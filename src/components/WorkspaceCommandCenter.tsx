'use client';

import Link from 'next/link';
import { Activity, Bot, FolderOpen, Plus, Radio, Settings, ShieldAlert, TestTube2, UploadCloud } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Agent, Event, OpenClawSession, Task, Workspace } from '@/lib/types';

interface WorkspaceCommandCenterProps {
  workspace: Workspace;
  tasks: Task[];
  agents: Agent[];
  events: Event[];
  openClawStatus: {
    connected: boolean;
    gateway_url?: string;
    error?: string;
    sessions_count?: number;
  } | null;
  activeSessions: OpenClawSession[];
  onCreateTask: () => void;
  onImportAgents: () => void;
  queueHref?: string;
}

interface WarningItem {
  id: string;
  label: string;
  detail: string;
  tone: 'critical' | 'warning' | 'info';
}

export function WorkspaceCommandCenter({
  workspace,
  tasks,
  agents,
  events,
  openClawStatus,
  activeSessions,
  onCreateTask,
  onImportAgents,
  queueHref,
}: WorkspaceCommandCenterProps) {
  const now = Date.now();
  const taskIds = new Set(tasks.map((task) => task.id));
  const agentIds = new Set(agents.map((agent) => agent.id));

  const activeTasks = tasks.filter((task) => !['done', 'review'].includes(task.status));
  const testingTasks = tasks.filter((task) => task.status === 'testing');
  const reviewTasks = tasks.filter((task) => task.status === 'review');
  const pendingDispatchTasks = tasks.filter((task) => task.status === 'pending_dispatch');
  const dispatchFailures = tasks.filter((task) => task.planning_dispatch_error);
  const workingAgents = agents.filter((agent) => agent.status === 'working');
  const activeWorkspaceSessions = activeSessions.filter((session) => {
    return (session.agent_id && agentIds.has(session.agent_id)) || (session.task_id && taskIds.has(session.task_id));
  });
  const activeSubagents = activeWorkspaceSessions.filter((session) => session.session_type === 'subagent');
  const stalledTasks = tasks.filter((task) => {
    if (!['pending_dispatch', 'assigned', 'in_progress', 'testing', 'review'].includes(task.status)) {
      return false;
    }

    const ageMs = now - new Date(task.updated_at).getTime();
    return ageMs > 1000 * 60 * 60 * 24;
  });
  const offlineAssignedAgents = agents.filter((agent) => {
    if (agent.status !== 'offline') return false;
    return tasks.some((task) => task.assigned_agent_id === agent.id && !['done'].includes(task.status));
  });

  const warningItems: WarningItem[] = [];

  if (!openClawStatus?.connected) {
    warningItems.push({
      id: 'gateway-offline',
      label: 'Gateway offline',
      detail: openClawStatus?.error || 'Mission Control could not reach OpenClaw.',
      tone: 'critical',
    });
  }

  if (pendingDispatchTasks.length > 0) {
    warningItems.push({
      id: 'pending-dispatch',
      label: `${pendingDispatchTasks.length} task${pendingDispatchTasks.length === 1 ? '' : 's'} pending dispatch`,
      detail: 'These tasks are created but not yet actively executing.',
      tone: 'warning',
    });
  }

  if (dispatchFailures.length > 0) {
    warningItems.push({
      id: 'dispatch-failure',
      label: `${dispatchFailures.length} dispatch issue${dispatchFailures.length === 1 ? '' : 's'}`,
      detail: dispatchFailures[0]?.planning_dispatch_error || 'Planning or dispatch needs operator attention.',
      tone: 'critical',
    });
  }

  if (stalledTasks.length > 0) {
    warningItems.push({
      id: 'stalled',
      label: `${stalledTasks.length} stalled task${stalledTasks.length === 1 ? '' : 's'}`,
      detail: `No update for at least ${formatDistanceToNow(new Date(now - 1000 * 60 * 60 * 24))}.`,
      tone: 'warning',
    });
  }

  if (offlineAssignedAgents.length > 0) {
    warningItems.push({
      id: 'offline-agent',
      label: `${offlineAssignedAgents.length} offline agent${offlineAssignedAgents.length === 1 ? '' : 's'} still assigned`,
      detail: 'Reassign or reconnect these agents before work stalls further.',
      tone: 'info',
    });
  }

  const latestImportantEvents = events
    .filter((event) => ['task_created', 'task_completed', 'task_status_changed', 'agent_status_changed'].includes(event.type))
    .slice(0, 4);

  return (
    <section className="border-b border-mc-border bg-mc-bg-secondary/70 px-4 lg:px-6 py-3 lg:py-4 space-y-3">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-mc-text-secondary mb-2">
            <Radio className="w-3.5 h-3.5" />
            Workspace Command Center
          </div>
          <h2 className="text-xl lg:text-2xl font-semibold">{workspace.icon} {workspace.name}</h2>
          <p className="text-sm text-mc-text-secondary mt-1">
            Monitor live execution, surface review pressure, and jump directly into the next operator action.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onCreateTask}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-mc-accent-pink text-mc-bg font-medium hover:bg-mc-accent-pink/90"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
          <button
            onClick={onImportAgents}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20"
          >
            <UploadCloud className="w-4 h-4" />
            Import Agents
          </button>
          <Link
            href={`/workspace/${workspace.slug}/activity`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/40"
          >
            <Activity className="w-4 h-4" />
            Activity Dashboard
          </Link>
          <Link
            href={`/workspace/${workspace.slug}/settings`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/40"
          >
            <Settings className="w-4 h-4" />
            Workspace Settings
          </Link>
          {queueHref && (
            <Link
              href={queueHref}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/40"
            >
              <FolderOpen className="w-4 h-4" />
              Jump to Queue
            </Link>
          )}
          <Link
            href={`/workspace/${workspace.slug}/agents`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/40"
          >
            <Bot className="w-4 h-4" />
            Agent Directory
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-7 gap-3">
        <MetricCard label="Active Tasks" value={String(activeTasks.length)} tone="accent" />
        <MetricCard label="Testing" value={String(testingTasks.length)} tone="cyan" />
        <MetricCard label="Review" value={String(reviewTasks.length)} tone="purple" />
        <MetricCard label="Stalled" value={String(stalledTasks.length)} tone={stalledTasks.length > 0 ? 'warning' : 'neutral'} />
        <MetricCard label="Working Agents" value={String(workingAgents.length)} tone="green" />
        <MetricCard label="Active Sessions" value={String(activeWorkspaceSessions.length)} hint={`${activeSubagents.length} subagents`} tone="neutral" />
        <MetricCard
          label="Gateway"
          value={openClawStatus?.connected ? 'Online' : 'Offline'}
          hint={openClawStatus?.gateway_url}
          tone={openClawStatus?.connected ? 'green' : 'warning'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-3">
        <div className="rounded-xl border border-mc-border bg-mc-bg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="w-4 h-4 text-mc-accent-yellow" />
            Needs Attention
          </div>

          {warningItems.length === 0 ? (
            <div className="rounded-lg border border-mc-border bg-mc-bg-secondary px-3 py-4 text-sm text-mc-text-secondary">
              No blocking warnings. The workspace is clear for new work.
            </div>
          ) : (
            <div className="space-y-2">
              {warningItems.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border px-3 py-3 ${
                    item.tone === 'critical'
                      ? 'border-mc-accent-red/40 bg-mc-accent-red/10 text-mc-text'
                      : item.tone === 'warning'
                        ? 'border-mc-accent-yellow/30 bg-mc-accent-yellow/10 text-mc-text'
                        : 'border-mc-border bg-mc-bg-secondary text-mc-text'
                  }`}
                >
                  <div className="font-medium text-sm">{item.label}</div>
                  <div className="text-xs text-mc-text-secondary mt-1">{item.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-mc-border bg-mc-bg p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Bot className="w-4 h-4 text-mc-accent-cyan" />
            Recent Signal
          </div>

          {latestImportantEvents.length === 0 ? (
            <div className="rounded-lg border border-mc-border bg-mc-bg-secondary px-3 py-4 text-sm text-mc-text-secondary">
              No recent events yet for this workspace.
            </div>
          ) : (
            <div className="space-y-2">
              {latestImportantEvents.map((event) => (
                <div key={event.id} className="rounded-lg border border-mc-border bg-mc-bg-secondary px-3 py-3">
                  <div className="text-sm leading-relaxed">{event.message}</div>
                  <div className="text-[11px] text-mc-text-secondary mt-1">
                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Link
              href={`/workspace/${workspace.slug}/review`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-sm text-mc-text hover:border-mc-accent/40"
            >
              <TestTube2 className="w-4 h-4" />
              Review Surface
            </Link>
            <Link
              href={`/workspace/${workspace.slug}/settings`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-sm text-mc-text hover:border-mc-accent/40"
            >
              <FolderOpen className="w-4 h-4" />
              Operations
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: 'accent' | 'purple' | 'cyan' | 'green' | 'warning' | 'neutral';
}) {
  const toneClasses = {
    accent: 'text-mc-accent border-mc-accent/20 bg-mc-accent/5',
    purple: 'text-mc-accent-purple border-mc-accent-purple/20 bg-mc-accent-purple/5',
    cyan: 'text-mc-accent-cyan border-mc-accent-cyan/20 bg-mc-accent-cyan/5',
    green: 'text-mc-accent-green border-mc-accent-green/20 bg-mc-accent-green/5',
    warning: 'text-mc-accent-yellow border-mc-accent-yellow/20 bg-mc-accent-yellow/5',
    neutral: 'text-mc-text border-mc-border bg-mc-bg',
  };

  return (
    <div className={`rounded-xl border px-3 py-3 ${toneClasses[tone]}`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">{label}</div>
      <div className="text-xl lg:text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-mc-text-secondary mt-1 truncate">{hint}</div>}
    </div>
  );
}
