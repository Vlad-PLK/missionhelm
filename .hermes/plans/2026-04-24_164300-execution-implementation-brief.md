# La Citadel execution monitoring + post-execution implementation brief

> Audience: coding agent executing the full repair.
> Role context: Hermès is the orchestrator/master. Your job is implementation only.

## Mission
Repair the execution-observability layer in La Citadel so that task execution, monitoring, and post-execution ingestion become reliable and audit-ready.

## Problem statement
La Citadel can currently:
- create tasks
- assign tasks
- dispatch tasks to agents
- sometimes begin execution

But it cannot reliably:
- prove that a specific task was acknowledged
- prove that execution actually started
- detect stalled execution early
- bind runtime execution to the exact task
- ingest completion into structured task receipts
- guarantee that post-execution evidence lands in Activity / Deliverables / lifecycle state

## Highest-priority goals
1. Build exact task-to-runtime binding
2. Build runtime execution signal ingestion
3. Build structured task receipts from runtime evidence
4. Harden completion handling so completion becomes visible task truth
5. Add execution-stall detection and reconciliation

## Non-negotiable requirements
- Do not rely on “latest active task for an agent” for completion attribution
- Do not treat `chat.send` as proof of execution
- Do not move task lifecycle forward without evidence
- Preserve backward compatibility where possible
- Keep changes minimal, reversible, and operationally observable

## Confirmed live gaps
1. `openclaw_sessions.task_id` exists in schema but is never populated
2. completion webhook resolves task by latest active task for agent
3. `/api/openclaw/sessions/[id]/history` is broken live because gateway method `sessions.history` is unsupported
4. dispatch sets task `in_progress` immediately after `chat.send`
5. completion webhook writes `events` but not rich task receipts
6. reconciliation lacks execution-stall rules

## Required architectural outcome
Implement a separate execution-tracking layer in addition to task lifecycle.

Task lifecycle can remain:
- planning -> inbox -> assigned -> in_progress -> testing -> review -> done

But execution lifecycle must become explicit, either through `openclaw_sessions` extensions or a new table.

Suggested execution states:
- queued
- dispatched
- acknowledged
- executing
- blocked
- stalled
- completed
- ingestion_failed

## Preferred implementation direction
### Option A: dedicated execution-run table (recommended)
Create a new table such as `task_dispatch_runs` with fields like:
- `id`
- `task_id`
- `agent_id`
- `openclaw_session_id`
- `dispatch_attempt`
- `dispatch_status`
- `execution_state`
- `acknowledged_at`
- `execution_started_at`
- `last_progress_at`
- `completed_at`
- `ingestion_status`
- `source_summary`
- `source_metadata`
- `created_at`
- `updated_at`

Why this is preferred:
- supports retries/redispatch cleanly
- keeps task lifecycle separate from runtime lifecycle
- prevents ambiguity when one agent touches multiple tasks

### Option B: extend `openclaw_sessions`
Less ideal, but acceptable if done carefully.
Must at minimum add/use:
- `task_id`
- `execution_state`
- `last_runtime_signal_at`
- `last_runtime_signal_type`
- `completed_at`
- `ingestion_status`

## Required runtime receipts
The system must be able to generate these task-visible receipts:
1. `dispatch_sent`
2. `ack_received`
3. `execution_started`
4. `progress_seen`
5. `blocker_seen`
6. `completion_seen`
7. `completion_ingested`
8. `stalled_execution_detected`

These should land in `task_activities` with structured metadata.

## Required post-execution outcome
When a task completes, La Citadel must atomically do all of the following:
1. resolve the exact task from execution record
2. write a completion activity receipt to `task_activities`
3. persist summary + evidence source metadata
4. register deliverables if present or infer absence explicitly
5. move task to `testing` only after receipt creation succeeds
6. reset agent state using canonical status values only
7. mark execution record as completed and ingested

## Monitoring requirements
Implement watchdog detection for:
- dispatched but no ack after threshold
- ack but no execution signal after threshold
- in_progress task with no activity/blocker/deliverable delta after threshold
- runtime session shows recent updates but task has no corresponding receipts
- completion-like runtime signal without successful ingestion

These conditions must create visible task/blocker/activity evidence.

## Required file targets
Core files likely to change:
- `src/app/api/tasks/[id]/dispatch/route.ts`
- `src/app/api/webhooks/agent-completion/route.ts`
- `src/app/api/openclaw/sessions/[id]/history/route.ts`
- `src/app/api/openclaw/sessions/[id]/route.ts`
- `src/app/api/openclaw/status/route.ts`
- `src/app/api/tasks/[id]/activities/route.ts`
- `src/app/api/tasks/[id]/deliverables/route.ts`
- `src/app/api/tasks/[id]/route.ts`
- `src/lib/openclaw/client.ts`
- `src/lib/reconciliation.ts`
- `src/lib/types.ts`
- `src/lib/db/schema.ts`
- `src/lib/db/migrations.ts`

Possible new files:
- `src/lib/execution-runs.ts`
- `src/lib/runtime-ingestion.ts`
- `src/lib/execution-watchdog.ts`
- `src/app/api/execution/...` routes if needed

## Hard constraints for implementation
- Keep status vocabulary canonical: `standby | working | offline`
- Do not keep writing `idle`
- Avoid direct DB writes outside API/runtime layers unless part of migrations/reconciliation utilities
- Do not silently swallow runtime ingestion failures; record them visibly
- Prefer task-centric APIs and receipts over agent-centric inference

## Acceptance tests
Implementation is not complete until these pass:

### Test 1: dispatch evidence
Given a task is dispatched,
when dispatch succeeds,
then a task-linked execution record exists,
and task activity shows dispatch receipt,
and task is not falsely considered fully executing without additional evidence.

### Test 2: ack evidence
Given an agent acknowledges a dispatched task,
then La Citadel records `ack_received` against that exact task.

### Test 3: execution evidence
Given runtime emits tool/progress evidence,
then La Citadel records `execution_started` or `progress_seen` against that exact task.

### Test 4: completion evidence
Given runtime emits completion,
then the exact task receives:
- completion activity
- structured metadata
- proper lifecycle move to `testing`
- canonical agent state reset

### Test 5: ambiguity prevention
Given one agent has multiple historical tasks,
completion must still resolve to the exact active dispatch run, never latest task guesswork.

### Test 6: stale execution detection
Given dispatch occurs and no ack/progress arrives within threshold,
then La Citadel creates visible stalled/blocker evidence.

## Deliverables expected from coding agent
1. code changes
2. migration(s)
3. runtime verification steps
4. evidence of exact files changed
5. explicit list of backward-compat assumptions
6. rollback notes

## Definition of done
Done means:
- exact task/runtime binding exists
- runtime signals are ingested into task receipts
- completion produces task-visible evidence
- stale execution is auto-detected
- live verification passes
- no silent execution ambiguity remains in the critical path
