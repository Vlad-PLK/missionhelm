import { NextRequest, NextResponse } from 'next/server';
import {
  ensureExecutionMonitorStarted,
  getExecutionMonitorStatus,
  runExecutionMonitorCycle,
} from '@/lib/execution-monitor';
import { listActiveExecutionRunsWithLimit } from '@/lib/execution-runs';

export const dynamic = 'force-dynamic';

function buildActiveRunSnapshot() {
  return listActiveExecutionRunsWithLimit(25).map((run) => ({
    id: run.id,
    task_id: run.task_id,
    agent_id: run.agent_id,
    dispatch_status: run.dispatch_status,
    execution_state: run.execution_state,
    ingestion_status: run.ingestion_status,
    last_runtime_signal_at: run.last_runtime_signal_at ?? null,
    last_runtime_signal_type: run.last_runtime_signal_type ?? null,
    created_at: run.created_at,
    updated_at: run.updated_at,
  }));
}

export async function GET() {
  ensureExecutionMonitorStarted();

  return NextResponse.json({
    execution_monitor: getExecutionMonitorStatus(),
    active_runs: buildActiveRunSnapshot(),
  });
}

export async function POST(request: NextRequest) {
  try {
    let force = true;
    const rawBody = await request.text();

    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as { force?: boolean };
        if (typeof parsed.force === 'boolean') {
          force = parsed.force;
        }
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }

    const cycle = await runExecutionMonitorCycle({
      reason: 'manual',
      force,
    });

    return NextResponse.json({
      execution_monitor: getExecutionMonitorStatus(),
      cycle,
      active_runs: buildActiveRunSnapshot(),
    });
  } catch (error) {
    console.error('Failed to run execution monitor cycle:', error);
    return NextResponse.json(
      { error: 'Failed to run execution monitor cycle' },
      { status: 500 }
    );
  }
}
