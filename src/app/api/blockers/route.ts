/**
 * Blockers Queue API
 * GET all blockers with triage visibility
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryAll } from '@/lib/db';
import type { TaskBlocker } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // active, escalated, resolved
    const severity = searchParams.get('severity'); // critical, high, medium, low
    const workspaceId = searchParams.get('workspace_id');
    const taskId = searchParams.get('task_id');

    let sql = `
      SELECT 
        b.*,
        t.title as task_title,
        t.status as task_status,
        t.priority as task_priority,
        t.workspace_id,
        ia.name as identified_by_name,
        ia.avatar_emoji as identified_by_emoji,
        ra.name as resolved_by_name,
        ra.avatar_emoji as resolved_by_emoji,
        ea.name as escalated_to_name
      FROM task_blockers b
      JOIN tasks t ON b.task_id = t.id
      LEFT JOIN agents ia ON b.identified_by_agent_id = ia.id
      LEFT JOIN agents ra ON b.resolved_by_agent_id = ra.id
      LEFT JOIN agents ea ON b.escalated_to_agent_id = ea.id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (status) {
      sql += ' AND b.status = ?';
      params.push(status);
    }

    if (severity) {
      sql += ' AND b.severity = ?';
      params.push(severity);
    }

    if (workspaceId) {
      sql += ' AND t.workspace_id = ?';
      params.push(workspaceId);
    }

    if (taskId) {
      sql += ' AND b.task_id = ?';
      params.push(taskId);
    }

    sql += ' ORDER BY b.severity DESC, b.created_at ASC';

    const blockers = queryAll<TaskBlocker & {
      task_title: string;
      task_status: string;
      task_priority: string;
      workspace_id: string;
      identified_by_name: string;
      identified_by_emoji: string;
      resolved_by_name: string;
      resolved_by_emoji: string;
      escalated_to_name: string;
    }>(sql, params);

    // Transform to include enriched data
    const result = blockers.map(b => ({
      id: b.id,
      task_id: b.task_id,
      blocker_type: b.blocker_type,
      severity: b.severity,
      status: b.status,
      title: b.title,
      description: b.description,
      identified_by_agent_id: b.identified_by_agent_id,
      escalated_at: b.escalated_at,
      escalated_to_agent_id: b.escalated_to_agent_id,
      resolved_at: b.resolved_at,
      resolved_by_agent_id: b.resolved_by_agent_id,
      resolution_note: b.resolution_note,
      created_at: b.created_at,
      updated_at: b.updated_at,
      // Enriched fields
      task_title: b.task_title,
      task_status: b.task_status,
      task_priority: b.task_priority,
      workspace_id: b.workspace_id,
      identified_by: b.identified_by_name ? {
        name: b.identified_by_name,
        avatar_emoji: b.identified_by_emoji,
      } : null,
      resolved_by: b.resolved_by_name ? {
        name: b.resolved_by_name,
        avatar_emoji: b.resolved_by_emoji,
      } : null,
      escalated_to: b.escalated_to_name ? {
        name: b.escalated_to_name,
      } : null,
    }));

    // Return summary stats
    const totalActive = queryAll<{ count: number }>(
      `SELECT COUNT(*) as count FROM task_blockers WHERE status IN ('active', 'escalated')`,
      []
    );
    const criticalCount = queryAll<{ count: number }>(
      `SELECT COUNT(*) as count FROM task_blockers WHERE severity = 'critical' AND status IN ('active', 'escalated')`,
      []
    );

    return NextResponse.json({
      blockers: result,
      summary: {
        total: result.length,
        active: totalActive[0]?.count ?? 0,
        critical: criticalCount[0]?.count ?? 0,
      }
    });
  } catch (error) {
    console.error('Error fetching blockers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blockers' },
      { status: 500 }
    );
  }
}