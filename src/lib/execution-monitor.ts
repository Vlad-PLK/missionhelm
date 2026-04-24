import {
  getExecutionMonitorMaxRunsPerCycle,
  getExecutionMonitorPollIntervalMs,
  isExecutionMonitorEnabled,
} from '@/lib/config';
import {
  countActiveExecutionRuns,
  listActiveExecutionRunsWithLimit,
} from '@/lib/execution-runs';
import { runExecutionWatchdog } from '@/lib/execution-watchdog';
import { ingestRuntimeSignalsForRun } from '@/lib/runtime-ingestion';
import type {
  ExecutionMonitorCycleReason,
  ExecutionMonitorCycleSummary,
  ExecutionMonitorStatus,
  TaskDispatchRun,
} from '@/lib/types';

type TimerHandle = ReturnType<typeof setTimeout>;

type ExecutionMonitorDeps = {
  isEnabled: () => boolean;
  getIntervalMs: () => number;
  getMaxRunsPerCycle: () => number;
  countActiveRuns: () => number;
  listActiveRuns: (limit: number) => TaskDispatchRun[];
  ingestRun: typeof ingestRuntimeSignalsForRun;
  runWatchdog: typeof runExecutionWatchdog;
  schedule: (callback: () => void, delayMs: number) => TimerHandle;
  cancel: (handle: TimerHandle) => void;
  now: () => string;
  onError: (error: unknown) => void;
};

export type ExecutionMonitor = {
  start: () => ExecutionMonitorStatus;
  stop: () => void;
  getStatus: () => ExecutionMonitorStatus;
  runCycle: (params?: {
    reason?: ExecutionMonitorCycleReason;
    force?: boolean;
  }) => Promise<ExecutionMonitorCycleSummary>;
};

const defaultDeps: ExecutionMonitorDeps = {
  isEnabled: isExecutionMonitorEnabled,
  getIntervalMs: getExecutionMonitorPollIntervalMs,
  getMaxRunsPerCycle: getExecutionMonitorMaxRunsPerCycle,
  countActiveRuns: countActiveExecutionRuns,
  listActiveRuns: listActiveExecutionRunsWithLimit,
  ingestRun: ingestRuntimeSignalsForRun,
  runWatchdog: runExecutionWatchdog,
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle),
  now: () => new Date().toISOString(),
  onError: (error) => {
    console.error('[Execution Monitor] Cycle failed:', error);
  },
};

function buildEmptySummary(now: string, reason: ExecutionMonitorCycleReason, forced: boolean): ExecutionMonitorCycleSummary {
  return {
    reason,
    forced,
    started_at: now,
    completed_at: now,
    active_run_count: 0,
    processed_run_count: 0,
    processed_run_ids: [],
    skipped_run_ids: [],
    incident_count: 0,
    run_errors: [],
  };
}

export function createExecutionMonitor(overrides: Partial<ExecutionMonitorDeps> = {}): ExecutionMonitor {
  const deps = { ...defaultDeps, ...overrides };
  let timer: TimerHandle | null = null;
  let runningCycle: Promise<ExecutionMonitorCycleSummary> | null = null;

  const status: ExecutionMonitorStatus = {
    enabled: deps.isEnabled(),
    started: false,
    running: false,
    interval_ms: deps.getIntervalMs(),
    max_runs_per_cycle: deps.getMaxRunsPerCycle(),
    last_started_at: null,
    last_completed_at: null,
    last_error: null,
    last_error_at: null,
    last_cycle_reason: null,
    last_cycle_summary: null,
    total_cycles: 0,
    total_failures: 0,
    next_scheduled_at: null,
  };

  function syncConfig(): void {
    status.enabled = deps.isEnabled();
    status.interval_ms = deps.getIntervalMs();
    status.max_runs_per_cycle = deps.getMaxRunsPerCycle();
  }

  function scheduleNextCycle(): void {
    if (!status.started || !status.enabled) {
      status.next_scheduled_at = null;
      return;
    }

    if (timer) {
      deps.cancel(timer);
    }

    const nextScheduledAt = new Date(Date.now() + status.interval_ms).toISOString();
    status.next_scheduled_at = nextScheduledAt;
    timer = deps.schedule(() => {
      void monitor.runCycle({ reason: 'interval' });
    }, status.interval_ms);
  }

  const monitor: ExecutionMonitor = {
    start(): ExecutionMonitorStatus {
      syncConfig();
      if (!status.enabled) {
        return monitor.getStatus();
      }

      if (!status.started) {
        status.started = true;
        void monitor.runCycle({ reason: 'startup' });
      }

      return monitor.getStatus();
    },

    stop(): void {
      status.started = false;
      status.running = false;
      status.next_scheduled_at = null;
      if (timer) {
        deps.cancel(timer);
        timer = null;
      }
    },

    getStatus(): ExecutionMonitorStatus {
      syncConfig();
      return {
        ...status,
        last_cycle_summary: status.last_cycle_summary
          ? {
              ...status.last_cycle_summary,
              processed_run_ids: [...status.last_cycle_summary.processed_run_ids],
              skipped_run_ids: [...status.last_cycle_summary.skipped_run_ids],
              run_errors: [...status.last_cycle_summary.run_errors],
            }
          : null,
      };
    },

    async runCycle(params = {}): Promise<ExecutionMonitorCycleSummary> {
      const reason = params.reason ?? 'manual';
      const forced = params.force ?? false;
      syncConfig();

      if (!status.enabled && !forced) {
        const skipped = buildEmptySummary(deps.now(), reason, forced);
        status.last_cycle_reason = reason;
        status.last_cycle_summary = skipped;
        return skipped;
      }

      if (runningCycle) {
        return runningCycle;
      }

      runningCycle = (async () => {
        const startedAt = deps.now();
        status.running = true;
        status.last_started_at = startedAt;
        status.last_cycle_reason = reason;
        status.last_error = null;
        status.last_error_at = null;
        if (timer) {
          deps.cancel(timer);
          timer = null;
        }

        const activeRunCount = deps.countActiveRuns();
        const candidateRuns = deps
          .listActiveRuns(status.max_runs_per_cycle)
          .filter((run) => run.execution_state !== 'completed' && run.dispatch_status !== 'superseded');

        const processedRunIds: string[] = [];
        const skippedRunIds: string[] = [];
        const runErrors: ExecutionMonitorCycleSummary['run_errors'] = [];

        for (const run of candidateRuns) {
          try {
            await deps.ingestRun({ run });
            processedRunIds.push(run.id);
          } catch (error) {
            runErrors.push({
              run_id: run.id,
              message: error instanceof Error ? error.message : 'Unknown execution monitor error',
            });
          }
        }

        for (const run of candidateRuns) {
          if (!processedRunIds.includes(run.id) && !runErrors.some((entry) => entry.run_id === run.id)) {
            skippedRunIds.push(run.id);
          }
        }

        let incidentCount = 0;
        try {
          const incidents = await deps.runWatchdog({
            pollRuntime: false,
            runIds: candidateRuns.map((run) => run.id),
          });
          incidentCount = incidents.length;
        } catch (error) {
          deps.onError(error);
          const message = error instanceof Error ? error.message : 'Unknown watchdog failure';
          runErrors.push({
            run_id: 'watchdog',
            message,
          });
        }

        const completedAt = deps.now();
        const summary: ExecutionMonitorCycleSummary = {
          reason,
          forced,
          started_at: startedAt,
          completed_at: completedAt,
          active_run_count: activeRunCount,
          processed_run_count: processedRunIds.length,
          processed_run_ids: processedRunIds,
          skipped_run_ids: skippedRunIds,
          incident_count: incidentCount,
          run_errors: runErrors,
        };

        status.total_cycles += 1;
        status.last_completed_at = completedAt;
        status.last_cycle_summary = summary;
        if (runErrors.length > 0) {
          status.total_failures += runErrors.length;
          status.last_error = runErrors[runErrors.length - 1]?.message ?? null;
          status.last_error_at = completedAt;
        }

        return summary;
      })();

      try {
        return await runningCycle;
      } catch (error) {
        status.total_failures += 1;
        status.last_error = error instanceof Error ? error.message : 'Unknown execution monitor failure';
        status.last_error_at = deps.now();
        deps.onError(error);
        throw error;
      } finally {
        runningCycle = null;
        status.running = false;
        if (status.started) {
          scheduleNextCycle();
        }
      }
    },
  };

  return monitor;
}

const GLOBAL_MONITOR_KEY = '__mission_control_execution_monitor__';

function getGlobalExecutionMonitor(): ExecutionMonitor {
  const globalScope = globalThis as Record<string, unknown>;
  const existing = globalScope[GLOBAL_MONITOR_KEY];
  if (existing) {
    return existing as ExecutionMonitor;
  }

  const monitor = createExecutionMonitor();
  globalScope[GLOBAL_MONITOR_KEY] = monitor;
  return monitor;
}

export function ensureExecutionMonitorStarted(): ExecutionMonitorStatus {
  return getGlobalExecutionMonitor().start();
}

export function getExecutionMonitorStatus(): ExecutionMonitorStatus {
  return getGlobalExecutionMonitor().getStatus();
}

export async function runExecutionMonitorCycle(params: {
  reason?: ExecutionMonitorCycleReason;
  force?: boolean;
} = {}): Promise<ExecutionMonitorCycleSummary> {
  return getGlobalExecutionMonitor().runCycle(params);
}

export function stopExecutionMonitorForTests(): void {
  getGlobalExecutionMonitor().stop();
}
