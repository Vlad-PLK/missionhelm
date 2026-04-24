import { ensureExecutionMonitorStarted } from '@/lib/execution-monitor';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    ensureExecutionMonitorStarted();
  }
}
