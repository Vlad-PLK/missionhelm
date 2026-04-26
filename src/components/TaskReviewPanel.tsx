'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Loader2, PlayCircle, RotateCcw, Send, ShieldAlert, TestTube2 } from 'lucide-react';
import type { Task, TaskActivity, TaskDeliverable, TaskStatus } from '@/lib/types';

interface TaskReviewPanelProps {
  task: Task;
  onTaskUpdated?: (task: Task) => void;
}

export function TaskReviewPanel({ task, onTaskUpdated }: TaskReviewPanelProps) {
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [deliverables, setDeliverables] = useState<TaskDeliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    try {
      const [activityRes, deliverableRes] = await Promise.all([
        fetch(`/api/tasks/${task.id}/activities`),
        fetch(`/api/tasks/${task.id}/deliverables`),
      ]);

      if (activityRes.ok) {
        setActivities(await activityRes.json());
      }
      if (deliverableRes.ok) {
        setDeliverables(await deliverableRes.json());
      }
    } catch (error) {
      console.error('Failed to load review context:', error);
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const latestTestActivity = useMemo(() => {
    return activities.find((activity) => activity.activity_type === 'test_passed' || activity.activity_type === 'test_failed') || null;
  }, [activities]);

  const runStatusUpdate = async (status: TaskStatus) => {
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
          // Keep fallback
        }
        setActionError(message);
        return;
      }

      const updatedTask = await res.json();
      onTaskUpdated?.(updatedTask);
    } catch (error) {
      console.error('Failed to update task status:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to update task status');
    } finally {
      setActionLoading(null);
    }
  };

  const runAutomatedTests = async () => {
    setActionError(null);
    setActionLoading('test');
    try {
      const res = await fetch(`/api/tasks/${task.id}/test`, { method: 'POST' });
      if (!res.ok) {
        let message = `Failed to run automated tests (${res.status})`;
        try {
          const payload = await res.json();
          if (typeof payload?.error === 'string') message = payload.error;
        } catch {
          // Keep fallback
        }
        setActionError(message);
        return;
      }

      const result = await res.json();
      if (result.newStatus) {
        const taskRes = await fetch(`/api/tasks/${task.id}`);
        if (taskRes.ok) {
          onTaskUpdated?.(await taskRes.json());
        }
      }

      await loadContext();
    } catch (error) {
      console.error('Failed to run tests:', error);
      setActionError(error instanceof Error ? error.message : 'Failed to run tests');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="rounded-[1.6rem] border border-mc-border bg-mc-bg-secondary/88 p-5 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.75)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-mc-bg px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-mc-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <TestTube2 className="h-3.5 w-3.5 text-mc-accent" />
            Review / Approval
          </div>
          <h3 className="text-xl font-semibold tracking-tight text-mc-text">Keep approval visible</h3>
          <p className="mt-2 text-sm leading-relaxed text-mc-text-secondary">
            Keep testing state, deliverables, and send-back actions on the same surface instead of bouncing back to the board.
          </p>
        </div>

        <div className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(135deg,rgba(88,166,255,0.12),rgba(13,17,23,0.18))] p-4 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">Current status</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-mc-text">{task.status.replace(/_/g, ' ')}</div>
          <div className="mt-2 text-sm text-mc-text-secondary">
            {task.status === 'review'
              ? 'Operator approval is the next blocking action.'
              : task.status === 'testing'
                ? 'Run tests or inspect receipts before approval.'
                : 'Advance this task into the next review step when evidence is ready.'}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-[1.25rem] border border-mc-border bg-mc-bg" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Deliverables" value={String(deliverables.length)} />
            <Stat label="Activities" value={String(activities.length)} />
            <Stat label="Latest Test" value={latestTestActivity ? latestTestActivity.activity_type.replace('_', ' ') : 'Not run'} />
          </div>

          {latestTestActivity ? (
            <div
              className={`mt-4 rounded-[1.25rem] border px-4 py-4 ${
                latestTestActivity.activity_type === 'test_passed'
                  ? 'border-mc-accent-green/30 bg-mc-accent-green/10'
                  : 'border-mc-accent-red/30 bg-mc-accent-red/10'
              }`}
            >
              <div className="text-sm font-medium text-mc-text">
                {latestTestActivity.activity_type === 'test_passed' ? 'Latest automated test passed' : 'Latest automated test failed'}
              </div>
              <div className="mt-1 text-xs text-mc-text-secondary">{latestTestActivity.message}</div>
            </div>
          ) : (
            <div className="mt-4 rounded-[1.25rem] border border-mc-border bg-mc-bg px-4 py-4 text-sm text-mc-text-secondary">
              No automated test results recorded yet for this task.
            </div>
          )}

          {task.planning_dispatch_error ? (
            <div className="mt-4 flex items-start gap-3 rounded-[1.25rem] border border-mc-accent-red/30 bg-mc-accent-red/10 px-4 py-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-mc-accent-red" />
              <div>
                <div className="text-sm font-medium text-mc-text">Dispatch warning</div>
                <div className="mt-1 text-xs text-mc-text-secondary">{task.planning_dispatch_error}</div>
              </div>
            </div>
          ) : null}

          {actionError ? (
            <div className="mt-4 rounded-[1.25rem] border border-mc-accent-red/30 bg-mc-accent-red/10 px-4 py-4 text-sm text-mc-text-secondary">
              {actionError}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <ActionButton
              label="Run Automated Test"
              icon={<PlayCircle className="w-4 h-4" />}
              onClick={runAutomatedTests}
              disabled={deliverables.length === 0}
              loading={actionLoading === 'test'}
            />
            <ActionButton
              label="Move to Testing"
              icon={<Send className="w-4 h-4" />}
              onClick={() => runStatusUpdate('testing')}
              loading={actionLoading === 'testing'}
              disabled={task.status === 'testing'}
            />
            <ActionButton
              label="Send Back"
              icon={<RotateCcw className="w-4 h-4" />}
              onClick={() => runStatusUpdate('assigned')}
              loading={actionLoading === 'assigned'}
              disabled={task.status === 'assigned'}
            />
            <ActionButton
              label="Approve Done"
              icon={<CheckCircle2 className="w-4 h-4" />}
              onClick={() => runStatusUpdate('done')}
              loading={actionLoading === 'done'}
              disabled={task.status !== 'review'}
              tone="success"
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-mc-border bg-mc-bg px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">{label}</div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-mc-text">{value}</div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  loading,
  tone = 'default',
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'default' | 'success';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        tone === 'success'
          ? 'border-mc-accent-green/30 bg-mc-accent-green/10 text-mc-accent-green'
          : 'border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/40'
      }`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
