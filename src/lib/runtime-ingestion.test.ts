import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { closeDb, getDb } from '@/lib/db';
import { createTempDbPath } from '@/test/harness/db';
import { ingestRuntimeSignalsForRun } from './runtime-ingestion';

test('runtime ingestion scopes transcript to the current run and only records explicit ack for current messages', async () => {
  const previousDbPath = process.env.DATABASE_PATH;
  const { dir, dbPath } = createTempDbPath('runtime-ingestion');

  try {
    process.env.DATABASE_PATH = dbPath;
    closeDb();

    const db = getDb();
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, slug, folder_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run('default', 'Default Workspace', 'default', '/tmp/mission-control-new');

    db.prepare(
      `INSERT INTO agents (id, name, role, workspace_id, status, is_master, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-20 minutes'), datetime('now', '-20 minutes'))`
    ).run('11111111-1111-1111-1111-111111111111', 'Builder', 'engineer', 'default', 'working', 0, 'local');

    db.prepare(
      `INSERT INTO tasks (
        id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-20 minutes'), datetime('now', '-20 minutes'))`
    ).run('task-1', 'Scoped task', 'Current run only', 'assigned', 'high', '11111111-1111-1111-1111-111111111111', 'default', 'default');

    db.prepare(
      `INSERT INTO task_dispatch_runs (
        id, task_id, agent_id, openclaw_session_id, session_key, dispatch_attempt,
        dispatch_status, execution_state, ingestion_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-5 minutes'), datetime('now', '-5 minutes'))`
    ).run(
      'run-1',
      'task-1',
      '11111111-1111-1111-1111-111111111111',
      'la-citadel-11111111-1111-1111-1111-111111111111',
      'agent:main:la-citadel-11111111-1111-1111-1111-111111111111',
      1,
      'sent',
      'dispatched',
      'pending'
    );

    const client = {
      isConnected: () => true,
      connect: async () => undefined,
      call: async <T>() => ({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'ACK_TASK: old task acknowledgement | next: old step' }],
            timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'ACK_TASK: scoped task acknowledged | next: inspect files' }],
            timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'PROGRESS_UPDATE: inspected execution paths | next: write patch | eta: 10m' }],
            timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
          },
        ],
      }) as T,
    };

    const result = await ingestRuntimeSignalsForRun({ run: 'run-1', client });
    assert.deepEqual(
      result.signals.map((signal) => signal.receiptType),
      ['ack_received', 'progress_seen']
    );

    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task-1') as { status: string };
    assert.equal(task.status, 'in_progress');

    const ackReceipts = db.prepare(
      `SELECT message FROM task_activities
       WHERE task_id = ?
         AND metadata LIKE '%"receipt_type":"ack_received"%'
       ORDER BY created_at ASC`
    ).all('task-1') as Array<{ message: string }>;
    assert.equal(ackReceipts.length, 1);
    assert.match(ackReceipts[0].message, /scoped task acknowledged/);
    assert.doesNotMatch(ackReceipts[0].message, /old task acknowledgement/);

    const run = db.prepare('SELECT * FROM task_dispatch_runs WHERE id = ?').get('run-1') as any;
    assert.equal(run.execution_state, 'executing');
    assert.ok(run.acknowledged_at);
    assert.ok(run.execution_started_at);
  } finally {
    closeDb();
    if (previousDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDbPath;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runtime ingestion remains idempotent under repeated polling for the same transcript', async () => {
  const previousDbPath = process.env.DATABASE_PATH;
  const { dir, dbPath } = createTempDbPath('runtime-ingestion-idempotent');

  try {
    process.env.DATABASE_PATH = dbPath;
    closeDb();

    const db = getDb();
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, slug, folder_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run('default', 'Default Workspace', 'default', '/tmp/mission-control-new');

    db.prepare(
      `INSERT INTO agents (id, name, role, workspace_id, status, is_master, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-20 minutes'), datetime('now', '-20 minutes'))`
    ).run('22222222-2222-2222-2222-222222222222', 'Builder', 'engineer', 'default', 'working', 0, 'local');

    db.prepare(
      `INSERT INTO tasks (
        id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-20 minutes'), datetime('now', '-20 minutes'))`
    ).run('task-2', 'Idempotent task', 'Poll repeatedly', 'assigned', 'high', '22222222-2222-2222-2222-222222222222', 'default', 'default');

    db.prepare(
      `INSERT INTO task_dispatch_runs (
        id, task_id, agent_id, openclaw_session_id, session_key, dispatch_attempt,
        dispatch_status, execution_state, ingestion_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-5 minutes'), datetime('now', '-5 minutes'))`
    ).run(
      'run-2',
      'task-2',
      '22222222-2222-2222-2222-222222222222',
      'la-citadel-22222222-2222-2222-2222-222222222222',
      'agent:main:la-citadel-22222222-2222-2222-2222-222222222222',
      1,
      'sent',
      'dispatched',
      'pending'
    );

    const client = {
      isConnected: () => true,
      connect: async () => undefined,
      call: async <T>() => ({
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'ACK_TASK: idempotent task acknowledged | next: inspect execution' }],
            timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'PROGRESS_UPDATE: inspected execution | next: continue | eta: 5m' }],
            timestamp: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
          },
        ],
      }) as T,
    };

    for (let index = 0; index < 10; index += 1) {
      await ingestRuntimeSignalsForRun({ run: 'run-2', client });
    }

    const ackReceipts = db.prepare(
      `SELECT COUNT(*) AS count
       FROM task_activities
       WHERE task_id = ?
         AND metadata LIKE '%"receipt_type":"ack_received"%'`
    ).get('task-2') as { count: number };
    assert.equal(ackReceipts.count, 1);

    const progressReceipts = db.prepare(
      `SELECT COUNT(*) AS count
       FROM task_activities
       WHERE task_id = ?
         AND metadata LIKE '%"receipt_type":"progress_seen"%'`
    ).get('task-2') as { count: number };
    assert.equal(progressReceipts.count, 1);

    const executionStartedReceipts = db.prepare(
      `SELECT COUNT(*) AS count
       FROM task_activities
       WHERE task_id = ?
         AND metadata LIKE '%"receipt_type":"execution_started"%'`
    ).get('task-2') as { count: number };
    assert.equal(executionStartedReceipts.count, 1);
  } finally {
    closeDb();
    if (previousDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDbPath;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
