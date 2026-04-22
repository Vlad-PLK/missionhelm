# MissionHelm Hardening Plan (Orchestrator Scope)

> For Hermes: this is a planning-only artifact. No coding in this phase.

Goal: harden runtime reliability and workflow governance for MissionHelm (excluding Playwright/browser testing priority).

Architecture: split hardening into five independent implementation tracks with clear acceptance criteria and rollback notes. Execute each track as a bounded task with verification evidence.

Tech stack impact: Next.js API routes, SQLite schema/migrations, task orchestration logic, activity/events layer, operational dashboards.

---

## Track 1 — Schema Drift Guard + Migration Repair
Objective: eliminate runtime column-missing failures (example: agents.session_key_prefix).

Scope
- Add startup preflight that checks required columns/indexes.
- Repair migration path for existing DBs to guarantee agents.session_key_prefix exists.
- Add health signal endpoint exposing migration/preflight status.

Acceptance criteria
- /api/tasks/[id]/planning POST does not fail with missing-column errors.
- Preflight returns actionable error if schema drift detected.
- CI includes migration drift regression test.

Rollback
- Feature flag around strict preflight fail-close behavior.

## Track 2 — Approval Governance Hardening (review->done)
Objective: enforce quality gates at backend, not docs only.

Scope
- Require deliverables for review->done transitions.
- Optional policy toggle: require successful test evidence unless explicit override reason logged.
- Keep master approval semantics explicit and auditable.

Acceptance criteria
- review->done without deliverables is rejected server-side with clear reason.
- approval actions write structured activity/event with approver + gate evidence.

Rollback
- Temporary soft-enforcement mode (warn + log, no block).

## Track 3 — Automatic State Reconciliation
Objective: prevent status drift (agents stuck working with no active tasks).

Scope
- Add reconciler routine (manual endpoint + scheduled job).
- Rules:
  - working agent + no active task/session -> standby
  - stale planning with no session/messages -> blocked marker + inbox fallback recommendation
- Reconciler emits activity/event receipts.

Acceptance criteria
- Drift is corrected without manual bulk patches.
- Reconciler report includes changed entities and reasons.

Rollback
- Dry-run mode + workspace-scoped execution mode.

## Track 4 — Blocker Intelligence + Staleness Detection
Objective: make stalls explicit and triageable.

Scope
- Add blocker classification fields (infra, dependency, clarification, external).
- Add stale thresholds per status (planning/in_progress/review).
- Surface blocker queue endpoint + dashboard card.

Acceptance criteria
- Stale tasks auto-surface with age + required input.
- BLOCKED protocol message template available in UI/API.

Rollback
- Disable auto-flagging while keeping read-only blocker analytics.

## Track 5 — Bulk Ops with Dry-Run + Audit
Objective: support safe board cleanup/archival without losing traceability.

Scope
- Bulk transition/delete endpoints with dry-run preview.
- Mandatory reason field and generated operation report.
- Optional archive mode (soft delete marker) before hard delete.

Acceptance criteria
- Bulk operation provides impacted counts before execution.
- Post-op report includes per-task outcome and failures.

Rollback
- Hard delete path protected by explicit confirmation token.

---

## Execution order
1) Track 1 (schema safety baseline)
2) Track 2 (approval integrity)
3) Track 3 (state hygiene automation)
4) Track 4 (stall visibility)
5) Track 5 (safe bulk operations)

## Operational verification checklist
- No runtime schema exceptions in missionhelm logs for critical routes.
- Zero working agents with zero active tasks after reconciliation.
- Zero review->done approvals lacking deliverables.
- Blocked queue visible and actionable.
- Bulk ops always emit audit artifacts.
