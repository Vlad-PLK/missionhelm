import { NextRequest, NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reporting/dashboard
 * 
 * Returns dashboard metrics for monitoring:
 * - Task counts by status
 * - Agent activity
 * - Completion rates
 * - Time tracking
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspace_id') || 'default';
    const days = parseInt(searchParams.get('days') || '30', 10);

    // Task counts by status
    const taskCounts = queryAll(`
      SELECT status, COUNT(*) as count 
      FROM tasks 
      WHERE workspace_id = ? 
      GROUP BY status
    `, [workspaceId]);

    const statusMap: Record<string, number> = {};
    (taskCounts as { status: string; count: number }[]).forEach((row) => {
      statusMap[row.status] = row.count;
    });

    // Agent performance
    const agentPerformance = queryAll(`
      SELECT 
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
      GROUP BY a.id
    `, [workspaceId]);

    // Completion rate (last N days)
    const completionStats = queryOne(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'done' AND updated_at >= datetime('now', '-${days} days') THEN 1 ELSE 0 END) as recent_completed
      FROM tasks 
      WHERE workspace_id = ?
    `, [workspaceId]);

    // Average time in status
    const avgTimeInStatus = queryAll(`
      SELECT 
        status,
        AVG(
          (julianday(COALESCE(updated_at, datetime('now'))) - julianday(created_at)) * 24
        ) as avg_hours
      FROM tasks 
      WHERE workspace_id = ? 
        AND created_at >= datetime('now', '-${days} days')
      GROUP BY status
    `, [workspaceId]);

    // Task type distribution
    const typeDistribution = queryAll(`
      SELECT task_type, COUNT(*) as count 
      FROM tasks 
      WHERE workspace_id = ? AND task_type IS NOT NULL
      GROUP BY task_type
    `, [workspaceId]);

    // Priority distribution
    const priorityDistribution = queryAll(`
      SELECT priority, COUNT(*) as count 
      FROM tasks 
      WHERE workspace_id = ?
      GROUP BY priority
    `, [workspaceId]);

    // Recent activity (last 7 days)
    const recentActivity = queryAll(`
      SELECT 
        DATE(created_at) as date,
        type,
        COUNT(*) as count
      FROM events 
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY DATE(created_at), type
      ORDER BY date DESC
    `);

    // Milestone progress for active tasks
    const milestoneProgress = queryAll(`
      SELECT 
        t.id,
        t.title,
        COUNT(m.id) as total_milestones,
        SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END) as completed_milestones
      FROM tasks t
      LEFT JOIN task_milestones m ON m.task_id = t.id
      WHERE t.workspace_id = ? AND t.status IN ('in_progress', 'testing')
      GROUP BY t.id
      HAVING total_milestones > 0
    `, [workspaceId]);

    // Calculate completion rate
    const stats = completionStats as { total: number; completed: number; recent_completed: number } | undefined;
    const completionRate = stats?.total && stats.total > 0
      ? Math.round((stats.completed / stats.total) * 100)
      : 0;
    
    const recentCompletionRate = stats?.recent_completed && stats.total > 0
      ? Math.round((stats.recent_completed / stats.total) * 100)
      : 0;

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
        total: (taskCounts as { count: number }[]).reduce((sum, r) => sum + r.count, 0)
      },
      completion_rate: completionRate,
      recent_completion_rate: recentCompletionRate,
      agent_performance: (agentPerformance as { id: string; name: string; avatar_emoji: string; status: string; task_count: number; completed_count: number }[]).map((a) => ({
        id: a.id,
        name: a.name,
        avatar_emoji: a.avatar_emoji,
        status: a.status,
        task_count: a.task_count,
        completed_count: a.completed_count,
        completion_rate: a.task_count > 0 ? Math.round((a.completed_count / a.task_count) * 100) : 0
      })),
      avg_time_in_status: avgTimeInStatus,
      task_type_distribution: typeDistribution,
      priority_distribution: priorityDistribution,
      recent_activity: recentActivity,
      milestone_progress: (milestoneProgress as { id: string; title: string; total_milestones: number; completed_milestones: number }[]).map((m) => ({
        id: m.id,
        title: m.title,
        total_milestones: m.total_milestones,
        completed_milestones: m.completed_milestones,
        percentage: m.total_milestones > 0 ? Math.round((m.completed_milestones / m.total_milestones) * 100) : 0
      }))
    });
  } catch (error) {
    console.error('Failed to fetch dashboard:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 });
  }
}
