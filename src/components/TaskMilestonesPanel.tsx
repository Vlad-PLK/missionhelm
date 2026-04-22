'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, Flag, Loader2 } from 'lucide-react';
import type { TaskMilestone } from '@/lib/types';

interface MilestonesResponse {
  milestones: TaskMilestone[];
  progress: {
    current_phase: string;
  };
}

export function TaskMilestonesPanel({ taskId }: { taskId: string }) {
  const [data, setData] = useState<MilestonesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMilestones = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/milestones`);
      if (!res.ok) {
        setData({ milestones: [], progress: { current_phase: 'initiation' } });
        return;
      }
      setData(await res.json());
    } catch (error) {
      console.error('Failed to load task milestones:', error);
      setData({ milestones: [], progress: { current_phase: 'initiation' } });
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadMilestones();
  }, [loadMilestones]);

  const completedCount = useMemo(() => {
    return data?.milestones.filter((milestone) => milestone.status === 'completed').length || 0;
  }, [data]);

  if (loading) {
    return (
      <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 flex items-center gap-2 text-sm text-mc-text-secondary">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading milestones...
      </div>
    );
  }

  if (!data || data.milestones.length === 0) {
    return (
      <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4">
        <div className="text-sm font-medium">Progress / Milestones</div>
        <div className="text-sm text-mc-text-secondary mt-2">
          No milestones have been registered for this task yet. The backend supports them, so this panel is ready as soon as milestones are created.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Progress / Milestones</div>
          <div className="text-xs text-mc-text-secondary mt-1">
            {completedCount} of {data.milestones.length} milestones complete
          </div>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-xs text-mc-text-secondary uppercase tracking-wider">
          <Flag className="w-3.5 h-3.5" />
          Current phase: {data.progress.current_phase}
        </div>
      </div>

      <div className="space-y-2">
        {data.milestones.map((milestone) => {
          const completed = milestone.status === 'completed';
          return (
            <div key={milestone.id} className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
              <div className="flex items-start gap-3">
                <div className="pt-0.5 text-mc-accent">
                  {completed ? <CheckCircle2 className="w-4 h-4 text-mc-accent-green" /> : <CircleDashed className="w-4 h-4 text-mc-text-secondary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-sm">{milestone.title}</div>
                    <span className={`text-[10px] uppercase rounded px-2 py-0.5 ${completed ? 'bg-mc-accent-green/15 text-mc-accent-green' : 'bg-mc-bg-tertiary text-mc-text-secondary'}`}>
                      {milestone.status.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] uppercase rounded px-2 py-0.5 bg-mc-accent-cyan/10 text-mc-accent-cyan">
                      {milestone.phase}
                    </span>
                  </div>
                  {milestone.description && (
                    <div className="text-sm text-mc-text-secondary mt-1 leading-relaxed">{milestone.description}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
