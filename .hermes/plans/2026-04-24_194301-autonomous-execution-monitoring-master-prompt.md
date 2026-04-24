# Coding Agent Master Prompt — Autonomous Execution Monitoring Phase 2

You are implementing the final missing layer in La Citadel’s execution-monitoring system.

Context
- The previous phase already introduced:
  - `task_dispatch_runs`
  - runtime ingestion via `chat.history`
  - task-visible receipts
  - hardened completion ingestion by exact execution run
  - watchdog logic for stall conditions
- Build passes, targeted tests pass, and the live container has been redeployed successfully.
- The remaining operational gap is that monitoring is not yet truly autonomous.

Mission
Finish the coding session by making La Citadel continuously and autonomously monitor active execution runs without requiring manual session-history inspection or ad hoc reconciliation to materialize receipts.

Primary objective
Close the gap between:
- “ingestion/watchdog logic exists”
and
- “active runs are monitored automatically in production and task receipts appear on their own.”

What is still not fully solved
1. Active execution runs are not continuously polled by default.
2. Receipt ingestion currently depends on a trigger such as manual `/api/openclaw/sessions/[id]/history` access or reconciliation execution.
3. Therefore a run can remain `dispatched/pending` even when the system already has enough code to ingest new runtime signals later.
4. The system needs a deep and autonomous monitoring loop with health visibility.

You must implement Option A
- Keep the `task_dispatch_runs` architecture.
- Do NOT redesign the persistence model again.
- Add a first-class autonomous monitoring loop around it.

Required outcome
The system must automatically:
1. poll active `task_dispatch_runs`
2. ingest `ACK_TASK` / `TASK_ACK` / `ACKNOWLEDGED` / `ACK:` signals
3. ingest `PROGRESS_UPDATE`, `BLOCKED`, and `TASK_COMPLETE`
4. write task-visible receipts without manual operator prompting
5. create watchdog blocker/activity evidence when runs stall
6. expose monitor health/status in an operator-visible API surface

Files likely to change
- `src/lib/execution-monitor.ts` (new)
- `src/lib/runtime-ingestion.ts`
- `src/lib/execution-watchdog.ts`
- `src/lib/execution-runs.ts`
- `src/lib/config.ts`
- `src/lib/types.ts`
- `src/app/api/openclaw/status/route.ts`
- `src/app/api/health/readiness/route.ts`
- optionally `src/app/api/execution/monitor/route.ts`
- tests around the above

Implementation requirements
- Use a singleton/autonomous scheduler for active runs
- Prevent overlapping cycles
- Make it configurable by env
- Make repeated polling idempotent
- Do not duplicate blockers/receipts
- Fail one run safely without killing the whole loop
- Surface monitor health and last error
- Keep canonical agent states only: `standby | working | offline`

Suggested env vars
- `MC_EXECUTION_MONITOR_ENABLED`
- `MC_EXECUTION_MONITOR_POLL_INTERVAL_MS`
- `MC_EXECUTION_MONITOR_MAX_RUNS_PER_CYCLE`
- existing watchdog threshold envs as already implemented

Acceptance criteria
1. Dispatch a smoke task
2. Without manually opening `/history`, the task should automatically receive:
   - dispatch receipt
   - ack receipt
   - progress/blocker/completion receipt as applicable
3. A silent task must automatically get stalled/blocker evidence after thresholds
4. `/api/openclaw/status` and/or another diagnostics surface must show monitor state
5. Repeated monitor cycles must not create duplicate evidence
6. Build and tests must pass
7. Live verification must prove autonomous behavior

Execution discipline
- Work in small commits
- Add/extend tests before relying on behavior claims
- Verify live runtime after implementation
- Report blockers explicitly
- Do not broaden scope into unrelated UI or rebrand work

Final deliverables expected from you
1. files changed
2. tests run and results
3. live runtime verification results
4. any env vars added/changed
5. rollback notes
6. explicit statement confirming that active execution monitoring is now autonomous
