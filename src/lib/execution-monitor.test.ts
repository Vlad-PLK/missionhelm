import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionMonitor } from './execution-monitor';
import type { TaskDispatchRun } from './types';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function buildRun(id: string, executionState: TaskDispatchRun['execution_state'] = 'dispatched'): TaskDispatchRun {
  return {
    id,
    task_id: `task-${id}`,
    agent_id: `agent-${id}`,
    openclaw_session_id: `session-${id}`,
    session_key: `agent:main:session-${id}`,
    dispatch_attempt: 1,
    dispatch_status: 'sent',
    execution_state: executionState,
    ingestion_status: 'pending',
    created_at: '2026-04-24T00:00:00.000Z',
    updated_at: '2026-04-24T00:00:00.000Z',
  };
}

test('execution monitor starts only once per process', async () => {
  const scheduledCallbacks: Array<() => void> = [];

  const monitor = createExecutionMonitor({
    isEnabled: () => true,
    getIntervalMs: () => 50,
    getMaxRunsPerCycle: () => 10,
    countActiveRuns: () => 0,
    listActiveRuns: () => [],
    ingestRun: async () => ({ run: buildRun('noop'), signals: [] }),
    runWatchdog: async () => [],
    schedule: (callback) => {
      scheduledCallbacks.push(callback);
      return scheduledCallbacks.length as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: () => undefined,
    now: () => '2026-04-24T00:00:00.000Z',
    onError: () => undefined,
  });

  monitor.start();
  monitor.start();
  await flushMicrotasks();

  assert.equal(scheduledCallbacks.length, 1);
  assert.equal(monitor.getStatus().started, true);
});

test('execution monitor is a no-op when disabled', async () => {
  let scheduledCount = 0;

  const monitor = createExecutionMonitor({
    isEnabled: () => false,
    countActiveRuns: () => 2,
    listActiveRuns: () => [buildRun('a'), buildRun('b')],
    schedule: () => {
      scheduledCount += 1;
      return scheduledCount as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: () => undefined,
    now: () => '2026-04-24T00:00:00.000Z',
    onError: () => undefined,
  });

  const status = monitor.start();
  const summary = await monitor.runCycle({ reason: 'manual' });

  assert.equal(status.started, false);
  assert.equal(status.enabled, false);
  assert.equal(summary.processed_run_count, 0);
  assert.equal(scheduledCount, 0);
});

test('execution monitor processes active runs on interval tick', async () => {
  const scheduledCallbacks: Array<() => void> = [];
  const ingestedRuns: string[] = [];

  const monitor = createExecutionMonitor({
    isEnabled: () => true,
    getIntervalMs: () => 50,
    getMaxRunsPerCycle: () => 10,
    countActiveRuns: () => 1,
    listActiveRuns: () => [buildRun('run-1')],
    ingestRun: async ({ run }) => {
      const runRecord = typeof run === 'string' ? buildRun(run) : run;
      ingestedRuns.push(runRecord.id);
      return { run: runRecord, signals: [] };
    },
    runWatchdog: async () => [],
    schedule: (callback) => {
      scheduledCallbacks.push(callback);
      return scheduledCallbacks.length as unknown as ReturnType<typeof setTimeout>;
    },
    cancel: () => undefined,
    now: () => '2026-04-24T00:00:00.000Z',
    onError: () => undefined,
  });

  monitor.start();
  await flushMicrotasks();
  assert.deepEqual(ingestedRuns, ['run-1']);

  assert.equal(scheduledCallbacks.length, 1);
  scheduledCallbacks[0]();
  await flushMicrotasks();

  assert.deepEqual(ingestedRuns, ['run-1', 'run-1']);
});

test('execution monitor failures on one run do not stop remaining runs', async () => {
  const attemptedRuns: string[] = [];

  const monitor = createExecutionMonitor({
    isEnabled: () => true,
    countActiveRuns: () => 2,
    listActiveRuns: () => [buildRun('run-a'), buildRun('run-b')],
    ingestRun: async ({ run }) => {
      const runRecord = typeof run === 'string' ? buildRun(run) : run;
      attemptedRuns.push(runRecord.id);
      if (runRecord.id === 'run-a') {
        throw new Error('run-a failed');
      }
      return { run: runRecord, signals: [] };
    },
    runWatchdog: async () => [],
    schedule: () => 1 as unknown as ReturnType<typeof setTimeout>,
    cancel: () => undefined,
    now: () => '2026-04-24T00:00:00.000Z',
    onError: () => undefined,
  });

  const summary = await monitor.runCycle({ reason: 'manual', force: true });

  assert.deepEqual(attemptedRuns, ['run-a', 'run-b']);
  assert.deepEqual(summary.processed_run_ids, ['run-b']);
  assert.equal(summary.run_errors.length, 1);
  assert.equal(summary.run_errors[0].run_id, 'run-a');
});

test('execution monitor skips completed runs defensively', async () => {
  const ingestedRuns: string[] = [];

  const monitor = createExecutionMonitor({
    isEnabled: () => true,
    countActiveRuns: () => 2,
    listActiveRuns: () => [buildRun('run-complete', 'completed'), buildRun('run-active', 'executing')],
    ingestRun: async ({ run }) => {
      const runRecord = typeof run === 'string' ? buildRun(run) : run;
      ingestedRuns.push(runRecord.id);
      return { run: runRecord, signals: [] };
    },
    runWatchdog: async () => [],
    schedule: () => 1 as unknown as ReturnType<typeof setTimeout>,
    cancel: () => undefined,
    now: () => '2026-04-24T00:00:00.000Z',
    onError: () => undefined,
  });

  const summary = await monitor.runCycle({ reason: 'manual', force: true });

  assert.deepEqual(ingestedRuns, ['run-active']);
  assert.deepEqual(summary.processed_run_ids, ['run-active']);
});
