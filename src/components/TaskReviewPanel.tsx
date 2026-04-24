'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, Loader2, PlayCircle, RotateCcw, Send } from 'lucide-react';
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
    loadContext();
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
    <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Review / Approval</div>
          <div className="text-xs text-mc-text-secondary mt-1">
            Keep testing, approval, and send-back actions visible without returning to the board.
          </div>
        </div>
        <span className="text-xs px-2 py-1 rounded-full border border-mc-border bg-mc-bg text-mc-text-secondary uppercase">
          {task.status.replace('_', ' ')}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-mc-text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading testing context...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <Stat label="Deliverables" value={String(deliverables.length)} />
            <Stat label="Activities" value={String(activities.length)} />
            <Stat label="Latest Test" value={latestTestActivity ? latestTestActivity.activity_type.replace('_', ' ') : 'Not run'} />
          </div>

          {latestTestActivity ? (
            <div className={`rounded-lg border px-3 py-3 ${latestTestActivity.activity_type === 'test_passed' ? 'border-mc-accent-green/30 bg-mc-accent-green/10' : 'border-mc-accent-red/30 bg-mc-accent-red/10'}`}>
              <div className="font-medium text-sm">
                {latestTestActivity.activity_type === 'test_passed' ? 'Latest automated test passed' : 'Latest automated test failed'}
              </div>
              <div className="text-xs text-mc-text-secondary mt-1">{latestTestActivity.message}</div>
            </div>
          ) : (
            <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3 text-sm text-mc-text-secondary">
              No automated test results recorded yet for this task.
            </div>
          )}

          {task.planning_dispatch_error && (
            <div className="rounded-lg border border-mc-accent-red/30 bg-mc-accent-red/10 px-3 py-3 text-sm text-mc-text">
              <div className="font-medium">Dispatch warning</div>
              <div className="text-xs text-mc-text-secondary mt-1">{task.planning_dispatch_error}</div>
            </div>
          )}

          {actionError && (
            <div className="rounded-lg border border-mc-accent-red/30 bg-mc-accent-red/10 px-3 py-3 text-sm text-mc-text-secondary">
              {actionError}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
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
    <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
      <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
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
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm disabled:opacity-50 ${
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
