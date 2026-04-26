'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Inbox, Users, Activity } from 'lucide-react';
import { Header } from '@/components/Header';
import { AgentsSidebar } from '@/components/AgentsSidebar';
import { DiscoverAgentsModal } from '@/components/DiscoverAgentsModal';
import { MissionQueue } from '@/components/MissionQueue';
import { TaskModal } from '@/components/TaskModal';
import { LiveFeed } from '@/components/LiveFeed';
import { SSEDebugPanel } from '@/components/SSEDebugPanel';
import { WorkspaceCommandCenter } from '@/components/WorkspaceCommandCenter';
import { WorkspaceSubnav } from '@/components/WorkspaceSubnav';

import { useMissionControl } from '@/lib/store';
import { useSSE } from '@/hooks/useSSE';
import { debug } from '@/lib/debug';
import type { Agent, Event, OpenClawSession, Task, Workspace } from '@/lib/types';

type MobileTab = 'tasks' | 'agents' | 'feed';

export default function WorkspacePage() {
  const params = useParams();
  const slug = params.slug as string;
  
  const {
    setAgents,
    setTasks,
    setEvents,
    setIsOnline,
    setIsLoading,
    isLoading,
  } = useMissionControl();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('tasks');
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [taskSnapshot, setTaskSnapshot] = useState<Task[]>([]);
  const [agentSnapshot, setAgentSnapshot] = useState<Agent[]>([]);
  const [eventSnapshot, setEventSnapshot] = useState<Event[]>([]);
  const [activeSessions, setActiveSessions] = useState<OpenClawSession[]>([]);
  const [openClawStatus, setOpenClawStatus] = useState<{
    connected: boolean;
    gateway_url?: string;
    error?: string;
    sessions_count?: number;
  } | null>(null);

  // Connect to SSE for real-time updates
  useSSE();

  // Load workspace data
  useEffect(() => {
    async function loadWorkspace() {
      try {
        const res = await fetch(`/api/workspaces/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setWorkspace(data);
        } else if (res.status === 404) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }
      } catch (error) {
        console.error('Failed to load workspace:', error);
        setNotFound(true);
        setIsLoading(false);
        return;
      }
    }

    loadWorkspace();
  }, [slug, setIsLoading]);

  // Load workspace-specific data
  useEffect(() => {
    if (!workspace) return;
    
    const workspaceId = workspace.id;

    async function loadData() {
      try {
        debug.api('Loading workspace data...', { workspaceId });
        
        // Fetch workspace-scoped data
        const [agentsRes, tasksRes, eventsRes] = await Promise.all([
          fetch(`/api/agents?workspace_id=${workspaceId}`),
          fetch(`/api/tasks?workspace_id=${workspaceId}`),
          fetch('/api/events'),
        ]);

        if (agentsRes.ok) {
          const agentsData = await agentsRes.json();
          setAgents(agentsData);
          setAgentSnapshot(agentsData);
        }
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          debug.api('Loaded tasks', { count: tasksData.length });
          setTasks(tasksData);
          setTaskSnapshot(tasksData);
        }
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          setEvents(eventsData);
          setEventSnapshot(eventsData);
        }

        const sessionsRes = await fetch('/api/openclaw/sessions?status=active');
        if (sessionsRes.ok) {
          setActiveSessions(await sessionsRes.json());
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    // Check OpenClaw connection separately (non-blocking)
    async function checkOpenClaw() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const openclawRes = await fetch('/api/openclaw/status', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (openclawRes.ok) {
          const status = await openclawRes.json();
          setIsOnline(status.connected);
          setOpenClawStatus(status);

          const sessionsRes = await fetch('/api/openclaw/sessions?status=active');
          if (sessionsRes.ok) {
            setActiveSessions(await sessionsRes.json());
          }
        }
      } catch {
        setIsOnline(false);
        setOpenClawStatus({ connected: false, error: 'Failed to reach OpenClaw Gateway' });
      }
    }

    loadData();
    checkOpenClaw();

    // SSE is the primary real-time mechanism - these are fallback polls with longer intervals
    // to reduce server load while providing redundancy

    // Poll for events every 30 seconds (SSE fallback - increased from 5s)
    const eventPoll = setInterval(async () => {
      try {
        const res = await fetch('/api/events?limit=20');
        if (res.ok) {
          setEvents(await res.json());
        }
      } catch (error) {
        console.error('Failed to poll events:', error);
      }
    }, 30000); // Increased from 5000 to 30000

    // Poll tasks as SSE fallback every 60 seconds (increased from 10s)
    const taskPoll = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks?workspace_id=${workspaceId}`);
        if (res.ok) {
          const newTasks: Task[] = await res.json();
          const currentTasks = useMissionControl.getState().tasks;

          const hasChanges = newTasks.length !== currentTasks.length ||
            newTasks.some((t) => {
              const current = currentTasks.find(ct => ct.id === t.id);
              return !current || current.status !== t.status;
            });

          if (hasChanges) {
            debug.api('[FALLBACK] Task changes detected via polling, updating store');
            setTasks(newTasks);
          }
        }
      } catch (error) {
        console.error('Failed to poll tasks:', error);
      }
    }, 60000); // Increased from 10000 to 60000

    // Check OpenClaw connection every 30 seconds (kept as-is for monitoring)
    const connectionCheck = setInterval(async () => {
      try {
        const res = await fetch('/api/openclaw/status');
        if (res.ok) {
          const status = await res.json();
          setIsOnline(status.connected);
          setOpenClawStatus(status);
        }
      } catch {
        setIsOnline(false);
        setOpenClawStatus({ connected: false, error: 'Failed to reach OpenClaw Gateway' });
      }
    }, 30000);

    return () => {
      clearInterval(eventPoll);
      clearInterval(connectionCheck);
      clearInterval(taskPoll);
    };
  }, [workspace, setAgents, setTasks, setEvents, setIsOnline, setIsLoading]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2">Workspace Not Found</h1>
          <p className="text-mc-text-secondary mb-6">
            The workspace &ldquo;{slug}&rdquo; doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-mc-accent text-mc-bg rounded-lg font-medium hover:bg-mc-accent/90"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading || !workspace) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading {slug}...</p>
        </div>
      </div>
    );
  }

  const activeAgentCount = agentSnapshot.filter((agent) => agent.status === 'working').length
    + activeSessions.filter((session) => session.session_type === 'subagent' && ((session.agent_id && agentSnapshot.some((agent) => agent.id === session.agent_id)) || (session.task_id && taskSnapshot.some((task) => task.id === session.task_id)))).length;
  const tasksInQueue = taskSnapshot.filter((task) => task.status !== 'done' && task.status !== 'review').length;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-mc-bg">
      <Header
        workspace={workspace}
        statsOverride={{
          activeAgents: activeAgentCount,
          tasksInQueue,
        }}
        onCreateTask={() => setShowCreateTaskModal(true)}
      />
      <WorkspaceSubnav workspaceSlug={workspace.slug} />

      <WorkspaceCommandCenter
        workspace={workspace}
        tasks={taskSnapshot}
        agents={agentSnapshot}
        events={eventSnapshot.filter((event) => {
          if (event.task_id && taskSnapshot.some((task) => task.id === event.task_id)) return true;
          if (event.agent_id && agentSnapshot.some((agent) => agent.id === event.agent_id)) return true;
          return false;
        })}
        openClawStatus={openClawStatus}
        activeSessions={activeSessions}
        onCreateTask={() => setShowCreateTaskModal(true)}
        onImportAgents={() => setShowDiscoverModal(true)}
        queueHref="#workspace-queue"
      />

      <div className="flex min-h-[70dvh] flex-1 overflow-hidden lg:min-h-[42rem]">
        {/* Desktop Layout: 3 columns */}
        <div className="hidden lg:flex flex-1 overflow-hidden">
          {/* Agents Sidebar */}
          <AgentsSidebar workspaceId={workspace.id} />

          {/* Main Content Area */}
          <MissionQueue sectionId="workspace-queue" workspaceId={workspace.id} workspaceSlug={workspace.slug} onCreateTask={() => setShowCreateTaskModal(true)} />

          {/* Live Feed */}
          <LiveFeed />
        </div>

        {/* Mobile/Tablet Layout: Tab-based navigation */}
        <div className="lg:hidden flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Tab Content */}
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {mobileTab === 'tasks' && <MissionQueue sectionId="workspace-queue-mobile" workspaceId={workspace.id} workspaceSlug={workspace.slug} onCreateTask={() => setShowCreateTaskModal(true)} />}
            {mobileTab === 'agents' && (
              <div className="h-full min-h-0 overflow-y-auto">
                <AgentsSidebar workspaceId={workspace.id} mobile />
              </div>
            )}
            {mobileTab === 'feed' && <LiveFeed mobile />}
            
          </div>

          {/* Mobile Tab Bar */}
          <div className="border-t border-mc-border bg-mc-bg-secondary flex justify-around py-2 safe-area-pb">
            <button
              onClick={() => setMobileTab('tasks')}
              className={`flex flex-col items-center gap-1 px-4 py-2 min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
                mobileTab === 'tasks' 
                  ? 'text-mc-accent bg-mc-accent/10' 
                  : 'text-mc-text-secondary'
              }`}
            >
              <Inbox className="w-5 h-5" />
              <span className="text-xs">Tasks</span>
            </button>
            <button
              onClick={() => setMobileTab('agents')}
              className={`flex flex-col items-center gap-1 px-4 py-2 min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
                mobileTab === 'agents' 
                  ? 'text-mc-accent-purple bg-mc-accent-purple/10' 
                  : 'text-mc-text-secondary'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-xs">Agents</span>
            </button>
            <button
              onClick={() => setMobileTab('feed')}
              className={`flex flex-col items-center gap-1 px-4 py-2 min-h-[44px] min-w-[44px] rounded-lg transition-colors ${
                mobileTab === 'feed' 
                  ? 'text-mc-accent-green bg-mc-accent-green/10' 
                  : 'text-mc-text-secondary'
              }`}
            >
              <Activity className="w-5 h-5" />
              <span className="text-xs">Feed</span>
            </button>
          </div>
        </div>
      </div>

      {/* Debug Panel - only shows when debug mode enabled */}
      <SSEDebugPanel />

      {showCreateTaskModal && (
        <TaskModal onClose={() => setShowCreateTaskModal(false)} workspaceId={workspace.id} />
      )}

      {showDiscoverModal && (
        <DiscoverAgentsModal onClose={() => setShowDiscoverModal(false)} workspaceId={workspace.id} />
      )}
    </div>
  );
}
