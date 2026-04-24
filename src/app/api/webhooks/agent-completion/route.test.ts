import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { NextRequest } from 'next/server';
import { closeDb, getDb } from '@/lib/db';
import { createTempDbPath } from '@/test/harness/db';
import { POST } from './route';

function seedCompletionDb() {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (id, name, slug, folder_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run('default', 'Default Workspace', 'default', '/tmp/mission-control-new');

  db.prepare(
    `INSERT INTO agents (id, name, role, workspace_id, status, is_master, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run('11111111-1111-1111-1111-111111111111', 'Builder', 'engineer', 'default', 'working', 0, 'local');

  db.prepare(
    `INSERT INTO tasks (
      id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 hours'), datetime('now', '-2 hours'))`
  ).run('task-1', 'Primary task', 'Should complete from exact run', 'assigned', 'high', '11111111-1111-1111-1111-111111111111', 'default', 'default');

  db.prepare(
    `INSERT INTO tasks (
      id, title, description, status, priority, assigned_agent_id, workspace_id, business_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).run('task-2', 'Later task', 'Would be chosen by latest-task inference', 'in_progress', 'normal', '11111111-1111-1111-1111-111111111111', 'default', 'default');

  db.prepare(
    `INSERT INTO openclaw_sessions (id, agent_id, openclaw_session_id, channel, status, task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-2 hours'), datetime('now', '-2 hours'))`
  ).run('session-1', '11111111-1111-1111-1111-111111111111', 'agent-main-11111111-1111-1111-1111-111111111111', 'mission-control', 'active', 'task-1');

  db.prepare(
    `INSERT INTO task_dispatch_runs (
      id, task_id, agent_id, openclaw_session_id, session_key, dispatch_attempt,
      dispatch_status, execution_state, acknowledged_at, ingestion_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-90 minutes'), ?, datetime('now', '-2 hours'), datetime('now', '-90 minutes'))`
  ).run(
    'run-1',
    'task-1',
    '11111111-1111-1111-1111-111111111111',
    'agent-main-11111111-1111-1111-1111-111111111111',
    'agent:main:agent-main-11111111-1111-1111-1111-111111111111',
    1,
    'sent',
    'acknowledged',
    'pending'
  );

  return db;
}

test('completion webhook resolves the exact task by execution run instead of agent latest-task inference', async () => {
  const previousDbPath = process.env.DATABASE_PATH;
  const { dir, dbPath } = createTempDbPath('completion-route');

  try {
    process.env.DATABASE_PATH = dbPath;
    closeDb();
    const db = seedCompletionDb();

    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/agent-completion', {
        method: 'POST',
        body: JSON.stringify({
          session_id: 'agent-main-11111111-1111-1111-1111-111111111111',
          message: 'TASK_COMPLETE: implemented exact binding | deliverables: src/lib/execution-runs.ts | verification: npx tsc --noEmit',
        }),
      })
    );

    assert.equal(response.status, 200);
    const payload = await response.json() as { task_id: string; execution_run_id: string };
    assert.equal(payload.task_id, 'task-1');
    assert.equal(payload.execution_run_id, 'run-1');

    const completedTask = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task-1') as { status: string };
    const untouchedTask = db.prepare('SELECT status FROM tasks WHERE id = ?').get('task-2') as { status: string };
    assert.equal(completedTask.status, 'testing');
    assert.equal(untouchedTask.status, 'in_progress');

    const run = db.prepare('SELECT * FROM task_dispatch_runs WHERE id = ?').get('run-1') as any;
    assert.equal(run.execution_state, 'completed');
    assert.equal(run.ingestion_status, 'ingested');

    const deliverable = db.prepare('SELECT * FROM task_deliverables WHERE task_id = ?').get('task-1') as any;
    assert.equal(deliverable.path, 'src/lib/execution-runs.ts');

    const activity = db.prepare(
      `SELECT * FROM task_activities
       WHERE task_id = ?
         AND message = ?
       ORDER BY created_at DESC
       LIMIT 1`
    ).get('task-1', 'Completion signal ingested into task receipts') as any;
    assert.ok(activity);
    assert.match(String(activity.metadata), /completion_ingested/);

    const agent = db.prepare('SELECT status FROM agents WHERE id = ?').get('11111111-1111-1111-1111-111111111111') as { status: string };
    assert.equal(agent.status, 'standby');
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
