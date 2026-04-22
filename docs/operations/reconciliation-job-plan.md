# Reconciliation Job Plan

## Endpoint
- Route: `POST /api/reconciliation`
- Modes:
- `dry-run`: detect drift, return the report, no mutations
- `apply`: apply corrections, emit receipts, return the report

## Request body
```json
{
  "mode": "apply",
  "workspace_id": "default",
  "write_artifact": true
}
```

## Deterministic correction rules
1. `agent_working_without_active_assignment`
Set `agents.status` from `working` to `standby` when the agent has no `assigned` or `in_progress` task and no active task-linked or subagent session.

2. `task_stale_planning_without_session_or_messages`
Move `tasks.status` from `planning` to `inbox` when the task exceeds `MC_RECONCILIATION_STALE_PLANNING_MINUTES` (default `30`) with no `planning_session_key`, no retained `planning_messages`, and `planning_complete != 1`.
Reason handling:
The reconciler stamps `status_reason` with a blocked-style explanation and an explicit replanning recommendation.

3. `task_dispatchable_without_assignee`
Move `tasks.status` from `pending_dispatch` or `assigned` to `inbox` when `assigned_agent_id` is `NULL`.

## Receipts and artifacts
- Every applied agent correction writes an `events` receipt with `receipt_type=state_reconciliation`.
- Every applied task correction writes both:
- an `events` receipt
- a `task_activities` receipt with the same structured metadata
- Apply mode also writes a JSON report artifact by default:
- default path: `artifacts/reconciliation/*.json`
- override path: `MC_RECONCILIATION_REPORT_DIR`

## Scheduled job plan
Recommended cadence:
- Every 15 minutes globally
- Optional hourly workspace-scoped sweeps for noisy workspaces

Example cron entry:
```cron
*/15 * * * * curl -sS -X POST http://127.0.0.1:4000/api/reconciliation \
  -H 'Content-Type: application/json' \
  --data '{"mode":"apply","write_artifact":true}'
```

Workspace-scoped example:
```cron
7 * * * * curl -sS -X POST http://127.0.0.1:4000/api/reconciliation \
  -H 'Content-Type: application/json' \
  --data '{"mode":"apply","workspace_id":"default","write_artifact":true}'
```

## Rollback notes
Infra impact:
Scheduling the apply job changes live agent/task state and writes local report files.

Rollback path:
1. Switch the scheduler payload to `{"mode":"dry-run"}` to keep visibility without mutation.
2. Disable the cron entry entirely if automated reconciliation needs to stop.
3. If artifact writes are undesirable, set `"write_artifact": false` or point `MC_RECONCILIATION_REPORT_DIR` at a disposable location.
4. Re-run dry-run after rollback to confirm only detection remains active.
