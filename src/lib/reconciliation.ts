import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { broadcast } from '@/lib/events';
import { queryAll, queryOne, run, transaction } from '@/lib/db';
import type { AgentStatus, Task, TaskActivity, TaskStatus } from '@/lib/types';

export type ReconciliationMode = 'dry-run' | 'apply';

export type ReconciliationScope = {
  workspaceId?: string;
};

type AgentDriftRow = {
  id: string;
  name: string;
  workspace_id: string;
  status: AgentStatus;
  active_task_count: number;
  active_session_count: number;
};

type TaskPlanningRow = Pick<
  Task,
  | 'id'
  | 'title'
  | 'workspace_id'
  | 'status'
  | 'updated_at'
  | 'planning_session_key'
  | 'planning_messages'
  | 'planning_complete'
  | 'planning_dispatch_error'
>;

type TaskAssignmentRow = Pick<Task, 'id' | 'title' | 'workspace_id' | 'status' | 'assigned_agent_id'>;

export type ReconciliationRuleId =
  | 'agent_working_without_active_assignment'
  | 'task_stale_planning_without_session_or_messages'
  | 'task_dispatchable_without_assignee';

export type ReconciliationCorrection = {
  entityType: 'agent' | 'task';
  entityId: string;
  workspaceId: string;
  rule: ReconciliationRuleId;
  reason: string;
  currentState: Record<string, unknown>;
  nextState: Record<string, unknown>;
};

export type ReconciliationRuleSummary = {
  id: ReconciliationRuleId;
  description: string;
  reasonTemplate: string;
  correction: string;
};

export type ReconciliationReport = {
  runId: string;
  mode: ReconciliationMode;
  startedAt: string;
  completedAt: string;
  scope: {
    workspaceId: string | null;
  };
  thresholds: {
    stalePlanningMinutes: number;
  };
  rules: ReconciliationRuleSummary[];
  counts: {
    detected: number;
    applied: number;
    byRule: Record<ReconciliationRuleId, number>;
  };
  corrections: ReconciliationCorrection[];
  artifact: {
    written: boolean;
    path: string | null;
  };
};

const ACTIVE_TASK_STATUSES: TaskStatus[] = ['assigned', 'in_progress'];

export const RECONCILIATION_RULES: ReconciliationRuleSummary[] = [
  {
    id: 'agent_working_without_active_assignment',
    description: 'Reset working agents that have neither active execution tasks nor task-linked active sessions.',
    reasonTemplate: 'Agent is marked working but has no assigned/in-progress tasks and no active task-linked session.',
    correction: 'Set agent status to standby.',
  },
  {
    id: 'task_stale_planning_without_session_or_messages',
    description: 'Recover planning tasks that have gone stale without any retained planning session or messages.',
    reasonTemplate: 'Task remained in planning past the stale threshold with no planning session key and no planning messages.',
    correction: 'Move task back to inbox and stamp a blocked-style status_reason recommending replanning.',
  },
  {
    id: 'task_dispatchable_without_assignee',
    description: 'Remove dispatch-ready states from tasks that no longer have an assigned agent.',
    reasonTemplate: 'Task is waiting to dispatch or execute but has no assigned agent.',
    correction: 'Move task back to inbox and record the reconciliation reason.',
  },
];

function getStalePlanningMinutes(): number {
  const raw = Number.parseInt(process.env.MC_RECONCILIATION_STALE_PLANNING_MINUTES ?? '', 10);
  if (!Number.isFinite(raw) || raw < 1) {
    return 30;
  }

  return raw;
}

function buildWorkspaceWhereClause(column: string, workspaceId?: string): { clause: string; params: unknown[] } {
  if (!workspaceId) {
    return { clause: '', params: [] };
  }

  return {
    clause: ` AND ${column} = ?`,
    params: [workspaceId],
  };
}

function safeParseMessageCount(raw: string | undefined): number {
  if (!raw) {
    return 0;
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return raw.trim() ? 1 : 0;
  }
}

function getAgeMinutes(iso: string | undefined, nowMs: number): number | null {
  if (!iso) {
    return null;
  }

  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.max(0, Math.floor((nowMs - parsed) / 60000));
}

function countByRule(corrections: ReconciliationCorrection[]): Record<ReconciliationRuleId, number> {
  return corrections.reduce<Record<ReconciliationRuleId, number>>(
    (acc, correction) => {
      acc[correction.rule] += 1;
      return acc;
    },
    {
      agent_working_without_active_assignment: 0,
      task_stale_planning_without_session_or_messages: 0,
      task_dispatchable_without_assignee: 0,
    }
  );
}

function detectAgentCorrections(scope: ReconciliationScope): ReconciliationCorrection[] {
  const workspace = buildWorkspaceWhereClause('a.workspace_id', scope.workspaceId);
  const rows = queryAll<AgentDriftRow>(
    `SELECT a.id,
            a.name,
            a.workspace_id,
            a.status,
            COALESCE(active_tasks.active_task_count, 0) AS active_task_count,
            COALESCE(active_sessions.active_session_count, 0) AS active_session_count
       FROM agents a
       LEFT JOIN (
         SELECT assigned_agent_id AS agent_id, COUNT(*) AS active_task_count
         FROM tasks
         WHERE assigned_agent_id IS NOT NULL
           AND status IN (${ACTIVE_TASK_STATUSES.map(() => '?').join(', ')})
         GROUP BY assigned_agent_id
       ) AS active_tasks ON active_tasks.agent_id = a.id
       LEFT JOIN (
         SELECT agent_id, COUNT(*) AS active_session_count
         FROM openclaw_sessions
         WHERE agent_id IS NOT NULL
           AND status = 'active'
           AND ended_at IS NULL
           AND (task_id IS NOT NULL OR session_type = 'subagent')
         GROUP BY agent_id
       ) AS active_sessions ON active_sessions.agent_id = a.id
       WHERE a.status = 'working'${workspace.clause}`,
    [...ACTIVE_TASK_STATUSES, ...workspace.params]
  );

  return rows
    .filter((row) => row.active_task_count === 0 && row.active_session_count === 0)
    .map((row) => ({
      entityType: 'agent' as const,
      entityId: row.id,
      workspaceId: row.workspace_id,
      rule: 'agent_working_without_active_assignment' as const,
      reason: `Agent ${row.name} is marked working but has no assigned/in-progress tasks and no active task-linked sessions.`,
      currentState: {
        status: row.status,
        activeTaskCount: row.active_task_count,
        activeSessionCount: row.active_session_count,
      },
      nextState: {
        status: 'standby',
      },
    }));
}

function detectStalePlanningCorrections(scope: ReconciliationScope, nowMs: number): ReconciliationCorrection[] {
  const stalePlanningMinutes = getStalePlanningMinutes();
  const workspace = buildWorkspaceWhereClause('workspace_id', scope.workspaceId);
  const rows = queryAll<TaskPlanningRow>(
    `SELECT id, title, workspace_id, status, updated_at, planning_session_key, planning_messages, planning_complete, planning_dispatch_error
       FROM tasks
       WHERE status = 'planning'
         AND COALESCE(planning_complete, 0) = 0${workspace.clause}`,
    workspace.params
  );

  const corrections: ReconciliationCorrection[] = [];

  for (const row of rows) {
    const ageMinutes = getAgeMinutes(row.updated_at, nowMs);
    const messageCount = safeParseMessageCount(row.planning_messages);
    const hasSession = Boolean(row.planning_session_key?.trim());
    const isStale = ageMinutes !== null && ageMinutes >= stalePlanningMinutes;

    if (!isStale || hasSession || messageCount > 0) {
      continue;
    }

    const statusReason = `[blocked] Reconciler moved task from planning to inbox after ${ageMinutes} minute(s) with no planning session or retained messages. Re-run planning before dispatch.`;

    corrections.push({
      entityType: 'task',
      entityId: row.id,
      workspaceId: row.workspace_id,
      rule: 'task_stale_planning_without_session_or_messages',
      reason: `Task ${row.title} remained in planning for ${ageMinutes} minute(s) without a planning session key or retained planning messages.`,
      currentState: {
        status: row.status,
        updatedAt: row.updated_at,
        planningSessionKey: row.planning_session_key ?? null,
        planningMessageCount: messageCount,
        planningDispatchError: row.planning_dispatch_error ?? null,
      },
      nextState: {
        status: 'inbox',
        status_reason: statusReason,
      },
    });
  }

  return corrections;
}

function detectAssigneeCorrections(scope: ReconciliationScope): ReconciliationCorrection[] {
  const workspace = buildWorkspaceWhereClause('workspace_id', scope.workspaceId);
  const rows = queryAll<TaskAssignmentRow>(
    `SELECT id, title, workspace_id, status, assigned_agent_id
       FROM tasks
       WHERE status IN ('pending_dispatch', 'assigned')
         AND assigned_agent_id IS NULL${workspace.clause}`,
    workspace.params
  );

  return rows.map((row) => {
    const statusReason = '[blocked] Reconciler moved task back to inbox because it no longer has an assigned agent. Reassign before dispatch.';

    return {
      entityType: 'task' as const,
      entityId: row.id,
      workspaceId: row.workspace_id,
      rule: 'task_dispatchable_without_assignee' as const,
      reason: `Task ${row.title} is in ${row.status} without an assigned agent.`,
      currentState: {
        status: row.status,
        assignedAgentId: row.assigned_agent_id,
      },
      nextState: {
        status: 'inbox',
        status_reason: statusReason,
      },
    };
  });
}

function insertEvent(params: {
  eventType: string;
  agentId?: string | null;
  taskId?: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}): void {
  run(
    `INSERT INTO events (id, type, agent_id, task_id, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      params.eventType,
      params.agentId ?? null,
      params.taskId ?? null,
      params.message,
      JSON.stringify(params.metadata),
      params.createdAt,
    ]
  );
}

function insertTaskActivity(params: {
  taskId: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}): TaskActivity {
  const activity: TaskActivity = {
    id: uuidv4(),
    task_id: params.taskId,
    activity_type: 'status_changed',
    message: params.message,
    metadata: JSON.stringify(params.metadata),
    created_at: params.createdAt,
  };

  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [activity.id, activity.task_id, null, activity.activity_type, activity.message, activity.metadata, activity.created_at]
  );

  return activity;
}

function applyCorrections(runId: string, corrections: ReconciliationCorrection[], now: string): void {
  transaction(() => {
    for (const correction of corrections) {
      const receipt = {
        receipt_type: 'state_reconciliation',
        run_id: runId,
        rule: correction.rule,
        reason: correction.reason,
        current_state: correction.currentState,
        next_state: correction.nextState,
      };

      if (correction.entityType === 'agent') {
        run('UPDATE agents SET status = ?, updated_at = ? WHERE id = ?', ['standby', now, correction.entityId]);

        insertEvent({
          eventType: 'agent_status_changed',
          agentId: correction.entityId,
          message: `Reconciler reset agent to standby: ${correction.reason}`,
          metadata: receipt,
          createdAt: now,
        });

        continue;
      }

      const nextStatus = String(correction.nextState.status);
      const nextStatusReason = String(correction.nextState.status_reason ?? '');
      const existingTask = queryOne<Pick<Task, 'id' | 'title' | 'status'>>('SELECT id, title, status FROM tasks WHERE id = ?', [
        correction.entityId,
      ]);

      run('UPDATE tasks SET status = ?, status_reason = ?, updated_at = ? WHERE id = ?', [
        nextStatus,
        nextStatusReason,
        now,
        correction.entityId,
      ]);

      insertEvent({
        eventType: 'task_status_changed',
        taskId: correction.entityId,
        message: `Reconciler moved task to ${nextStatus}: ${correction.reason}`,
        metadata: {
          ...receipt,
          transition: {
            from: existingTask?.status ?? correction.currentState.status ?? null,
            to: nextStatus,
          },
        },
        createdAt: now,
      });

      const activity = insertTaskActivity({
        taskId: correction.entityId,
        message: `Reconciler moved task to ${nextStatus}`,
        metadata: {
          ...receipt,
          transition: {
            from: existingTask?.status ?? correction.currentState.status ?? null,
            to: nextStatus,
          },
        },
        createdAt: now,
      });

      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [correction.entityId]);
      if (updatedTask) {
        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      }

      broadcast({
        type: 'activity_logged',
        payload: activity,
      });
    }

    insertEvent({
      eventType: 'system',
      message: `Reconciliation ${runId} applied ${corrections.length} correction(s)`,
      metadata: {
        receipt_type: 'state_reconciliation_summary',
        run_id: runId,
        applied: corrections.length,
      },
      createdAt: now,
    });
  });
}

export function buildReconciliationReport(params: {
  mode: ReconciliationMode;
  scope: ReconciliationScope;
}): ReconciliationReport {
  const startedAt = new Date().toISOString();
  const nowMs = Date.now();
  const corrections = [
    ...detectAgentCorrections(params.scope),
    ...detectStalePlanningCorrections(params.scope, nowMs),
    ...detectAssigneeCorrections(params.scope),
  ];

  return {
    runId: uuidv4(),
    mode: params.mode,
    startedAt,
    completedAt: new Date().toISOString(),
    scope: {
      workspaceId: params.scope.workspaceId ?? null,
    },
    thresholds: {
      stalePlanningMinutes: getStalePlanningMinutes(),
    },
    rules: RECONCILIATION_RULES,
    counts: {
      detected: corrections.length,
      applied: 0,
      byRule: countByRule(corrections),
    },
    corrections,
    artifact: {
      written: false,
      path: null,
    },
  };
}

export async function runReconciliation(params: {
  mode: ReconciliationMode;
  scope: ReconciliationScope;
  writeArtifact?: boolean;
}): Promise<ReconciliationReport> {
  const report = buildReconciliationReport({
    mode: params.mode,
    scope: params.scope,
  });

  if (params.mode === 'apply' && report.corrections.length > 0) {
    const appliedAt = new Date().toISOString();
    applyCorrections(report.runId, report.corrections, appliedAt);
    report.completedAt = appliedAt;
    report.counts.applied = report.corrections.length;
  }

  if (params.writeArtifact) {
    report.artifact = await writeReconciliationReportArtifact(report);
  }

  return report;
}

async function writeReconciliationReportArtifact(report: ReconciliationReport): Promise<ReconciliationReport['artifact']> {
  const baseDir = process.env.MC_RECONCILIATION_REPORT_DIR
    ? path.resolve(process.env.MC_RECONCILIATION_REPORT_DIR)
    : path.join(process.cwd(), 'artifacts', 'reconciliation');

  await fs.mkdir(baseDir, { recursive: true });

  const workspaceSegment = report.scope.workspaceId ?? 'all-workspaces';
  const fileName = `${report.completedAt.replace(/[:.]/g, '-')}-${report.mode}-${workspaceSegment}.json`;
  const filePath = path.join(baseDir, fileName);
  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        ...report,
        artifact: {
          written: true,
          path: filePath,
        },
      },
      null,
      2
    ),
    'utf8'
  );

  return {
    written: true,
    path: filePath,
  };
}
