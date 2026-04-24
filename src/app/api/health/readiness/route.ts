import { NextResponse } from 'next/server';
import { getDbStartupStatus } from '@/lib/db';
import { APP_DISPLAY_NAME } from '@/lib/branding';
import { ensureExecutionMonitorStarted, getExecutionMonitorStatus } from '@/lib/execution-monitor';

export const dynamic = 'force-dynamic';

export async function GET() {
  ensureExecutionMonitorStarted();
  const status = getDbStartupStatus();
  const executionMonitor = getExecutionMonitorStatus();
  const monitorDegraded = executionMonitor.enabled && (!executionMonitor.started || executionMonitor.last_error !== null);
  const httpStatus = status.ready ? 200 : 503;
  const warnings = monitorDegraded
    ? [
        executionMonitor.started
          ? `Execution monitor is enabled but degraded: ${executionMonitor.last_error ?? 'last cycle did not complete cleanly'}`
          : 'Execution monitor is enabled but not started in this process.',
      ]
    : [];

  return NextResponse.json(
    {
      ready: status.ready,
      degraded: monitorDegraded,
      databasePath: status.databasePath,
      initializedAt: status.initializedAt,
      isNewDatabase: status.isNewDatabase,
      migration: status.migration,
      preflight: status.preflight,
      execution_monitor: executionMonitor,
      warnings,
      actions: status.ready
        ? warnings.length > 0
          ? [
              'Inspect /api/openclaw/status or /api/execution/monitor for execution monitor health.',
              'Check OpenClaw connectivity if monitor errors persist.',
            ]
          : []
        : [
            'Inspect the preflight receipt for missing tables or columns.',
            'Fix any filesystem or SQLite permission issues blocking additive repair.',
            `Restart ${APP_DISPLAY_NAME} after the database is writable again.`,
          ],
    },
    { status: httpStatus }
  );
}
