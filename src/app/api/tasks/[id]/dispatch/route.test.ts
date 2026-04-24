import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { NextRequest } from 'next/server';
import { closeDb, getDb } from '@/lib/db';
import { createTempDbPath } from '@/test/harness/db';
import { POST } from './route';
import { resetDispatchRouteTestDeps, setDispatchRouteTestDeps } from './deps';

function seedExecutionDb() {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, folder_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run('default', 'Default Workspace', 'default', '/tmp/mission-control-new');

  db.prepare(
    `INSERT INTO agents (id, name, role, workspace_id, status, is_master, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run('11111111-1111-1111-1111-111111111111', 'Builder', 'engineer', 'default', 'standby', 0, 'local');

  db.prepare(
    `INSERT INTO tasks (
      id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run('task-1', 'Implement execution binding', 'Repair dispatch monitoring', 'assigned', 'high', '11111111-1111-1111-1111-111111111111', 'default', 'default');

  return db;
}

test('dispatch route creates an exact execution run without forcing the task to in_progress', async () => {
  const previousDbPath = process.env.DATABASE_PATH;
  const { dir, dbPath } = createTempDbPath('dispatch-route');

  try {
    process.env.DATABASE_PATH = dbPath;
    closeDb();
    const db = seedExecutionDb();

    let sentPayload: Record<string, unknown> | null = null;
    setDispatchRouteTestDeps({
      getOpenClawClient: () => ({
        isConnected: () => true,
        connect: async () => undefined,
        call: async (_method: string, params: Record<string, unknown>) => {
          sentPayload = params;
          return {};
        },
      }),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/tasks/task-1/dispatch', { method: 'POST' }),
      { params: Promise.resolve({ id: 'task-1' }) }
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { execution_run_id: string; session_id: string };
    assert.ok(payload.execution_run_id);
    assert.match(payload.session_id, /11111111-1111-1111-1111-111111111111$/);
    assert.ok(sentPayload);

    const task = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task-1') as { status: string };
    assert.equal(task.status, 'assigned');

    const run = db.prepare('SELECT * FROM task_dispatch_runs WHERE id = ?').get(payload.execution_run_id) as any;
    assert.equal(run.task_id, 'task-1');
    assert.equal(run.agent_id, '11111111-1111-1111-1111-111111111111');
    assert.equal(run.dispatch_status, 'sent');
    assert.equal(run.execution_state, 'dispatched');

    const session = db.prepare('SELECT * FROM openclaw_sessions WHERE openclaw_session_id = ?').get(payload.session_id) as any;
    assert.equal(session.task_id, 'task-1');

    const activity = db.prepare(`SELECT * FROM task_activities WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`).get('task-1') as any;
    assert.match(activity.message, /Dispatch sent to Builder/);
    assert.match(String(activity.metadata), /dispatch_sent/);
  } finally {
    resetDispatchRouteTestDeps();
    closeDb();
    if (previousDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDbPath;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dispatch route rejects a new task when the agent already has another active execution run', async () => {
  const previousDbPath = process.env.DATABASE_PATH;
  const { dir, dbPath } = createTempDbPath('dispatch-conflict');

  try {
    process.env.DATABASE_PATH = dbPath;
    closeDb();
    const db = seedExecutionDb();

    db.prepare(
      `INSERT INTO tasks (
        id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run('task-2', 'Second task', 'Should be blocked', 'assigned', 'normal', '11111111-1111-1111-1111-111111111111', 'default', 'default');

    db.prepare(
      `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run('session-1', '11111111-1111-1111-1111-111111111111', 'agent-main-11111111-1111-1111-1111-111111111111', 'mission-control', 'active', 'task-1');

    db.prepare(
      `INSERT INTO task_dispatch_runs (
        id, task_id, agent_id, openclaw_session_id, session_key, dispatch_attempt,
        dispatch_status, execution_state, ingestion_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
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

    setDispatchRouteTestDeps({
      getOpenClawClient: () => ({
        isConnected: () => true,
        connect: async () => undefined,
        call: async () => ({}),
      }),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/tasks/task-2/dispatch', { method: 'POST' }),
      { params: Promise.resolve({ id: 'task-2' }) }
    );

    assert.equal(response.status, 409);
    const payload = await response.json() as { conflicting_task_id: string };
    assert.equal(payload.conflicting_task_id, 'task-1');

    const runCount = db.prepare('SELECT COUNT(*) as count FROM task_dispatch_runs').get() as { count: number };
    assert.equal(runCount.count, 1);
  } finally {
    resetDispatchRouteTestDeps();
    closeDb();
    if (previousDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDbPath;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('failed dispatch does not leave a task-bound session without an execution run', async () => {
  const previousDbPath = process.env.DATABASE_PATH;
  const { dir, dbPath } = createTempDbPath('dispatch-failure');

  try {
    process.env.DATABASE_PATH = dbPath;
    closeDb();
    const db = seedExecutionDb();

    setDispatchRouteTestDeps({
      getOpenClawClient: () => ({
        isConnected: () => true,
        connect: async () => undefined,
        call: async () => {
          throw new Error('chat.send failed');
        },
      }),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/tasks/task-1/dispatch', { method: 'POST' }),
      { params: Promise.resolve({ id: 'task-1' }) }
    );

    assert.equal(response.status, 500);

    const session = db.prepare('SELECT * FROM openclaw_sessions LIMIT 1').get() as any;
    assert.ok(session);
    assert.equal(session.task_id, null);

    const runCount = db.prepare('SELECT COUNT(*) as count FROM task_dispatch_runs').get() as { count: number };
    assert.equal(runCount.count, 0);
  } finally {
    resetDispatchRouteTestDeps();
    closeDb();
    if (previousDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDbPath;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
