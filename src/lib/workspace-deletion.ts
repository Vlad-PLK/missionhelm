import type Database from 'better-sqlite3';

export const PROTECTED_WORKSPACE_SLUGS = new Set([
  'default',
  'cafe-fino',
  'autonomous-workflow',
  'cronjobs-review',
]);

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  folder_path?: string | null;
}

export interface WorkspaceDeletionPreview {
  workspace: WorkspaceRow;
  protected: boolean;
  counts: {
    tasks: number;
    agents: number;
    openclaw_sessions: number;
    messages: number;
    events: number;
    task_activities: number;
    task_deliverables: number;
    planning_questions: number;
    planning_specs: number;
    conversations: number;
    conversation_participants: number;
    task_groups: number;
    task_dependencies: number;
    workspace_agents: number;
    task_milestones: number;
    task_progress: number;
  };
  warnings: string[];
  taskIds: string[];
  agentIds: string[];
}

interface AgentRetentionPlan {
  deleteAgentIds: string[];
  retainAgentIds: string[];
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;
  return !!row?.name;
}

function tableColumns(db: Database.Database, tableName: string): string[] {
  if (!tableExists(db, tableName)) return [];
  return (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map((col) => col.name);
}

function countByWorkspace(db: Database.Database, tableName: string, workspaceId: string): number {
  if (!tableExists(db, tableName)) return 0;
  const columns = tableColumns(db, tableName);
  if (!columns.includes('workspace_id')) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM ${tableName} WHERE workspace_id = ?`)
    .get(workspaceId) as { count: number };
  return row.count;
}

function countByIds(
  db: Database.Database,
  tableName: string,
  columnName: string,
  ids: string[]
): number {
  if (!tableExists(db, tableName) || ids.length === 0) return 0;
  const columns = tableColumns(db, tableName);
  if (!columns.includes(columnName)) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM ${tableName} WHERE ${columnName} IN (${placeholders})`)
    .get(...ids) as { count: number };
  return row.count;
}

function countDependencies(db: Database.Database, taskIds: string[]): number {
  if (!tableExists(db, 'task_dependencies') || taskIds.length === 0) return 0;
  const columns = tableColumns(db, 'task_dependencies');
  if (!columns.includes('task_id') || !columns.includes('depends_on_task_id')) return 0;
  const placeholders = taskIds.map(() => '?').join(',');
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM task_dependencies
       WHERE task_id IN (${placeholders}) OR depends_on_task_id IN (${placeholders})`
    )
    .get(...taskIds, ...taskIds) as { count: number };
  return row.count;
}

function countByTaskOrAgentIds(
  db: Database.Database,
  tableName: string,
  taskIds: string[],
  agentIds: string[]
): number {
  if (!tableExists(db, tableName)) return 0;
  const columns = tableColumns(db, tableName);
  const clauses: string[] = [];
  const params: string[] = [];

  if (taskIds.length > 0 && columns.includes('task_id')) {
    clauses.push(`task_id IN (${taskIds.map(() => '?').join(',')})`);
    params.push(...taskIds);
  }
  if (agentIds.length > 0 && columns.includes('agent_id')) {
    clauses.push(`agent_id IN (${agentIds.map(() => '?').join(',')})`);
    params.push(...agentIds);
  }

  if (clauses.length === 0) return 0;
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${tableName} WHERE ${clauses.join(' OR ')}`).get(...params) as {
    count: number;
  };
  return row.count;
}

function buildAgentRetentionPlan(
  db: Database.Database,
  workspaceId: string,
  taskIds: string[],
  agentIds: string[]
): AgentRetentionPlan {
  const deleteAgentIds: string[] = [];
  const retainAgentIds: string[] = [];

  for (const agentId of agentIds) {
    const externalTaskRef = db
      .prepare(
        `SELECT COUNT(*) as count FROM tasks
         WHERE (assigned_agent_id = ? OR created_by_agent_id = ?)
           AND workspace_id != ?`
      )
      .get(agentId, agentId, workspaceId) as { count: number };

    const externalWorkspaceLinks = tableExists(db, 'workspace_agents')
      ? (db
          .prepare('SELECT COUNT(*) as count FROM workspace_agents WHERE agent_id = ? AND workspace_id != ?')
          .get(agentId, workspaceId) as { count: number })
      : { count: 0 };

    const externalSessions = tableExists(db, 'openclaw_sessions')
      ? (db
          .prepare(
            `SELECT COUNT(*) as count FROM openclaw_sessions
             WHERE agent_id = ? AND (task_id IS NULL OR task_id NOT IN (${taskIds.length ? taskIds.map(() => '?').join(',') : "''"}))`
          )
          .get(agentId, ...(taskIds.length ? taskIds : [])) as { count: number })
      : { count: 0 };

    const globalEvents = tableExists(db, 'events')
      ? (db
          .prepare(
            `SELECT COUNT(*) as count FROM events
             WHERE agent_id = ? AND (task_id IS NULL OR task_id NOT IN (${taskIds.length ? taskIds.map(() => '?').join(',') : "''"}))`
          )
          .get(agentId, ...(taskIds.length ? taskIds : [])) as { count: number })
      : { count: 0 };

    const participantRefs = tableExists(db, 'conversation_participants')
      ? (db.prepare('SELECT COUNT(*) as count FROM conversation_participants WHERE agent_id = ?').get(agentId) as {
          count: number;
        })
      : { count: 0 };

    const messageRefs = tableExists(db, 'messages')
      ? (db.prepare('SELECT COUNT(*) as count FROM messages WHERE sender_agent_id = ?').get(agentId) as { count: number })
      : { count: 0 };

    const milestoneRefs = tableExists(db, 'task_milestones')
      ? (db
          .prepare(
            `SELECT COUNT(*) as count FROM task_milestones
             WHERE completed_by_agent_id = ? AND task_id NOT IN (${taskIds.length ? taskIds.map(() => '?').join(',') : "''"})`
          )
          .get(agentId, ...(taskIds.length ? taskIds : [])) as { count: number })
      : { count: 0 };

    const taskGroupRefs = tableExists(db, 'task_groups')
      ? (db
          .prepare('SELECT COUNT(*) as count FROM task_groups WHERE assigned_agent_id = ? AND workspace_id != ?')
          .get(agentId, workspaceId) as { count: number })
      : { count: 0 };

    const shouldRetain =
      externalTaskRef.count > 0 ||
      externalWorkspaceLinks.count > 0 ||
      externalSessions.count > 0 ||
      globalEvents.count > 0 ||
      participantRefs.count > 0 ||
      messageRefs.count > 0 ||
      milestoneRefs.count > 0 ||
      taskGroupRefs.count > 0;

    if (shouldRetain) {
      retainAgentIds.push(agentId);
    } else {
      deleteAgentIds.push(agentId);
    }
  }

  return { deleteAgentIds, retainAgentIds };
}

export function buildWorkspaceDeletionPreview(
  db: Database.Database,
  workspaceId: string
): WorkspaceDeletionPreview | null {
  const workspace = db
    .prepare('SELECT id, name, slug, folder_path FROM workspaces WHERE id = ?')
    .get(workspaceId) as WorkspaceRow | undefined;

  if (!workspace) return null;

  const taskIds = (db.prepare('SELECT id FROM tasks WHERE workspace_id = ?').all(workspaceId) as Array<{ id: string }>).map(
    (row) => row.id
  );
  const agentIds = (
    db.prepare('SELECT id FROM agents WHERE workspace_id = ?').all(workspaceId) as Array<{ id: string }>
  ).map((row) => row.id);

  const counts = {
    tasks: taskIds.length,
    agents: agentIds.length,
    openclaw_sessions: countByTaskOrAgentIds(db, 'openclaw_sessions', taskIds, agentIds),
    messages: countByIds(db, 'messages', 'sender_agent_id', agentIds),
    events: countByTaskOrAgentIds(db, 'events', taskIds, agentIds),
    task_activities: countByIds(db, 'task_activities', 'task_id', taskIds),
    task_deliverables: countByIds(db, 'task_deliverables', 'task_id', taskIds),
    planning_questions: countByIds(db, 'planning_questions', 'task_id', taskIds),
    planning_specs: countByIds(db, 'planning_specs', 'task_id', taskIds),
    conversations: countByIds(db, 'conversations', 'task_id', taskIds),
    conversation_participants: countByIds(db, 'conversation_participants', 'agent_id', agentIds),
    task_groups: countByWorkspace(db, 'task_groups', workspaceId),
    task_dependencies: countDependencies(db, taskIds),
    workspace_agents: countByWorkspace(db, 'workspace_agents', workspaceId),
    task_milestones: countByIds(db, 'task_milestones', 'task_id', taskIds),
    task_progress: countByIds(db, 'task_progress', 'task_id', taskIds),
  };

  const warnings: string[] = [];
  if (PROTECTED_WORKSPACE_SLUGS.has(workspace.slug)) {
    warnings.push('This workspace is protected and cannot be deleted from the UI.');
  }
  if (taskIds.length > 0) {
    const activeTasks = db
      .prepare(
        "SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ? AND status IN ('assigned', 'in_progress', 'testing', 'review', 'planning', 'pending_dispatch')"
      )
      .get(workspaceId) as { count: number };
    if (activeTasks.count > 0) {
      warnings.push(`${activeTasks.count} task(s) are still active in this workspace.`);
    }
  }
  if (counts.openclaw_sessions > 0) {
    warnings.push('OpenClaw session records exist for this workspace and will be removed.');
  }
  if (workspace.folder_path) {
    warnings.push(`Workspace folder ${workspace.folder_path} is not deleted automatically.`);
  }

  return {
    workspace,
    protected: PROTECTED_WORKSPACE_SLUGS.has(workspace.slug),
    counts,
    warnings,
    taskIds,
    agentIds,
  };
}

function deleteByIds(db: Database.Database, tableName: string, columnName: string, ids: string[]) {
  if (!tableExists(db, tableName) || ids.length === 0) return;
  const columns = tableColumns(db, tableName);
  if (!columns.includes(columnName)) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM ${tableName} WHERE ${columnName} IN (${placeholders})`).run(...ids);
}

export function deleteWorkspaceById(db: Database.Database, workspaceId: string): WorkspaceDeletionPreview | null {
  const preview = buildWorkspaceDeletionPreview(db, workspaceId);
  if (!preview) return null;

  const { taskIds, agentIds } = preview;
  const { deleteAgentIds, retainAgentIds } = buildAgentRetentionPlan(db, workspaceId, taskIds, agentIds);

  const deleteConversationParticipantsByConversationIds = () => {
    if (!tableExists(db, 'conversation_participants') || taskIds.length === 0) return;
    const placeholders = taskIds.map(() => '?').join(',');
    db.prepare(
      `DELETE FROM conversation_participants
       WHERE conversation_id IN (SELECT id FROM conversations WHERE task_id IN (${placeholders}))`
    ).run(...taskIds);
  };

  const deleteEmptyConversations = () => {
    if (!tableExists(db, 'conversations') || !tableExists(db, 'conversation_participants')) return;
    db.prepare(
      `DELETE FROM conversations
       WHERE id NOT IN (SELECT DISTINCT conversation_id FROM conversation_participants)
         AND task_id IS NULL`
    ).run();
  };

  db.transaction(() => {
    if (tableExists(db, 'openclaw_sessions')) {
      if (taskIds.length > 0 || deleteAgentIds.length > 0) {
        const clauses: string[] = [];
        const params: string[] = [];
        if (deleteAgentIds.length > 0 && tableColumns(db, 'openclaw_sessions').includes('agent_id')) {
          clauses.push(`agent_id IN (${deleteAgentIds.map(() => '?').join(',')})`);
          params.push(...deleteAgentIds);
        }
        if (taskIds.length > 0 && tableColumns(db, 'openclaw_sessions').includes('task_id')) {
          clauses.push(`task_id IN (${taskIds.map(() => '?').join(',')})`);
          params.push(...taskIds);
        }
        if (clauses.length > 0) {
          db.prepare(
            `UPDATE openclaw_sessions SET status = 'ended', ended_at = datetime('now') WHERE ${clauses.join(' OR ')}`
          ).run(...params);
          db.prepare(`DELETE FROM openclaw_sessions WHERE ${clauses.join(' OR ')}`).run(...params);
        }
      }
    }

    if (tableExists(db, 'workspace_agents')) {
      const columns = tableColumns(db, 'workspace_agents');
      if (columns.includes('workspace_id')) {
        db.prepare('DELETE FROM workspace_agents WHERE workspace_id = ?').run(workspaceId);
      } else if (columns.includes('agent_id') && deleteAgentIds.length > 0) {
        deleteByIds(db, 'workspace_agents', 'agent_id', deleteAgentIds);
      }
    }

    if (tableExists(db, 'task_dependencies') && taskIds.length > 0) {
      const placeholders = taskIds.map(() => '?').join(',');
      db.prepare(
        `DELETE FROM task_dependencies WHERE task_id IN (${placeholders}) OR depends_on_task_id IN (${placeholders})`
      ).run(...taskIds, ...taskIds);
    }

    if (tableExists(db, 'task_groups')) {
      const columns = tableColumns(db, 'task_groups');
      if (columns.includes('workspace_id')) {
        db.prepare('DELETE FROM task_groups WHERE workspace_id = ?').run(workspaceId);
      }
    }

    if (deleteAgentIds.length > 0) {
      deleteByIds(db, 'messages', 'sender_agent_id', deleteAgentIds);
      deleteByIds(db, 'conversation_participants', 'agent_id', deleteAgentIds);
      deleteByIds(db, 'events', 'agent_id', deleteAgentIds);
    }

    if (taskIds.length > 0) {
      deleteByIds(db, 'events', 'task_id', taskIds);
      deleteByIds(db, 'task_activities', 'task_id', taskIds);
      deleteByIds(db, 'task_deliverables', 'task_id', taskIds);
      deleteByIds(db, 'planning_questions', 'task_id', taskIds);
      deleteByIds(db, 'planning_specs', 'task_id', taskIds);
      deleteByIds(db, 'task_milestones', 'task_id', taskIds);
      deleteByIds(db, 'task_progress', 'task_id', taskIds);
      deleteConversationParticipantsByConversationIds();
      deleteByIds(db, 'conversations', 'task_id', taskIds);
    }

    deleteEmptyConversations();

    db.prepare('DELETE FROM tasks WHERE workspace_id = ?').run(workspaceId);

    if (retainAgentIds.length > 0) {
      db.prepare(`UPDATE agents SET workspace_id = 'default', updated_at = datetime('now') WHERE id IN (${retainAgentIds.map(() => '?').join(',')})`).run(...retainAgentIds);
    }
    if (deleteAgentIds.length > 0) {
      db.prepare(`DELETE FROM agents WHERE id IN (${deleteAgentIds.map(() => '?').join(',')})`).run(...deleteAgentIds);
    }

    db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
  })();

  return preview;
}
