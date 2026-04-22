import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import type { TaskMilestone } from '@/lib/types';

export const dynamic = 'force-dynamic';

function syncTaskProgress(taskId: string, now: string) {
  const milestones = queryAll<Pick<TaskMilestone, 'status' | 'phase' | 'order_index'>>(
    `SELECT status, phase, order_index FROM task_milestones WHERE task_id = ? ORDER BY order_index ASC`,
    [taskId]
  );

  const currentMilestone = milestones.find((milestone) => milestone.status === 'in_progress')
    || milestones.find((milestone) => milestone.status !== 'completed')
    || milestones[milestones.length - 1]
    || null;

  const currentPhase = currentMilestone?.phase || 'initiation';
  const completedAt = milestones.length > 0 && milestones.every((milestone) => milestone.status === 'completed')
    ? now
    : null;

  const existingProgress = queryOne<{ id: string }>('SELECT id FROM task_progress WHERE task_id = ?', [taskId]);

  if (existingProgress) {
    run(
      `UPDATE task_progress
       SET current_phase = ?, last_updated_at = ?, completed_at = ?
       WHERE task_id = ?`,
      [currentPhase, now, completedAt, taskId]
    );
    return;
  }

  run(
    `INSERT INTO task_progress (id, task_id, current_phase, started_at, last_updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), taskId, currentPhase, now, now, completedAt]
  );
}

// GET /api/tasks/[id]/milestones/[milestoneId] - Get a single milestone
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;

    const milestone = queryOne<TaskMilestone>(
      'SELECT * FROM task_milestones WHERE id = ? AND task_id = ?',
      [milestoneId, id]
    );

    if (!milestone) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    return NextResponse.json(milestone);
  } catch (error) {
    console.error('Failed to fetch milestone:', error);
    return NextResponse.json({ error: 'Failed to fetch milestone' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id]/milestones/[milestoneId] - Update a milestone
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;
    const body = await request.json();

    const existing = queryOne<TaskMilestone>(
      'SELECT * FROM task_milestones WHERE id = ? AND task_id = ?',
      [milestoneId, id]
    );

    if (!existing) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const now = new Date().toISOString();

    if (body.title !== undefined) {
      updates.push('title = ?');
      values.push(body.title);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.status !== undefined) {
      updates.push('status = ?');
      values.push(body.status);
      
      // Track completion
      if (body.status === 'completed') {
        updates.push('completed_at = ?');
        values.push(now);
      } else {
        updates.push('completed_at = NULL');
      }
    }
    if (body.phase !== undefined) {
      updates.push('phase = ?');
      values.push(body.phase);
    }
    if (body.order_index !== undefined) {
      updates.push('order_index = ?');
      values.push(body.order_index);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(milestoneId);

    run(`UPDATE task_milestones SET ${updates.join(', ')} WHERE id = ?`, values);

    if (body.phase !== undefined || body.status !== undefined) {
      syncTaskProgress(id, now);
    }

    const milestone = queryOne<TaskMilestone>(
      'SELECT * FROM task_milestones WHERE id = ?',
      [milestoneId]
    );

    return NextResponse.json(milestone);
  } catch (error) {
    console.error('Failed to update milestone:', error);
    return NextResponse.json({ error: 'Failed to update milestone' }, { status: 500 });
  }
}

// DELETE /api/tasks/[id]/milestones/[milestoneId] - Delete a milestone
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const { id, milestoneId } = await params;

    const existing = queryOne<TaskMilestone>(
      'SELECT * FROM task_milestones WHERE id = ? AND task_id = ?',
      [milestoneId, id]
    );

    if (!existing) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    run('DELETE FROM task_milestones WHERE id = ?', [milestoneId]);
    syncTaskProgress(id, new Date().toISOString());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete milestone:', error);
    return NextResponse.json({ error: 'Failed to delete milestone' }, { status: 500 });
  }
}
