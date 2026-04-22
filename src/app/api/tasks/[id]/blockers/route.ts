/**
 * Task Blockers API
 * CRUD operations for blockers on a specific task
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import type { TaskActivity, TaskBlocker } from '@/lib/types';

// Helper to emit activity for state-changing operations
function emitBlockerActivity(params: {
  taskId: string;
  agentId?: string;
  activityType: string;
  message: string;
  metadata?: Record<string, unknown>;
}): TaskActivity {
  const { taskId, agentId, activityType, message, metadata } = params;
  const activity: TaskActivity = {
    id: uuidv4(),
    task_id: taskId,
    agent_id: agentId || undefined,
    activity_type: activityType as TaskActivity['activity_type'],
    message,
    metadata: metadata ? JSON.stringify(metadata) : undefined,
    created_at: new Date().toISOString(),
  };

  run(
    `INSERT INTO task_activities (id, task_id, agent_id, activity_type, message, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      activity.id,
      activity.task_id,
      activity.agent_id,
      activity.activity_type,
      activity.message,
      activity.metadata,
      activity.created_at,
    ]
  );

  return activity;
}

// Validation schema inline (extends validation.ts)
const BlockerTypeEnum = ['external_dependency', 'approval_pending', 'resource_unavailable', 'technical_impediment', 'spec_ambiguous', 'test_blocker'];
const BlockerSeverityEnum = ['critical', 'high', 'medium', 'low'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    const blockers = queryAll<TaskBlocker>(
      `SELECT * FROM task_blockers WHERE task_id = ? ORDER BY severity DESC, created_at ASC`,
      [taskId]
    );

    return NextResponse.json(blockers);
  } catch (error) {
    console.error('Error fetching blockers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blockers' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const body = await request.json();

    const { 
      blocker_type,
      severity = 'medium',
      title,
      description,
      identified_by_agent_id
    } = body;

    // Validate required fields
    if (!blocker_type || !BlockerTypeEnum.includes(blocker_type)) {
      return NextResponse.json(
        { error: 'Invalid or missing blocker_type', validTypes: BlockerTypeEnum },
        { status: 400 }
      );
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    if (severity && !BlockerSeverityEnum.includes(severity)) {
      return NextResponse.json(
        { error: 'Invalid severity', validSeverities: BlockerSeverityEnum },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO task_blockers 
       (id, task_id, blocker_type, severity, status, title, description, identified_by_agent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      [id, taskId, blocker_type, severity, title.trim(), description || null, identified_by_agent_id || null, now, now]
    );

    const blockerActivity = emitBlockerActivity({
      taskId,
      agentId: identified_by_agent_id,
      activityType: 'blocker_identified',
      message: `Blocker identified: ${title}`,
      metadata: {
        receipt_type: 'blocker_identified_receipt',
        blocker_id: id,
        blocker_type,
        severity,
        task_id: taskId,
      },
    });

    // Broadcast SSE event
    broadcast({
      type: 'activity_logged',
      payload: blockerActivity,
    });

    const blocker = queryOne<TaskBlocker>(
      `SELECT * FROM task_blockers WHERE id = ?`,
      [id]
    );

    return NextResponse.json(blocker, { status: 201 });
  } catch (error) {
    console.error('Error creating blocker:', error);
    return NextResponse.json(
      { error: 'Failed to create blocker' },
      { status: 500 }
    );
  }
}