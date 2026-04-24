# Autonomous Execution Monitoring Phase 2 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Close the remaining gap between "execution ingestion logic exists" and "La Citadel continuously and autonomously monitors active task execution without manual history inspection or ad hoc reconciliation."

**Architecture:** Keep the new `task_dispatch_runs` model as the source of truth for execution lifecycle, but add a first-class autonomous monitoring loop that continuously polls active runs, ingests runtime signals, records task-visible receipts, and escalates stalls automatically. The key change is not a new data model; it is operationalizing the existing ingestion/watchdog logic into an always-on runtime service with bounded polling, idempotent receipts, and explicit observability.

**Tech Stack:** Next.js app runtime, TypeScript, better-sqlite3, OpenClaw `chat.history`, existing `task_dispatch_runs`, `task_activities`, `task_blockers`, reconciliation/watchdog libs.

---

## Current verified gap

What is already implemented and verified:
- exact task/runtime binding via `task_dispatch_runs`
- runtime transcript retrieval via `chat.history`
- receipt ingestion and completion ingestion logic
- watchdog logic for stalled execution conditions
- tests and build passing

What is still missing operationally:
- active runs are not monitored continuously by default
- receipt ingestion currently depends on one of these happening:
  - manual history endpoint access
  - reconciliation apply run
  - another explicit invocation path
- therefore a run can remain `dispatched/pending` even though the system has enough code to ingest later

This phase must make monitoring autonomous.

---

## Success criteria

A task dispatch is only considered operationally closed out when all of these are true without operator intervention:
1. dispatch creates an execution run
2. active execution runs are polled automatically
3. `ACK_TASK` / `TASK_ACK` style responses are ingested into task receipts automatically
4. `PROGRESS_UPDATE`, `BLOCKED`, and `TASK_COMPLETE` messages are ingested automatically
5. stalled conditions create visible blocker/activity evidence automatically
6. the monitoring loop is observable and safe under repeated polling
7. the system does not require manual `/history` opening to progress receipts

---

## Design requirements

### Requirement 1: first-class autonomous poller
Add an in-process monitoring scheduler that wakes up on a configurable interval and processes active `task_dispatch_runs`.

Minimum behavior:
- list active runs
- ingest runtime signals for each run
- run execution watchdog logic
- skip completed runs
- bound work per cycle to avoid runaway load

### Requirement 2: idempotent repeated polling
The poller will hit the same run many times.

Must guarantee:
- no duplicate task receipts
- no duplicate blockers for same condition
- no repeated state churn when no new signals exist
- stable behavior if two poll cycles overlap or a manual ingestion route is used concurrently

### Requirement 3: explicit scheduler observability
Need clear runtime proof the autonomous monitor is active.

Expose at least:
- last scheduler run time
- active/pending run counts
- runs processed in last cycle
- last error if any
- scheduler enabled/disabled state

Preferably surface this in an API/status payload and/or structured logs.

### Requirement 4: bounded impact and safety
Polling must not degrade the app.

Must support config/env for:
- enable/disable autonomous monitor
- poll interval seconds
- max runs per cycle
- max transcript messages per poll if needed
- watchdog thresholds

### Requirement 5: startup and reconnect resilience
The monitor must handle:
- server restarts
- temporary OpenClaw disconnects
- no active runs
- repeated failures on one run without wedging all others

Failure on one run must not stop the whole monitoring loop.

---

## Files likely to change

### Core implementation
- Modify: `src/lib/runtime-ingestion.ts`
- Modify: `src/lib/execution-watchdog.ts`
- Modify: `src/lib/execution-runs.ts`
- Modify: `src/lib/openclaw/client.ts`
- Modify: `src/app/api/openclaw/status/route.ts`
- Modify: `src/app/api/health/readiness/route.ts`
- Modify: `src/lib/config.ts`
- Modify: `src/lib/types.ts`

### New monitoring runtime module
- Create: `src/lib/execution-monitor.ts`

### Optional API surface for diagnostics
- Create or modify: `src/app/api/reconciliation/route.ts`
- Create if needed: `src/app/api/execution/monitor/route.ts`

### Tests
- Create: `src/lib/execution-monitor.test.ts`
- Modify: `src/lib/execution-watchdog.test.ts`
- Modify: `src/lib/runtime-ingestion.test.ts`
- Possibly add: `src/app/api/openclaw/status/route.test.ts`

### Docs
- Modify: `docs/AGENT_PROTOCOL.md`
- Add/modify ops notes if needed in `PRODUCTION_SETUP.md`

---

## Phase breakdown

### Phase A: create the autonomous monitor runtime

**Objective:** Introduce a dedicated execution monitor service responsible for periodic ingestion of active runs.

**Files:**
- Create: `src/lib/execution-monitor.ts`
- Modify: `src/lib/execution-runs.ts`
- Modify: `src/lib/config.ts`
- Modify: `src/lib/types.ts`
- Test: `src/lib/execution-monitor.test.ts`

**Step 1: Write failing tests for scheduler behavior**
Test cases to add:
- starts only once per process
- no-op when disabled
- processes active runs on interval tick
- failures in one run do not stop remaining runs
- completed runs are skipped

**Step 2: Add config accessors**
In `src/lib/config.ts`, add helpers like:
- `isExecutionMonitorEnabled()`
- `getExecutionMonitorPollIntervalMs()`
- `getExecutionMonitorMaxRunsPerCycle()`

Use conservative defaults, e.g.:
- enabled: true in production by default only if desired, otherwise explicit env gate
- interval: 10000–15000 ms
- max runs: 10

**Step 3: Implement monitor singleton**
In `src/lib/execution-monitor.ts`, implement a singleton service that:
- tracks started state
- schedules recurring cycles
- prevents overlapping cycles
- stores status snapshot
- calls `listActiveExecutionRuns()` then ingests each run
- runs watchdog checks for those runs or globally as appropriate

**Step 4: Add status snapshot type**
Expose monitor status shape in `src/lib/types.ts`, e.g.:
- enabled
- running
- interval_ms
- last_started_at
- last_completed_at
- last_error
- processed_runs
- active_run_count

**Step 5: Run tests**
Run:
- `node --import tsx --test src/lib/execution-monitor.test.ts`
Expected: PASS

**Step 6: Commit**
```bash
git add src/lib/execution-monitor.ts src/lib/config.ts src/lib/types.ts src/lib/execution-runs.ts src/lib/execution-monitor.test.ts
git commit -m "feat: add autonomous execution monitor runtime"
```

---

### Phase B: integrate autonomous monitor into server startup and status surfaces

**Objective:** Make the monitor actually run in the app lifecycle and expose its health.

**Files:**
- Modify: `src/app/api/openclaw/status/route.ts`
- Modify: `src/app/api/health/readiness/route.ts`
- Modify: startup-adjacent server modules that are always loaded server-side
- Test: `src/app/api/openclaw/status/route.test.ts` if needed

**Step 1: Identify safe startup hook**
Use a server-only module that is guaranteed to initialize in runtime code paths without relying on client rendering.

Possible pattern:
- import and lazily `ensureExecutionMonitorStarted()` from a server API route or a shared server bootstrap module

Do not create duplicate intervals on every request.

**Step 2: Expose monitor health in status route**
Extend `/api/openclaw/status` to include monitor status:
- execution monitor enabled/running
- last cycle timestamps
- active run count
- last error

**Step 3: Expose readiness degradation when monitor is unhealthy**
If the monitor is enabled but repeatedly failing, `/api/health/readiness` should reflect warning/degraded context, not silent success.

**Step 4: Run tests**
Run route/unit tests relevant to status exposure.

**Step 5: Commit**
```bash
git add src/app/api/openclaw/status/route.ts src/app/api/health/readiness/route.ts
git commit -m "feat: surface execution monitor status in runtime health endpoints"
```

---

### Phase C: make polling efficient and receipt-safe

**Objective:** Ensure the autonomous loop is safe under continuous polling.

**Files:**
- Modify: `src/lib/runtime-ingestion.ts`
- Modify: `src/lib/execution-watchdog.ts`
- Modify: `src/lib/execution-runs.ts`
- Test: `src/lib/runtime-ingestion.test.ts`
- Test: `src/lib/execution-watchdog.test.ts`

**Step 1: Verify idempotency under repeated polling**
Add/extend tests proving:
- same transcript polled 10 times → one ack receipt
- same progress message polled 10 times → one progress receipt
- same completion signal polled 10 times → one completion ingestion path
- same stall condition polled repeatedly → one active blocker per condition title

**Step 2: Reduce unnecessary transcript work**
If possible, use run timestamps or stored fingerprints so each cycle avoids reprocessing the entire logical history unnecessarily.

Potential additions:
- `last_polled_at`
- `last_processed_fingerprint`
- `last_processed_signal_at`

Only add if genuinely needed; do not overbuild.

**Step 3: Make watchdog invocation coherent**
Ensure monitor cycle and watchdog logic do not double-process or create contradictory state.

Recommendation:
- in each monitor cycle: ingest first, then watchdog
- watchdog should read fresh run state after ingestion

**Step 4: Run tests**
Run:
- `node --import tsx --test src/lib/runtime-ingestion.test.ts src/lib/execution-watchdog.test.ts src/lib/execution-monitor.test.ts`
Expected: PASS

**Step 5: Commit**
```bash
git add src/lib/runtime-ingestion.ts src/lib/execution-watchdog.ts src/lib/execution-runs.ts src/lib/runtime-ingestion.test.ts src/lib/execution-watchdog.test.ts
 git commit -m "fix: harden execution polling idempotency and watchdog sequencing"
```

---

### Phase D: add operator-grade diagnostics and manual forcing path

**Objective:** Give operators explicit visibility and a safe manual override path without requiring history inspection.

**Files:**
- Create or modify: `src/app/api/execution/monitor/route.ts`
- Modify: `src/app/api/reconciliation/route.ts` if using existing surface
- Modify: `src/lib/execution-monitor.ts`

**Step 1: Add diagnostics endpoint or extend reconciliation endpoint**
Return:
- current monitor status
- active runs snapshot
- recent incidents count
- last cycle summary

**Step 2: Add safe manual trigger**
Add a route or action to force one monitor cycle immediately.
This is for ops only, not primary behavior.

**Step 3: Ensure it is side-effect safe**
Manual trigger should reuse the same code path as autonomous cycle, not a forked implementation.

**Step 4: Commit**
```bash
git add src/app/api/execution/monitor/route.ts src/lib/execution-monitor.ts
git commit -m "feat: add operator diagnostics for autonomous execution monitoring"
```

---

### Phase E: live verification sweep

**Objective:** Prove the autonomous monitor works end-to-end without manual history access.

**Files:**
- No new core files required unless test/support helpers are added
- Update docs if live behavior differs from assumptions

**Step 1: Controlled smoke task**
Create a no-op smoke task that asks the agent to emit:
- `ACK_TASK`
- `PROGRESS_UPDATE`
- `BLOCKED` or `TASK_COMPLETE`

**Step 2: Do NOT open session history manually initially**
Observe whether the autonomous monitor alone creates:
- dispatch receipt
- ack receipt
- progress receipt
- blocker or completion receipt

**Step 3: Verify execution run transitions**
Expected sequence:
- `dispatched`
- `acknowledged`
- `executing` or `blocked`
- `completed` / `ingested` when completion path is used

**Step 4: Verify watchdog behavior**
Create or simulate a run that receives no ack.
Expected:
- visible stalled receipt
- visible blocker
- no manual intervention needed

**Step 5: Verify APIs**
Check:
- `/api/openclaw/status`
- `/api/health/readiness`
- diagnostics endpoint if added
- task activities/blockers/deliverables for smoke task

**Step 6: Document results**
Record:
- files changed
- env vars added
- final verification evidence
- known residual limitations if any

**Step 7: Commit**
```bash
git add <docs-or-support-files>
git commit -m "test: verify autonomous execution monitoring end to end"
```

---

## Suggested environment variables

Add/document these in `.env.example` and runtime docs if implemented:
- `MC_EXECUTION_MONITOR_ENABLED=true`
- `MC_EXECUTION_MONITOR_POLL_INTERVAL_MS=10000`
- `MC_EXECUTION_MONITOR_MAX_RUNS_PER_CYCLE=10`
- `MC_EXECUTION_ACK_TIMEOUT_MINUTES=5`
- `MC_EXECUTION_PROGRESS_TIMEOUT_MINUTES=15`
- `MC_EXECUTION_NO_DELTA_TIMEOUT_MINUTES=30`
- `MC_EXECUTION_COMPLETION_INGESTION_TIMEOUT_MINUTES=5`

---

## Risks and tradeoffs

### Risk 1: too much transcript polling
Mitigation:
- cap runs per cycle
- skip completed runs
- prevent overlapping cycles
- use signal dedupe/fingerprints aggressively

### Risk 2: duplicate monitor startup
Mitigation:
- singleton with in-memory started/running guard
- clear status reporting

### Risk 3: false-positive watchdogs during temporary gateway issues
Mitigation:
- differentiate monitor failure vs silent run stall
- report monitor health separately from task stall incidents

### Risk 4: monitor exists but is invisible
Mitigation:
- expose monitor state in `/api/openclaw/status` and readiness/diagnostics

---

## Final acceptance checklist
- [ ] active runs are ingested automatically without manual history endpoint use
- [ ] ack/progress/completion receipts appear automatically on task
- [ ] watchdog incidents are created automatically when runs stall
- [ ] monitor status is visible via runtime APIs/logs
- [ ] repeated polling does not duplicate receipts/blockers
- [ ] build passes
- [ ] targeted tests pass
- [ ] controlled live smoke test proves autonomous behavior

---

## Copy-paste execution note for the coding agent
Implement Option A fully: operationalize the existing `task_dispatch_runs` architecture by adding a first-class autonomous execution monitor loop. Do not redesign the data model again. The missing work is continuous polling, idempotent ingestion under repeated cycles, watchdog automation, and operator-visible monitor health. The system must ingest runtime receipts automatically for active runs without requiring manual `/history` access.
