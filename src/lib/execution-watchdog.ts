import { v4 as uuidv4 } from 'uuid';
import { queryOne, run, transaction } from '@/lib/db';
import {
  getExecutionRunById,
  hasExecutionReceiptForFingerprint,
  listActiveExecutionRuns,
  recordExecutionReceipt,
  updateExecutionRun,
} from '@/lib/execution-runs';
import { getLatestVisibleTaskDeltaAt, ingestRuntimeSignalsForRun } from '@/lib/runtime-ingestion';
import type { Task, TaskDispatchRun } from '@/lib/types';

export type ExecutionWatchdogRuleId =
  | 'dispatched_no_ack'
  | 'ack_no_progress'
  | 'in_progress_no_delta'
  | 'completion_not_ingested'
  | 'runtime_signal_without_receipt';

export type ExecutionWatchdogIncident = {
  rule: ExecutionWatchdogRuleId;
  runId: string;
  taskId: string;
  agentId: string;
  workspaceId: string;
  title: string;
  description: string;
  detectedAt: string;
};

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function minutesSince(value: string | null | undefined, nowMs: number): number | null {
  const parsed = parseIsoMs(value);
  if (parsed === null) {
    return null;
  }

  return Math.max(0, Math.floor((nowMs - parsed) / 60000));
}

function threshold(envName: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[envName] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function activeBlockerExists(taskId: string, title: string): boolean {
  const existing = queryOne<{ id: string }>(
    `SELECT id
     FROM task_blockers
     WHERE task_id = ?
       AND title = ?
       AND status IN ('active', 'escalated')
     LIMIT 1`,
    [taskId, title]
  );

  return Boolean(existing);
}

function createExecutionBlocker(params: {
  taskId: string;
  agentId: string;
  title: string;
  description: string;
  severity: 'high' | 'medium';
  detectedAt: string;
}): void {
  if (activeBlockerExists(params.taskId, params.title)) {
    return;
  }

  run(
    `INSERT INTO task_blockers (
      id, task_id, blocker_type, severity, status, title, description,
      identified_by_agent_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      params.taskId,
      'technical_impediment',
      params.severity,
      'active',
      params.title,
      params.description,
      params.agentId,
      params.detectedAt,
      params.detectedAt,
    ]
  );
}

function maybeCreateIncident(params: {
  run: TaskDispatchRun;
  task: Task;
  rule: ExecutionWatchdogRuleId;
  title: string;
  description: string;
  detectedAt: string;
}): ExecutionWatchdogIncident {
  const severity = params.rule === 'in_progress_no_delta' ? 'medium' : 'high';
  const sourceFingerprint = `watchdog:${params.rule}:${params.run.id}`;

  transaction(() => {
    recordExecutionReceipt({
      taskId: params.task.id,
      agentId: params.run.agent_id,
      runId: params.run.id,
      sessionId: params.run.openclaw_session_id,
      sessionKey: params.run.session_key,
      receiptType: 'stalled_execution_detected',
      message: params.title,
      sourceType: 'watchdog',
      sourceFingerprint,
      sourceTimestamp: params.detectedAt,
      createdAt: params.detectedAt,
      metadata: {
        watchdog_rule: params.rule,
        description: params.description,
      },
    });

    createExecutionBlocker({
      taskId: params.task.id,
      agentId: params.run.agent_id,
      title: params.title,
      description: params.description,
      severity,
      detectedAt: params.detectedAt,
    });

    updateExecutionRun(params.run.id, {
      execution_state: params.rule === 'completion_not_ingested' ? 'ingestion_failed' : 'stalled',
      last_runtime_signal_at: params.detectedAt,
      last_runtime_signal_type: params.rule,
      updated_at: params.detectedAt,
    });
  });

  return {
    rule: params.rule,
    runId: params.run.id,
    taskId: params.task.id,
    agentId: params.run.agent_id,
    workspaceId: params.task.workspace_id,
    title: params.title,
    description: params.description,
    detectedAt: params.detectedAt,
  };
}

export async function runExecutionWatchdog(params: {
  workspaceId?: string;
  pollRuntime?: boolean;
  runIds?: string[];
} = {}): Promise<ExecutionWatchdogIncident[]> {
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const incidents: ExecutionWatchdogIncident[] = [];
  const runIdFilter = params.runIds ? new Set(params.runIds) : null;

  for (const activeRun of listActiveExecutionRuns()) {
    if (runIdFilter && !runIdFilter.has(activeRun.id)) {
      continue;
    }

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [activeRun.task_id]);
    if (!task) {
      continue;
    }

    if (params.workspaceId && task.workspace_id !== params.workspaceId) {
      continue;
    }

    let ingestedSignals: Awaited<ReturnType<typeof ingestRuntimeSignalsForRun>>['signals'] = [];

    if (params.pollRuntime !== false) {
      try {
        ({ signals: ingestedSignals } = await ingestRuntimeSignalsForRun({ run: activeRun }));
      } catch (error) {
        console.warn('[Execution Watchdog] Signal ingestion failed for run', activeRun.id, error);
      }
    }

    const runState = getExecutionRunById(activeRun.id);
    if (!runState || runState.execution_state === 'completed') {
      continue;
    }

    const dispatchedAge = minutesSince(runState.created_at, nowMs);
    const ackAge = minutesSince(runState.acknowledged_at, nowMs);
    const latestVisibleDeltaAt = getLatestVisibleTaskDeltaAt(task.id);
    const visibleDeltaAge = minutesSince(latestVisibleDeltaAt, nowMs);
    const runtimeSignalAge = minutesSince(runState.last_runtime_signal_at, nowMs);

    const ackTimeout = threshold('MC_EXECUTION_ACK_TIMEOUT_MINUTES', 5);
    const progressTimeout = threshold('MC_EXECUTION_PROGRESS_TIMEOUT_MINUTES', 15);
    const noDeltaTimeout = threshold('MC_EXECUTION_NO_DELTA_TIMEOUT_MINUTES', 30);
    const completionTimeout = threshold('MC_EXECUTION_COMPLETION_INGESTION_TIMEOUT_MINUTES', 5);

    if (runState.execution_state === 'dispatched' && dispatchedAge !== null && dispatchedAge >= ackTimeout) {
      incidents.push(maybeCreateIncident({
        run: runState,
        task,
        rule: 'dispatched_no_ack',
        title: 'Execution stalled after dispatch',
        description: `Dispatch run ${runState.id} has not acknowledged within ${ackTimeout} minute(s).`,
        detectedAt: now,
      }));
      continue;
    }

    if (runState.execution_state === 'acknowledged' && !runState.execution_started_at && ackAge !== null && ackAge >= progressTimeout) {
      incidents.push(maybeCreateIncident({
        run: runState,
        task,
        rule: 'ack_no_progress',
        title: 'Execution acknowledged but no progress observed',
        description: `Dispatch run ${runState.id} acknowledged work but showed no execution signal within ${progressTimeout} minute(s).`,
        detectedAt: now,
      }));
      continue;
    }

    const missingReceiptSignal = ingestedSignals.find((signal) => !hasExecutionReceiptForFingerprint({
      taskId: task.id,
      runId: runState.id,
      sourceFingerprint: signal.sourceFingerprint,
    }));

    if (missingReceiptSignal) {
      incidents.push(maybeCreateIncident({
        run: runState,
        task,
        rule: 'runtime_signal_without_receipt',
        title: 'Runtime signal missing task receipt',
        description: `Dispatch run ${runState.id} has runtime signal ${missingReceiptSignal.receiptType} without a corresponding task activity receipt.`,
        detectedAt: now,
      }));
      continue;
    }

    const runtimeAheadOfVisibleDelta = runState.last_runtime_signal_at
      && (!latestVisibleDeltaAt || Date.parse(latestVisibleDeltaAt) < Date.parse(runState.last_runtime_signal_at));

    if (
      runtimeAheadOfVisibleDelta
      && runtimeSignalAge !== null
      && runtimeSignalAge <= progressTimeout
    ) {
      incidents.push(maybeCreateIncident({
        run: runState,
        task,
        rule: 'runtime_signal_without_receipt',
        title: 'Runtime updated without visible task evidence',
        description: `Dispatch run ${runState.id} has newer runtime signals than any task activity, blocker, or deliverable receipt.`,
        detectedAt: now,
      }));
      continue;
    }

    if (
      ['executing', 'blocked', 'stalled'].includes(runState.execution_state)
      && visibleDeltaAge !== null
      && visibleDeltaAge >= noDeltaTimeout
    ) {
      incidents.push(maybeCreateIncident({
        run: runState,
        task,
        rule: 'in_progress_no_delta',
        title: 'Execution has gone quiet',
        description: `Task ${task.id} has shown no activity, blocker, or deliverable delta for ${noDeltaTimeout} minute(s) while execution remains active.`,
        detectedAt: now,
      }));
      continue;
    }

    if (
      (runState.execution_state === 'ingestion_failed'
        || (runState.last_runtime_signal_type === 'completion_seen' && runState.ingestion_status !== 'ingested'))
      && minutesSince(runState.last_runtime_signal_at ?? now, nowMs)! >= completionTimeout
    ) {
      incidents.push(maybeCreateIncident({
        run: runState,
        task,
        rule: 'completion_not_ingested',
        title: 'Completion signal not ingested',
        description: `Dispatch run ${runState.id} emitted completion but ingestion did not finish within ${completionTimeout} minute(s).`,
        detectedAt: now,
      }));
    }
  }

  return incidents;
}
