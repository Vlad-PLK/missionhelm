import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne, run } from '@/lib/db';
import type { Task, Agent } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tasks/[id]/route-agent
 * 
 * Suggests the best agent for a task based on:
 * - Task type (feature, bugfix, research, etc.)
 * - Agent specialty/role
 * - Current workload
 * - Availability
 */
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

    // Get all available agents in the workspace
    const agents = queryAll<Agent>(
      `SELECT * FROM agents WHERE workspace_id = ? AND status != 'offline'`,
      [task.workspace_id]
    );

    if (agents.length === 0) {
      return NextResponse.json({ error: 'No available agents' }, { status: 404 });
    }

    // Score each agent
    const scoredAgents = agents.map(agent => {
      let score = 0;
      const reasons: string[] = [];

      // Check for matching role/specialty based on task type
      const taskType = task.task_type || 'general';
      const role = (agent.role || '').toLowerCase();
      const description = (agent.description || '').toLowerCase();

      switch (taskType) {
        case 'bugfix':
          if (role.includes('bug') || role.includes('fix') || description.includes('bug') || description.includes('debug')) {
            score += 30;
            reasons.push('Agent specializes in bug fixes');
          }
          break;
        case 'feature':
          if (role.includes('developer') || role.includes('engineer') || description.includes('feature')) {
            score += 30;
            reasons.push('Agent specializes in feature development');
          }
          break;
        case 'research':
          if (role.includes('research') || role.includes('analyst') || description.includes('research')) {
            score += 30;
            reasons.push('Agent specializes in research');
          }
          break;
        case 'documentation':
          if (role.includes('doc') || description.includes('documentation')) {
            score += 30;
            reasons.push('Agent specializes in documentation');
          }
          break;
        case 'deployment':
          if (role.includes('devops') || role.includes('deploy') || description.includes('deploy')) {
            score += 30;
            reasons.push('Agent specializes in deployment');
          }
          break;
      }

      // Check for master agent preference for urgent tasks
      if (task.priority === 'urgent' && agent.is_master) {
        score += 20;
        reasons.push('Master agent for urgent tasks');
      }

      // Penalize busy agents
      const activeTasks = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks WHERE assigned_agent_id = ? AND status IN ('assigned', 'in_progress')`,
        [agent.id]
      );
      const busyCount = activeTasks?.count || 0;

      if (busyCount === 0) {
        score += 15;
        reasons.push('Agent is available');
      } else if (busyCount === 1) {
        score += 5;
        reasons.push('Agent has 1 active task');
      } else {
        score -= busyCount * 5;
        reasons.push(`Agent has ${busyCount} active tasks`);
      }

      // Penalize offline/standby vs working
      if (agent.status === 'standby') {
        score += 10;
        reasons.push('Agent is on standby');
      }

      return {
        agent: {
          id: agent.id,
          name: agent.name,
          avatar_emoji: agent.avatar_emoji,
          role: agent.role,
          status: agent.status,
          is_master: agent.is_master
        },
        score,
        reasons,
        active_task_count: busyCount
      };
    });

    // Sort by score descending
    scoredAgents.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      task_id: id,
      task_title: task.title,
      task_type: task.task_type,
      priority: task.priority,
      suggested_agents: scoredAgents.slice(0, 5),
      best_match: scoredAgents[0]
    });
  } catch (error) {
    console.error('Failed to route task:', error);
    return NextResponse.json({ error: 'Failed to route task' }, { status: 500 });
  }
}

/**
 * POST /api/tasks/[id]/route-agent
 * 
 * Auto-assign the best agent to a task based on routing logic
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Get all available agents in the workspace
    const agents = queryAll<Agent>(
      `SELECT * FROM agents WHERE workspace_id = ? AND status != 'offline'`,
      [task.workspace_id]
    );

    if (agents.length === 0) {
      return NextResponse.json({ error: 'No available agents' }, { status: 404 });
    }

    // Score each agent (same logic as GET)
    const scoredAgents = agents.map(agent => {
      let score = 0;

      const taskType = task.task_type || 'general';
      const role = (agent.role || '').toLowerCase();
      const description = (agent.description || '').toLowerCase();

      switch (taskType) {
        case 'bugfix':
          if (role.includes('bug') || role.includes('fix') || description.includes('bug') || description.includes('debug')) {
            score += 30;
          }
          break;
        case 'feature':
          if (role.includes('developer') || role.includes('engineer') || description.includes('feature')) {
            score += 30;
          }
          break;
        case 'research':
          if (role.includes('research') || role.includes('analyst') || description.includes('research')) {
            score += 30;
          }
          break;
        case 'documentation':
          if (role.includes('doc') || description.includes('documentation')) {
            score += 30;
          }
          break;
        case 'deployment':
          if (role.includes('devops') || role.includes('deploy') || description.includes('deploy')) {
            score += 30;
          }
          break;
      }

      if (task.priority === 'urgent' && agent.is_master) {
        score += 20;
      }

      const activeTasks = queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM tasks WHERE assigned_agent_id = ? AND status IN ('assigned', 'in_progress')`,
        [agent.id]
      );
      const busyCount = activeTasks?.count || 0;

      if (busyCount === 0) {
        score += 15;
      } else if (busyCount === 1) {
        score += 5;
      } else {
        score -= busyCount * 5;
      }

      if (agent.status === 'standby') {
        score += 10;
      }

      return { agent, score };
    });

    // Sort by score descending
    scoredAgents.sort((a, b) => b.score - a.score);

    const bestMatch = scoredAgents[0];

    if (!bestMatch) {
      return NextResponse.json({ error: 'Could not find suitable agent' }, { status: 400 });
    }

    // Optionally assign the agent
    if (body.assign === true) {
      const now = new Date().toISOString();
      
      run(
        `UPDATE tasks SET assigned_agent_id = ?, updated_at = ? WHERE id = ?`,
        [bestMatch.agent.id, now, id]
      );

      // Log the assignment
      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), 'task_assigned', bestMatch.agent.id, id, `Task auto-assigned to ${bestMatch.agent.name}`, now]
      );

      return NextResponse.json({
        success: true,
        task_id: id,
        assigned_agent_id: bestMatch.agent.id,
        assigned_agent_name: bestMatch.agent.name,
        score: bestMatch.score
      });
    }

    return NextResponse.json({
      task_id: id,
      suggested_agent: {
        id: bestMatch.agent.id,
        name: bestMatch.agent.name,
        avatar_emoji: bestMatch.agent.avatar_emoji,
        role: bestMatch.agent.role
      },
      score: bestMatch.score,
      message: 'Set assign=true in body to auto-assign this agent'
    });
  } catch (error) {
    console.error('Failed to route task:', error);
    return NextResponse.json({ error: 'Failed to route task' }, { status: 500 });
  }
}
