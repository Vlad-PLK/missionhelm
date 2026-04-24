import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { closeDb, getDb } from '@/lib/db';
import { createTempDbPath } from '@/test/harness/db';
import { runExecutionWatchdog } from './execution-watchdog';

test('execution watchdog records a stalled dispatch when no ack arrives within threshold', async () => {
  const previousDbPath = process.env.DATABASE_PATH;
  const previousAckTimeout = process.env.MC_EXECUTION_ACK_TIMEOUT_MINUTES;
  const { dir, dbPath } = createTempDbPath('execution-watchdog');

  try {
    process.env.DATABASE_PATH = dbPath;
    process.env.MC_EXECUTION_ACK_TIMEOUT_MINUTES = '1';
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
    ).run('task-1', 'Stalled task', 'Ack should be missing', 'assigned', 'high', '11111111-1111-1111-1111-111111111111', 'default', 'default');

    db.prepare(
      `INSERT INTO task_dispatch_runs (
        id, task_id, agent_id, openclaw_session_id, session_key, dispatch_attempt,
        dispatch_status, execution_state, ingestion_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-10 minutes'), datetime('now', '-10 minutes'))`
    ).run(
      'run-1',
      'task-1',
      '11111111-1111-1111-1111-111111111111',
      'agent-main-11111111-1111-1111-1111-111111111111',
      'agent:main:agent-main-11111111-1111-1111-1111-111111111111',
      1,
      'sent',
      'dispatched',
      'pending'
    );

    const incidents = await runExecutionWatchdog({ pollRuntime: false });
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0].rule, 'dispatched_no_ack');

    const updatedRun = db.prepare('SELECT execution_state FROM task_dispatch_runs WHERE id = ?').get('run-1') as { execution_state: string };
    assert.equal(updatedRun.execution_state, 'stalled');

    const blocker = db.prepare('SELECT title FROM task_blockers WHERE task_id = ?').get('task-1') as { title: string };
    assert.equal(blocker.title, 'Execution stalled after dispatch');

    const activity = db.prepare(
      `SELECT * FROM task_activities
       WHERE task_id = ?
         AND activity_type = 'staleness_detected'
       ORDER BY created_at DESC
       LIMIT 1`
    ).get('task-1') as any;
    assert.ok(activity);
    assert.match(String(activity.metadata), /stalled_execution_detected/);
  } finally {
    closeDb();
    if (previousDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDbPath;
    }
    if (previousAckTimeout === undefined) {
      delete process.env.MC_EXECUTION_ACK_TIMEOUT_MINUTES;
    } else {
      process.env.MC_EXECUTION_ACK_TIMEOUT_MINUTES = previousAckTimeout;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('execution watchdog flags recent runtime signals that do not have matching task-visible receipts', async () => {
  const previousDbPath = process.env.DATABASE_PATH;
  const { dir, dbPath } = createTempDbPath('execution-watchdog-receipt-gap');

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
    ).run('task-2', 'Receipt gap task', 'Runtime is newer than receipts', 'in_progress', 'high', '11111111-1111-1111-1111-111111111111', 'default', 'default');

    db.prepare(
      `INSERT INTO task_dispatch_runs (
        id, task_id, agent_id, openclaw_session_id, session_key, dispatch_attempt,
        dispatch_status, execution_state, execution_started_at, last_runtime_signal_at, last_runtime_signal_type,
        ingestion_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-15 minutes'), datetime('now', '-1 minute'), ?, ?, datetime('now', '-15 minutes'), datetime('now', '-1 minute'))`
    ).run(
      'run-2',
      'task-2',
      '11111111-1111-1111-1111-111111111111',
      'agent-main-11111111-1111-1111-1111-111111111111',
      'agent:main:agent-main-11111111-1111-1111-1111-111111111111',
      1,
      'sent',
      'executing',
      'progress_seen',
      'pending'
    );

    db.prepare(
      `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-10 minutes'))`
    ).run(
      'activity-1',
      'task-2',
      '11111111-1111-1111-1111-111111111111',
      'status_changed',
      'Older visible task receipt',
      JSON.stringify({ receipt_type: 'dispatch_sent', execution_run_id: 'run-2' })
    );

    const incidents = await runExecutionWatchdog({ pollRuntime: false });
    const incident = incidents.find((entry) => entry.runId === 'run-2');
    assert.ok(incident);
    assert.equal(incident.rule, 'runtime_signal_without_receipt');

    const blocker = db.prepare('SELECT title FROM task_blockers WHERE task_id = ? ORDER BY created_at DESC LIMIT 1').get('task-2') as { title: string };
    assert.equal(blocker.title, 'Runtime updated without visible task evidence');
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

test('execution watchdog does not duplicate blockers for the same stalled condition across repeated cycles', async () => {
  const previousDbPath = process.env.DATABASE_PATH;
  const previousAckTimeout = process.env.MC_EXECUTION_ACK_TIMEOUT_MINUTES;
  const { dir, dbPath } = createTempDbPath('execution-watchdog-dedupe');

  try {
    process.env.DATABASE_PATH = dbPath;
    process.env.MC_EXECUTION_ACK_TIMEOUT_MINUTES = '1';
    closeDb();

    const db = getDb();
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, slug, folder_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run('default', 'Default Workspace', 'default', '/tmp/mission-control-new');

    db.prepare(
      `INSERT INTO agents (id, name, role, workspace_id, status, is_master, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-20 minutes'), datetime('now', '-20 minutes'))`
    ).run('33333333-3333-3333-3333-333333333333', 'Builder', 'engineer', 'default', 'working', 0, 'local');

    db.prepare(
      `INSERT INTO tasks (
        id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-20 minutes'), datetime('now', '-20 minutes'))`
    ).run('task-3', 'Repeated stall', 'Should not duplicate blockers', 'assigned', 'high', '33333333-3333-3333-3333-333333333333', 'default', 'default');

    db.prepare(
      `INSERT INTO task_dispatch_runs (
        id, task_id, agent_id, openclaw_session_id, session_key, dispatch_attempt,
        dispatch_status, execution_state, ingestion_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-10 minutes'), datetime('now', '-10 minutes'))`
    ).run(
      'run-3',
      'task-3',
      '33333333-3333-3333-3333-333333333333',
      'agent-main-33333333-3333-3333-3333-333333333333',
      'agent:main:agent-main-33333333-3333-3333-3333-333333333333',
      1,
      'sent',
      'dispatched',
      'pending'
    );

    await runExecutionWatchdog({ pollRuntime: false });
    await runExecutionWatchdog({ pollRuntime: false });

    const blockerCount = db.prepare(
      `SELECT COUNT(*) AS count
       FROM task_blockers
       WHERE task_id = ?`
    ).get('task-3') as { count: number };
    assert.equal(blockerCount.count, 1);

    const activityCount = db.prepare(
      `SELECT COUNT(*) AS count
       FROM task_activities
       WHERE task_id = ?
         AND activity_type = 'staleness_detected'`
    ).get('task-3') as { count: number };
    assert.equal(activityCount.count, 1);
  } finally {
    closeDb();
    if (previousDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDbPath;
    }
    if (previousAckTimeout === undefined) {
      delete process.env.MC_EXECUTION_ACK_TIMEOUT_MINUTES;
    } else {
      process.env.MC_EXECUTION_ACK_TIMEOUT_MINUTES = previousAckTimeout;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
