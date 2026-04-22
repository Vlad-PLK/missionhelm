import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { broadcast } from '@/lib/events';
import { queryAll, run, transaction } from '@/lib/db';
import type { Task, TaskStatus, TaskActivity } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TaskStatusEnum = z.enum([
  'pending_dispatch',
  'planning',
  'inbox',
  'assigned',
  'in_progress',
  'testing',
  'review',
  'done',
]);

const BulkTaskSchema = z.object({
  mode: z.enum(['dry-run', 'execute']).default('dry-run'),
  operation: z.enum(['transition', 'delete']),
  task_ids: z.array(z.string().uuid()).min(1).max(200),
  target_status: TaskStatusEnum.optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
  updated_by_agent_id: z.string().uuid().optional(),
  archive_before_delete: z.boolean().default(false),
  confirm_destructive: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.operation === 'transition' && !value.target_status) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'target_status is required for transition operations',
      path: ['target_status'],
    });
  }

  if (value.operation === 'delete' && value.target_status) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'target_status is not valid for delete operations',
      path: ['target_status'],
    });
  }

  if (value.mode === 'execute' && !value.reason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'reason is required when mode=execute',
      path: ['reason'],
    });
  }

  if (value.mode === 'execute' && value.operation === 'delete' && value.confirm_destructive !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'confirm_destructive=true is required for bulk delete execution',
      path: ['confirm_destructive'],
    });
  }
});

type BulkTaskRequest = z.infer<typeof BulkTaskSchema>;

type BulkTaskPreview = {
  task_id: string;
  title: string;
  current_status: TaskStatus;
  action: 'transition' | 'delete';
  next_status: TaskStatus | null;
  archive_before_delete: boolean;
  eligible: boolean;
  skip_reason: string | null;
};

type BulkReport = {
  report_id: string;
  mode: 'dry-run' | 'execute';
  operation: 'transition' | 'delete';
  created_at: string;
  requested_by_agent_id: string | null;
  reason: string | null;
  request: {
    task_ids: string[];
    target_status: TaskStatus | null;
    archive_before_delete: boolean;
  };
  summary: {
    requested_count: number;
    matched_count: number;
    eligible_count: number;
    skipped_count: number;
    executed_count: number;
    archived_count: number;
  };
  tasks: BulkTaskPreview[];
  skipped_task_ids: string[];
  not_found_task_ids: string[];
  execution: {
    audit_report_persisted: boolean;
    archive_table_used: boolean;
  };
  confirmation_notes: string[];
  rollback_notes: string[];
};

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

function insertTaskActivity(params: {
  taskId: string;
  agentId?: string;
  activityType: TaskActivity['activity_type'];
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}): TaskActivity {
  const activity: TaskActivity = {
    id: uuidv4(),
    task_id: params.taskId,
    agent_id: params.agentId || undefined,
    activity_type: params.activityType,
    message: params.message,
    metadata: JSON.stringify(params.metadata),
    created_at: params.createdAt,
  };

  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [activity.id, activity.task_id, activity.agent_id || null, activity.activity_type, activity.message, activity.metadata, activity.created_at]
  );

  return activity;
}

function insertEvent(params: {
  eventType: string;
  taskId?: string | null;
  agentId?: string;
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
      params.agentId || null,
      params.taskId || null,
      params.message,
      JSON.stringify(params.metadata),
      params.createdAt,
    ]
  );
}

function persistBulkReport(params: {
  reportId: string;
  request: BulkTaskRequest;
  report: BulkReport | Record<string, unknown>;
  status: 'completed' | 'failed';
  createdAt: string;
}) {
  run(
    `INSERT INTO bulk_operation_reports
     (id, operation_type, execution_mode, status, requested_by_agent_id, reason, request_payload, report_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.reportId,
      params.request.operation,
      params.request.mode,
      params.status,
      params.request.updated_by_agent_id || null,
      params.request.reason?.trim() || null,
      JSON.stringify(params.request),
      JSON.stringify(params.report),
      params.createdAt,
    ]
  );
}

function buildArchiveSnapshot(taskId: string) {
  return {
    task: queryAll<Task>('SELECT * FROM tasks WHERE id = ?', [taskId])[0] ?? null,
    activities: queryAll('SELECT * FROM task_activities WHERE task_id = ? ORDER BY created_at DESC', [taskId]),
    deliverables: queryAll('SELECT * FROM task_deliverables WHERE task_id = ? ORDER BY created_at DESC', [taskId]),
    milestones: queryAll('SELECT * FROM task_milestones WHERE task_id = ? ORDER BY order_index ASC, created_at ASC', [taskId]),
    progress: queryAll('SELECT * FROM task_progress WHERE task_id = ?', [taskId]),
    blockers: queryAll('SELECT * FROM task_blockers WHERE task_id = ? ORDER BY created_at DESC', [taskId]),
    blocker_escalations: queryAll('SELECT * FROM blocker_escalations WHERE task_id = ? ORDER BY created_at DESC', [taskId]),
    sessions: queryAll('SELECT * FROM openclaw_sessions WHERE task_id = ? ORDER BY created_at DESC', [taskId]),
    conversations: queryAll('SELECT * FROM conversations WHERE task_id = ? ORDER BY created_at DESC', [taskId]),
    events: queryAll('SELECT * FROM events WHERE task_id = ? ORDER BY created_at DESC', [taskId]),
  };
}

function buildTaskPreview(task: Task, request: BulkTaskRequest): BulkTaskPreview {
  if (request.operation === 'transition') {
    const eligible = task.status !== request.target_status;
    return {
      task_id: task.id,
      title: task.title,
      current_status: task.status,
      action: 'transition',
      next_status: request.target_status ?? null,
      archive_before_delete: false,
      eligible,
      skip_reason: eligible ? null : 'Task is already in the requested status.',
    };
  }

  return {
    task_id: task.id,
    title: task.title,
    current_status: task.status,
    action: 'delete',
    next_status: null,
    archive_before_delete: request.archive_before_delete,
    eligible: true,
    skip_reason: null,
  };
}

function buildConfirmationNotes(request: BulkTaskRequest): string[] {
  if (request.operation === 'delete') {
    return [
      'Bulk delete execution requires a non-empty reason and confirm_destructive=true.',
      request.archive_before_delete
        ? 'Archive-before-delete is enabled; task snapshots will be written to task_archives before removal.'
        : 'Archive-before-delete is disabled; deleted task records are only recoverable from database backups or the persisted bulk audit report.',
    ];
  }

  return [
    'Execute mode requires a non-empty reason so the transition report is auditable.',
    'Review the dry-run preview before executing to confirm the target status and skipped tasks.',
  ];
}

function buildRollbackNotes(request: BulkTaskRequest): string[] {
  if (request.operation === 'delete') {
    return [
      request.archive_before_delete
        ? 'Restore deleted tasks by recreating records from task_archives.snapshot_json and re-linking any required related records.'
        : 'Restore deleted tasks from a database backup taken before execution; delete mode is destructive when archive-before-delete is disabled.',
      'Use bulk_operation_reports.report_json to identify every affected task and the reason supplied for deletion.',
    ];
  }

  return [
    'Revert the transition by executing another bulk transition back to the prior status using the same task IDs.',
    'Use bulk_operation_reports.report_json and task_activities metadata to identify the original from/to statuses for rollback.',
  ];
}

function buildReport(reportId: string, request: BulkTaskRequest, tasks: Task[], now: string): BulkReport {
  const previewTasks = tasks.map((task) => buildTaskPreview(task, request));
  const skippedTaskIds = previewTasks.filter((task) => !task.eligible).map((task) => task.task_id);
  const matchedTaskIds = new Set(tasks.map((task) => task.id));
  const notFoundTaskIds = uniq(request.task_ids).filter((taskId) => !matchedTaskIds.has(taskId));

  return {
    report_id: reportId,
    mode: request.mode,
    operation: request.operation,
    created_at: now,
    requested_by_agent_id: request.updated_by_agent_id ?? null,
    reason: request.reason?.trim() || null,
    request: {
      task_ids: uniq(request.task_ids),
      target_status: request.target_status ?? null,
      archive_before_delete: request.archive_before_delete,
    },
    summary: {
      requested_count: uniq(request.task_ids).length,
      matched_count: tasks.length,
      eligible_count: previewTasks.filter((task) => task.eligible).length,
      skipped_count: skippedTaskIds.length + notFoundTaskIds.length,
      executed_count: 0,
      archived_count: 0,
    },
    tasks: previewTasks,
    skipped_task_ids: skippedTaskIds,
    not_found_task_ids: notFoundTaskIds,
    execution: {
      audit_report_persisted: false,
      archive_table_used: request.operation === 'delete' && request.archive_before_delete,
    },
    confirmation_notes: buildConfirmationNotes(request),
    rollback_notes: buildRollbackNotes(request),
  };
}

export async function POST(request: NextRequest) {
  const now = new Date().toISOString();
  let parsedBody: BulkTaskRequest | null = null;
  let reportId = uuidv4();

  try {
    const body = await request.json();
    const validation = BulkTaskSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    parsedBody = validation.data;
    const requestBody = parsedBody;
    reportId = uuidv4();

    const uniqueTaskIds = uniq(requestBody.task_ids);
    const placeholders = uniqueTaskIds.map(() => '?').join(',');
    const tasks = queryAll<Task>(
      `SELECT * FROM tasks WHERE id IN (${placeholders}) ORDER BY created_at DESC`,
      uniqueTaskIds
    );

    const report = buildReport(reportId, { ...parsedBody, task_ids: uniqueTaskIds }, tasks, now);

    if (requestBody.mode === 'dry-run') {
      return NextResponse.json(report);
    }

    let executedCount = 0;
    let archivedCount = 0;

    transaction(() => {
      for (const preview of report.tasks) {
        if (!preview.eligible) {
          continue;
        }

        const receipt = {
          receipt_type: 'bulk_operation_task_receipt',
          bulk_report_id: report.report_id,
          operation: requestBody.operation,
          reason: parsedBody?.reason?.trim() || null,
          executed_by_agent_id: parsedBody?.updated_by_agent_id || null,
          created_at: now,
        };

        if (requestBody.operation === 'transition') {
          run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [requestBody.target_status, now, preview.task_id]);

          const activity = insertTaskActivity({
            taskId: preview.task_id,
            agentId: requestBody.updated_by_agent_id,
            activityType: 'status_changed',
            message: `Bulk transition moved task from ${preview.current_status} to ${requestBody.target_status}`,
            metadata: {
              ...receipt,
              transition: {
                from: preview.current_status,
                to: requestBody.target_status,
              },
            },
            createdAt: now,
          });

          insertEvent({
            eventType: 'task_status_changed',
            taskId: preview.task_id,
            agentId: requestBody.updated_by_agent_id,
            message: `Bulk transition moved "${preview.title}" to ${requestBody.target_status}`,
            metadata: {
              ...receipt,
              transition: {
                from: preview.current_status,
                to: requestBody.target_status,
              },
            },
            createdAt: now,
          });

          const updatedTask = queryAll<Task>('SELECT * FROM tasks WHERE id = ?', [preview.task_id])[0];
          if (updatedTask) {
            broadcast({ type: 'task_updated', payload: updatedTask });
          }
          broadcast({ type: 'activity_logged', payload: activity });
          executedCount += 1;
          continue;
        }

        const deleteActivity = insertTaskActivity({
          taskId: preview.task_id,
          agentId: requestBody.updated_by_agent_id,
          activityType: 'updated',
          message: 'Bulk delete queued for execution',
          metadata: {
            ...receipt,
            archive_before_delete: requestBody.archive_before_delete,
          },
          createdAt: now,
        });
        broadcast({ type: 'activity_logged', payload: deleteActivity });

        if (requestBody.archive_before_delete) {
          const archiveSnapshot = buildArchiveSnapshot(preview.task_id);
          run(
            `INSERT INTO task_archives
             (id, original_task_id, bulk_report_id, archived_by_agent_id, archive_reason, source_operation, snapshot_json, created_at)
             VALUES (?, ?, ?, ?, ?, 'bulk_delete', ?, ?)`,
            [
              uuidv4(),
              preview.task_id,
              report.report_id,
              requestBody.updated_by_agent_id || null,
              requestBody.reason?.trim() || '',
              JSON.stringify(archiveSnapshot),
              now,
            ]
          );
          archivedCount += 1;
        }

        run('DELETE FROM openclaw_sessions WHERE task_id = ?', [preview.task_id]);
        run('DELETE FROM events WHERE task_id = ?', [preview.task_id]);
        run('UPDATE conversations SET task_id = NULL WHERE task_id = ?', [preview.task_id]);
        run('DELETE FROM tasks WHERE id = ?', [preview.task_id]);

        insertEvent({
          eventType: 'system',
          taskId: null,
          agentId: requestBody.updated_by_agent_id,
          message: `Bulk delete removed task "${preview.title}"`,
          metadata: {
            ...receipt,
            deleted_task_id: preview.task_id,
            deleted_task_title: preview.title,
            archived_before_delete: requestBody.archive_before_delete,
          },
          createdAt: now,
        });

        broadcast({
          type: 'task_deleted',
          payload: { id: preview.task_id },
        });
        executedCount += 1;
      }

      report.summary.executed_count = executedCount;
      report.summary.archived_count = archivedCount;
      report.execution.audit_report_persisted = true;

      persistBulkReport({
        reportId: report.report_id,
        request: requestBody,
        report,
        status: 'completed',
        createdAt: now,
      });

      insertEvent({
        eventType: 'system',
        taskId: null,
        agentId: requestBody.updated_by_agent_id,
        message: `Bulk ${requestBody.operation} executed for ${executedCount} task(s)`,
        metadata: {
          receipt_type: 'bulk_operation_summary',
          bulk_report_id: report.report_id,
          reason: requestBody.reason?.trim() || null,
          operation: requestBody.operation,
          executed_count: executedCount,
          archived_count: archivedCount,
        },
        createdAt: now,
      });
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error('Failed to process bulk task operation:', error);

    if (parsedBody?.mode === 'execute') {
      try {
        persistBulkReport({
          reportId,
          request: parsedBody,
          report: {
            report_id: reportId,
            error: error instanceof Error ? error.message : 'Unknown bulk operation error',
            operation: parsedBody.operation,
            mode: parsedBody.mode,
            created_at: now,
          },
          status: 'failed',
          createdAt: now,
        });
      } catch (persistError) {
        console.error('Failed to persist bulk operation failure report:', persistError);
      }
    }

    return NextResponse.json({ error: 'Failed to process bulk task operation' }, { status: 500 });
  }
}
