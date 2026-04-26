     1|# La Citadel Hardening Plan (Orchestrator Scope)
     2|
     3|> For Hermes: this is a planning-only artifact. No coding in this phase.
     4|
     5|Goal: harden runtime reliability and workflow governance for La Citadel (excluding Playwright/browser testing priority).
     6|
     7|Architecture: split hardening into five independent implementation tracks with clear acceptance criteria and rollback notes. Execute each track as a bounded task with verification evidence.
     8|
     9|Tech stack impact: Next.js API routes, SQLite schema/migrations, task orchestration logic, activity/events layer, operational dashboards.
    10|
    11|---
    12|
    13|## Track 1 — Schema Drift Guard + Migration Repair
    14|Objective: eliminate runtime column-missing failures (example: agents.session_key_prefix).
    15|
    16|Scope
    17|- Add startup preflight that checks required columns/indexes.
    18|- Repair migration path for existing DBs to guarantee agents.session_key_prefix exists.
    19|- Add health signal endpoint exposing migration/preflight status.
    20|
    21|Acceptance criteria
    22|- /api/tasks/[id]/planning POST does not fail with missing-column errors.
    23|- Preflight returns actionable error if schema drift detected.
    24|- CI includes migration drift regression test.
    25|
    26|Rollback
    27|- Feature flag around strict preflight fail-close behavior.
    28|
    29|## Track 2 — Approval Governance Hardening (review->done)
    30|Objective: enforce quality gates at backend, not docs only.
    31|
    32|Scope
    33|- Require deliverables for review->done transitions.
    34|- Optional policy toggle: require successful test evidence unless explicit override reason logged.
    35|- Keep master approval semantics explicit and auditable.
    36|
    37|Acceptance criteria
    38|- review->done without deliverables is rejected server-side with clear reason.
    39|- approval actions write structured activity/event with approver + gate evidence.
    40|
    41|Rollback
    42|- Temporary soft-enforcement mode (warn + log, no block).
    43|
    44|## Track 3 — Automatic State Reconciliation
    45|Objective: prevent status drift (agents stuck working with no active tasks).
    46|
    47|Scope
    48|- Add reconciler routine (manual endpoint + scheduled job).
    49|- Rules:
    50|  - working agent + no active task/session -> standby
    51|  - stale planning with no session/messages -> blocked marker + inbox fallback recommendation
    52|- Reconciler emits activity/event receipts.
    53|
    54|Acceptance criteria
    55|- Drift is corrected without manual bulk patches.
    56|- Reconciler report includes changed entities and reasons.
    57|
    58|Rollback
    59|- Dry-run mode + workspace-scoped execution mode.
    60|
    61|## Track 4 — Blocker Intelligence + Staleness Detection
    62|Objective: make stalls explicit and triageable.
    63|
    64|Scope
    65|- Add blocker classification fields (infra, dependency, clarification, external).
    66|- Add stale thresholds per status (planning/in_progress/review).
    67|- Surface blocker queue endpoint + dashboard card.
    68|
    69|Acceptance criteria
    70|- Stale tasks auto-surface with age + required input.
    71|- BLOCKED protocol message template available in UI/API.
    72|
    73|Rollback
    74|- Disable auto-flagging while keeping read-only blocker analytics.
    75|
    76|## Track 5 — Bulk Ops with Dry-Run + Audit
    77|Objective: support safe board cleanup/archival without losing traceability.
    78|
    79|Scope
    80|- Bulk transition/delete endpoints with dry-run preview.
    81|- Mandatory reason field and generated operation report.
    82|- Optional archive mode (soft delete marker) before hard delete.
    83|
    84|Acceptance criteria
    85|- Bulk operation provides impacted counts before execution.
    86|- Post-op report includes per-task outcome and failures.
    87|
    88|Rollback
    89|- Hard delete path protected by explicit confirmation token.
    90|
    91|---
    92|
    93|## Execution order
    94|1) Track 1 (schema safety baseline)
    95|2) Track 2 (approval integrity)
    96|3) Track 3 (state hygiene automation)
    97|4) Track 4 (stall visibility)
    98|5) Track 5 (safe bulk operations)
    99|
   100|## Operational verification checklist
   101|- No runtime schema exceptions in la citadel logs for critical routes.
   102|- Zero working agents with zero active tasks after reconciliation.
   103|- Zero review->done approvals lacking deliverables.
   104|- Blocked queue visible and actionable.
   105|- Bulk ops always emit audit artifacts.
   106|