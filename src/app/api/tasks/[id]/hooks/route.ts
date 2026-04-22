import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import type { Task } from '@/lib/types';

export const dynamic = 'force-dynamic';

const validEvents = [
  'task_created',
  'task_assigned',
  'task_status_changed',
  'task_completed',
  'milestone_completed',
  'task_dispatched',
];

type HookRegistration = {
  id: string;
  url: string;
  events: string[];
  secret?: string | null;
  created_at: string;
};

function parseHookRegistration(metadata?: string | null): HookRegistration | null {
  if (!metadata) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadata) as Partial<HookRegistration>;
    if (!parsed.id || !parsed.url || !Array.isArray(parsed.events) || !parsed.created_at) {
      return null;
    }

    return {
      id: parsed.id,
      url: parsed.url,
      events: parsed.events,
      secret: parsed.secret ?? null,
      created_at: parsed.created_at,
    };
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const storedHooks = queryAll<{ metadata: string | null }>(
      `SELECT metadata
       FROM task_activities
       WHERE task_id = ?
         AND activity_type = 'updated'
         AND message = 'Webhook registered'
       ORDER BY created_at DESC`,
      [id]
    )
      .map((row) => parseHookRegistration(row.metadata))
      .filter((hook): hook is HookRegistration => hook !== null);

    return NextResponse.json({
      task_id: id,
      task_title: task.title,
      available_events: validEvents,
      hooks: storedHooks,
    });
  } catch (error) {
    console.error('Failed to fetch hooks:', error);
    return NextResponse.json({ error: 'Failed to fetch hooks' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { url, events, secret } = body;

    if (!url || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'URL and a non-empty events array are required' },
        { status: 400 }
      );
    }

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const invalidEvents = events.filter((event: string) => !validEvents.includes(event));
    if (invalidEvents.length > 0) {
      return NextResponse.json(
        { error: `Invalid events: ${invalidEvents.join(', ')}` },
        { status: 400 }
      );
    }

    const hookId = uuidv4();
    const now = new Date().toISOString();
    const registration = JSON.stringify({
      id: hookId,
      url,
      events,
      secret: secret || null,
      created_at: now,
    });

    run(
      `INSERT INTO task_activities (id, task_id, activity_type, message, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [hookId, id, 'updated', 'Webhook registered', registration, now]
    );

    return NextResponse.json({
      success: true,
      webhook_id: hookId,
      url,
      events,
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to register webhook:', error);
    return NextResponse.json({ error: 'Failed to register webhook' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { webhook_id } = body;

    if (!webhook_id) {
      return NextResponse.json({ error: 'Webhook ID is required' }, { status: 400 });
    }

    run(
      `DELETE FROM task_activities
       WHERE id = ?
         AND task_id = ?
         AND activity_type = 'updated'
         AND message = 'Webhook registered'`,
      [webhook_id, id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete webhook:', error);
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
  }
}
