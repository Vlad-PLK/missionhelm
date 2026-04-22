import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import Database from 'better-sqlite3';
import { NextRequest } from 'next/server';
import { closeDb, getDbStartupStatus } from '@/lib/db';
import { createLegacyPlanningDb, createTempDbPath } from '@/test/harness/db';
import { POST } from './route';
import { resetPlanningRouteTestDeps, setPlanningRouteTestDeps } from './deps';

test('planning route repairs drifted migrated database before starting planning', async () => {
  const previousDbPath = process.env.DATABASE_PATH;
  const { dir, dbPath } = createTempDbPath('planning-route');

  try {
    createLegacyPlanningDb(dbPath, { markAllMigrationsApplied: true });
    process.env.DATABASE_PATH = dbPath;
    closeDb();

    let sentMessage: { sessionKey: string; message: string } | null = null;
    setPlanningRouteTestDeps({
      getOpenClawClient: () => ({
        isConnected: () => true,
        connect: async () => undefined,
        call: async (_method: string, params: { sessionKey: string; message: string }) => {
          sentMessage = params;
        },
      }),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/tasks/task-1/planning', { method: 'POST' }),
      { params: Promise.resolve({ id: 'task-1' }) }
    );

    assert.equal(response.status, 200);

    const payload = await response.json() as { success: boolean; sessionKey: string };
    assert.equal(payload.success, true);
    assert.ok(payload.sessionKey.includes('planning:task-1'));
    assert.ok(sentMessage);

    const status = getDbStartupStatus();
    assert.equal(status.ready, true);
    assert.equal(status.preflight?.status, 'repaired');

    const db = closeAndReopenDb();
    const planningColumns = (db.prepare(`PRAGMA table_info(tasks)`).all() as { name: string }[]).map((column) => column.name);
    assert.ok(planningColumns.includes('planning_session_key'));
    assert.ok(planningColumns.includes('planning_messages'));
    assert.ok(planningColumns.includes('planning_dispatch_error'));
    db.close();
  } finally {
    resetPlanningRouteTestDeps();
    closeDb();
    if (previousDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = previousDbPath;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function closeAndReopenDb() {
  return new Database(process.env.DATABASE_PATH!);
}
