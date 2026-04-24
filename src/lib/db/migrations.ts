/**
 * Database Migrations System
 * 
 * Handles schema changes in a production-safe way:
 * 1. Tracks which migrations have been applied
 * 2. Runs new migrations automatically on startup
 * 3. Never runs the same migration twice
 */

import Database from 'better-sqlite3';
import { applyAdditiveRepair } from './inspection';

interface Migration {
  id: string;
  name: string;
  up: (db: Database.Database) => void;
}

export type MigrationStepReceipt = {
  id: string;
  name: string;
  status: 'applied' | 'skipped' | 'failed';
  startedAt: string;
  completedAt: string;
  error?: string;
};

export type MigrationRunReceipt = {
  operation: 'db_migrations';
  status: 'ok' | 'failed';
  startedAt: string;
  completedAt: string;
  applied: string[];
  pending: string[];
  steps: MigrationStepReceipt[];
  error?: string;
};

// All migrations in order - NEVER remove or reorder existing migrations
const migrations: Migration[] = [
  {
    id: '001',
    name: 'initial_schema',
    up: (db) => {
      // Core tables - these are created in schema.ts on fresh databases
      // This migration exists to mark the baseline for existing databases
      console.log('[Migration 001] Baseline schema marker');
    }
  },
  {
    id: '002',
    name: 'add_workspaces',
    up: (db) => {
      console.log('[Migration 002] Adding workspaces table and columns...');
      
      // Create workspaces table if not exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          icon TEXT DEFAULT '📁',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      
      // Insert default workspace if not exists
      db.exec(`
        INSERT OR IGNORE INTO workspaces (id, name, slug, description, icon) 
        VALUES ('default', 'Default Workspace', 'default', 'Default workspace', '🏠');
      `);
      
      // Add workspace_id to tasks if not exists
      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
      if (!tasksInfo.some(col => col.name === 'workspace_id')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id)`);
        console.log('[Migration 002] Added workspace_id to tasks');
      }
      
      // Add workspace_id to agents if not exists
      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];
      if (!agentsInfo.some(col => col.name === 'workspace_id')) {
        db.exec(`ALTER TABLE agents ADD COLUMN workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id)`);
        console.log('[Migration 002] Added workspace_id to agents');
      }
    }
  },
  {
    id: '003',
    name: 'add_planning_tables',
    up: (db) => {
      console.log('[Migration 003] Adding planning tables...');
      
      // Create planning_questions table if not exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS planning_questions (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          category TEXT NOT NULL,
          question TEXT NOT NULL,
          question_type TEXT DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'text', 'yes_no')),
          options TEXT,
          answer TEXT,
          answered_at TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      
      // Create planning_specs table if not exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS planning_specs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
          spec_markdown TEXT NOT NULL,
          locked_at TEXT NOT NULL,
          locked_by TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      
      // Create index
      db.exec(`CREATE INDEX IF NOT EXISTS idx_planning_questions_task ON planning_questions(task_id, sort_order)`);
      
      // Update tasks status check constraint to include 'planning'
      // SQLite doesn't support ALTER CONSTRAINT, so we check if it's needed
      const taskSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string } | undefined;
      if (taskSchema && !taskSchema.sql.includes("'planning'")) {
        console.log('[Migration 003] Note: tasks table needs planning status - will be handled by schema recreation on fresh dbs');
      }
    }
  },
  {
    id: '004',
    name: 'add_planning_session_columns',
    up: (db) => {
      console.log('[Migration 004] Adding planning session columns to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      // Add planning_session_key column
      if (!tasksInfo.some(col => col.name === 'planning_session_key')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_session_key TEXT`);
        console.log('[Migration 004] Added planning_session_key');
      }

      // Add planning_messages column (stores JSON array of messages)
      if (!tasksInfo.some(col => col.name === 'planning_messages')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_messages TEXT`);
        console.log('[Migration 004] Added planning_messages');
      }

      // Add planning_complete column
      if (!tasksInfo.some(col => col.name === 'planning_complete')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_complete INTEGER DEFAULT 0`);
        console.log('[Migration 004] Added planning_complete');
      }

      // Add planning_spec column (stores final spec JSON)
      if (!tasksInfo.some(col => col.name === 'planning_spec')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_spec TEXT`);
        console.log('[Migration 004] Added planning_spec');
      }

      // Add planning_agents column (stores generated agents JSON)
      if (!tasksInfo.some(col => col.name === 'planning_agents')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_agents TEXT`);
        console.log('[Migration 004] Added planning_agents');
      }
    }
  },
  {
    id: '005',
    name: 'add_agent_model_field',
    up: (db) => {
      console.log('[Migration 005] Adding model field to agents...');

      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];

      // Add model column
      if (!agentsInfo.some(col => col.name === 'model')) {
        db.exec(`ALTER TABLE agents ADD COLUMN model TEXT`);
        console.log('[Migration 005] Added model to agents');
      }
    }
  },
  {
    id: '006',
    name: 'add_planning_dispatch_error_column',
    up: (db) => {
      console.log('[Migration 006] Adding planning_dispatch_error column to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      // Add planning_dispatch_error column
      if (!tasksInfo.some(col => col.name === 'planning_dispatch_error')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN planning_dispatch_error TEXT`);
        console.log('[Migration 006] Added planning_dispatch_error to tasks');
      }
    }
  },
  {
    id: '007',
    name: 'add_agent_source_and_gateway_id',
    up: (db) => {
      console.log('[Migration 007] Adding source and gateway_agent_id to agents...');

      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];

      // Add source column: 'local' for MC-created, 'gateway' for imported from OpenClaw Gateway
      if (!agentsInfo.some(col => col.name === 'source')) {
        db.exec(`ALTER TABLE agents ADD COLUMN source TEXT DEFAULT 'local'`);
        console.log('[Migration 007] Added source to agents');
      }

      // Add gateway_agent_id column: stores the original agent ID/name from the Gateway
      if (!agentsInfo.some(col => col.name === 'gateway_agent_id')) {
        db.exec(`ALTER TABLE agents ADD COLUMN gateway_agent_id TEXT`);
        console.log('[Migration 007] Added gateway_agent_id to agents');
      }
    }
  },
  {
    id: '008',
    name: 'add_status_reason_column',
    up: (db) => {
      console.log('[Migration 008] Adding status_reason column to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      if (!tasksInfo.some(col => col.name === 'status_reason')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN status_reason TEXT`);
        console.log('[Migration 008] Added status_reason to tasks');
      }
    }
  },
  {
    id: '009',
    name: 'add_agent_session_key_prefix',
    up: (db) => {
      console.log('[Migration 009] Adding session_key_prefix to agents...');

      const agentsInfo = db.prepare("PRAGMA table_info(agents)").all() as { name: string }[];

      if (!agentsInfo.some(col => col.name === 'session_key_prefix')) {
        db.exec(`ALTER TABLE agents ADD COLUMN session_key_prefix TEXT`);
        console.log('[Migration 009] Added session_key_prefix to agents');
      }
    }
  },
  {
    id: '010',
    name: 'schema_drift_additive_repair',
    up: (db) => {
      console.log('[Migration 010] Running additive schema repair...');
      const statements = applyAdditiveRepair(db);
      console.log(`[Migration 010] Applied ${statements.length} additive repair statements`);
    }
  },
  {
    id: '011',
    name: 'add_task_milestones',
    up: (db) => {
      console.log('[Migration 011] Creating task_milestones and task_progress tables...');

      // Create task_milestones table
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_milestones (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked')),
          phase TEXT NOT NULL,
          order_index INTEGER DEFAULT 0,
          completed_at TEXT,
          completed_by_agent_id TEXT REFERENCES agents(id),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Create task_progress table
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_progress (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
          current_phase TEXT DEFAULT 'initiation',
          started_at TEXT,
          last_updated_at TEXT,
          completed_at TEXT,
          completion_summary TEXT
        );
      `);

      // Create indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_milestones_task ON task_milestones(task_id, order_index)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_progress_task ON task_progress(task_id)`);

      console.log('[Migration 011] Created task_milestones and task_progress tables');
    }
  },
  {
    id: '012',
    name: 'ensure_workspace_folder_path',
    up: (db) => {
      console.log('[Migration 012] Ensuring folder_path exists on workspaces...');

      const workspacesInfo = db.prepare("PRAGMA table_info(workspaces)").all() as { name: string }[];

      if (!workspacesInfo.some(col => col.name === 'folder_path')) {
        db.exec(`ALTER TABLE workspaces ADD COLUMN folder_path TEXT`);
        console.log('[Migration 012] Added folder_path to workspaces');
      }
    }
  },
  {
    id: '013',
    name: 'add_task_type_and_hours',
    up: (db) => {
      console.log('[Migration 013] Adding task_type and hour fields to tasks...');

      const tasksInfo = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];

      if (!tasksInfo.some(col => col.name === 'task_type')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'general'`);
        console.log('[Migration 013] Added task_type to tasks');
      }

      if (!tasksInfo.some(col => col.name === 'estimated_hours')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN estimated_hours REAL`);
        console.log('[Migration 013] Added estimated_hours to tasks');
      }

      if (!tasksInfo.some(col => col.name === 'actual_hours')) {
        db.exec(`ALTER TABLE tasks ADD COLUMN actual_hours REAL`);
        console.log('[Migration 013] Added actual_hours to tasks');
      }
    }
  },
  {
    id: '014',
    name: 'add_task_blockers',
    up: (db) => {
      console.log('[Migration 014] Creating task_blockers and blocker_escalations tables...');

      // Create task_blockers table
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_blockers (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          blocker_type TEXT NOT NULL CHECK (blocker_type IN ('external_dependency', 'approval_pending', 'resource_unavailable', 'technical_impediment', 'spec_ambiguous', 'test_blocker')),
          severity TEXT DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'escalated', 'resolved')),
          title TEXT NOT NULL,
          description TEXT,
          identified_by_agent_id TEXT REFERENCES agents(id),
          escalated_at TEXT,
          escalated_to_agent_id TEXT REFERENCES agents(id),
          resolved_at TEXT,
          resolved_by_agent_id TEXT REFERENCES agents(id),
          resolution_note TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Create blocker_escalations table
      db.exec(`
        CREATE TABLE IF NOT EXISTS blocker_escalations (
          id TEXT PRIMARY KEY,
          blocker_id TEXT NOT NULL REFERENCES task_blockers(id) ON DELETE CASCADE,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          escalated_by_agent_id TEXT REFERENCES agents(id),
          escalated_to_agent_id TEXT REFERENCES agents(id),
          escalation_note TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Create indexes
      db.exec(`CREATE INDEX IF NOT EXISTS idx_blockers_task ON task_blockers(task_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_blockers_status ON task_blockers(status)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_blockers_severity ON task_blockers(severity)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_escalations_blocker ON blocker_escalations(blocker_id)`);

      console.log('[Migration 014] Created task_blockers and blocker_escalations tables');
    }
  },
  {
    id: '015',
    name: 'add_bulk_operation_audit_tables',
    up: (db) => {
      console.log('[Migration 015] Creating bulk operation audit tables...');

      db.exec(`
        CREATE TABLE IF NOT EXISTS bulk_operation_reports (
          id TEXT PRIMARY KEY,
          operation_type TEXT NOT NULL CHECK (operation_type IN ('transition', 'delete')),
          execution_mode TEXT NOT NULL CHECK (execution_mode IN ('dry-run', 'execute')),
          status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
          requested_by_agent_id TEXT REFERENCES agents(id),
          reason TEXT,
          request_payload TEXT,
          report_json TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS task_archives (
          id TEXT PRIMARY KEY,
          original_task_id TEXT NOT NULL,
          bulk_report_id TEXT,
          archived_by_agent_id TEXT REFERENCES agents(id),
          archive_reason TEXT NOT NULL,
          source_operation TEXT NOT NULL CHECK (source_operation IN ('bulk_delete')),
          snapshot_json TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      db.exec(`CREATE INDEX IF NOT EXISTS idx_bulk_reports_created ON bulk_operation_reports(created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_archives_task ON task_archives(original_task_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_archives_report ON task_archives(bulk_report_id)`);

      console.log('[Migration 015] Created bulk_operation_reports and task_archives tables');
    }
  },
  {
    id: '016',
    name: 'add_task_dispatch_runs',
    up: (db) => {
      console.log('[Migration 016] Creating task_dispatch_runs table...');

      db.exec(`
        CREATE TABLE IF NOT EXISTS task_dispatch_runs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
          openclaw_session_id TEXT NOT NULL,
          session_key TEXT NOT NULL,
          dispatch_attempt INTEGER NOT NULL DEFAULT 1,
          dispatch_status TEXT NOT NULL DEFAULT 'queued' CHECK (dispatch_status IN ('queued', 'sent', 'failed', 'superseded')),
          execution_state TEXT NOT NULL DEFAULT 'queued' CHECK (execution_state IN ('queued', 'dispatched', 'acknowledged', 'executing', 'blocked', 'stalled', 'completed', 'ingestion_failed')),
          idempotency_key TEXT,
          acknowledged_at TEXT,
          execution_started_at TEXT,
          last_progress_at TEXT,
          last_runtime_signal_at TEXT,
          last_runtime_signal_type TEXT,
          completed_at TEXT,
          ingestion_status TEXT NOT NULL DEFAULT 'pending' CHECK (ingestion_status IN ('pending', 'ingested', 'failed')),
          source_summary TEXT,
          source_metadata TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dispatch_runs_task ON task_dispatch_runs(task_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dispatch_runs_agent ON task_dispatch_runs(agent_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dispatch_runs_session ON task_dispatch_runs(openclaw_session_id, created_at DESC)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_task_dispatch_runs_state ON task_dispatch_runs(execution_state, ingestion_status, created_at DESC)`);

      console.log('[Migration 016] Created task_dispatch_runs table');
    }
  }
];

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database.Database): MigrationRunReceipt {
  const startedAt = new Date().toISOString();
  const steps: MigrationStepReceipt[] = [];

  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  // Get already applied migrations
  const applied = new Set(
    (db.prepare('SELECT id FROM _migrations').all() as { id: string }[]).map(m => m.id)
  );

  // Run pending migrations in order
  try {
    for (const migration of migrations) {
      if (applied.has(migration.id)) {
        const receipt: MigrationStepReceipt = {
          id: migration.id,
          name: migration.name,
          status: 'skipped',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        steps.push(receipt);
        continue;
      }

      console.log(`[DB] Running migration ${migration.id}: ${migration.name}`);
      const stepStartedAt = new Date().toISOString();

      try {
        db.transaction(() => {
          migration.up(db);
          db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
        })();

        const receipt: MigrationStepReceipt = {
          id: migration.id,
          name: migration.name,
          status: 'applied',
          startedAt: stepStartedAt,
          completedAt: new Date().toISOString(),
        };
        steps.push(receipt);
        console.log('[DB][Receipt]', JSON.stringify(receipt));
      } catch (error) {
        const receipt: MigrationStepReceipt = {
          id: migration.id,
          name: migration.name,
          status: 'failed',
          startedAt: stepStartedAt,
          completedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown migration error',
        };
        steps.push(receipt);
        console.error('[DB][Receipt]', JSON.stringify(receipt));
        throw error;
      }
    }

    const receipt: MigrationRunReceipt = {
      operation: 'db_migrations',
      status: 'ok',
      startedAt,
      completedAt: new Date().toISOString(),
      applied: (db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: string }[]).map((migration) => migration.id),
      pending: [],
      steps,
    };
    console.log('[DB][Receipt]', JSON.stringify(receipt));
    return receipt;
  } catch (error) {
    const appliedAfterFailure = (db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: string }[]).map((migration) => migration.id);
    const receipt: MigrationRunReceipt = {
      operation: 'db_migrations',
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      applied: appliedAfterFailure,
      pending: migrations.filter((migration) => !appliedAfterFailure.includes(migration.id)).map((migration) => migration.id),
      steps,
      error: error instanceof Error ? error.message : 'Unknown migration error',
    };
    console.error('[DB][Receipt]', JSON.stringify(receipt));
    throw error;
  }
}

/**
 * Get migration status
 */
export function getMigrationStatus(db: Database.Database): { applied: string[]; pending: string[] } {
  const applied = (db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: string }[]).map(m => m.id);
  const pending = migrations.filter(m => !applied.includes(m.id)).map(m => m.id);
  return { applied, pending };
}
