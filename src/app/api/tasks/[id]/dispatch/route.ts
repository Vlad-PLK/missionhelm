import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, run, transaction } from '@/lib/db';
import { broadcast } from '@/lib/events';
import { buildDispatchPrompt, fetchDispatchContext } from '@/lib/prompt-templates';
import { isCodingTask } from '@/lib/opencode';
import type { Task, Agent, OpenClawSession } from '@/lib/types';
import { APP_RUNTIME_CHANNEL, APP_RUNTIME_SESSION_PREFIX } from '@/lib/branding';
import {
  createDispatchRun,
  ensureAgentHasNoConflictingRun,
  recordExecutionReceipt,
  supersedeActiveRunsForTask,
} from '@/lib/execution-runs';
import { ensureExecutionMonitorStarted } from '@/lib/execution-monitor';
import { dispatchRouteDeps } from './deps';

export const dynamic = 'force-dynamic';
interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/dispatch
 * 
 * Dispatches a task to its assigned agent's OpenClaw session.
 * Creates session if needed, sends task details to agent.
 * 
 * Uses enhanced prompt templates with OpenCode integration for coding tasks.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Get task with agent info
    const task = queryOne<Task & { assigned_agent_name?: string; workspace_id: string }>(
      `SELECT t.*, a.name as assigned_agent_name, a.is_master
       FROM tasks t
       LEFT JOIN agents a ON t.assigned_agent_id = a.id
       WHERE t.id = ?`,
      [id]
    );

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    if (!task.assigned_agent_id) {
      return NextResponse.json(
        { error: 'Task has no assigned agent' },
        { status: 400 }
      );
    }

    // Get agent details
    const agent = queryOne<Agent>(
      'SELECT * FROM agents WHERE id = ?',
      [task.assigned_agent_id]
    );

    if (!agent) {
      return NextResponse.json({ error: 'Assigned agent not found' }, { status: 404 });
    }

    // Check if dispatching to the master agent while there are other orchestrators available
    if (agent.is_master) {
      // Check for other master agents in the same workspace (excluding this one)
      const otherOrchestrators = queryAll<{
        id: string;
        name: string;
        role: string;
      }>(
        `SELECT id, name, role
         FROM agents
         WHERE is_master = 1
         AND id != ?
         AND workspace_id = ?
         AND status != 'offline'`,
        [agent.id, task.workspace_id]
      );

      if (otherOrchestrators.length > 0) {
        return NextResponse.json({
          success: false,
          warning: 'Other orchestrators available',
          message: `There ${otherOrchestrators.length === 1 ? 'is' : 'are'} ${otherOrchestrators.length} other orchestrator${otherOrchestrators.length === 1 ? '' : 's'} available in this workspace: ${otherOrchestrators.map(o => o.name).join(', ')}. Consider assigning this task to them instead.`,
          otherOrchestrators,
        }, { status: 409 }); // 409 Conflict - indicating there's an alternative
      }
    }

    // Connect to OpenClaw Gateway
    const client = dispatchRouteDeps.getOpenClawClient();
    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (err) {
        console.error('Failed to connect to OpenClaw Gateway:', err);
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    // Get or create persistent OpenClaw session scoped to (workspace, agent)
    let session = queryOne<OpenClawSession>(
      `SELECT *
       FROM openclaw_sessions
       WHERE agent_id = ?
         AND workspace_id = ?
         AND session_type = 'persistent'
         AND status = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [agent.id, task.workspace_id, 'active']
    );

    const now = new Date().toISOString();

    if (!session) {
      // Create session record
      const sessionId = uuidv4();
      const workspaceSessionSuffix = task.workspace_id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const openclawSessionId = `${APP_RUNTIME_SESSION_PREFIX}-${workspaceSessionSuffix}-${agent.id}`;

      run(
        `INSERT INTO openclaw_sessions (id, agent_id, workspace_id, openclaw_session_id, channel, status, session_type, task_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, agent.id, task.workspace_id, openclawSessionId, APP_RUNTIME_CHANNEL, 'active', 'persistent', null, now, now]
      );

      session = queryOne<OpenClawSession>(
        'SELECT * FROM openclaw_sessions WHERE id = ?',
        [sessionId]
      );

      // Log session creation
      run(
        `INSERT INTO events (id, type, agent_id, task_id, message, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          'agent_status_changed',
          agent.id,
          task.id,
          `${agent.name} workspace-scoped session created`,
          JSON.stringify({
            session_id: openclawSessionId,
            workspace_id: task.workspace_id,
            session_scope: 'workspace+agent',
          }),
          now,
        ]
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'Failed to create agent session' },
        { status: 500 }
      );
    }

    const conflictingRun = ensureAgentHasNoConflictingRun(agent.id, task.id);
    if (conflictingRun) {
      return NextResponse.json(
        {
          error: 'Agent already has an active execution run',
          message: `Agent ${agent.name} is still bound to task ${conflictingRun.task_id}. Dispatch stopped because exact task/runtime correlation would become ambiguous.`,
          conflicting_run_id: conflictingRun.id,
          conflicting_task_id: conflictingRun.task_id,
        },
        { status: 409 }
      );
    }

    // Build task message using enhanced prompt templates
    const context = fetchDispatchContext(id);
    if (!context) {
      return NextResponse.json(
        { error: 'Failed to fetch dispatch context' },
        { status: 500 }
      );
    }

    const codingTask = isCodingTask(task.title, task.description || '');
    if (codingTask && !context.workspace?.folder_path) {
      return NextResponse.json(
        {
          error: 'Workspace folder path required for coding task dispatch',
          message: `Task ${task.id} is coding-like and cannot be dispatched until workspace.folder_path points to the real repository path.`,
          workspace_id: context.task.workspace_id,
        },
        { status: 409 }
      );
    }

    const taskMessage = buildDispatchPrompt(context);

    // Send message to agent's session using chat.send
    try {
      // Use sessionKey for routing to the agent's session
      // Format: {prefix}{openclaw_session_id} where prefix defaults to 'agent:main:'
      const prefix = agent.session_key_prefix || 'agent:main:';
      const sessionKey = `${prefix}${session.openclaw_session_id}`;
      const idempotencyKey = `dispatch-${id}-${Date.now()}`;
      await client.call('chat.send', {
        sessionKey,
        message: taskMessage,
        idempotencyKey
      });

      let dispatchRunId: string | null = null;
      transaction(() => {
        supersedeActiveRunsForTask(task.id, now);
        run(
          'UPDATE openclaw_sessions SET task_id = ?, updated_at = ? WHERE id = ?',
          [task.id, now, session!.id]
        );

        const dispatchRun = createDispatchRun({
          taskId: task.id,
          agentId: agent.id,
          openclawSessionId: session!.openclaw_session_id,
          sessionKey,
          idempotencyKey,
          now,
        });
        dispatchRunId = dispatchRun.id;

        run(
          'UPDATE agents SET status = ?, updated_at = ? WHERE id = ?',
          ['working', now, agent.id]
        );

        run(
          `INSERT INTO events (id, type, agent_id, task_id, message, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            'task_dispatched',
            agent.id,
            task.id,
            `Task "${task.title}" dispatched to ${agent.name}`,
            JSON.stringify({
              execution_run_id: dispatchRun.id,
              session_id: session!.openclaw_session_id,
              session_key: sessionKey,
              dispatch_attempt: dispatchRun.dispatch_attempt,
              idempotency_key: idempotencyKey,
            }),
            now,
          ]
        );

        recordExecutionReceipt({
          taskId: task.id,
          agentId: agent.id,
          runId: dispatchRun.id,
          sessionId: session!.openclaw_session_id,
          sessionKey,
          receiptType: 'dispatch_sent',
          message: `Dispatch sent to ${agent.name} (attempt ${dispatchRun.dispatch_attempt})`,
          sourceType: 'dispatch',
          sourceFingerprint: idempotencyKey,
          sourceTimestamp: now,
          createdAt: now,
          metadata: {
            dispatch_attempt: dispatchRun.dispatch_attempt,
            idempotency_key: idempotencyKey,
          },
        });
      });

      const updatedTask = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (updatedTask) {
        broadcast({
          type: 'task_updated',
          payload: updatedTask,
        });
      }

      ensureExecutionMonitorStarted();

      return NextResponse.json({
        success: true,
        task_id: id,
        agent_id: agent.id,
        execution_run_id: dispatchRunId,
        session_id: session.openclaw_session_id,
        message: 'Task dispatch accepted and execution run recorded'
      });
    } catch (err) {
      console.error('Failed to send message to agent:', err);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Failed to dispatch task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
