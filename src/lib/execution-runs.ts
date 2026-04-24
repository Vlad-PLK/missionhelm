import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { broadcast } from '@/lib/events';
import { queryAll, queryOne, run } from '@/lib/db';
import type {
  ActivityType,
  RuntimeReceiptType,
  Task,
  TaskActivity,
  TaskDispatchRun,
  TaskExecutionState,
} from '@/lib/types';

const ACTIVE_RUN_SQL = `
  dispatch_status != 'superseded'
  AND execution_state != 'completed'
`;

function stableJson(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function buildReceiptActivityType(receiptType: RuntimeReceiptType): ActivityType {
  switch (receiptType) {
    case 'dispatch_sent':
    case 'execution_started':
      return 'status_changed';
    case 'blocker_seen':
      return 'blocker_identified';
    case 'completion_ingested':
      return 'completed';
    case 'stalled_execution_detected':
      return 'staleness_detected';
    default:
      return 'updated';
  }
}

export function buildContentFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

export function getExecutionRunById(runId: string): TaskDispatchRun | undefined {
  return queryOne<TaskDispatchRun>('SELECT * FROM task_dispatch_runs WHERE id = ?', [runId]);
}

export function getLatestExecutionRunForTask(taskId: string): TaskDispatchRun | undefined {
  return queryOne<TaskDispatchRun>(
    `SELECT * FROM task_dispatch_runs
     WHERE task_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [taskId]
  );
}

export function getExecutionRunForSession(openclawSessionId: string): TaskDispatchRun | undefined {
  return queryOne<TaskDispatchRun>(
    `SELECT * FROM task_dispatch_runs
     WHERE openclaw_session_id = ?
       AND ${ACTIVE_RUN_SQL}
     ORDER BY created_at DESC
     LIMIT 1`,
    [openclawSessionId]
  );
}

export function listActiveExecutionRuns(): TaskDispatchRun[] {
  return queryAll<TaskDispatchRun>(
    `SELECT * FROM task_dispatch_runs
     WHERE ${ACTIVE_RUN_SQL}
     ORDER BY created_at DESC`
  );
}

export function listActiveExecutionRunsWithLimit(limit?: number): TaskDispatchRun[] {
  const cappedLimit = typeof limit === 'number' && limit > 0 ? Math.floor(limit) : null;
  return queryAll<TaskDispatchRun>(
    `SELECT * FROM task_dispatch_runs
     WHERE ${ACTIVE_RUN_SQL}
     ORDER BY created_at ASC${cappedLimit ? ' LIMIT ?' : ''}`,
    cappedLimit ? [cappedLimit] : []
  );
}

export function countActiveExecutionRuns(): number {
  const row = queryOne<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM task_dispatch_runs
     WHERE ${ACTIVE_RUN_SQL}`
  );

  return row?.count ?? 0;
}

export function listActiveExecutionRunsForAgent(agentId: string): TaskDispatchRun[] {
  return queryAll<TaskDispatchRun>(
    `SELECT * FROM task_dispatch_runs
     WHERE agent_id = ?
       AND ${ACTIVE_RUN_SQL}
     ORDER BY created_at DESC`,
    [agentId]
  );
}

export function ensureAgentHasNoConflictingRun(agentId: string, taskId: string): TaskDispatchRun | undefined {
  return queryOne<TaskDispatchRun>(
    `SELECT * FROM task_dispatch_runs
     WHERE agent_id = ?
       AND task_id != ?
       AND ${ACTIVE_RUN_SQL}
     ORDER BY created_at DESC
     LIMIT 1`,
    [agentId, taskId]
  );
}

export function supersedeActiveRunsForTask(taskId: string, now: string): void {
  run(
    `UPDATE task_dispatch_runs
     SET dispatch_status = 'superseded', updated_at = ?
     WHERE task_id = ?
       AND ${ACTIVE_RUN_SQL}`,
    [now, taskId]
  );
}

export function createDispatchRun(params: {
  taskId: string;
  agentId: string;
  openclawSessionId: string;
  sessionKey: string;
  idempotencyKey: string;
  now: string;
}): TaskDispatchRun {
  const previousAttempt = queryOne<{ attempt: number }>(
    `SELECT COALESCE(MAX(dispatch_attempt), 0) AS attempt
     FROM task_dispatch_runs
     WHERE task_id = ?`,
    [params.taskId]
  );

  const dispatchRun: TaskDispatchRun = {
    id: uuidv4(),
    task_id: params.taskId,
    agent_id: params.agentId,
    openclaw_session_id: params.openclawSessionId,
    session_key: params.sessionKey,
    dispatch_attempt: (previousAttempt?.attempt ?? 0) + 1,
    dispatch_status: 'sent',
    execution_state: 'dispatched',
    idempotency_key: params.idempotencyKey,
    ingestion_status: 'pending',
    created_at: params.now,
    updated_at: params.now,
  };

  run(
    `INSERT INTO task_dispatch_runs (
      id, task_id, agent_id, openclaw_session_id, session_key,
      dispatch_attempt, dispatch_status, execution_state, idempotency_key,
      ingestion_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dispatchRun.id,
      dispatchRun.task_id,
      dispatchRun.agent_id,
      dispatchRun.openclaw_session_id,
      dispatchRun.session_key,
      dispatchRun.dispatch_attempt,
      dispatchRun.dispatch_status,
      dispatchRun.execution_state,
      dispatchRun.idempotency_key ?? null,
      dispatchRun.ingestion_status,
      dispatchRun.created_at,
      dispatchRun.updated_at,
    ]
  );

  return dispatchRun;
}

export function updateExecutionRun(runId: string, changes: Partial<{
  dispatch_status: TaskDispatchRun['dispatch_status'];
  execution_state: TaskExecutionState;
  acknowledged_at: string | null;
  execution_started_at: string | null;
  last_progress_at: string | null;
  last_runtime_signal_at: string | null;
  last_runtime_signal_type: string | null;
  completed_at: string | null;
  ingestion_status: TaskDispatchRun['ingestion_status'];
  source_summary: string | null;
  source_metadata: string | null;
  updated_at: string;
}>): void {
  const entries = Object.entries(changes).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return;
  }

  const assignments = entries.map(([key]) => `${key} = ?`);
  const values = entries.map(([, value]) => value ?? null);

  run(
    `UPDATE task_dispatch_runs
     SET ${assignments.join(', ')}
     WHERE id = ?`,
    [...values, runId]
  );
}

export function resolveExactExecutionRun(params: {
  taskId?: string;
  sessionId?: string;
  agentId?: string;
}): TaskDispatchRun | undefined {
  const where: string[] = [ACTIVE_RUN_SQL];
  const values: unknown[] = [];

  if (params.taskId) {
    where.push('task_id = ?');
    values.push(params.taskId);
  }

  if (params.sessionId) {
    where.push('openclaw_session_id = ?');
    values.push(params.sessionId);
  }

  if (params.agentId) {
    where.push('agent_id = ?');
    values.push(params.agentId);
  }

  const candidates = queryAll<TaskDispatchRun>(
    `SELECT * FROM task_dispatch_runs
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC`,
    values
  );

  if (candidates.length > 1) {
    throw new Error('Ambiguous execution run resolution');
  }

  return candidates[0];
}

export function getTaskForRun(runId: string): Task | undefined {
  return queryOne<Task>(
    `SELECT t.*
     FROM tasks t
     INNER JOIN task_dispatch_runs r ON r.task_id = t.id
     WHERE r.id = ?`,
    [runId]
  );
}

export function hasExecutionReceiptForFingerprint(params: {
  taskId: string;
  runId: string;
  sourceFingerprint: string;
}): boolean {
  const receipt = queryOne<{ id: string }>(
    `SELECT id
     FROM task_activities
     WHERE task_id = ?
       AND metadata LIKE ?
       AND metadata LIKE ?
     LIMIT 1`,
    [
      params.taskId,
      `%\"execution_run_id\":\"${params.runId}\"%`,
      `%\"source_fingerprint\":\"${params.sourceFingerprint}\"%`,
    ]
  );

  return Boolean(receipt);
}

export function recordExecutionReceipt(params: {
  taskId: string;
  agentId?: string | null;
  runId: string;
  sessionId: string;
  sessionKey: string;
  receiptType: RuntimeReceiptType;
  message: string;
  sourceType: string;
  sourceFingerprint: string;
  sourceTimestamp?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): TaskActivity {
  const activityType = buildReceiptActivityType(params.receiptType);
  const metadata = stableJson({
    receipt_type: params.receiptType,
    execution_run_id: params.runId,
    session_id: params.sessionId,
    session_key: params.sessionKey,
    source_type: params.sourceType,
    source_fingerprint: params.sourceFingerprint,
    source_timestamp: params.sourceTimestamp ?? null,
    ...(params.metadata ?? {}),
  });

  const existingByIdentity = queryOne<TaskActivity>(
    `SELECT * FROM task_activities
     WHERE task_id = ?
       AND activity_type = ?
       AND metadata LIKE ?
       AND metadata LIKE ?
       AND metadata LIKE ?
     LIMIT 1`,
    [
      params.taskId,
      activityType,
      `%\"execution_run_id\":\"${params.runId}\"%`,
      `%\"receipt_type\":\"${params.receiptType}\"%`,
      `%\"source_fingerprint\":\"${params.sourceFingerprint}\"%`,
    ]
  );

  if (existingByIdentity) {
    return existingByIdentity;
  }

  const existingByExactPayload = queryOne<TaskActivity>(
    `SELECT * FROM task_activities
     WHERE task_id = ?
       AND activity_type = ?
       AND message = ?
       AND COALESCE(metadata, '') = COALESCE(?, '')
     LIMIT 1`,
    [params.taskId, activityType, params.message, metadata]
  );

  if (existingByExactPayload) {
    return existingByExactPayload;
  }

  const activity: TaskActivity = {
    id: uuidv4(),
    task_id: params.taskId,
    agent_id: params.agentId ?? undefined,
    activity_type: activityType,
    message: params.message,
    metadata,
    created_at: params.createdAt,
  };

  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      activity.id,
      activity.task_id,
      activity.agent_id ?? null,
      activity.activity_type,
      activity.message,
      activity.metadata ?? null,
      activity.created_at,
    ]
  );

  broadcast({
    type: 'activity_logged',
    payload: activity,
  });

  return activity;
}
