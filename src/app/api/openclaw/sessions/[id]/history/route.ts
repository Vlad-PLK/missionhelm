import { NextResponse } from 'next/server';
import { getOpenClawClient } from '@/lib/openclaw/client';
import { queryOne } from '@/lib/db';
import type { Agent, OpenClawSession } from '@/lib/types';
import { getExecutionRunForSession } from '@/lib/execution-runs';
import { getRuntimeTranscriptForSession, ingestRuntimeSignalsForRun } from '@/lib/runtime-ingestion';

export const dynamic = 'force-dynamic';
interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/openclaw/sessions/[id]/history - Get conversation history
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const client = getOpenClawClient();
    const session = queryOne<OpenClawSession>(
      `SELECT *
       FROM openclaw_sessions
       WHERE openclaw_session_id = ?
          OR id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [id, id]
    );

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch {
        return NextResponse.json(
          { error: 'Failed to connect to OpenClaw Gateway' },
          { status: 503 }
        );
      }
    }

    const agent = queryOne<Pick<Agent, 'session_key_prefix'>>(
      'SELECT session_key_prefix FROM agents WHERE id = ?',
      [session.agent_id]
    );
    const sessionKey = agent?.session_key_prefix
      ? `${agent.session_key_prefix}${session.openclaw_session_id}`
      : `agent:main:${session.openclaw_session_id}`;

    const executionRun = getExecutionRunForSession(session.openclaw_session_id);
    const transcript = await getRuntimeTranscriptForSession(sessionKey, client);
    const filteredTranscript = executionRun
      ? transcript.filter((message) => {
          if (!message.sourceTimestamp) {
            return false;
          }

          return Date.parse(message.sourceTimestamp) >= Date.parse(executionRun.created_at);
        })
      : transcript;
    const ingestion = executionRun
      ? await ingestRuntimeSignalsForRun({ run: executionRun, client })
      : null;

    return NextResponse.json({
      session_id: session.openclaw_session_id,
      session_key: sessionKey,
      history: filteredTranscript,
      execution_run_id: executionRun?.id ?? null,
      normalized_signals: ingestion?.signals ?? [],
    });
  } catch (error) {
    console.error('Failed to get OpenClaw session history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
