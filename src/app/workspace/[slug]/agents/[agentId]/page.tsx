'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Cable, Crown, FolderGit2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { TaskModal } from '@/components/TaskModal';
import { WorkspaceSubnav } from '@/components/WorkspaceSubnav';
import type { Agent, OpenClawSession, Task, Workspace } from '@/lib/types';
import { APP_RUNTIME_CHANNEL } from '@/lib/branding';

export default function WorkspaceAgentDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const agentId = params.agentId as string;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessionState, setSessionState] = useState<{ linked: boolean; session: OpenClawSession | null } | null>(null);
  const [workspaceTasks, setWorkspaceTasks] = useState<Task[]>([]);
  const [workspaceAgents, setWorkspaceAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sessionAction, setSessionAction] = useState<'connect' | 'disconnect' | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const workspaceRes = await fetch(`/api/workspaces/${slug}`);
      if (!workspaceRes.ok) {
        setNotFound(true);
        return;
      }

      const workspaceData = await workspaceRes.json();
      setWorkspace(workspaceData);

      const [agentRes, tasksRes, sessionRes, workspaceTasksRes, workspaceAgentsRes] = await Promise.all([
        fetch(`/api/agents/${agentId}`),
        fetch(`/api/tasks?workspace_id=${workspaceData.id}&assigned_agent_id=${agentId}`),
        fetch(`/api/agents/${agentId}/openclaw`),
        fetch(`/api/tasks?workspace_id=${workspaceData.id}`),
        fetch(`/api/agents?workspace_id=${workspaceData.id}`),
      ]);

      if (!agentRes.ok) {
        setNotFound(true);
        return;
      }

      const agentData = await agentRes.json();
      if (agentData.workspace_id !== workspaceData.id) {
        setNotFound(true);
        return;
      }

      setAgent(agentData);
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (sessionRes.ok) setSessionState(await sessionRes.json());
      if (workspaceTasksRes.ok) setWorkspaceTasks(await workspaceTasksRes.json());
      if (workspaceAgentsRes.ok) setWorkspaceAgents(await workspaceAgentsRes.json());
    } catch (error) {
      console.error('Failed to load workspace agent detail:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [agentId, slug]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const headerStats = useMemo(() => ({
    activeAgents: workspaceAgents.filter((entry) => entry.status === 'working').length,
    tasksInQueue: workspaceTasks.filter((task) => task.status !== 'done' && task.status !== 'review').length,
  }), [workspaceAgents, workspaceTasks]);

  const handleSessionToggle = async () => {
    if (!agent) return;
    const method = sessionState?.linked ? 'DELETE' : 'POST';
    setSessionAction(sessionState?.linked ? 'disconnect' : 'connect');
    try {
      await fetch(`/api/agents/${agent.id}/openclaw`, { method });
      await loadPage();
    } finally {
      setSessionAction(null);
    }
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">🤖</div>
          <h1 className="text-2xl font-semibold mb-2">Agent not found</h1>
          <Link href={`/workspace/${slug}/agents`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-mc-accent text-mc-bg font-medium mt-6">
            <ArrowLeft className="w-4 h-4" />
            Back to agents
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !workspace || !agent) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading agent detail...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mc-bg pb-10">
      <Header workspace={workspace} statsOverride={headerStats} onCreateTask={() => setShowCreateTaskModal(true)} />
      <WorkspaceSubnav workspaceSlug={workspace.slug} />

      <main className="max-w-6xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        <section>
          <Link href={`/workspace/${workspace.slug}/agents`} className="inline-flex items-center gap-2 text-sm text-mc-text-secondary hover:text-mc-text mb-3">
            <ArrowLeft className="w-4 h-4" />
            Back to Queue
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-3xl">{agent.avatar_emoji}</div>
            <div>
              <div className="flex items-center gap-2 text-2xl lg:text-3xl font-semibold">
                {agent.name}
                {agent.is_master && <Crown className="w-5 h-5 text-mc-accent-yellow" />}
              </div>
              <div className="text-mc-text-secondary mt-1">{agent.role}</div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] gap-6">
          <div className="space-y-6">
            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-3">
              <div className="text-sm font-medium">Agent Overview</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DetailCard label="Source" value={agent.source === 'gateway' ? 'Imported from gateway' : 'Local agent'} />
                <DetailCard label="Status" value={agent.status} />
                <DetailCard label="Model" value={agent.model || 'Default model'} />
                <DetailCard label="Gateway ID" value={agent.gateway_agent_id || 'None'} />
              </div>
              {agent.description && <div className="text-sm text-mc-text-secondary leading-relaxed">{agent.description}</div>}
            </div>

            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FolderGit2 className="w-4 h-4 text-mc-accent-cyan" />
                Recent Assigned Tasks
              </div>
              {tasks.length === 0 ? (
                <div className="text-sm text-mc-text-secondary">This agent has no currently assigned tasks in this workspace.</div>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <Link key={task.id} href={`/workspace/${workspace.slug}/tasks/${task.id}`} className="block rounded-lg border border-mc-border bg-mc-bg px-3 py-3 hover:border-mc-accent/40">
                      <div className="font-medium text-sm">{task.title}</div>
                      <div className="text-xs text-mc-text-secondary mt-1 uppercase">{task.status.replace('_', ' ')}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Cable className="w-4 h-4 text-mc-accent" />
                OpenClaw Connection
              </div>
              <div className={`rounded-lg border px-3 py-3 text-sm ${sessionState?.linked ? 'border-mc-accent-green/30 bg-mc-accent-green/10' : 'border-mc-border bg-mc-bg'}`}>
                {sessionState?.linked ? 'Linked to an active OpenClaw session.' : 'Not currently linked to an OpenClaw session.'}
              </div>
              {sessionState?.session && (
                <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3 text-sm space-y-1">
                  <div><span className="text-mc-text-secondary">Session:</span> {sessionState.session.openclaw_session_id}</div>
                  <div><span className="text-mc-text-secondary">Channel:</span> {sessionState.session.channel || APP_RUNTIME_CHANNEL}</div>
                </div>
              )}
              <button onClick={handleSessionToggle} disabled={!!sessionAction} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-mc-border bg-mc-bg text-sm text-mc-text">
                {sessionAction ? (sessionAction === 'connect' ? 'Connecting...' : 'Disconnecting...') : (sessionState?.linked ? 'Disconnect OpenClaw' : 'Connect OpenClaw')}
              </button>
            </div>
          </div>
        </section>
      </main>

      {showCreateTaskModal && (
        <TaskModal
          workspaceId={workspace.id}
          onClose={() => {
            setShowCreateTaskModal(false);
            void loadPage();
          }}
        />
      )}
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
      <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary">{label}</div>
      <div className="font-medium mt-1 break-words">{value}</div>
    </div>
  );
}
