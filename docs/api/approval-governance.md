# Approval Governance

Backend approval governance for La Citadel review completion.

## Scope

- Applies to `PATCH /api/tasks/{id}` when transitioning `review -> done`
- Uses existing `task_deliverables`, `task_activities`, and `events` tables for evidence and audit receipts
- Preserves current behavior by default; optional stricter test-evidence policy is disabled unless enabled by env var

## Enforced Gates

### Deliverables

- `review -> done` is rejected unless the task has at least one deliverable in `task_deliverables`

### Master Approval

- If `updated_by_agent_id` is present for `review -> done`, the referenced agent must have `is_master=1`

### Optional Test Evidence

- Enabled with `MC_APPROVAL_REQUIRE_TEST_EVIDENCE=true`
- Approval then requires the latest test activity for the task to be `test_passed`
- If not, approval may still proceed only when `approval_override_reason` is included in the PATCH body

## Request Contract

```json
{
  "status": "done",
  "updated_by_agent_id": "optional-master-agent-uuid",
  "approval_override_reason": "optional string when test evidence is missing and override is intentional",
  "approval_notes": "optional operator note stored in receipt metadata"
}
```

## Failure Contract

Rejected approvals return `409` with structured gate details:

```json
{
  "error": "Approval gate failed",
  "details": [
    "At least one deliverable is required before approving review -> done."
  ],
  "gate": {
    "deliverables": {
      "required": true,
      "count": 0,
      "passed": false
    },
    "testEvidence": {
      "required": false,
      "passed": true,
      "overrideUsed": false,
      "overrideReason": null,
      "latestActivityType": null,
      "latestActivityAt": null
    },
    "policy": {
      "softEnforcement": false
    }
  }
}
```

## Audit Receipts

Successful status changes write:

- `task_activities` row with `activity_type=status_changed`
- `events` row with `type=task_status_changed` or `task_completed`

`review -> done` approvals also write an additional `task_activities` receipt containing:

- transition source and destination
- approver agent id
- master-agent evaluation
- gate policy values
- deliverable count
- latest test evidence state
- override reason, if used
- approval notes, if supplied

## Policy Toggles

| Variable | Default | Purpose |
|----------|---------|---------|
| `MC_APPROVAL_REQUIRE_TEST_EVIDENCE` | `false` | Enforce latest `test_passed` evidence before approval |
| `MC_APPROVAL_SOFT_ENFORCEMENT` | `false` | Log receipt warnings but allow transition when gates fail |

## Rollback Notes

- No schema migration or irreversible infra change is required for this feature.
- To relax enforcement quickly, set `MC_APPROVAL_SOFT_ENFORCEMENT=true`.
- To disable the optional test-evidence gate, set `MC_APPROVAL_REQUIRE_TEST_EVIDENCE=false`.
