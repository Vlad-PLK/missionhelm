import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import type { TaskMilestone } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/tasks/[id]/milestones - List milestones for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Verify task exists
    const task = queryOne('SELECT id FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const milestones = queryAll<TaskMilestone>(
      `SELECT * FROM task_milestones WHERE task_id = ? ORDER BY order_index ASC`,
      [id]
    );

    // Get progress summary
    const progress = queryOne(
      `SELECT current_phase FROM task_progress WHERE task_id = ?`,
      [id]
    );

    return NextResponse.json({
      milestones,
      progress: progress || { current_phase: 'initiation' }
    });
  } catch (error) {
    console.error('Failed to fetch milestones:', error);
    return NextResponse.json({ error: 'Failed to fetch milestones' }, { status: 500 });
  }
}

// POST /api/tasks/[id]/milestones - Create a new milestone
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { title, description, phase, order_index } = body;

    if (!title || !phase) {
      return NextResponse.json(
        { error: 'Title and phase are required' },
        { status: 400 }
      );
    }

    // Verify task exists
    const task = queryOne('SELECT id FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const milestoneId = uuidv4();
    const now = new Date().toISOString();

    run(
      `INSERT INTO task_milestones (id, task_id, title, description, status, phase, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [milestoneId, id, title, description || null, 'pending', phase, order_index || 0, now, now]
    );

    // Initialize task_progress if not exists
    const existingProgress = queryOne('SELECT id FROM task_progress WHERE task_id = ?', [id]);
    if (!existingProgress) {
      run(
        `INSERT INTO task_progress (id, task_id, current_phase, started_at, last_updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), id, phase, now, now]
      );
    }

    const milestone = queryOne<TaskMilestone>(
      'SELECT * FROM task_milestones WHERE id = ?',
      [milestoneId]
    );

    return NextResponse.json(milestone, { status: 201 });
  } catch (error) {
    console.error('Failed to create milestone:', error);
    return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 });
  }
}
