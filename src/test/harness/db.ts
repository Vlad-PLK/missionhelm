import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

type LegacyDbOptions = {
  markAllMigrationsApplied?: boolean;
};

export function createTempDbPath(name = 'mission-control'): { dir: string; dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  return { dir, dbPath: path.join(dir, 'mission-control.db') };
}

export function createLegacyPlanningDb(dbPath: string, options: LegacyDbOptions = {}): void {
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      icon TEXT DEFAULT '📁',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT,
      avatar_emoji TEXT DEFAULT '🤖',
      status TEXT DEFAULT 'standby',
      is_master INTEGER DEFAULT 0,
      workspace_id TEXT DEFAULT 'default',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'inbox',
      priority TEXT DEFAULT 'normal',
      assigned_agent_id TEXT,
      created_by_agent_id TEXT,
      workspace_id TEXT DEFAULT 'default',
      business_id TEXT DEFAULT 'default',
      due_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.prepare(`INSERT INTO workspaces (id, name, slug, description) VALUES (?, ?, ?, ?)`)
    .run('default', 'Default Workspace', 'default', 'Default workspace');

  db.prepare(`INSERT INTO agents (id, name, role, is_master, workspace_id, status) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('master-1', 'Master Agent', 'orchestrator', 1, 'default', 'standby');

  db.prepare(`INSERT INTO tasks (id, title, description, workspace_id, status) VALUES (?, ?, ?, ?, ?)`)
    .run('task-1', 'Repair migrated database', 'Planning route regression coverage', 'default', 'inbox');

  if (options.markAllMigrationsApplied !== false) {
    for (const id of ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013']) {
      db.prepare(`INSERT INTO _migrations (id, name) VALUES (?, ?)`)
        .run(id, `migration_${id}`);
    }
  }

  db.close();
}
