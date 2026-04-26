'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Activity, Bot, FolderOpen, Plus, Radio, Settings, ShieldAlert, TestTube2, UploadCloud, Workflow } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Agent, Event, OpenClawSession, Task, Workspace } from '@/lib/types';
import { APP_DISPLAY_NAME } from '@/lib/branding';

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
    return tasks.some((task) => task.assigned_agent_id === agent.id && task.status !== 'done');
  });

  const warningItems: WarningItem[] = [];

  if (!openClawStatus?.connected) {
    warningItems.push({
      id: 'gateway-offline',
      label: 'Gateway offline',
      detail: openClawStatus?.error || `${APP_DISPLAY_NAME} could not reach OpenClaw.`,
      tone: 'critical',
    });
  }

  if (pendingDispatchTasks.length > 0) {
    warningItems.push({
      id: 'pending-dispatch',
      label: `${pendingDispatchTasks.length} pending dispatch`,
      detail: 'Execution has not started for these tasks yet.',
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
      label: `${offlineAssignedAgents.length} offline agent${offlineAssignedAgents.length === 1 ? '' : 's'} assigned`,
      detail: 'Reassign or reconnect these agents before work stalls further.',
      tone: 'info',
    });
  }

  const latestImportantEvents = events
    .filter((event) => ['task_created', 'task_completed', 'task_status_changed', 'agent_status_changed'].includes(event.type))
    .slice(0, 4);

  return (
    <section className="border-b border-mc-border bg-mc-bg-secondary/75 px-4 py-4 lg:px-6 lg:py-5">
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.9fr)] xl:items-start">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-mc-bg px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-mc-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <Radio className="h-3.5 w-3.5 text-mc-accent" />
              Workspace Command Center
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-mc-text lg:text-3xl">
              {workspace.icon} {workspace.name}
            </h2>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-mc-text-secondary lg:text-base">
              Monitor live execution, surface review pressure, and jump into the next operator action without scanning the full queue.
            </p>
          </div>

          <div className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(88,166,255,0.12),rgba(13,17,23,0.18))] p-4 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="text-[11px] uppercase tracking-[0.2em] text-mc-text-secondary">Next operator actions</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <CommandActionButton icon={<Plus className="h-4 w-4" />} label="New Task" onClick={onCreateTask} tone="primary" />
              <CommandActionButton icon={<UploadCloud className="h-4 w-4" />} label="Import Agents" onClick={onImportAgents} />
              <CommandLink href={`/workspace/${workspace.slug}/activity`} icon={<Activity className="h-4 w-4" />} label="Activity" />
              <CommandLink href={`/workspace/${workspace.slug}/settings`} icon={<Settings className="h-4 w-4" />} label="Settings" />
              {queueHref ? <CommandLink href={queueHref} icon={<FolderOpen className="h-4 w-4" />} label="Queue" /> : null}
              <CommandLink href={`/workspace/${workspace.slug}/agents`} icon={<Bot className="h-4 w-4" />} label="Agents" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <MetricCard label="Active Tasks" value={String(activeTasks.length)} tone="accent" />
          <MetricCard label="Testing" value={String(testingTasks.length)} tone={testingTasks.length > 0 ? 'warning' : 'neutral'} />
          <MetricCard label="Review" value={String(reviewTasks.length)} tone={reviewTasks.length > 0 ? 'warning' : 'neutral'} />
          <MetricCard label="Stalled" value={String(stalledTasks.length)} tone={stalledTasks.length > 0 ? 'warning' : 'neutral'} />
          <MetricCard label="Working Agents" value={String(workingAgents.length)} tone="success" />
          <MetricCard label="Sessions" value={String(activeWorkspaceSessions.length)} hint={`${activeSubagents.length} subagents`} tone="neutral" />
          <MetricCard label="Gateway" value={openClawStatus?.connected ? 'Online' : 'Offline'} hint={openClawStatus?.gateway_url} tone={openClawStatus?.connected ? 'success' : 'warning'} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.6rem] border border-mc-border bg-mc-bg p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center gap-2 text-sm font-medium text-mc-text">
              <ShieldAlert className="h-4 w-4 text-mc-accent-yellow" />
              Needs Attention
            </div>

            {warningItems.length === 0 ? (
              <div className="mt-4 rounded-[1.25rem] border border-mc-accent-green/25 bg-mc-accent-green/10 px-4 py-4 text-sm text-mc-text-secondary">
                No blocking warnings. The workspace is clear for new work.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {warningItems.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-[1.25rem] border px-4 py-4 ${
                      item.tone === 'critical'
                        ? 'border-mc-accent-red/35 bg-mc-accent-red/10'
                        : item.tone === 'warning'
                          ? 'border-mc-accent-yellow/30 bg-mc-accent-yellow/10'
                          : 'border-mc-border bg-mc-bg-secondary'
                    }`}
                  >
                    <div className="text-sm font-medium text-mc-text">{item.label}</div>
                    <div className="mt-1 text-xs leading-relaxed text-mc-text-secondary">{item.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[1.6rem] border border-mc-border bg-mc-bg p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center gap-2 text-sm font-medium text-mc-text">
              <Workflow className="h-4 w-4 text-mc-accent" />
              Recent Signal
            </div>

            {latestImportantEvents.length === 0 ? (
              <div className="mt-4 rounded-[1.25rem] border border-mc-border bg-mc-bg-secondary px-4 py-4 text-sm text-mc-text-secondary">
                No recent events yet for this workspace.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {latestImportantEvents.map((event) => (
                  <div key={event.id} className="rounded-[1.25rem] border border-mc-border bg-mc-bg-secondary px-4 py-4">
                    <div className="text-sm leading-relaxed text-mc-text">{event.message}</div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.16em] text-mc-text-secondary">
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <CommandLink href={`/workspace/${workspace.slug}/review`} icon={<TestTube2 className="h-4 w-4" />} label="Review Surface" />
              <CommandLink href={`/workspace/${workspace.slug}/activity`} icon={<Activity className="h-4 w-4" />} label="Live Activity" />
            </div>
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
  tone: 'accent' | 'success' | 'warning' | 'neutral';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-mc-accent-green/25 bg-mc-accent-green/10'
      : tone === 'warning'
        ? 'border-mc-accent-yellow/25 bg-mc-accent-yellow/10'
        : tone === 'accent'
          ? 'border-mc-accent/25 bg-mc-accent/10'
          : 'border-mc-border bg-mc-bg';

  return (
    <div className={`rounded-[1.25rem] border px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-mc-text">{value}</div>
      {hint ? <div className="mt-1 text-xs text-mc-text-secondary">{hint}</div> : null}
    </div>
  );
}

function CommandActionButton({
  icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'primary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors active:scale-[0.98] ${
        tone === 'primary'
          ? 'bg-mc-accent text-mc-bg hover:bg-mc-accent/90'
          : 'border border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/30'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function CommandLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-mc-border bg-mc-bg px-4 py-2 text-sm font-medium text-mc-text transition-colors hover:border-mc-accent/30"
    >
      {icon}
      {label}
    </Link>
  );
}
