import Database from 'better-sqlite3';

type InvariantColumn = {
  name: string;
  addSql: string;
};

type InvariantTable = {
  name: string;
  createSql: string;
  columns: InvariantColumn[];
};

export type SchemaViolation = {
  kind: 'missing_table' | 'missing_column';
  table: string;
  column?: string;
  repairSql: string;
};

export type SchemaInspection = {
  inspectedAt: string;
  tables: Record<string, { columns: string[] }>;
  indexes: string[];
};

export type PreflightReceipt = {
  operation: 'db_preflight';
  status: 'ok' | 'repaired' | 'failed';
  startedAt: string;
  completedAt: string;
  violations: SchemaViolation[];
  repairStatements: string[];
  remainingViolations: SchemaViolation[];
  error?: string;
};

const TABLE_INVARIANTS: InvariantTable[] = [
  {
    name: 'workspaces',
    createSql: `
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        icon TEXT DEFAULT '📁',
        folder_path TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `,
    columns: [
      { name: 'folder_path', addSql: `ALTER TABLE workspaces ADD COLUMN folder_path TEXT` },
    ],
  },
  {
    name: 'agents',
    createSql: `
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        description TEXT,
        avatar_emoji TEXT DEFAULT '🤖',
        status TEXT DEFAULT 'standby' CHECK (status IN ('standby', 'working', 'offline')),
        is_master INTEGER DEFAULT 0,
        workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
        soul_md TEXT,
        user_md TEXT,
        agents_md TEXT,
        model TEXT,
        source TEXT DEFAULT 'local',
        gateway_agent_id TEXT,
        session_key_prefix TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `,
    columns: [
      { name: 'workspace_id', addSql: `ALTER TABLE agents ADD COLUMN workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id)` },
      { name: 'model', addSql: `ALTER TABLE agents ADD COLUMN model TEXT` },
      { name: 'source', addSql: `ALTER TABLE agents ADD COLUMN source TEXT DEFAULT 'local'` },
      { name: 'gateway_agent_id', addSql: `ALTER TABLE agents ADD COLUMN gateway_agent_id TEXT` },
      { name: 'session_key_prefix', addSql: `ALTER TABLE agents ADD COLUMN session_key_prefix TEXT` },
    ],
  },
  {
    name: 'tasks',
    createSql: `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        task_type TEXT DEFAULT 'general' CHECK (task_type IN ('feature', 'bugfix', 'research', 'documentation', 'deployment', 'general')),
        status TEXT DEFAULT 'inbox' CHECK (status IN ('pending_dispatch', 'planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'done')),
        priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
        estimated_hours REAL,
        actual_hours REAL,
        assigned_agent_id TEXT REFERENCES agents(id),
        created_by_agent_id TEXT REFERENCES agents(id),
        workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id),
        business_id TEXT DEFAULT 'default',
        due_date TEXT,
        planning_session_key TEXT,
        planning_messages TEXT,
        planning_complete INTEGER DEFAULT 0,
        planning_spec TEXT,
        planning_agents TEXT,
        planning_dispatch_error TEXT,
        status_reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `,
    columns: [
      { name: 'task_type', addSql: `ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'general'` },
      { name: 'estimated_hours', addSql: `ALTER TABLE tasks ADD COLUMN estimated_hours REAL` },
      { name: 'actual_hours', addSql: `ALTER TABLE tasks ADD COLUMN actual_hours REAL` },
      { name: 'workspace_id', addSql: `ALTER TABLE tasks ADD COLUMN workspace_id TEXT DEFAULT 'default' REFERENCES workspaces(id)` },
      { name: 'planning_session_key', addSql: `ALTER TABLE tasks ADD COLUMN planning_session_key TEXT` },
      { name: 'planning_messages', addSql: `ALTER TABLE tasks ADD COLUMN planning_messages TEXT` },
      { name: 'planning_complete', addSql: `ALTER TABLE tasks ADD COLUMN planning_complete INTEGER DEFAULT 0` },
      { name: 'planning_spec', addSql: `ALTER TABLE tasks ADD COLUMN planning_spec TEXT` },
      { name: 'planning_agents', addSql: `ALTER TABLE tasks ADD COLUMN planning_agents TEXT` },
      { name: 'planning_dispatch_error', addSql: `ALTER TABLE tasks ADD COLUMN planning_dispatch_error TEXT` },
      { name: 'status_reason', addSql: `ALTER TABLE tasks ADD COLUMN status_reason TEXT` },
    ],
  },
  {
    name: 'planning_questions',
    createSql: `
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
      )
    `,
    columns: [],
  },
  {
    name: 'planning_specs',
    createSql: `
      CREATE TABLE IF NOT EXISTS planning_specs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
        spec_markdown TEXT NOT NULL,
        locked_at TEXT NOT NULL,
        locked_by TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `,
    columns: [],
  },
  {
    name: 'openclaw_sessions',
    createSql: `
      CREATE TABLE IF NOT EXISTS openclaw_sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT REFERENCES agents(id),
        openclaw_session_id TEXT NOT NULL,
        channel TEXT,
        status TEXT DEFAULT 'active',
        session_type TEXT DEFAULT 'persistent',
        task_id TEXT REFERENCES tasks(id),
        ended_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `,
    columns: [],
  },
  {
    name: 'task_activities',
    createSql: `
      CREATE TABLE IF NOT EXISTS task_activities (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        agent_id TEXT REFERENCES agents(id),
        activity_type TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `,
    columns: [],
  },
  {
    name: 'task_deliverables',
    createSql: `
      CREATE TABLE IF NOT EXISTS task_deliverables (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        deliverable_type TEXT NOT NULL,
        title TEXT NOT NULL,
        path TEXT,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `,
    columns: [],
  },
  {
    name: 'task_milestones',
    createSql: `
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
      )
    `,
    columns: [],
  },
  {
    name: 'task_progress',
    createSql: `
      CREATE TABLE IF NOT EXISTS task_progress (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
        current_phase TEXT DEFAULT 'initiation',
        started_at TEXT,
        last_updated_at TEXT,
        completed_at TEXT,
        completion_summary TEXT
      )
    `,
    columns: [],
  },
  {
    name: 'bulk_operation_reports',
    createSql: `
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
      )
    `,
    columns: [],
  },
  {
    name: 'task_archives',
    createSql: `
      CREATE TABLE IF NOT EXISTS task_archives (
        id TEXT PRIMARY KEY,
        original_task_id TEXT NOT NULL,
        bulk_report_id TEXT,
        archived_by_agent_id TEXT REFERENCES agents(id),
        archive_reason TEXT NOT NULL,
        source_operation TEXT NOT NULL CHECK (source_operation IN ('bulk_delete')),
        snapshot_json TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `,
    columns: [],
  },
];

const INDEX_REPAIR_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id)`,
  `CREATE INDEX IF NOT EXISTS idx_planning_questions_task ON planning_questions(task_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_activities_task ON task_activities(task_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_deliverables_task ON task_deliverables(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_openclaw_sessions_task ON openclaw_sessions(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_milestones_task ON task_milestones(task_id, order_index)`,
  `CREATE INDEX IF NOT EXISTS idx_progress_task ON task_progress(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_bulk_reports_created ON bulk_operation_reports(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_task_archives_task ON task_archives(original_task_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_task_archives_report ON task_archives(bulk_report_id)`,
];

export const DB_SCHEMA_INVARIANTS = TABLE_INVARIANTS.map(({ name, columns }) => ({
  table: name,
  columns: columns.map((column) => column.name),
}));

export function inspectDbSchema(db: Database.Database): SchemaInspection {
  const tables = db.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
  ).all() as { name: string }[];

  const inspectionTables = Object.fromEntries(
    tables.map(({ name }) => {
      const columns = (db.prepare(`PRAGMA table_info('${name}')`).all() as { name: string }[]).map((column) => column.name);
      return [name, { columns }];
    })
  );

  const indexes = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'`).all() as { name: string }[])
    .map((index) => index.name)
    .sort();

  return {
    inspectedAt: new Date().toISOString(),
    tables: inspectionTables,
    indexes,
  };
}

export function getSchemaViolations(inspection: SchemaInspection): SchemaViolation[] {
  const violations: SchemaViolation[] = [];

  for (const table of TABLE_INVARIANTS) {
    const inspectedTable = inspection.tables[table.name];

    if (!inspectedTable) {
      violations.push({
        kind: 'missing_table',
        table: table.name,
        repairSql: table.createSql.trim(),
      });
      continue;
    }

    for (const column of table.columns) {
      if (!inspectedTable.columns.includes(column.name)) {
        violations.push({
          kind: 'missing_column',
          table: table.name,
          column: column.name,
          repairSql: column.addSql,
        });
      }
    }
  }

  return violations;
}

export function applyAdditiveRepair(db: Database.Database): string[] {
  const statements: string[] = [];

  const violations = getSchemaViolations(inspectDbSchema(db));

  for (const violation of violations) {
    db.exec(violation.repairSql);
    statements.push(violation.repairSql);
  }

  for (const statement of INDEX_REPAIR_SQL) {
    db.exec(statement);
    statements.push(statement);
  }

  return statements;
}

export function runSchemaPreflight(db: Database.Database): PreflightReceipt {
  const startedAt = new Date().toISOString();
  const violations = getSchemaViolations(inspectDbSchema(db));

  if (violations.length === 0) {
    const receipt: PreflightReceipt = {
      operation: 'db_preflight',
      status: 'ok',
      startedAt,
      completedAt: new Date().toISOString(),
      violations: [],
      repairStatements: [],
      remainingViolations: [],
    };
    console.log('[DB][Receipt]', JSON.stringify(receipt));
    return receipt;
  }

  try {
    const repairStatements = db.transaction(() => applyAdditiveRepair(db))();
    const remainingViolations = getSchemaViolations(inspectDbSchema(db));
    const receipt: PreflightReceipt = {
      operation: 'db_preflight',
      status: remainingViolations.length === 0 ? 'repaired' : 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      violations,
      repairStatements,
      remainingViolations,
      error: remainingViolations.length === 0 ? undefined : 'Schema drift remains after additive repair.',
    };
    console.log('[DB][Receipt]', JSON.stringify(receipt));
    return receipt;
  } catch (error) {
    const receipt: PreflightReceipt = {
      operation: 'db_preflight',
      status: 'failed',
      startedAt,
      completedAt: new Date().toISOString(),
      violations,
      repairStatements: [],
      remainingViolations: violations,
      error: error instanceof Error ? error.message : 'Unknown preflight error',
    };
    console.error('[DB][Receipt]', JSON.stringify(receipt));
    return receipt;
  }
}
