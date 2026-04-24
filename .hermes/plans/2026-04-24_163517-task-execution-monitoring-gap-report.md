# La Citadel task execution + monitoring gap report

> For Hermès / coding agents: focus implementation on execution observability and post-execution ingestion before broader workflow cleanup.

## Goal
Pinpoint the real gaps causing task completion failures in La Citadel, with priority on:
1. task execution monitoring
2. post-execution response/completion ingestion

## Scope of this report
Grounded against live runtime and current code paths:
- `src/app/api/tasks/[id]/dispatch/route.ts`
- `src/app/api/webhooks/agent-completion/route.ts`
- `src/app/api/tasks/[id]/route.ts`
- `src/app/api/tasks/[id]/activities/route.ts`
- `src/app/api/tasks/[id]/deliverables/route.ts`
- `src/app/api/openclaw/sessions/[id]/route.ts`
- `src/app/api/openclaw/sessions/[id]/history/route.ts`
- `src/lib/openclaw/client.ts`
- `src/lib/reconciliation.ts`
- `src/lib/orchestration.ts`
- runtime DB snapshot from container `/app/data/mission-control.db`

## Executive summary
La Citadel is currently good at sending work to agents, but weak at proving that work actually started, progressed, or finished for a specific task.

Main diagnosis:
- dispatch is treated as execution too early
- execution monitoring relies on weak/partial runtime signals
- completion ingestion is optional and ambiguous
- task/session binding is not first-class
- post-execution receipts (activity, deliverables, status transition) are not automatically enforced from runtime evidence

This creates the current symptom cluster:
- tasks enter `in_progress` quickly
- agents can acknowledge work
- real execution may or may not happen
- monitoring cannot reliably distinguish ack vs work vs completion
- post-execution reporting is inconsistent or absent
- review/done quality drifts from reality

## Live/runtime evidence collected

### 1) History API is broken for monitoring
Live call result:
- `GET /api/openclaw/sessions/{id}/history` returns 500

Container log evidence:
- `Failed to get OpenClaw session history: Error: unknown method: sessions.history`

Code evidence:
- `src/lib/openclaw/client.ts:464-466`
  - `getSessionHistory()` calls unsupported RPC method `sessions.history`
- `src/app/api/openclaw/sessions/[id]/history/route.ts:26`
  - directly depends on that method

Operational consequence:
- the intended runtime transcript inspection path is non-functional
- monitoring cannot rely on first-class session history via La Citadel API

### 2) Sessions are not bound to tasks
Runtime DB evidence:
- `openclaw_sessions` rows total: 14
- `openclaw_sessions` rows with `task_id IS NOT NULL`: 0

Schema evidence:
- `src/lib/db/schema.ts:145-156`
  - `openclaw_sessions.task_id` exists in schema

Dispatch code evidence:
- `src/app/api/tasks/[id]/dispatch/route.ts:111-115`
  - inserts `openclaw_sessions` without `task_id`

Operational consequence:
- runtime sessions exist only as agent sessions, not task execution records
- post-execution correlation must guess which task a session belongs to
- this is a foundational cause of completion ambiguity

### 3) Completion webhook resolves by “latest active task for agent”
Code evidence:
- `src/app/api/webhooks/agent-completion/route.ts:147-157`
  - finds task via `assigned_agent_id = ? and status in ('assigned','in_progress') order by updated_at desc limit 1`

Operational consequence:
- completion attribution is agent-centric, not dispatch-attempt-centric
- if an agent has more than one active/recent task, completion can land on the wrong task
- redispatch churn increases this risk

### 4) Dispatch marks execution as live before proof exists
Code evidence:
- `src/app/api/tasks/[id]/dispatch/route.ts:154-195`
  - `chat.send`
  - task -> `in_progress`
  - agent -> `working`
  - logs dispatch activity immediately

Operational consequence:
- system records execution as active based on message send, not execution evidence
- ack-only behavior appears as real work
- dashboards and operators see false progress

### 5) Auto-dispatch has no closed-loop confirmation
Code evidence:
- `src/app/api/tasks/[id]/route.ts:398-407`
  - fire-and-forget fetch to `/api/tasks/{id}/dispatch`
  - async error only logged server-side

Operational consequence:
- assignment/status transitions can succeed while actual dispatch fails silently
- no mandatory follow-up status correction or blocker creation

### 6) Completion webhook moves task to testing but does not produce rich task receipts
Code evidence:
- `src/app/api/webhooks/agent-completion/route.ts`
  - updates task to `testing`
  - writes `events` row
  - resets agent status to `standby`
  - does NOT create task deliverables
  - does NOT create task completion activity in `task_activities`
  - does NOT capture structured completion metadata on task

Operational consequence:
- even when completion webhook fires, the task may still lack visible proof in task tabs
- closure remains weak and hard to audit

### 7) Runtime monitoring surface is too thin
Live status evidence for active mc-code-lead session:
- OpenClaw status shows session snapshot with fields like:
  - `sessionId`
  - `updatedAt`
  - `inputTokens`
  - `outputTokens`
- example: `outputTokens` remained very low for a supposedly executing task

Code evidence:
- `src/app/api/openclaw/status/route.ts`
  - only lists sessions
  - no task-aware execution view
  - no classification of ack / active work / stalled / completed

Operational consequence:
- monitoring has only coarse session metadata
- there is no first-class execution heartbeat model
- operators must manually infer meaning from token counters and timestamps

### 8) Reconciliation does not cover execution-stall detection
Code evidence:
- `src/lib/reconciliation.ts`
  - rules only cover:
    - agent working without active assignment
    - stale planning without session/messages
    - dispatchable task without assignee
- there is no rule for:
  - dispatched but no ack
  - ack but no progress
  - in_progress without task activity for threshold
  - completion-like runtime state without La Citadel receipts

Operational consequence:
- execution stalls are not first-class reconciled incidents
- manual operator intervention is required

### 9) Session control semantics have drift
Code evidence:
- canonical agent statuses are `standby | working | offline` in `src/lib/types.ts`
- `src/app/api/openclaw/sessions/[id]/route.ts:137-145` and `:193-196`
  - write agent status `idle`

Operational consequence:
- session cleanup can write a non-canonical agent status
- monitoring, filters, and automation can drift from actual intended agent state model

### 10) Existing webhook/hook concepts are not real execution bridges
Code evidence:
- `src/app/api/tasks/[id]/hooks/route.ts`
  - only stores webhook registration metadata in task activities
  - does not deliver outbound webhook calls
  - no retry queue, no worker, no dispatch engine
- `src/lib/orchestration.ts`
  - helper methods exist but depend on callers voluntarily using them

Operational consequence:
- the system has instructions and helper utilities, but not an enforced runtime bridge
- reporting remains best-effort rather than guaranteed

## Current state machine (actual behavior)

### Dispatch phase
1. task assigned
2. `/api/tasks/{id}` may auto-trigger dispatch asynchronously
3. `/api/tasks/{id}/dispatch` sends prompt via `chat.send`
4. task immediately becomes `in_progress`
5. agent immediately becomes `working`
6. activity immediately logs “dispatched / now working”

Weakness:
- no distinction between “message sent” and “agent genuinely executing”

### Execution phase
What the system expects:
- agent posts `PROGRESS_UPDATE`
- agent posts task activity/deliverables directly
- agent eventually sends `TASK_COMPLETE`

What the system actually guarantees:
- none of the above
- only prompt instructions and helper functions exist
- no strong ingestion loop from runtime session to task receipts

### Completion phase
1. if webhook called correctly, task may move to `testing`
2. event row is written
3. agent moves back to `standby`

Weakness:
- no guaranteed task activity receipt
- no guaranteed deliverables
- no guaranteed task/session correlation
- no guaranteed review-ready evidence bundle

## Priority gaps for coding-agent implementation

### P0 — Build a real execution state model
Needed states or equivalent receipt semantics:
- `dispatched` = chat.send accepted
- `acknowledged` = agent explicitly accepted task / first assistant response seen
- `executing` = tool call or progress evidence observed
- `stalled` = no progress within threshold
- `completed_pending_ingestion` = runtime says complete but task receipts not yet materialized

Reason:
Current `in_progress` is overloaded and begins too early.

### P0 — Task/session binding must become exact
Required change:
- every dispatch attempt must create or update a task-linked execution record
- `openclaw_sessions.task_id` must be populated, or a dedicated `task_dispatch_runs` table should be introduced
- completion and monitoring must resolve by dispatch run / task binding, never by “latest task for agent”

Reason:
Without exact binding, all downstream monitoring and completion logic is unreliable.

### P0 — Replace prompt-only reporting with runtime ingestion
Needed mechanism:
- ingest session signals into La Citadel automatically
- minimally: first ack, tool-call seen, blocker-like message, completion-like message
- if transcript API is unavailable, use the proven fallback path: session jsonl inspection or another supported gateway method

Reason:
The system must observe work, not merely request that agents self-report it.

### P1 — Completion webhook must materialize task receipts
Required on completion ingestion:
- create `task_activities` completion receipt
- attach structured metadata (session id, summary, evidence source, timestamps)
- optionally create inferred deliverables if reported in payload
- move to `testing` only after receipt creation succeeds

Reason:
Completion should become visible evidence on the task, not only an event row.

### P1 — Add execution watchdogs and stale-task reconciliation
Required detectors:
- dispatched but no ack after N seconds
- ack but no execution signal after N minutes
- in_progress with no activity/deliverable/blocker delta after threshold
- session updated recently but task not updated recently
- completion-like runtime state without task receipt ingestion

Reason:
Operators need automatic surfacing of silent failure modes.

### P1 — Normalize agent/session status semantics
Required fix:
- remove `idle` writes from session routes or map them to `standby`
- ensure all UI filters, reconciliation, and APIs use one status vocabulary

Reason:
State drift at the agent layer weakens monitoring accuracy.

## Recommended target architecture

### A. Introduce an execution-run record
Option A1: extend `openclaw_sessions`
- populate `task_id`
- add fields like:
  - `dispatch_attempt_id`
  - `last_runtime_signal_at`
  - `last_runtime_signal_type`
  - `execution_state`

Option A2: add dedicated table `task_dispatch_runs`
Suggested fields:
- `id`
- `task_id`
- `agent_id`
- `openclaw_session_id`
- `dispatch_status`
- `acknowledged_at`
- `execution_started_at`
- `last_progress_at`
- `completed_at`
- `ingestion_status`
- `source_summary`
- `source_metadata`

Recommendation:
Use a dedicated dispatch-run table if multiple attempts/retries matter operationally.

### B. Separate task lifecycle from execution lifecycle
Task lifecycle remains:
- planning -> inbox -> assigned -> in_progress -> testing -> review -> done

Execution lifecycle should be tracked separately:
- queued
- dispatched
- acknowledged
- executing
- blocked
- stalled
- completed
- ingestion_failed

Reason:
A single task status cannot accurately represent dispatch/runtime/receipt ingestion.

### C. Create a runtime-to-task receipt ingestor
Responsibilities:
- watch runtime session signal source
- derive canonical receipt types:
  - dispatch_sent
  - ack_received
  - progress_seen
  - blocker_seen
  - tool_execution_seen
  - completion_seen
- upsert them into `task_activities`
- advance execution state safely
- escalate on gaps

### D. Make completion ingestion transactional
Completion path should only succeed if it can atomically:
1. resolve exact task/run
2. write completion activity
3. write or validate deliverable data if present
4. advance task status appropriately
5. reset agent state
6. stamp run/session completion metadata

## Concrete implementation backlog for coding agents

### Workstream 1: execution observability foundation
Files likely touched:
- `src/app/api/tasks/[id]/dispatch/route.ts`
- `src/lib/db/schema.ts`
- `src/lib/db/migrations.ts`
- `src/lib/types.ts`
- possibly new `src/lib/execution-runs.ts`

Deliverables:
- exact task/session binding
- execution-run persistence
- dispatch no longer equals full execution proof

### Workstream 2: runtime signal ingestion
Files likely touched:
- `src/lib/openclaw/client.ts`
- `src/app/api/openclaw/sessions/[id]/history/route.ts`
- new ingestion service/module
- possibly fallback reader for session transcript files if gateway method unsupported

Deliverables:
- supported session history or transcript ingestion path
- normalized runtime signal extraction
- ack/progress/completion evidence surfaced to tasks

### Workstream 3: completion bridge hardening
Files likely touched:
- `src/app/api/webhooks/agent-completion/route.ts`
- `src/app/api/tasks/[id]/activities/route.ts`
- `src/app/api/tasks/[id]/deliverables/route.ts`

Deliverables:
- task-centric completion ingestion
- rich completion receipts in activity feed
- optional deliverable extraction/registration

### Workstream 4: watchdog + reconciliation
Files likely touched:
- `src/lib/reconciliation.ts`
- `src/app/api/reconciliation/route.ts`
- monitoring dashboard surfaces if needed

Deliverables:
- stalled execution rules
- explicit blocker/staleness receipts
- reduced silent stagnation

## Acceptance criteria for the fix
A coding task is considered observably healthy only if all are true:
1. dispatch attempt is persisted and linked to exact task
2. agent ack is visible as structured task evidence
3. at least one execution/progress signal is visible or a blocker is visible
4. completion is ingested into `task_activities`
5. deliverables are registered or explicit “no deliverable” policy is recorded
6. task status transitions are downstream of evidence, not just chat.send
7. stale executions auto-surface as blockers or reconciliation findings

## Non-goals for the first implementation wave
- redesigning all planning flows
- broad UI polish
- full review-gate overhaul beyond execution evidence integrity
- perfect transcript semantic parsing from day one

## Immediate recommendation to implementation agents
Start with these exact order-of-operations priorities:
1. fix task/session binding
2. fix runtime history/signal ingestion path
3. create execution-state receipts (`ack`, `progress`, `completion`)
4. harden completion webhook to write task evidence, not only events
5. add stale execution detectors

This order gives the highest operational leverage and directly addresses the current mission-critical gaps: task execution and responses.
