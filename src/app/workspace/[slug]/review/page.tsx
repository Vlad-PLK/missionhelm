'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, PlayCircle, RotateCcw, ShieldAlert, TestTube2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { TaskModal } from '@/components/TaskModal';
import { WorkspaceSubnav } from '@/components/WorkspaceSubnav';
import type { Agent, Task, TaskActivity, TaskDeliverable, Workspace } from '@/lib/types';

type ReviewTask = Task & { planning_dispatch_error?: string };

export default function WorkspaceReviewPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
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

      const [tasksRes, agentsRes] = await Promise.all([
        fetch(`/api/tasks?workspace_id=${workspaceData.id}&status=testing,review,pending_dispatch`),
        fetch(`/api/agents?workspace_id=${workspaceData.id}`),
      ]);

      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (agentsRes.ok) setAgents(await agentsRes.json());
    } catch (error) {
      console.error('Failed to load review page:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const grouped = useMemo(
    () => ({
      testing: tasks.filter((task) => task.status === 'testing'),
      review: tasks.filter((task) => task.status === 'review'),
      pendingDispatch: tasks.filter((task) => task.status === 'pending_dispatch'),
    }),
    [tasks],
  );

  const headerStats = useMemo(
    () => ({
      activeAgents: agents.filter((agent) => agent.status === 'working').length,
      tasksInQueue: tasks.filter((task) => task.status !== 'done' && task.status !== 'review').length,
    }),
    [agents, tasks],
  );

  if (notFound) {
    return (
      <div className="min-h-[100dvh] bg-mc-bg px-4 py-8">
        <div className="mx-auto max-w-md rounded-[2rem] border border-mc-border bg-mc-bg-secondary/88 p-8 text-center shadow-[0_20px_50px_-32px_rgba(0,0,0,0.8)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-mc-border bg-mc-bg">
            <TestTube2 className="h-7 w-7 text-mc-accent" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-mc-text">Workspace not found</h1>
          <p className="mt-3 text-sm leading-relaxed text-mc-text-secondary">The requested workspace could not be loaded.</p>
          <Link href="/" className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-mc-accent px-4 py-2 text-sm font-medium text-mc-bg">
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !workspace) {
    return (
      <div className="min-h-[100dvh] bg-mc-bg px-4 py-8 lg:px-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-20 animate-pulse rounded-[1.8rem] border border-mc-border bg-mc-bg-secondary/70" />
          <div className="h-28 animate-pulse rounded-[1.8rem] border border-mc-border bg-mc-bg-secondary/70" />
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-[1.6rem] border border-mc-border bg-mc-bg-secondary/70" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-mc-bg pb-10">
      <Header workspace={workspace} statsOverride={headerStats} onCreateTask={() => setShowCreateTaskModal(true)} />
      <WorkspaceSubnav workspaceSlug={workspace.slug} />

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)] lg:items-end">
          <div>
            <Link href={`/workspace/${workspace.slug}`} className="mb-3 inline-flex items-center gap-2 text-sm text-mc-text-secondary transition-colors hover:text-mc-text">
              <ArrowLeft className="w-4 h-4" />
              Back to Queue
            </Link>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-mc-bg px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-mc-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <TestTube2 className="h-3.5 w-3.5 text-mc-accent" />
              Review Surface
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-mc-text lg:text-5xl">Review and Testing Surface</h1>
            <p className="mt-3 max-w-[64ch] text-sm leading-relaxed text-mc-text-secondary lg:text-base">
              Keep the tasks that need operator attention in one place instead of scanning the full kanban board.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(88,166,255,0.12),rgba(13,17,23,0.18))] p-4 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">Next focus</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-mc-text">
              {grouped.review.length > 0 ? 'Approve review queue' : grouped.testing.length > 0 ? 'Run testing checks' : 'Clear dispatch blockers'}
            </div>
            <div className="mt-2 text-sm text-mc-text-secondary">
              {grouped.review.length > 0
                ? `${grouped.review.length} tasks are ready for operator approval.`
                : grouped.testing.length > 0
                  ? `${grouped.testing.length} tasks need validation or automated checks.`
                  : `${grouped.pendingDispatch.length} tasks need dispatch attention.`}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <SummaryCard label="Testing" value={grouped.testing.length} description="Tasks waiting on automated or manual checks." tone={grouped.testing.length > 0 ? 'warning' : 'default'} />
          <SummaryCard label="Review" value={grouped.review.length} description="Tasks ready for operator approval." tone={grouped.review.length > 0 ? 'warning' : 'success'} />
          <SummaryCard label="Dispatch Issues" value={grouped.pendingDispatch.length} description="Tasks blocked before active execution." tone={grouped.pendingDispatch.length > 0 ? 'danger' : 'default'} />
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-3">
          <ReviewColumn title="In Testing" description="Run automated checks or inspect the latest outputs." tasks={grouped.testing} workspaceSlug={workspace.slug} onTaskUpdated={loadPage} />
          <ReviewColumn title="Awaiting Review" description="Approve, send back, or open the full task detail view." tasks={grouped.review} workspaceSlug={workspace.slug} onTaskUpdated={loadPage} />
          <ReviewColumn title="Pending Dispatch" description="Spot routing or planning problems before they stall the workspace." tasks={grouped.pendingDispatch} workspaceSlug={workspace.slug} onTaskUpdated={loadPage} />
        </div>
      </main>

      {showCreateTaskModal ? (
        <TaskModal
          workspaceId={workspace.id}
          onClose={() => {
            setShowCreateTaskModal(false);
            void loadPage();
          }}
        />
      ) : null}
    </div>
  );
}

function ReviewColumn({
  title,
  description,
  tasks,
  workspaceSlug,
  onTaskUpdated,
}: {
  title: string;
  description: string;
  tasks: ReviewTask[];
  workspaceSlug: string;
  onTaskUpdated: () => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-mc-text">{title}</h2>
        <p className="mt-1 text-sm text-mc-text-secondary">{description}</p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-[1.6rem] border border-mc-border bg-mc-bg-secondary/88 px-4 py-5 text-sm text-mc-text-secondary">
          Nothing is waiting here right now.
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <ReviewTaskCard key={task.id} task={task} workspaceSlug={workspaceSlug} onTaskUpdated={onTaskUpdated} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewTaskCard({ task, workspaceSlug, onTaskUpdated }: { task: ReviewTask; workspaceSlug: string; onTaskUpdated: () => void }) {
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [deliverables, setDeliverables] = useState<TaskDeliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadCard = useCallback(async () => {
    try {
      const [activityRes, deliverableRes] = await Promise.all([
        fetch(`/api/tasks/${task.id}/activities`),
        fetch(`/api/tasks/${task.id}/deliverables`),
      ]);

      if (activityRes.ok) setActivities(await activityRes.json());
      if (deliverableRes.ok) setDeliverables(await deliverableRes.json());
    } catch (error) {
      console.error('Failed to load review card context:', error);
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  const latestActivity = activities[0];
  const latestTest = activities.find((activity) => activity.activity_type === 'test_passed' || activity.activity_type === 'test_failed');

  const updateStatus = async (status: Task['status']) => {
    setActionError(null);
    setActionLoading(status);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        let message = `Failed to update task status (${res.status})`;
        try {
          const payload = await res.json();
          if (Array.isArray(payload?.details) && payload.details.length > 0) {
            message = payload.details.join(' ');
          } else if (typeof payload?.error === 'string') {
            message = payload.error;
          }
        } catch {
          // Keep fallback message
        }
        setActionError(message);
        return;
      }

      onTaskUpdated();
    } catch (error) {
      console.error('Failed to update review task status:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to update task status');
    } finally {
      setActionLoading(null);
    }
  };

  const runTests = async () => {
    setActionError(null);
    setActionLoading('test');
    try {
      const res = await fetch(`/api/tasks/${task.id}/test`, { method: 'POST' });
      if (!res.ok) {
        let message = `Failed to run tests (${res.status})`;
        try {
          const payload = await res.json();
          if (typeof payload?.error === 'string') message = payload.error;
        } catch {
          // Keep fallback message
        }
        setActionError(message);
        return;
      }
      onTaskUpdated();
    } catch (error) {
      console.error('Failed to run tests from review card:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to run tests');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <article className="rounded-[1.6rem] border border-mc-border bg-mc-bg-secondary/88 p-4 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.75)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">{task.status.replace(/_/g, ' ')}</div>
          <div className="mt-2 text-base font-semibold leading-snug tracking-tight text-mc-text">{task.title}</div>
          {task.assigned_agent?.name ? (
            <div className="mt-1 text-xs text-mc-text-secondary">Assigned to {task.assigned_agent.name}</div>
          ) : null}
        </div>
        <Link href={`/workspace/${workspaceSlug}/tasks/${task.id}`} className="inline-flex min-h-[36px] items-center rounded-full border border-mc-border px-3 py-1.5 text-xs text-mc-text-secondary transition-colors hover:text-mc-text">
          Open detail
        </Link>
      </div>

      {task.planning_dispatch_error ? (
        <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-mc-accent-red/30 bg-mc-accent-red/10 px-4 py-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-mc-accent-red" />
          <div className="text-xs leading-relaxed text-mc-text-secondary">{task.planning_dispatch_error}</div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <MiniStat label="Deliverables" value={deliverables.length} />
        <MiniStat label="Latest Test" value={latestTest ? latestTest.activity_type.replace('_', ' ') : 'not run'} />
        <MiniStat label="Activity" value={loading ? '...' : latestActivity ? latestActivity.activity_type.replace('_', ' ') : 'none'} />
      </div>

      {latestActivity ? (
        <div className="mt-4 rounded-[1.25rem] border border-mc-border bg-mc-bg px-4 py-4 text-sm text-mc-text-secondary">
          {latestActivity.message}
        </div>
      ) : null}

      {actionError ? (
        <div className="mt-4 rounded-[1.25rem] border border-mc-accent-red/30 bg-mc-accent-red/10 px-4 py-4 text-sm text-mc-text-secondary">
          {actionError}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <ReviewActionButton
          onClick={runTests}
          disabled={actionLoading === 'test' || deliverables.length === 0}
          tone="default"
          icon={actionLoading === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
        >
          Run Tests
        </ReviewActionButton>
        <ReviewActionButton
          onClick={() => updateStatus('assigned')}
          disabled={actionLoading === 'assigned'}
          tone="default"
          icon={actionLoading === 'assigned' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        >
          Send Back
        </ReviewActionButton>
        <ReviewActionButton
          onClick={() => updateStatus('done')}
          disabled={task.status !== 'review' || actionLoading === 'done'}
          tone="success"
          icon={actionLoading === 'done' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        >
          Approve
        </ReviewActionButton>
      </div>
    </article>
  );
}

function SummaryCard({
  label,
  value,
  description,
  tone,
}: {
  label: string;
  value: number;
  description: string;
  tone: 'default' | 'warning' | 'success' | 'danger';
}) {
  const toneClass =
    tone === 'warning'
      ? 'border-mc-accent-yellow/25 bg-[linear-gradient(180deg,rgba(210,153,34,0.08),rgba(22,27,34,0.9))]'
      : tone === 'success'
        ? 'border-mc-accent-green/25 bg-[linear-gradient(180deg,rgba(63,185,80,0.08),rgba(22,27,34,0.9))]'
        : tone === 'danger'
          ? 'border-mc-accent-red/25 bg-[linear-gradient(180deg,rgba(248,81,73,0.08),rgba(22,27,34,0.9))]'
          : 'border-mc-border bg-mc-bg-secondary/88';

  return (
    <div className={`rounded-[1.6rem] border p-4 shadow-[0_18px_36px_-34px_rgba(0,0,0,0.75)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.22em] text-mc-text-secondary">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-mc-text">{value}</div>
      <div className="mt-2 text-sm text-mc-text-secondary">{description}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[1.15rem] border border-mc-border bg-mc-bg px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-mc-text-secondary">{label}</div>
      <div className="mt-1 font-medium text-mc-text">{value}</div>
    </div>
  );
}

function ReviewActionButton({
  children,
  icon,
  onClick,
  disabled,
  tone,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone: 'default' | 'success';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[40px] items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
        tone === 'success'
          ? 'border-mc-accent-green/30 bg-mc-accent-green/10 text-mc-accent-green'
          : 'border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/30'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
