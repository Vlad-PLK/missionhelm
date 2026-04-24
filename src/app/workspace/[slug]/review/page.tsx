'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Loader2, PlayCircle, RotateCcw } from 'lucide-react';
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
    loadPage();
  }, [loadPage]);

  const grouped = useMemo(() => ({
    testing: tasks.filter((task) => task.status === 'testing'),
    review: tasks.filter((task) => task.status === 'review'),
    pendingDispatch: tasks.filter((task) => task.status === 'pending_dispatch'),
  }), [tasks]);

  const headerStats = useMemo(() => ({
    activeAgents: agents.filter((agent) => agent.status === 'working').length,
    tasksInQueue: tasks.filter((task) => task.status !== 'done' && task.status !== 'review').length,
  }), [agents, tasks]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">🧪</div>
          <h1 className="text-2xl font-semibold mb-2">Workspace not found</h1>
          <p className="text-mc-text-secondary mb-6">The requested workspace could not be loaded.</p>
          <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-mc-accent text-mc-bg font-medium">
            <ArrowLeft className="w-4 h-4" />
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !workspace) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading review surface...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mc-bg pb-10">
      <Header workspace={workspace} statsOverride={headerStats} onCreateTask={() => setShowCreateTaskModal(true)} />
      <WorkspaceSubnav workspaceSlug={workspace.slug} />

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        <section className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <Link href={`/workspace/${workspace.slug}`} className="inline-flex items-center gap-2 text-sm text-mc-text-secondary hover:text-mc-text mb-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Queue
            </Link>
            <h1 className="text-2xl lg:text-3xl font-semibold">Review and Testing Surface</h1>
            <p className="text-mc-text-secondary mt-2 max-w-3xl">
              Keep the tasks that need operator attention in one place instead of scanning the full kanban board.
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SummaryCard label="Testing" value={grouped.testing.length} description="Tasks waiting on automated or manual checks" />
          <SummaryCard label="Review" value={grouped.review.length} description="Tasks ready for operator approval" />
          <SummaryCard label="Dispatch Issues" value={grouped.pendingDispatch.length} description="Tasks blocked before active execution" />
        </section>

        <ReviewColumn title="In Testing" description="Run automated checks or inspect latest outputs." tasks={grouped.testing} workspaceSlug={workspace.slug} onTaskUpdated={loadPage} />
        <ReviewColumn title="Awaiting Review" description="Approve, send back, or open the full task detail view." tasks={grouped.review} workspaceSlug={workspace.slug} onTaskUpdated={loadPage} />
        <ReviewColumn title="Pending Dispatch" description="Spot routing or planning problems before they stall the workspace." tasks={grouped.pendingDispatch} workspaceSlug={workspace.slug} onTaskUpdated={loadPage} />
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
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-mc-text-secondary mt-1">{description}</p>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-mc-border bg-mc-bg-secondary px-4 py-5 text-sm text-mc-text-secondary">
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
    loadCard();
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
    <article className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-mc-text-secondary">{task.status.replace('_', ' ')}</div>
          <div className="font-medium text-base leading-snug mt-1">{task.title}</div>
          {task.assigned_agent?.name && (
            <div className="text-xs text-mc-text-secondary mt-1">Assigned to {task.assigned_agent.name}</div>
          )}
        </div>
        <Link href={`/workspace/${workspaceSlug}/tasks/${task.id}`} className="text-sm text-mc-accent hover:text-mc-accent/80">
          Open detail
        </Link>
      </div>

      {task.planning_dispatch_error && (
        <div className="rounded-lg border border-mc-accent-red/30 bg-mc-accent-red/10 px-3 py-3 text-xs text-mc-text-secondary">
          {task.planning_dispatch_error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 text-sm">
        <MiniStat label="Deliverables" value={deliverables.length} />
        <MiniStat label="Latest Test" value={latestTest ? latestTest.activity_type.replace('_', ' ') : 'not run'} />
        <MiniStat label="Activity" value={loading ? '...' : (latestActivity ? latestActivity.activity_type.replace('_', ' ') : 'none')} />
      </div>

      {latestActivity && (
        <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3 text-sm text-mc-text-secondary">
          {latestActivity.message}
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-mc-accent-red/30 bg-mc-accent-red/10 px-3 py-3 text-sm text-mc-text-secondary">
          {actionError}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={runTests}
          disabled={actionLoading === 'test' || deliverables.length === 0}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-sm disabled:opacity-50"
        >
          {actionLoading === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          Run Tests
        </button>
        <button
          onClick={() => updateStatus('assigned')}
          disabled={actionLoading === 'assigned'}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-sm"
        >
          {actionLoading === 'assigned' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          Send Back
        </button>
        <button
          onClick={() => updateStatus('done')}
          disabled={task.status !== 'review' || actionLoading === 'done'}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-accent-green/30 bg-mc-accent-green/10 text-sm text-mc-accent-green disabled:opacity-50"
        >
          {actionLoading === 'done' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Approve
        </button>
        <Link href={`/workspace/${workspaceSlug}/tasks/${task.id}`} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-sm text-mc-text">
          Open Detail
        </Link>
      </div>
    </article>
  );
}

function SummaryCard({ label, value, description }: { label: string; value: number; description: string }) {
  return (
    <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4">
      <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary">{label}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
      <div className="text-sm text-mc-text-secondary mt-2">{description}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
      <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary">{label}</div>
      <div className="font-medium mt-1">{value}</div>
    </div>
  );
}
