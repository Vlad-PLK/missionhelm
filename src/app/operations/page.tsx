'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, AlertTriangle, ArrowRight, Bot, Radio, Settings2, ShieldAlert, Workflow } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Event, Task, WorkspaceStats } from '@/lib/types';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { getOperatorPrefs, type OperatorPrefs } from '@/lib/ui/operator-prefs';

interface WorkspaceAttentionRecord {
  workspace: WorkspaceStats;
  tasks: Task[];
  score: number;
  chips: Array<{ label: string; tone: 'danger' | 'warning' | 'info' }>;
}

function createDefaultPrefs(): OperatorPrefs {
  return {
    pinnedWorkspaces: [],
    recentWorkspaces: [],
  };
}

function scoreTask(task: Task) {
  if (task.status === 'review') return 6;
  if (task.status === 'testing') return 5;
  if (task.status === 'pending_dispatch') return 4;
  if (task.status === 'planning') return 3;
  return 1;
}

function toneForEvent(type: Event['type']): 'danger' | 'warning' | 'success' | 'default' {
  if (type === 'task_completed') return 'success';
  if (type === 'agent_status_changed') return 'warning';
  if (type === 'task_status_changed') return 'default';
  return 'default';
}

function labelForEvent(type: Event['type']) {
  if (type === 'task_completed') return 'Completed';
  if (type === 'task_status_changed') return 'Status';
  if (type === 'agent_status_changed') return 'Agent';
  if (type === 'task_dispatched') return 'Dispatch';
  return type.replace(/_/g, ' ');
}

export default function OperationsPage() {
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<WorkspaceStats[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [prefs, setPrefs] = useState<OperatorPrefs>(createDefaultPrefs);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useKeyboardShortcuts({
    onGoOperations: () => router.push('/operations'),
    onGoSystem: () => router.push('/admin/system'),
  });

  useEffect(() => {
    setPrefs(getOperatorPrefs());
    void loadPage();
  }, []);

  const loadPage = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [workspacesRes, tasksRes, eventsRes] = await Promise.all([
        fetch('/api/workspaces?stats=true'),
        fetch('/api/tasks'),
        fetch('/api/events?limit=100'),
      ]);

      if (!workspacesRes.ok || !tasksRes.ok || !eventsRes.ok) {
        throw new Error('Failed to load operations data');
      }

      const [workspaceData, taskData, eventData] = await Promise.all([
        workspacesRes.json() as Promise<WorkspaceStats[]>,
        tasksRes.json() as Promise<Task[]>,
        eventsRes.json() as Promise<Event[]>,
      ]);

      setWorkspaces(workspaceData);
      setTasks(taskData);
      setEvents(eventData);
    } catch (error) {
      console.error('Failed to load operations home:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load operations data');
    } finally {
      setLoading(false);
    }
  };

  const tasksNeedingAttention = useMemo(
    () => tasks.filter((task) => ['testing', 'review', 'pending_dispatch', 'planning'].includes(task.status)),
    [tasks],
  );

  const attentionByWorkspace = useMemo<WorkspaceAttentionRecord[]>(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasksNeedingAttention) {
      const current = map.get(task.workspace_id) || [];
      current.push(task);
      map.set(task.workspace_id, current);
    }

    return workspaces
      .map((workspace) => {
        const workspaceTasks = (map.get(workspace.id) || []).sort((left, right) => scoreTask(right) - scoreTask(left));
        const reviewCount = workspaceTasks.filter((task) => task.status === 'review').length;
        const testingCount = workspaceTasks.filter((task) => task.status === 'testing').length;
        const pendingDispatchCount = workspaceTasks.filter((task) => task.status === 'pending_dispatch').length;
        const planningCount = workspaceTasks.filter((task) => task.status === 'planning').length;

        const chips: WorkspaceAttentionRecord['chips'] = [];
        if (reviewCount > 0) chips.push({ label: `${reviewCount} review`, tone: 'danger' });
        if (testingCount > 0) chips.push({ label: `${testingCount} testing`, tone: 'warning' });
        if (pendingDispatchCount > 0) chips.push({ label: `${pendingDispatchCount} pending dispatch`, tone: 'warning' });
        if (planningCount > 0) chips.push({ label: `${planningCount} planning`, tone: 'info' });
        if (workspaceTasks.length > 1) chips.push({ label: `${workspaceTasks.length} tasks need attention`, tone: 'info' });

        const score = workspaceTasks.reduce((total, task) => total + scoreTask(task), 0);

        return {
          workspace,
          tasks: workspaceTasks,
          score,
          chips,
        };
      })
      .sort((left, right) => right.score - left.score || right.tasks.length - left.tasks.length || left.workspace.name.localeCompare(right.workspace.name));
  }, [tasksNeedingAttention, workspaces]);

  const recentImportantEvents = useMemo(
    () =>
      events
        .filter((event) => ['task_completed', 'task_status_changed', 'agent_status_changed', 'task_dispatched'].includes(event.type))
        .slice(0, 14),
    [events],
  );

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const workspacesById = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace])), [workspaces]);

  const pinnedRoutes = useMemo(() => {
    return prefs.pinnedWorkspaces
      .map((slug) => workspaces.find((workspace) => workspace.slug === slug))
      .filter((workspace): workspace is WorkspaceStats => Boolean(workspace))
      .slice(0, 2);
  }, [prefs.pinnedWorkspaces, workspaces]);

  const mostUrgentWorkspace = attentionByWorkspace.find((item) => item.tasks.length > 0)?.workspace || null;
  const missionControlWorkspace =
    workspaces.find((workspace) => workspace.slug === 'autonomous-workflow') ||
    workspaces.find((workspace) => workspace.slug === 'default') ||
    workspaces[0] ||
    null;

  const quickRoutes = [
    mostUrgentWorkspace
      ? {
          href: `/workspace/${mostUrgentWorkspace.slug}/review`,
          label: `${mostUrgentWorkspace.name} review`,
          detail: 'Jump into the hottest approval queue.',
        }
      : null,
    missionControlWorkspace
      ? {
          href: `/workspace/${missionControlWorkspace.slug}`,
          label: `${missionControlWorkspace.name} queue`,
          detail: 'Open the primary execution workspace.',
        }
      : null,
    ...pinnedRoutes.map((workspace) => ({
      href: `/workspace/${workspace.slug}`,
      label: workspace.name,
      detail: 'Pinned workspace route.',
    })),
    {
      href: '/admin/system',
      label: 'System admin',
      detail: 'Check gateway health, sessions, and monitor state.',
    },
  ].filter((route, index, all): route is NonNullable<typeof route> => Boolean(route) && all.findIndex((item) => item?.href === route?.href) === index);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-mc-bg px-4 py-8 lg:px-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-32 animate-pulse rounded-[2rem] border border-mc-border bg-mc-bg-secondary/70" />
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-[1.6rem] border border-mc-border bg-mc-bg-secondary/70" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
            <div className="h-[520px] animate-pulse rounded-[2rem] border border-mc-border bg-mc-bg-secondary/70" />
            <div className="h-[520px] animate-pulse rounded-[2rem] border border-mc-border bg-mc-bg-secondary/70" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-mc-bg pb-10">
      <header className="border-b border-mc-border bg-mc-bg-secondary/95 px-4 py-5 backdrop-blur-xl lg:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] lg:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-mc-bg px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-mc-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <Radio className="h-3.5 w-3.5 text-mc-accent" />
                Operations
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-mc-text lg:text-5xl">Operations Home</h1>
              <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-mc-text-secondary lg:text-base">
                Rank workspaces by urgency, scan recent changes faster, and move directly from signals into the next operator route.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(88,166,255,0.14),rgba(13,17,23,0.22))] p-4 shadow-[0_20px_50px_-34px_rgba(0,0,0,0.8)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="text-[11px] uppercase tracking-[0.22em] text-mc-text-secondary">Jump points</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/" className="inline-flex min-h-[40px] items-center rounded-full border border-mc-border bg-mc-bg px-3 py-2 text-sm text-mc-text-secondary transition-colors hover:text-mc-text">
                  Dashboard
                </Link>
                <Link href="/admin/system" className="inline-flex min-h-[40px] items-center rounded-full border border-mc-border bg-mc-bg px-3 py-2 text-sm text-mc-text-secondary transition-colors hover:text-mc-text">
                  System
                </Link>
                <span className="inline-flex min-h-[40px] items-center rounded-full border border-mc-border bg-mc-bg px-3 py-2 text-xs text-mc-text-secondary">
                  g s for system
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        {loadError ? (
          <div className="rounded-[1.75rem] border border-mc-accent-red/30 bg-mc-accent-red/10 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-mc-accent-red" />
              <div>
                <h2 className="text-lg font-medium text-mc-text">Operations data unavailable</h2>
                <p className="mt-2 text-sm text-mc-text-secondary">{loadError}</p>
                <button
                  onClick={() => void loadPage()}
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-full border border-mc-accent-red/30 bg-mc-bg px-4 py-2 text-sm font-medium text-mc-text"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <OpsMetric label="Workspaces" value={workspaces.length} detail="Tracked from the shared dashboard." tone="default" />
              <OpsMetric label="Needs Attention" value={tasksNeedingAttention.length} detail="Review, testing, planning, or dispatch pressure." tone={tasksNeedingAttention.length > 0 ? 'warning' : 'success'} />
              <OpsMetric label="Review" value={tasks.filter((task) => task.status === 'review').length} detail="Tasks waiting on operator approval." tone="warning" />
              <OpsMetric label="Testing" value={tasks.filter((task) => task.status === 'testing').length} detail="Tasks awaiting checks or receipts." tone="default" />
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.22fr)_minmax(360px,0.9fr)]">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-mc-text">
                  <ShieldAlert className="h-4 w-4 text-mc-accent-yellow" />
                  Attention by Workspace
                </div>

                {attentionByWorkspace.length === 0 ? (
                  <div className="rounded-[1.8rem] border border-mc-border bg-mc-bg-secondary/80 px-5 py-8 text-sm text-mc-text-secondary">
                    No active attention queue across workspaces.
                  </div>
                ) : (
                  attentionByWorkspace.map((record) => (
                    <article key={record.workspace.id} className="rounded-[1.8rem] border border-mc-border bg-mc-bg-secondary/88 p-5 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.75)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-mc-bg text-xl">
                              <span aria-hidden="true">{record.workspace.icon}</span>
                            </div>
                            <div>
                              <div className="text-lg font-semibold tracking-tight text-mc-text">{record.workspace.name}</div>
                              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-mc-text-secondary">/{record.workspace.slug}</div>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {record.chips.length === 0 ? (
                              <SignalPill label="No urgent queue" tone="success" />
                            ) : (
                              record.chips.map((chip) => <SignalPill key={chip.label} label={chip.label} tone={chip.tone} />)
                            )}
                          </div>
                        </div>

                        <Link
                          href={`/workspace/${record.workspace.slug}`}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-mc-border bg-mc-bg px-4 py-2 text-sm font-medium text-mc-text transition-colors hover:border-mc-accent/40"
                        >
                          Open workspace
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>

                      <div className="mt-4 space-y-2">
                        {record.tasks.length === 0 ? (
                          <div className="rounded-2xl border border-mc-border bg-mc-bg px-4 py-3 text-sm text-mc-text-secondary">
                            This workspace is clear right now.
                          </div>
                        ) : (
                          record.tasks.slice(0, 4).map((task) => (
                            <Link
                              key={task.id}
                              href={`/workspace/${record.workspace.slug}/tasks/${task.id}`}
                              className="block rounded-2xl border border-mc-border bg-mc-bg px-4 py-3 transition-colors hover:border-mc-accent/30"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <div className="text-sm font-medium text-mc-text">{task.title}</div>
                                  <div className="mt-1 text-xs text-mc-text-secondary">
                                    {task.assigned_agent?.name ? `Assigned to ${task.assigned_agent.name}` : 'No assigned agent'}
                                  </div>
                                </div>
                                <SignalPill
                                  label={task.status.replace(/_/g, ' ')}
                                  tone={task.status === 'review' ? 'danger' : task.status === 'testing' ? 'warning' : 'info'}
                                />
                              </div>
                            </Link>
                          ))
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-[1.8rem] border border-mc-border bg-mc-bg-secondary/88 p-5 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.75)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="flex items-center gap-2 text-sm font-medium text-mc-text">
                    <Activity className="h-4 w-4 text-mc-accent" />
                    Recent Important Events
                  </div>
                  <div className="mt-4 space-y-3">
                    {recentImportantEvents.length === 0 ? (
                      <div className="rounded-2xl border border-mc-border bg-mc-bg px-4 py-3 text-sm text-mc-text-secondary">
                        No recent events recorded.
                      </div>
                    ) : (
                      recentImportantEvents.map((event) => {
                        const task = event.task_id ? tasksById.get(event.task_id) : undefined;
                        const workspace = task ? workspacesById.get(task.workspace_id) : undefined;

                        return (
                          <div key={event.id} className="rounded-2xl border border-mc-border bg-mc-bg px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <EventChip label={labelForEvent(event.type)} tone={toneForEvent(event.type)} />
                                  <span className="text-[11px] uppercase tracking-[0.16em] text-mc-text-secondary">
                                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                                  </span>
                                </div>
                                <div className="mt-2 text-sm leading-relaxed text-mc-text">{event.message}</div>
                              </div>
                            </div>
                            {workspace ? (
                              <div className="mt-3 flex flex-wrap gap-2 text-xs text-mc-text-secondary">
                                <Link href={`/workspace/${workspace.slug}`} className="inline-flex items-center rounded-full border border-mc-border px-2.5 py-1 hover:text-mc-text">
                                  {workspace.name}
                                </Link>
                                {task ? (
                                  <Link href={`/workspace/${workspace.slug}/tasks/${task.id}`} className="inline-flex items-center rounded-full border border-mc-border px-2.5 py-1 hover:text-mc-text">
                                    Open task
                                  </Link>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-[1.8rem] border border-mc-border bg-mc-bg-secondary/88 p-5 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.75)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <div className="flex items-center gap-2 text-sm font-medium text-mc-text">
                    <Workflow className="h-4 w-4 text-mc-accent-green" />
                    Operator Presets
                  </div>
                  <div className="mt-4 space-y-2">
                    {quickRoutes.map((route) => (
                      <Link
                        key={route.href}
                        href={route.href}
                        className="block rounded-2xl border border-mc-border bg-mc-bg px-4 py-3 transition-colors hover:border-mc-accent/30"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-mc-text">{route.label}</div>
                            <div className="mt-1 text-xs text-mc-text-secondary">{route.detail}</div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-mc-text-secondary" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function OpsMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: 'default' | 'warning' | 'success';
}) {
  return (
    <div
      className={`rounded-[1.6rem] border p-4 shadow-[0_18px_36px_-34px_rgba(0,0,0,0.75)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${
        tone === 'warning'
          ? 'border-mc-accent-yellow/25 bg-[linear-gradient(180deg,rgba(210,153,34,0.08),rgba(22,27,34,0.9))]'
          : tone === 'success'
            ? 'border-mc-accent-green/25 bg-[linear-gradient(180deg,rgba(63,185,80,0.08),rgba(22,27,34,0.9))]'
            : 'border-mc-border bg-mc-bg-secondary/88'
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.22em] text-mc-text-secondary">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-mc-text">{value}</div>
      <div className="mt-2 text-sm text-mc-text-secondary">{detail}</div>
    </div>
  );
}

function SignalPill({ label, tone }: { label: string; tone: 'danger' | 'warning' | 'info' | 'success' }) {
  const toneClass =
    tone === 'danger'
      ? 'border-mc-accent-red/25 bg-mc-accent-red/10 text-mc-accent-red'
      : tone === 'warning'
        ? 'border-mc-accent-yellow/25 bg-mc-accent-yellow/10 text-mc-accent-yellow'
        : tone === 'success'
          ? 'border-mc-accent-green/25 bg-mc-accent-green/10 text-mc-accent-green'
          : 'border-mc-accent/25 bg-mc-accent/10 text-mc-accent';

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${toneClass}`}>{label}</span>;
}

function EventChip({ label, tone }: { label: string; tone: 'danger' | 'warning' | 'success' | 'default' }) {
  const toneClass =
    tone === 'danger'
      ? 'border-mc-accent-red/25 bg-mc-accent-red/10 text-mc-accent-red'
      : tone === 'warning'
        ? 'border-mc-accent-yellow/25 bg-mc-accent-yellow/10 text-mc-accent-yellow'
        : tone === 'success'
          ? 'border-mc-accent-green/25 bg-mc-accent-green/10 text-mc-accent-green'
          : 'border-mc-border bg-mc-bg text-mc-text-secondary';

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${toneClass}`}>{label}</span>;
}
