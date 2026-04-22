import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import {
  getMissionControlUrl,
  isApprovalSoftEnforcementEnabled,
  isApprovalTestEvidenceRequired,
} from '@/lib/config';
import { UpdateTaskSchema } from '@/lib/validation';
import type { Task, UpdateTaskRequest, Agent } from '@/lib/types';

export const dynamic = 'force-dynamic';

type ApprovalGateResult = {
  deliverables: {
    required: true;
    count: number;
    passed: boolean;
  };
  testEvidence: {
    required: boolean;
    passed: boolean;
    overrideUsed: boolean;
    overrideReason: string | null;
    latestActivityType: string | null;
    latestActivityAt: string | null;
  };
  policy: {
    softEnforcement: boolean;
  };
};

function insertTaskActivity(params: {
  taskId: string;
  agentId?: string;
  activityType: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}): void {
  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      params.taskId,
      params.agentId || null,
      params.activityType,
      params.message,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.createdAt,
    ]
  );
}

function insertEvent(params: {
  eventType: string;
  taskId: string;
  agentId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}): void {
  run(
    `INSERT INTO events (id, type, agent_id, task_id, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(),
      params.eventType,
      params.agentId || null,
      params.taskId,
      params.message,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.createdAt,
    ]
  );
}

function getApprovalGateResult(taskId: string, overrideReason: string | undefined): ApprovalGateResult {
  const deliverableCountRow = queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM task_deliverables WHERE task_id = ?',
    [taskId]
  );
  const deliverableCount = deliverableCountRow?.count ?? 0;
  const latestTestActivity = queryOne<{ activity_type: string; created_at: string }>(
    `SELECT activity_type, created_at
     FROM task_activities
     WHERE task_id = ? AND activity_type IN ('test_passed', 'test_failed')
     ORDER BY created_at DESC
     LIMIT 1`,
    [taskId]
  );

  const testEvidenceRequired = isApprovalTestEvidenceRequired();
  const trimmedOverrideReason = overrideReason?.trim() || null;
  const hasPassingTestEvidence = latestTestActivity?.activity_type === 'test_passed';
  const overrideUsed = Boolean(testEvidenceRequired && !hasPassingTestEvidence && trimmedOverrideReason);

  return {
    deliverables: {
      required: true,
      count: deliverableCount,
      passed: deliverableCount > 0,
    },
    testEvidence: {
      required: testEvidenceRequired,
      passed: !testEvidenceRequired || hasPassingTestEvidence || overrideUsed,
      overrideUsed,
      overrideReason: trimmedOverrideReason,
      latestActivityType: latestTestActivity?.activity_type ?? null,
      latestActivityAt: latestTestActivity?.created_at ?? null,
    },
    policy: {
      softEnforcement: isApprovalSoftEnforcementEnabled(),
    },
  };
}

// GET /api/tasks/[id] - Get a single task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = queryOne<Task>(
      `SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to fetch task:', error);
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id] - Update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateTaskRequest & { updated_by_agent_id?: string } = await request.json();

    // Validate input with Zod
    const validation = UpdateTaskSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const validatedData = validation.data;
    let nextStatus = validatedData.status;

    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const now = new Date().toISOString();
    const isReviewApproval = nextStatus === 'done' && existing.status === 'review';
    let approvalGateResult: ApprovalGateResult | null = null;
    let approvalAgent: Pick<Agent, 'is_master'> | null = null;

    // Workflow enforcement for agent-initiated approvals
    // If an agent is trying to move review→done, they must be a master agent
    // User-initiated moves (no agent ID) are allowed
    if (isReviewApproval && validatedData.updated_by_agent_id) {
      const updatingAgent = queryOne<Pick<Agent, 'is_master'>>(
        'SELECT is_master FROM agents WHERE id = ?',
        [validatedData.updated_by_agent_id]
      );
      approvalAgent = updatingAgent ?? null;

      if (!updatingAgent || !updatingAgent.is_master) {
        return NextResponse.json(
          { error: 'Forbidden: only the master agent can approve tasks' },
          { status: 403 }
        );
      }
    }

    if (isReviewApproval) {
      approvalGateResult = getApprovalGateResult(id, validatedData.approval_override_reason);
      const gateFailures: string[] = [];

      if (!approvalGateResult.deliverables.passed) {
        gateFailures.push('At least one deliverable is required before approving review -> done.');
      }

      if (!approvalGateResult.testEvidence.passed) {
        gateFailures.push(
          'Successful test evidence is required before approval, or provide approval_override_reason when the policy is enabled.'
        );
      }

      if (gateFailures.length > 0 && !approvalGateResult.policy.softEnforcement) {
        return NextResponse.json(
          {
            error: 'Approval gate failed',
            details: gateFailures,
            gate: approvalGateResult,
          },
          { status: 409 }
        );
      }
    }

    if (validatedData.title !== undefined) {
      updates.push('title = ?');
      values.push(validatedData.title);
    }
    if (validatedData.description !== undefined) {
      updates.push('description = ?');
      values.push(validatedData.description);
    }
    if (validatedData.priority !== undefined) {
      updates.push('priority = ?');
      values.push(validatedData.priority);
    }
    if (validatedData.task_type !== undefined) {
      updates.push('task_type = ?');
      values.push(validatedData.task_type);
    }
    if (validatedData.estimated_hours !== undefined) {
      updates.push('estimated_hours = ?');
      values.push(validatedData.estimated_hours);
    }
    if (validatedData.actual_hours !== undefined) {
      updates.push('actual_hours = ?');
      values.push(validatedData.actual_hours);
    }
    if (validatedData.due_date !== undefined) {
      updates.push('due_date = ?');
      values.push(validatedData.due_date);
    }

    // Track if we need to dispatch task
    let shouldDispatch = false;

    // Auto-promote INBOX -> ASSIGNED when an agent is assigned and no explicit status was provided
    if (
      nextStatus === undefined &&
      validatedData.assigned_agent_id !== undefined &&
      validatedData.assigned_agent_id &&
      existing.status === 'inbox'
    ) {
      nextStatus = 'assigned';
    }

    // Handle status change
    if (nextStatus !== undefined && nextStatus !== existing.status) {
      updates.push('status = ?');
      values.push(nextStatus);

      // Auto-dispatch when moving to assigned
      if (nextStatus === 'assigned' && existing.assigned_agent_id) {
        shouldDispatch = true;
      }

      const statusMetadata: Record<string, unknown> = {
        receipt_type: 'task_status_transition',
        transition: {
          from: existing.status,
          to: nextStatus,
        },
        updated_by_agent_id: validatedData.updated_by_agent_id ?? null,
      };

      if (approvalGateResult) {
        statusMetadata.approval = {
          approver_agent_id: validatedData.updated_by_agent_id ?? null,
          approver_is_master: approvalAgent?.is_master ?? null,
          notes: validatedData.approval_notes ?? null,
          gate: approvalGateResult,
        };
      }

      insertTaskActivity({
        taskId: id,
        agentId: validatedData.updated_by_agent_id,
        activityType: 'status_changed',
        message: `Task status changed from ${existing.status} to ${nextStatus}`,
        metadata: statusMetadata,
        createdAt: now,
      });

      // Log status change event
      const eventType = nextStatus === 'done' ? 'task_completed' : 'task_status_changed';
      insertEvent({
        eventType,
        taskId: id,
        agentId: validatedData.updated_by_agent_id,
        message: `Task "${existing.title}" moved to ${nextStatus}`,
        metadata: statusMetadata,
        createdAt: now,
      });

      if (approvalGateResult) {
        const approvalMessage = approvalGateResult.testEvidence.overrideUsed
          ? 'Approval recorded with test-evidence override'
          : approvalGateResult.policy.softEnforcement && (!approvalGateResult.deliverables.passed || !approvalGateResult.testEvidence.passed)
            ? 'Approval recorded with soft-enforcement policy warnings'
            : 'Approval recorded with required evidence';

        insertTaskActivity({
          taskId: id,
          agentId: validatedData.updated_by_agent_id,
          activityType: 'updated',
          message: approvalMessage,
          metadata: {
            receipt_type: 'approval_receipt',
            task_id: id,
            transition: {
              from: existing.status,
              to: nextStatus,
            },
            approver_agent_id: validatedData.updated_by_agent_id ?? null,
            approver_is_master: approvalAgent?.is_master ?? null,
            notes: validatedData.approval_notes ?? null,
            gate: approvalGateResult,
          },
          createdAt: now,
        });
      }
    }

    // Handle assignment change
    if (validatedData.assigned_agent_id !== undefined && validatedData.assigned_agent_id !== existing.assigned_agent_id) {
      updates.push('assigned_agent_id = ?');
      values.push(validatedData.assigned_agent_id);

      if (validatedData.assigned_agent_id) {
        const agent = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [validatedData.assigned_agent_id]);
        if (agent) {
          run(
            `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), 'task_assigned', validatedData.assigned_agent_id, id, `"${existing.title}" assigned to ${agent.name}`, now]
          );

          // Auto-dispatch if already in assigned status or being assigned now
          if (existing.status === 'assigned' || nextStatus === 'assigned') {
            shouldDispatch = true;
          }
        }
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, values);

    // Fetch updated task with all joined fields
    const task = queryOne<Task>(
      `SELECT t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji,
        ca.name as created_by_agent_name,
        ca.avatar_emoji as created_by_agent_emoji
       FROM tasks t
       LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
       LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
       WHERE t.id = ?`,
      [id]
    );

    // Broadcast task update via SSE
    if (task) {
      broadcast({
        type: 'task_updated',
        payload: task,
      });
    }

    // Trigger auto-dispatch if needed
    if (shouldDispatch) {
      // Call dispatch endpoint asynchronously (don't wait for response)
      const missionControlUrl = getMissionControlUrl();
      fetch(`${missionControlUrl}/api/tasks/${id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(err => {
        console.error('Auto-dispatch failed:', err);
      });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error('Failed to update task:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);

    if (!existing) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Delete or nullify related records first (foreign key constraints)
    // Note: task_activities and task_deliverables have ON DELETE CASCADE
    run('DELETE FROM openclaw_sessions WHERE task_id = ?', [id]);
    run('DELETE FROM events WHERE task_id = ?', [id]);
    // Conversations reference tasks - nullify or delete
    run('UPDATE conversations SET task_id = NULL WHERE task_id = ?', [id]);

    // Now delete the task (cascades to task_activities and task_deliverables)
    run('DELETE FROM tasks WHERE id = ?', [id]);

    // Broadcast deletion via SSE
    broadcast({
      type: 'task_deleted',
      payload: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete task:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
