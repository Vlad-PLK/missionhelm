'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Crown, ExternalLink } from 'lucide-react';
import { Header } from '@/components/Header';
import { TaskModal } from '@/components/TaskModal';
import { WorkspaceSubnav } from '@/components/WorkspaceSubnav';
import type { Agent, OpenClawSession, Task, Workspace } from '@/lib/types';

export default function WorkspaceAgentsPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<OpenClawSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
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

      const [agentsRes, tasksRes, sessionsRes] = await Promise.all([
        fetch(`/api/agents?workspace_id=${workspaceData.id}`),
        fetch(`/api/tasks?workspace_id=${workspaceData.id}`),
        fetch('/api/openclaw/sessions?status=active'),
      ]);

      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
    } catch (error) {
      console.error('Failed to load workspace agents page:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const headerStats = useMemo(() => ({
    activeAgents: agents.filter((agent) => agent.status === 'working').length + sessions.filter((session) => session.session_type === 'subagent').length,
    tasksInQueue: tasks.filter((task) => task.status !== 'done' && task.status !== 'review').length,
  }), [agents, sessions, tasks]);

  if (notFound) {
    return <Fallback title="Workspace not found" href="/" />;
  }

  if (loading || !workspace) {
    return <Loading message="Loading agent directory..." />;
  }

  return (
    <div className="min-h-screen bg-mc-bg pb-10">
      <Header workspace={workspace} statsOverride={headerStats} onCreateTask={() => setShowCreateTaskModal(true)} />
      <WorkspaceSubnav workspaceSlug={workspace.slug} />

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        <section>
          <Link href={`/workspace/${workspace.slug}`} className="inline-flex items-center gap-2 text-sm text-mc-text-secondary hover:text-mc-text mb-3">
            <ArrowLeft className="w-4 h-4" />
            Back to Queue
          </Link>
          <h1 className="text-2xl lg:text-3xl font-semibold">Agent Directory</h1>
          <p className="text-mc-text-secondary mt-2 max-w-3xl">
            See local and gateway agents, current connection state, model assignment, and who is actually carrying work in this workspace.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const assignedTasks = tasks.filter((task) => task.assigned_agent_id === agent.id);
            const activeSession = sessions.find((session) => session.agent_id === agent.id);
            return (
              <Link key={agent.id} href={`/workspace/${workspace.slug}/agents/${agent.id}`} className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 hover:border-mc-accent/40 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      <span className="text-xl">{agent.avatar_emoji}</span>
                      <span>{agent.name}</span>
                      {agent.is_master && <Crown className="w-4 h-4 text-mc-accent-yellow" />}
                    </div>
                    <div className="text-xs text-mc-text-secondary mt-1">{agent.role}</div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-mc-text-secondary" />
                </div>

                <div className="flex flex-wrap gap-2 mt-4 text-xs">
                  <span className={`px-2 py-1 rounded-full ${agent.source === 'gateway' ? 'bg-blue-500/10 text-blue-300' : 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
                    {agent.source === 'gateway' ? 'Gateway' : 'Local'}
                  </span>
                  <span className={`px-2 py-1 rounded-full ${agent.status === 'working' ? 'bg-mc-accent-green/10 text-mc-accent-green' : agent.status === 'offline' ? 'bg-mc-accent-red/10 text-mc-accent-red' : 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
                    {agent.status}
                  </span>
                  <span className={`px-2 py-1 rounded-full ${activeSession ? 'bg-mc-accent/10 text-mc-accent' : 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
                    {activeSession ? 'OpenClaw linked' : 'No session'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                  <MiniMetric label="Assigned" value={assignedTasks.length} />
                  <MiniMetric label="Model" value={agent.model || 'Default'} />
                </div>
              </Link>
            );
          })}
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

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
      <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary">{label}</div>
      <div className="font-medium mt-1 break-words">{value}</div>
    </div>
  );
}

function Loading({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">🦞</div>
        <p className="text-mc-text-secondary">{message}</p>
      </div>
    </div>
  );
}

function Fallback({ title, href }: { title: string; href: string }) {
  return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">🤖</div>
        <h1 className="text-2xl font-semibold mb-2">{title}</h1>
        <Link href={href} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-mc-accent text-mc-bg font-medium mt-6">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
      </div>
    </div>
  );
}
