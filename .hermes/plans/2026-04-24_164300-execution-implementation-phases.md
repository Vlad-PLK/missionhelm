# La Citadel execution-repair implementation phases

> This is the phased handoff for the coding agent.
> Execute in order. Do not skip phase gates.

## Phase 0 — Baseline + protection
Goal:
Establish a safe baseline before modifying execution logic.

Tasks:
1. Read current execution paths:
   - `src/app/api/tasks/[id]/dispatch/route.ts`
   - `src/app/api/webhooks/agent-completion/route.ts`
   - `src/lib/openclaw/client.ts`
   - `src/lib/reconciliation.ts`
2. Verify live limitations:
   - history endpoint failure
   - missing task-linked session records
3. Write migration/backward-compat plan
4. Preserve rollback notes for all schema/runtime changes

Phase gate:
- implementation note explaining chosen persistence model (`task_dispatch_runs` recommended)

## Phase 1 — Exact task execution binding
Goal:
Make every dispatch belong to an exact task/run.

Tasks:
1. Add persistence model:
   - preferred: new `task_dispatch_runs` table
   - acceptable fallback: extend `openclaw_sessions` with task-centric fields and actually populate them
2. Update dispatch route to create a task-linked execution record
3. Record dispatch attempt ids and timestamps
4. Ensure redispatch creates a new attempt or clearly versioned run record

Required result:
- after dispatch, there is a durable exact link between task, agent, and runtime session

Phase gate:
- verified DB/API evidence that a dispatched task can be traced to one exact runtime record

## Phase 2 — Runtime signal ingestion path
Goal:
Create a working runtime evidence ingestion mechanism.

Tasks:
1. Replace or bypass unsupported `sessions.history` path
2. Implement a supported way to inspect runtime evidence
   - gateway-supported method if available
   - otherwise transcript/jsonl fallback already proven operationally
3. Normalize runtime signals into categories:
   - ack
   - tool execution
   - progress
   - blocker
   - completion
4. Store normalized signal metadata on execution record

Required result:
- La Citadel can observe task execution without depending only on agent self-report API discipline

Phase gate:
- for a live dispatched task, system can detect at least ack/progress/completion class signals

## Phase 3 — Task-visible execution receipts
Goal:
Translate runtime evidence into visible task truth.

Tasks:
1. Write `task_activities` receipts for:
   - dispatch_sent
   - ack_received
   - execution_started
   - progress_seen
   - blocker_seen
   - completion_seen
2. Include structured metadata:
   - task id
   - execution run id
   - session id
   - source timestamp
   - source type
3. Ensure receipts are idempotent and not duplicated on repeated polling

Required result:
- operators can inspect Activity and understand exact execution state without reading raw transcripts

Phase gate:
- a real task shows structured execution receipts in Activity

## Phase 4 — Completion bridge hardening
Goal:
Turn completion into reliable post-execution ingestion.

Tasks:
1. Refactor completion webhook to resolve exact task/run
2. Stop using “latest active task for agent” matching
3. On completion, atomically:
   - write completion activity
   - persist summary metadata
   - register deliverables if present
   - set task to `testing`
   - reset agent to canonical state
   - mark execution record ingested
4. Handle ingestion failures explicitly with visible evidence

Required result:
- completion becomes task-visible proof, not only an event row

Phase gate:
- a completion event produces correct task receipts and lifecycle update for the exact task

## Phase 5 — Stall detection + reconciliation
Goal:
Surface silent execution failures automatically.

Tasks:
1. Extend reconciliation/watchdog rules for:
   - dispatched_no_ack
   - ack_no_progress
   - in_progress_no_delta
   - completion_not_ingested
2. Create blocker/activity receipts for each detected condition
3. Add thresholds through config/env where appropriate
4. Ensure watchdogs do not spam duplicate incidents

Required result:
- silent stalls become visible operational incidents

Phase gate:
- synthetic stale scenarios are detected and recorded automatically

## Phase 6 — Status semantics cleanup
Goal:
Eliminate state drift in agent/session/task semantics.

Tasks:
1. Remove `idle` writes from session APIs
2. Normalize all agent state transitions to canonical values
3. Audit UI/API assumptions for `standby | working | offline`
4. Ensure execution state is separate from agent status

Required result:
- no semantic drift between runtime/session cleanup and agent status model

Phase gate:
- code search confirms no non-canonical agent statuses remain in active paths

## Phase 7 — Verification sweep
Goal:
Prove the repaired system works end-to-end.

Tasks:
1. Dispatch a controlled smoke task
2. Capture:
   - dispatch receipt
   - ack receipt
   - execution/progress receipt
   - completion receipt
   - deliverable receipt or explicit no-deliverable policy evidence
3. Verify task transitions are evidence-driven
4. Verify reconciliation on a forced stale scenario
5. Record final verification summary

Required result:
- end-to-end evidence that execution and post-execution monitoring are repaired

## Implementation order summary
Must-follow order:
1. exact binding
2. runtime ingestion
3. task receipts
4. completion hardening
5. stall detection
6. semantic cleanup
7. verification

## Suggested commit structure
1. `feat: add task-linked execution run persistence`
2. `fix: replace broken runtime history monitoring path`
3. `feat: ingest runtime execution receipts into task activities`
4. `fix: resolve completion by exact task execution run`
5. `feat: detect and record stalled task execution`
6. `refactor: normalize agent status semantics in session flows`
7. `test: add execution monitoring verification coverage`

## Abort conditions
Stop and report blocker immediately if:
- no usable runtime evidence source can be accessed
- task/run binding cannot be introduced without unsafe schema assumptions
- completion source payload lacks enough information and fallback correlation is still ambiguous

## Final delivery package from coding agent
The agent must return:
1. files changed
2. schema/migration changes
3. exact runtime verification performed
4. blocker list if any unresolved
5. rollback notes
6. explicit statement of what is now guaranteed that was not guaranteed before
