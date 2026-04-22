import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';
    const days = Number.parseInt(searchParams.get('days') || '30', 10);

    const taskCounts = queryAll<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count
       FROM tasks
       WHERE workspace_id = ?
       GROUP BY status`,
      [workspaceId]
    );

    const statusMap = Object.fromEntries(taskCounts.map((row) => [row.status, row.count]));

    const agentPerformance = queryAll<{
      id: string;
      name: string;
      avatar_emoji: string;
      status: string;
      task_count: number;
      completed_count: number;
      avg_estimated_hours: number | null;
      avg_actual_hours: number | null;
    }>(
      `SELECT
         a.id,
         a.name,
         a.avatar_emoji,
         a.status,
         COUNT(t.id) as task_count,
         SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as completed_count,
         AVG(t.estimated_hours) as avg_estimated_hours,
         AVG(t.actual_hours) as avg_actual_hours
       FROM agents a
       LEFT JOIN tasks t ON t.assigned_agent_id = a.id
       WHERE a.workspace_id = ?
       GROUP BY a.id`,
      [workspaceId]
    );

    const completionStats = queryOne<{
      total: number;
      completed: number;
      recent_completed: number;
    }>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'done' AND updated_at >= datetime('now', ?) THEN 1 ELSE 0 END) as recent_completed
       FROM tasks
       WHERE workspace_id = ?`,
      [`-${days} days`, workspaceId]
    );

    const avgTimeInStatus = queryAll<{ status: string; avg_hours: number }>(
      `SELECT
         status,
         AVG((julianday(COALESCE(updated_at, datetime('now'))) - julianday(created_at)) * 24) as avg_hours
       FROM tasks
       WHERE workspace_id = ?
         AND created_at >= datetime('now', ?)
       GROUP BY status`,
      [workspaceId, `-${days} days`]
    );

    const typeDistribution = queryAll<{ task_type: string | null; count: number }>(
      `SELECT task_type, COUNT(*) as count
       FROM tasks
       WHERE workspace_id = ? AND task_type IS NOT NULL
       GROUP BY task_type`,
      [workspaceId]
    );

    const priorityDistribution = queryAll<{ priority: string; count: number }>(
      `SELECT priority, COUNT(*) as count
       FROM tasks
       WHERE workspace_id = ?
       GROUP BY priority`,
      [workspaceId]
    );

    const recentActivity = queryAll<{ date: string; type: string; count: number }>(
      `SELECT
         DATE(created_at) as date,
         type,
         COUNT(*) as count
       FROM events
       WHERE created_at >= datetime('now', '-7 days')
       GROUP BY DATE(created_at), type
       ORDER BY date DESC`,
    );

    const milestoneProgress = queryAll<{
      id: string;
      title: string;
      total_milestones: number;
      completed_milestones: number;
    }>(
      `SELECT
         t.id,
         t.title,
         COUNT(m.id) as total_milestones,
         SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END) as completed_milestones
       FROM tasks t
       LEFT JOIN task_milestones m ON m.task_id = t.id
       WHERE t.workspace_id = ?
         AND t.status IN ('in_progress', 'testing', 'review')
       GROUP BY t.id
       HAVING total_milestones > 0`,
      [workspaceId]
    );

    const totalTasks = taskCounts.reduce((sum, row) => sum + row.count, 0);
    const completed = completionStats?.completed || 0;
    const recentCompleted = completionStats?.recent_completed || 0;
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;
    const recentCompletionRate = totalTasks > 0 ? Math.round((recentCompleted / totalTasks) * 100) : 0;

    return NextResponse.json({
      workspace_id: workspaceId,
      period_days: days,
      task_counts: {
        pending_dispatch: statusMap.pending_dispatch || 0,
        planning: statusMap.planning || 0,
        inbox: statusMap.inbox || 0,
        assigned: statusMap.assigned || 0,
        in_progress: statusMap.in_progress || 0,
        testing: statusMap.testing || 0,
        review: statusMap.review || 0,
        done: statusMap.done || 0,
        total: totalTasks,
      },
      completion_rate: completionRate,
      recent_completion_rate: recentCompletionRate,
      agent_performance: agentPerformance.map((agent) => ({
        ...agent,
        completion_rate: agent.task_count > 0 ? Math.round((agent.completed_count / agent.task_count) * 100) : 0,
      })),
      avg_time_in_status: avgTimeInStatus,
      task_type_distribution: typeDistribution,
      priority_distribution: priorityDistribution,
      recent_activity: recentActivity,
      milestone_progress: milestoneProgress.map((milestone) => ({
        ...milestone,
        percentage: milestone.total_milestones > 0
          ? Math.round((milestone.completed_milestones / milestone.total_milestones) * 100)
          : 0,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch dashboard:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 });
  }
}
