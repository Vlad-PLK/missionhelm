import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run } from '@/lib/db';
import type { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tasks/[id]/hooks
 * 
 * Returns available automation hooks for a task
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify task exists
    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Return available hooks with URLs and descriptions
    const hooks = {
      on_status_change: {
        url: `/api/webhooks/task-status/${id}`,
        description: 'Triggers when task status changes',
        events: ['pending_dispatch', 'planning', 'inbox', 'assigned', 'in_progress', 'testing', 'review', 'done']
      },
      on_milestone_complete: {
        url: `/api/webhooks/milestone/${id}`,
        description: 'Triggers when a milestone is completed',
        events: ['milestone_completed']
      },
      on_agent_assign: {
        url: `/api/webhooks/agent-assign/${id}`,
        description: 'Triggers when an agent is assigned',
        events: ['task_assigned']
      },
      on_dispatch: {
        url: `/api/webhooks/task-dispatch/${id}`,
        description: 'Triggers when task is dispatched to agent',
        events: ['task_dispatched']
      },
      on_completion: {
        url: `/api/webhooks/task-completion/${id}`,
        description: 'Triggers when task is completed',
        events: ['task_completed']
      }
    };

    return NextResponse.json({
      task_id: id,
      task_title: task.title,
      hooks
    });
  } catch (error) {
    console.error('Failed to fetch hooks:', error);
    return NextResponse.json({ error: 'Failed to fetch hooks' }, { status: 500 });
  }
}

/**
 * POST /api/tasks/[id]/hooks
 * 
 * Register a custom webhook for task events
 * Body: { "url": "https://...", "events": ["task_completed", "milestone_completed"], "secret": "optional" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { url, events, secret } = body;

    if (!url || !events || !Array.isArray(events)) {
      return NextResponse.json(
        { error: 'URL and events array are required' },
        { status: 400 }
      );
    }

    // Verify task exists
    const task = queryOne('SELECT id FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Validate events
    const validEvents = ['task_created', 'task_assigned', 'task_status_changed', 'task_completed', 'milestone_completed', 'task_dispatched'];
    const invalidEvents = events.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalidEvents.join(', ')}` },
        { status: 400 }
      );
    }

    // Store the webhook (in a real implementation, this would be a dedicated table)
    // For now, we'll store in metadata as JSON
    const webhookId = uuidv4();
    const now = new Date().toISOString();

    const webhookConfig = JSON.stringify({
      id: webhookId,
      url,
      events,
      secret: secret || null,
      created_at: now
    });

    // Store in task metadata (simplified approach)
    run(
      `INSERT INTO task_activities (id, task_id, activity_type, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [webhookId, id, 'updated', `Webhook registered: ${url}`, webhookConfig, now]
    );

    return NextResponse.json({
      success: true,
      webhook_id: webhookId,
      url,
      events
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to register webhook:', error);
    return NextResponse.json({ error: 'Failed to register webhook' }, { status: 500 });
  }
}

/**
 * DELETE /api/tasks/[id]/hooks
 * 
 * Remove a registered webhook
 * Body: { "webhook_id": "uuid" }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { webhook_id } = body;

    if (!webhook_id) {
      return NextResponse.json(
        { error: 'Webhook ID is required' },
        { status: 400 }
      );
    }

    // Delete the webhook registration (from task_activities)
    run(
      `DELETE FROM task_activities WHERE id = ? AND task_id = ?`,
      [webhook_id, id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete webhook:', error);
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
  }
}
