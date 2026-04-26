import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { broadcast } from '@/lib/events';
import { queryOne, run, transaction } from '@/lib/db';
import { getOpenClawClient } from '@/lib/openclaw/client';
import {
  getExecutionRunById,
  hasExecutionReceiptForFingerprint,
  recordExecutionReceipt,
  updateExecutionRun,
} from '@/lib/execution-runs';
import type {
  Agent,
  RuntimeReceiptType,
  Task,
  TaskDeliverable,
  TaskDispatchRun,
} from '@/lib/types';

type HistoryMessage = {
  role: string;
  content: unknown;
  createdAt?: string | number;
  created_at?: string | number;
  timestamp?: string | number;
};

type HistoryResponse = {
  messages?: HistoryMessage[];
};

type RuntimeTranscriptMessage = {
  role: string;
  text: string;
  sourceTimestamp: string | null;
  sourceFingerprint: string;
};

type RuntimeSignal = {
  receiptType: Exclude<RuntimeReceiptType, 'dispatch_sent' | 'completion_ingested' | 'stalled_execution_detected'>;
  message: string;
  sourceTimestamp: string | null;
  sourceFingerprint: string;
  rawText: string;
  parsed?: {
    summary?: string;
    deliverables?: string[];
    verification?: string | null;
  };
};

const ACK_PATTERNS = [/^(ACK_TASK|TASK_ACK|ACKNOWLEDGED|ACK)\s*:/i];
const EXEC_STARTED_PATTERNS = [/^EXEC_STARTED\s*:/i];

type OpenClawSessionListResponse = {
  sessions?: Array<Record<string, unknown>>;
};

type OpenClawHistoryClient = {
  isConnected(): boolean;
  connect(): Promise<void>;
  call<T>(method: string, params?: Record<string, unknown>): Promise<T>;
};

function textFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
          return part.text;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n');

    return text;
  }

  return '';
}

function buildTranscriptFingerprint(text: string, occurrence: number): string {
  return createHash('sha256')
    .update(`${text}\n#${occurrence}`)
    .digest('hex')
    .slice(0, 24);
}

function parseIsoMs(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heuristic: values < 1e12 are likely epoch seconds, otherwise epoch ms.
    return value < 1e12 ? value * 1000 : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function normalizeSourceTimestamp(value: unknown): string | null {
  const ms = parseIsoMs(value as string | number | null | undefined);
  if (ms === null) {
    return null;
  }

  return new Date(ms).toISOString();
}

function parseCompletionMessage(rawText: string): {
  summary: string;
  deliverables: string[];
  verification: string | null;
} {
  const withoutPrefix = rawText.replace(/^TASK_COMPLETE:\s*/i, '').trim();
  const parts = withoutPrefix.split(/\s+\|\s+/);

  let summary = parts[0]?.trim() ?? '';
  let deliverables: string[] = [];
  let verification: string | null = null;

  for (const part of parts.slice(1)) {
    const [key, ...rest] = part.split(':');
    const value = rest.join(':').trim();
    const normalizedKey = key.trim().toLowerCase();

    if (normalizedKey === 'deliverables') {
      deliverables = value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      continue;
    }

    if (normalizedKey === 'verification') {
      verification = value || null;
      continue;
    }

    summary = `${summary} | ${part}`.trim();
  }

  return {
    summary,
    deliverables,
    verification,
  };
}

function inferDeliverableType(entry: string): TaskDeliverable['deliverable_type'] {
  if (/^https?:\/\//i.test(entry)) {
    return 'url';
  }

  if (entry.includes('/') || /\.[a-z0-9]{1,8}$/i.test(entry)) {
    return 'file';
  }

  return 'artifact';
}

function inferSessionIdFromListPayload(payload: unknown, sessionKey: string): string | null {
  const candidates = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && Array.isArray((payload as OpenClawSessionListResponse).sessions)
        ? (payload as OpenClawSessionListResponse).sessions
        : []);

  for (const candidate of candidates as Array<Record<string, unknown>>) {
    const key = String(candidate.key ?? candidate.sessionKey ?? candidate.session_key ?? '');
    if (key !== sessionKey) {
      continue;
    }

    const sessionId = candidate.sessionId ?? candidate.session_id ?? candidate.id;
    if (typeof sessionId === 'string' && sessionId.trim()) {
      return sessionId.trim();
    }
  }

  return null;
}

async function loadTranscriptFromLocalSessionFile(params: {
  sessionKey: string;
  client: OpenClawHistoryClient;
}): Promise<RuntimeTranscriptMessage[]> {
  let sessionId: string | null = null;

  try {
    const sessionsPayload = await params.client.call<unknown>('sessions.list');
    sessionId = inferSessionIdFromListPayload(sessionsPayload, params.sessionKey);
  } catch {
    return [];
  }

  if (!sessionId) {
    return [];
  }

  const home = process.env.HOME || process.env.USERPROFILE;
  if (!home) {
    return [];
  }

  const filePath = path.join(home, '.openclaw', 'agents', 'main', 'sessions', `${sessionId}.jsonl`);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const transcript: RuntimeTranscriptMessage[] = [];
  const seenOccurrences = new Map<string, number>();

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== 'object') {
      continue;
    }

    const envelope = parsed as Record<string, unknown>;
    if (envelope.type !== 'message') {
      continue;
    }

    const message = envelope.message as Record<string, unknown> | undefined;
    const role = typeof message?.role === 'string' ? message.role : undefined;
    const text = textFromContent(message?.content).trim();
    if (!role || !text) {
      continue;
    }

    const occurrence = (seenOccurrences.get(text) ?? 0) + 1;
    seenOccurrences.set(text, occurrence);
    const sourceTimestamp =
      normalizeSourceTimestamp(envelope.timestamp)
      || normalizeSourceTimestamp(message?.timestamp)
      || normalizeSourceTimestamp(message?.createdAt)
      || normalizeSourceTimestamp(message?.created_at)
      || null;

    transcript.push({
      role,
      text,
      sourceTimestamp,
      sourceFingerprint: buildTranscriptFingerprint(text, occurrence),
    });
  }

  return transcript;
}

export async function getRuntimeTranscriptForSession(
  sessionKey: string,
  client: OpenClawHistoryClient = getOpenClawClient()
): Promise<RuntimeTranscriptMessage[]> {
  if (!client.isConnected()) {
    await client.connect();
  }

  let messages: HistoryMessage[] = [];
  try {
    const response = await client.call<HistoryResponse>('chat.history', {
      sessionKey,
      limit: 200,
    });
    messages = response.messages ?? [];
  } catch {
    messages = [];
  }

  const seenOccurrences = new Map<string, number>();
  const primaryTranscript = messages
    .map((message) => {
      const text = textFromContent(message.content).trim();
      if (!text) {
        return null;
      }

      const occurrence = (seenOccurrences.get(text) ?? 0) + 1;
      seenOccurrences.set(text, occurrence);

      return {
        role: message.role,
        text,
        sourceTimestamp:
          normalizeSourceTimestamp(message.timestamp)
          || normalizeSourceTimestamp(message.createdAt)
          || normalizeSourceTimestamp(message.created_at)
          || null,
        sourceFingerprint: buildTranscriptFingerprint(text, occurrence),
      };
    })
    .filter((message): message is RuntimeTranscriptMessage => message !== null);

  if (primaryTranscript.length > 0) {
    return primaryTranscript;
  }

  return loadTranscriptFromLocalSessionFile({
    sessionKey,
    client,
  });
}

function normalizeRuntimeSignals(messages: RuntimeTranscriptMessage[]): RuntimeSignal[] {
  const signals: RuntimeSignal[] = [];

  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }

    const rawText = message.text;

    if (/^TASK_COMPLETE:\s*/i.test(rawText)) {
      signals.push({
        receiptType: 'completion_seen' as const,
        message: 'Runtime completion signal received',
        sourceTimestamp: message.sourceTimestamp,
        sourceFingerprint: message.sourceFingerprint,
        rawText,
        parsed: parseCompletionMessage(rawText),
      });
      continue;
    }

    if (/^BLOCKED:\s*/i.test(rawText)) {
      signals.push({
        receiptType: 'blocker_seen' as const,
        message: rawText,
        sourceTimestamp: message.sourceTimestamp,
        sourceFingerprint: message.sourceFingerprint,
        rawText,
      });
      continue;
    }

    if (/^PROGRESS_UPDATE:\s*/i.test(rawText)) {
      signals.push({
        receiptType: 'progress_seen' as const,
        message: rawText,
        sourceTimestamp: message.sourceTimestamp,
        sourceFingerprint: message.sourceFingerprint,
        rawText,
      });
      continue;
    }

    if (ACK_PATTERNS.some((pattern) => pattern.test(rawText))) {
      signals.push({
        receiptType: 'ack_received' as const,
        message: rawText,
        sourceTimestamp: message.sourceTimestamp,
        sourceFingerprint: message.sourceFingerprint,
        rawText,
      });
      continue;
    }

    if (EXEC_STARTED_PATTERNS.some((pattern) => pattern.test(rawText))) {
      signals.push({
        receiptType: 'execution_started' as const,
        message: rawText,
        sourceTimestamp: message.sourceTimestamp,
        sourceFingerprint: message.sourceFingerprint,
        rawText,
      });
      continue;
    }

    // Ignore unstructured assistant chatter for execution-state transitions.
    // Enforce explicit protocol tokens (ACK/EXEC_STARTED/PROGRESS_UPDATE/BLOCKED/TASK_COMPLETE).
    continue;
  }

  return signals;
}

function filterTranscriptForRun(messages: RuntimeTranscriptMessage[], run: TaskDispatchRun): RuntimeTranscriptMessage[] {
  const runStartMs = parseIsoMs(run.created_at);
  if (runStartMs === null) {
    return messages;
  }

  return messages.filter((message) => {
    const messageTs = parseIsoMs(message.sourceTimestamp);
    if (messageTs === null) {
      return false;
    }

    return messageTs >= runStartMs;
  });
}

function moveTaskToInProgress(params: {
  task: Task;
  now: string;
}): void {
  const { task, now } = params;
  if (['in_progress', 'testing', 'review', 'done'].includes(task.status)) {
    return;
  }

  run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', ['in_progress', now, task.id]);
  const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task.id]);
  if (updatedTask) {
    broadcast({
      type: 'task_updated',
      payload: updatedTask,
    });
  }
}

function ensureTaskDeliverable(taskId: string, entry: string, now: string): void {
  const deliverableType = inferDeliverableType(entry);
  const existing = queryOne<TaskDeliverable>(
    `SELECT * FROM task_deliverables
     WHERE task_id = ?
       AND deliverable_type = ?
       AND title = ?
       AND COALESCE(path, '') = COALESCE(?, '')
     LIMIT 1`,
    [taskId, deliverableType, entry, deliverableType === 'file' || deliverableType === 'url' ? entry : null]
  );

  if (existing) {
    return;
  }

  const deliverable: TaskDeliverable = {
    id: uuidv4(),
    task_id: taskId,
    deliverable_type: deliverableType,
    title: entry,
    path: deliverableType === 'file' || deliverableType === 'url' ? entry : undefined,
    description: deliverableType === 'artifact' ? 'Runtime-declared completion artifact' : undefined,
    created_at: now,
  };

  run(
    `INSERT INTO task_deliverables (id, task_id, deliverable_type, title, path, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      deliverable.id,
      deliverable.task_id,
      deliverable.deliverable_type,
      deliverable.title,
      deliverable.path ?? null,
      deliverable.description ?? null,
      deliverable.created_at,
    ]
  );

  broadcast({
    type: 'deliverable_added',
    payload: deliverable,
  });
}

export function markExecutionIngestionFailure(run: TaskDispatchRun, error: Error, now: string): void {
  updateExecutionRun(run.id, {
    execution_state: 'ingestion_failed',
    ingestion_status: 'failed',
    last_runtime_signal_at: now,
    last_runtime_signal_type: 'completion_ingestion_failed',
    source_summary: error.message,
    updated_at: now,
  });

  recordExecutionReceipt({
    taskId: run.task_id,
    agentId: run.agent_id,
    runId: run.id,
    sessionId: run.openclaw_session_id,
    sessionKey: run.session_key,
    receiptType: 'completion_seen',
    message: `Completion ingestion failed: ${error.message}`,
    sourceType: 'runtime_ingestion',
    sourceFingerprint: `completion_ingestion_failed:${run.id}`,
    sourceTimestamp: now,
    createdAt: now,
    metadata: {
      failure: true,
      error_message: error.message,
    },
  });
}

export function getLatestVisibleTaskDeltaAt(taskId: string): string | null {
  const row = queryOne<{ last_delta_at: string | null }>(
    `
      SELECT MAX(delta_at) AS last_delta_at
      FROM (
        SELECT created_at AS delta_at FROM task_activities WHERE task_id = ?
        UNION ALL
        SELECT created_at AS delta_at FROM task_deliverables WHERE task_id = ?
        UNION ALL
        SELECT COALESCE(updated_at, created_at) AS delta_at FROM task_blockers WHERE task_id = ?
      )
    `,
    [taskId, taskId, taskId]
  );

  return row?.last_delta_at ?? null;
}

export function ingestCompletionSignal(params: {
  run: TaskDispatchRun;
  rawMessage: string;
  sourceTimestamp?: string | null;
  sourceFingerprint: string;
  now?: string;
}): void {
  const now = params.now ?? new Date().toISOString();
  const parsed = parseCompletionMessage(params.rawMessage);
  const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [params.run.task_id]);
  const agent = queryOne<Agent>('SELECT * FROM agents WHERE id = ?', [params.run.agent_id]);

  if (!task || !agent) {
    throw new Error('Completion ingestion missing task or agent');
  }

  if (params.run.ingestion_status === 'ingested' || params.run.execution_state === 'completed') {
    return;
  }

  transaction(() => {
    recordExecutionReceipt({
      taskId: task.id,
      agentId: agent.id,
      runId: params.run.id,
      sessionId: params.run.openclaw_session_id,
      sessionKey: params.run.session_key,
      receiptType: 'completion_seen',
      message: 'Runtime completion signal received',
      sourceType: 'runtime',
      sourceFingerprint: params.sourceFingerprint,
      sourceTimestamp: params.sourceTimestamp ?? null,
      createdAt: now,
      metadata: {
        completion_summary: parsed.summary,
        verification: parsed.verification,
      },
    });

    for (const deliverable of parsed.deliverables) {
      ensureTaskDeliverable(task.id, deliverable, now);
    }

    if (parsed.deliverables.length === 0) {
      recordExecutionReceipt({
        taskId: task.id,
        agentId: agent.id,
        runId: params.run.id,
        sessionId: params.run.openclaw_session_id,
        sessionKey: params.run.session_key,
        receiptType: 'completion_ingested',
        message: 'Completion ingested with explicit no-deliverable declaration',
        sourceType: 'runtime',
        sourceFingerprint: `${params.sourceFingerprint}:no-deliverables`,
        sourceTimestamp: params.sourceTimestamp ?? null,
        createdAt: now,
        metadata: {
          deliverables_declared: false,
        },
      });
    }

    recordExecutionReceipt({
      taskId: task.id,
      agentId: agent.id,
      runId: params.run.id,
      sessionId: params.run.openclaw_session_id,
      sessionKey: params.run.session_key,
      receiptType: 'completion_ingested',
      message: 'Completion signal ingested into task receipts',
      sourceType: 'runtime',
      sourceFingerprint: `${params.sourceFingerprint}:ingested`,
      sourceTimestamp: params.sourceTimestamp ?? null,
      createdAt: now,
      metadata: {
        completion_summary: parsed.summary,
        verification: parsed.verification,
        deliverables: parsed.deliverables,
      },
    });

    if (!['testing', 'review', 'done'].includes(task.status)) {
      run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', ['testing', now, task.id]);
      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [task.id]);
      if (updatedTask) {
        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      }
    }

    run('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?', ['standby', now, agent.id]);
    run('UPDATE openclaw_sessions SET task_id = NULL, updated_at = ? WHERE openclaw_session_id = ?', [now, params.run.openclaw_session_id]);
    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        'task_completed',
        agent.id,
        task.id,
        `${agent.name} completed: ${parsed.summary || 'Task finished'}`,
        JSON.stringify({
          execution_run_id: params.run.id,
          verification: parsed.verification,
          deliverables: parsed.deliverables,
          session_id: params.run.openclaw_session_id,
        }),
        now,
      ]
    );
    run(
      `INSERT INTO task_progress (id, task_id, current_phase, started_at, last_updated_at, completed_at, completion_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(task_id) DO UPDATE SET
         current_phase = excluded.current_phase,
         last_updated_at = excluded.last_updated_at,
         completed_at = excluded.completed_at,
         completion_summary = excluded.completion_summary`,
      [uuidv4(), task.id, 'testing', task.created_at, now, now, parsed.summary]
    );

    updateExecutionRun(params.run.id, {
      execution_state: 'completed',
      completed_at: now,
      last_runtime_signal_at: now,
      last_runtime_signal_type: 'completion_seen',
      ingestion_status: 'ingested',
      source_summary: parsed.summary,
      source_metadata: JSON.stringify({
        completion_summary: parsed.summary,
        verification: parsed.verification,
        deliverables: parsed.deliverables,
        source_fingerprint: params.sourceFingerprint,
        source_timestamp: params.sourceTimestamp ?? null,
      }),
      updated_at: now,
    });
  });
}

export async function ingestRuntimeSignalsForRun(params: {
  run: TaskDispatchRun | string;
  client?: OpenClawHistoryClient;
}): Promise<{ run: TaskDispatchRun; signals: RuntimeSignal[] }> {
  const runRecord = typeof params.run === 'string'
    ? getExecutionRunById(params.run)
    : params.run;

  if (!runRecord) {
    throw new Error('Execution run not found');
  }

  const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [runRecord.task_id]);
  if (!task) {
    throw new Error('Task not found for execution run');
  }

  const historyClient = params.client ?? getOpenClawClient();
  const transcript = filterTranscriptForRun(
    await getRuntimeTranscriptForSession(runRecord.session_key, historyClient),
    runRecord
  );
  const signals = normalizeRuntimeSignals(transcript);
  const now = new Date().toISOString();

  for (const signal of signals) {
    switch (signal.receiptType) {
      case 'ack_received': {
        recordExecutionReceipt({
          taskId: runRecord.task_id,
          agentId: runRecord.agent_id,
          runId: runRecord.id,
          sessionId: runRecord.openclaw_session_id,
          sessionKey: runRecord.session_key,
          receiptType: signal.receiptType,
          message: signal.message,
          sourceType: 'chat.history',
          sourceFingerprint: signal.sourceFingerprint,
          sourceTimestamp: signal.sourceTimestamp,
          createdAt: now,
        });

        if (!runRecord.acknowledged_at) {
          updateExecutionRun(runRecord.id, {
            execution_state: 'acknowledged',
            acknowledged_at: signal.sourceTimestamp ?? now,
            last_runtime_signal_at: signal.sourceTimestamp ?? now,
            last_runtime_signal_type: 'ack_received',
            updated_at: now,
          });
          runRecord.execution_state = 'acknowledged';
          runRecord.acknowledged_at = signal.sourceTimestamp ?? now;
        }
        break;
      }
      case 'execution_started':
      case 'progress_seen':
      case 'blocker_seen':
      case 'completion_seen': {
        if (!runRecord.execution_started_at) {
          recordExecutionReceipt({
            taskId: runRecord.task_id,
            agentId: runRecord.agent_id,
            runId: runRecord.id,
            sessionId: runRecord.openclaw_session_id,
            sessionKey: runRecord.session_key,
            receiptType: 'execution_started',
            message: 'Runtime execution started',
            sourceType: 'chat.history',
            sourceFingerprint: `${signal.sourceFingerprint}:execution_started`,
            sourceTimestamp: signal.sourceTimestamp,
            createdAt: now,
            metadata: {
              trigger_signal_type: signal.receiptType,
            },
          });
          updateExecutionRun(runRecord.id, {
            execution_state: signal.receiptType === 'blocker_seen' ? 'blocked' : 'executing',
            execution_started_at: signal.sourceTimestamp ?? now,
            last_runtime_signal_at: signal.sourceTimestamp ?? now,
            last_runtime_signal_type: signal.receiptType,
            updated_at: now,
          });
          runRecord.execution_started_at = signal.sourceTimestamp ?? now;
          runRecord.execution_state = signal.receiptType === 'blocker_seen' ? 'blocked' : 'executing';
          moveTaskToInProgress({
            task,
            now,
          });
        }

        recordExecutionReceipt({
          taskId: runRecord.task_id,
          agentId: runRecord.agent_id,
          runId: runRecord.id,
          sessionId: runRecord.openclaw_session_id,
          sessionKey: runRecord.session_key,
          receiptType: signal.receiptType,
          message: signal.message,
          sourceType: 'chat.history',
          sourceFingerprint: signal.sourceFingerprint,
          sourceTimestamp: signal.sourceTimestamp,
          createdAt: now,
        });

        if (signal.receiptType === 'execution_started') {
          updateExecutionRun(runRecord.id, {
            execution_state: 'executing',
            last_runtime_signal_at: signal.sourceTimestamp ?? now,
            last_runtime_signal_type: 'execution_started',
            updated_at: now,
          });
        } else if (signal.receiptType === 'progress_seen') {
          updateExecutionRun(runRecord.id, {
            execution_state: 'executing',
            last_progress_at: signal.sourceTimestamp ?? now,
            last_runtime_signal_at: signal.sourceTimestamp ?? now,
            last_runtime_signal_type: 'progress_seen',
            updated_at: now,
          });
        } else if (signal.receiptType === 'blocker_seen') {
          updateExecutionRun(runRecord.id, {
            execution_state: 'blocked',
            last_runtime_signal_at: signal.sourceTimestamp ?? now,
            last_runtime_signal_type: 'blocker_seen',
            updated_at: now,
          });
        } else {
          try {
            ingestCompletionSignal({
              run: runRecord,
              rawMessage: signal.rawText,
              sourceTimestamp: signal.sourceTimestamp,
              sourceFingerprint: signal.sourceFingerprint,
              now,
            });
          } catch (error) {
            markExecutionIngestionFailure(
              runRecord,
              error instanceof Error ? error : new Error('Unknown completion ingestion error'),
              now
            );
            throw error;
          }
        }
        break;
      }
    }
  }

  return {
    run: getExecutionRunById(runRecord.id) ?? runRecord,
    signals,
  };
}

export function hasRuntimeSignalReceipt(params: {
  taskId: string;
  runId: string;
  signal: Pick<RuntimeSignal, 'sourceFingerprint'>;
}): boolean {
  return hasExecutionReceiptForFingerprint({
    taskId: params.taskId,
    runId: params.runId,
    sourceFingerprint: params.signal.sourceFingerprint,
  });
}
