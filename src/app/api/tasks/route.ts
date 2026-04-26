import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, run } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { CreateTaskSchema } from '@/lib/validation';
import type { Task, CreateTaskRequest, Agent } from '@/lib/types';
import { isCodingTask } from '@/lib/opencode';

// GET /api/tasks - List all tasks with optional filters

export const dynamic = 'force-dynamic';

function shouldDefaultToCodeLead(task: {
  assigned_agent_id?: string | null;
  title: string;
  description?: string | null;
  task_type?: string | null;
}): boolean {
  if (task.assigned_agent_id) {
    return false;
  }

  const title = task.title || '';
  const description = task.description || '';
  const codingLikeType = new Set(['feature', 'bugfix', 'deployment']);

  return Boolean(
    codingLikeType.has((task.task_type || '').toLowerCase()) ||
    isCodingTask(title, description)
  );
}

function findPreferredCodeLead(workspaceId: string): Agent | null {
  const workspaceScoped = queryOne<Agent>(
    `SELECT * FROM agents
     WHERE workspace_id = ?
       AND status != 'offline'
       AND (
         LOWER(name) = 'code-lead'
         OR LOWER(gateway_agent_id) = 'code-lead'
       )
     ORDER BY CASE WHEN status = 'standby' THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 1`,
    [workspaceId]
  );

  if (workspaceScoped) {
    return workspaceScoped;
  }

  return queryOne<Agent>(
    `SELECT * FROM agents
     WHERE status != 'offline'
       AND (
         LOWER(name) = 'code-lead'
         OR LOWER(gateway_agent_id) = 'code-lead'
       )
     ORDER BY CASE WHEN status = 'standby' THEN 0 ELSE 1 END, updated_at DESC
     LIMIT 1`
  ) || null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const businessId = searchParams.get('business_id');
    const workspaceId = searchParams.get('workspace_id');
    const assignedAgentId = searchParams.get('assigned_agent_id');

    let sql = `
      SELECT
        t.*,
        aa.name as assigned_agent_name,
        aa.avatar_emoji as assigned_agent_emoji,
        ca.name as created_by_agent_name
      FROM tasks t
      LEFT JOIN agents aa ON t.assigned_agent_id = aa.id
      LEFT JOIN agents ca ON t.created_by_agent_id = ca.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (status) {
      // Support comma-separated status values (e.g., status=inbox,testing,in_progress)
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        sql += ' AND t.status = ?';
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        sql += ` AND t.status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      }
    }
    if (businessId) {
      sql += ' AND t.business_id = ?';
      params.push(businessId);
    }
    if (workspaceId) {
      sql += ' AND t.workspace_id = ?';
      params.push(workspaceId);
    }
    if (assignedAgentId) {
      sql += ' AND t.assigned_agent_id = ?';
      params.push(assignedAgentId);
    }

    sql += ' ORDER BY t.created_at DESC';

    const tasks = queryAll<Task & { assigned_agent_name?: string; assigned_agent_emoji?: string; created_by_agent_name?: string }>(sql, params);

    // Transform to include nested agent info
    const transformedTasks = tasks.map((task) => ({
      ...task,
      assigned_agent: task.assigned_agent_id
        ? {
            id: task.assigned_agent_id,
            name: task.assigned_agent_name,
            avatar_emoji: task.assigned_agent_emoji,
          }
        : undefined,
    }));

    return NextResponse.json(transformedTasks);
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

// POST /api/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const body: CreateTaskRequest = await request.json();
    console.log('[POST /api/tasks] Received body:', JSON.stringify(body));

    // Validate input with Zod
    const validation = CreateTaskSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.issues },
        { status: 400 }
      );
    }

    const validatedData = validation.data;

    const id = uuidv4();
    const now = new Date().toISOString();

    const workspaceId = validatedData.workspace_id || 'default';
    const status = validatedData.status || 'inbox';

    const shouldAutoAssignCodeLead = shouldDefaultToCodeLead(validatedData);
    const autoSelectedCodeLead = shouldAutoAssignCodeLead
      ? findPreferredCodeLead(workspaceId)
      : null;
    const assignedAgentId = validatedData.assigned_agent_id || autoSelectedCodeLead?.id || null;

    run(
      `INSERT INTO tasks (id, title, description, task_type, status, priority, estimated_hours, actual_hours, assigned_agent_id, created_by_agent_id, workspace_id, business_id, due_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        validatedData.title,
        validatedData.description || null,
        validatedData.task_type || 'general',
        status,
        validatedData.priority || 'normal',
        validatedData.estimated_hours ?? null,
        validatedData.actual_hours ?? null,
        assignedAgentId,
        validatedData.created_by_agent_id || null,
        workspaceId,
        validatedData.business_id || 'default',
        validatedData.due_date || null,
        now,
        now,
      ]
    );

    // Log event
    let eventMessage = `New task: ${validatedData.title}`;
    if (validatedData.created_by_agent_id) {
      const creator = queryOne<Agent>('SELECT name FROM agents WHERE id = ?', [validatedData.created_by_agent_id]);
      if (creator) {
        eventMessage = `${creator.name} created task: ${validatedData.title}`;
      }
    }

    run(
      `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), 'task_created', body.created_by_agent_id || null, id, eventMessage, now]
    );

    // Fetch created task with all joined fields
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
    
    // Broadcast task creation via SSE
    if (task) {
      broadcast({
        type: 'task_created',
        payload: task,
      });
    }
    
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Failed to create task:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
