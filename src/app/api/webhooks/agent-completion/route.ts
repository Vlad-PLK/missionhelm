import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createHmac } from 'crypto';
import { queryOne, queryAll, run } from '@/lib/db';
import type { Task } from '@/lib/types';
import { markExecutionIngestionFailure, ingestCompletionSignal } from '@/lib/runtime-ingestion';
import { resolveExactExecutionRun } from '@/lib/execution-runs';

export const dynamic = 'force-dynamic';
/**
 * Verify HMAC-SHA256 signature of webhook request
 */
function verifyWebhookSignature(signature: string, rawBody: string): boolean {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    // Dev mode - skip validation
    return true;
  }

  if (!signature) {
    return false;
  }

  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  return signature === expectedSignature;
}

/**
 * POST /api/webhooks/agent-completion
 * 
 * Receives completion notifications from agents.
 * Expected payload:
 * {
 *   "session_id": "mission-control-engineering",
 *   "message": "TASK_COMPLETE: Built the authentication system"
 * }
 * 
 * Or can be called with task_id directly:
 * {
 *   "task_id": "uuid",
 *   "summary": "Completed the task successfully"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await request.text();
    
    // Verify webhook signature if WEBHOOK_SECRET is set
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get('x-webhook-signature');
      
      if (!signature || !verifyWebhookSignature(signature, rawBody)) {
        console.warn('[WEBHOOK] Invalid signature attempt');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const body = JSON.parse(rawBody);
    const now = new Date().toISOString();

    const isDirectTaskCompletion = Boolean(body.task_id);
    const isSessionCompletion = Boolean(body.session_id && body.message);

    if (!isDirectTaskCompletion && !isSessionCompletion) {
      return NextResponse.json(
        { error: 'Invalid payload. Provide either task_id or session_id + message' },
        { status: 400 }
      );
    }

    const completionMessage = isSessionCompletion
      ? String(body.message)
      : `TASK_COMPLETE: ${String(body.summary || 'Task finished').trim()}`;

    if (!/^TASK_COMPLETE:\s*/i.test(completionMessage)) {
      return NextResponse.json(
        { error: 'Invalid completion message format. Expected: TASK_COMPLETE: [summary]' },
        { status: 400 }
      );
    }

    let executionRun;
    try {
      executionRun = resolveExactExecutionRun({
        taskId: body.task_id || undefined,
        sessionId: body.session_id || undefined,
        agentId: body.agent_id || undefined,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Ambiguous execution run resolution',
          message: 'Completion payload matched multiple active execution runs. Exact task/runtime correlation is required before ingesting completion.',
        },
        { status: 409 }
      );
    }

    if (!executionRun) {
      return NextResponse.json(
        {
          error: 'Execution run not found',
          message: 'No exact active execution run matched this completion payload.',
        },
        { status: 404 }
      );
    }

    const task = queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [executionRun.task_id]);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    try {
      ingestCompletionSignal({
        run: executionRun,
        rawMessage: completionMessage,
        sourceTimestamp: body.completed_at || now,
        sourceFingerprint: body.event_id || body.delivery_id || `webhook:${executionRun.id}:${now}`,
        now,
      });
    } catch (error) {
      markExecutionIngestionFailure(
        executionRun,
        error instanceof Error ? error : new Error('Unknown completion ingestion error'),
        now
      );
      throw error;
    }

    return NextResponse.json({
      success: true,
      task_id: executionRun.task_id,
      agent_id: executionRun.agent_id,
      execution_run_id: executionRun.id,
      new_status: 'testing',
      message: 'Completion ingested through exact execution run resolution',
    });
  } catch (error) {
    console.error('Agent completion webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/agent-completion
 * 
 * Returns webhook status and recent completions
 */
export async function GET() {
  try {
    const recentCompletions = queryAll(
      `SELECT e.*, a.name as agent_name, t.title as task_title
       FROM events e
       LEFT JOIN agents a ON e.agent_id = a.id
       LEFT JOIN tasks t ON e.task_id = t.id
       WHERE e.type = 'task_completed'
       ORDER BY e.created_at DESC
       LIMIT 10`
    );

    return NextResponse.json({
      status: 'active',
      recent_completions: recentCompletions,
      endpoint: '/api/webhooks/agent-completion'
    });
  } catch (error) {
    console.error('Failed to fetch completion status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status' },
      { status: 500 }
    );
  }
}
