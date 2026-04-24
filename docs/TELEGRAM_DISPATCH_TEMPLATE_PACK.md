# Telegram Dispatch Template Pack (MissionHelm)

Purpose
- Give Vladimir a copy/paste-ready input system from Telegram so Hermès can dispatch, track, and close work without ambiguity.
- Convert strategy -> executable tasks with clear verification and blocker handling.

Use order
1) Send `MISSION_DAY`
2) Send one `WORKSPACE` per active workspace
3) Send one or more `TASK_PACKET`
4) If blocked, send `BLOCKER`
5) At day end, send `EOD_REVIEW`

---

## 1) MISSION_DAY (daily operating intent)

```text
MISSION_DAY
- date: YYYY-MM-DD
- top_outcomes:
  - [P0] ...
  - [P0] ...
  - [P1] ...
- hard_deadlines:
- non_negotiables:
- constraints:
- sequencing_rules:
  - max_parallel_per_workspace: 1
  - allow_parallel_p0: yes/no
```

---

## 2) WORKSPACE (strategy envelope)

```text
WORKSPACE
- workspace_name:
- objective:
- current_phase: discovery|build|stabilize|release|maintenance
- success_metric:
- primary_risk:
- owner:
- repo_or_folder_path:
```

---

## 3) TASK_PACKET (dispatch-ready unit)

```text
TASK_PACKET
- workspace:
- title: <verb + deliverable>
- priority: P0|P1|P2
- owner_type: backend|frontend|design|research|devops|content|ops
- definition_of_done:
  - [ ] change applied
  - [ ] verification passed
  - [ ] activity + deliverable visible in MissionHelm
  - [ ] next step or closure note posted
- subtasks:
  1)
  2)
  3)
- dependencies: none | <task ids>
- due:
- acceptance_checks:
  - command:
  - endpoint:
  - expected_signal:
- context_links:
- fallback_if_blocked:
```

Quality rule:
- Keep subtasks atomic (15–90 min), observable, and verifiable.

---

## 4) BLOCKER (strict escalation)

```text
BLOCKER
- task_id:
- blocker_type: external_dependency|approval_pending|resource_unavailable|technical_impediment|spec_ambiguous|test_blocker
- severity: critical|high|medium|low
- blocker:
- need_from_vladimir:
- attempted:
- fallback_now:
- decision_deadline:
```

---

## 5) EOD_REVIEW (closure and carry-over)

```text
EOD_REVIEW
- completed_today:
  - task_id: ... | evidence: ... | closure: done/review
- still_in_progress:
  - task_id: ... | blocker/risk: ... | next action: ...
- carry_over_priority_for_tomorrow:
  - [P0] ...
  - [P1] ...
- decisions_needed_from_vladimir:
```

---

## 6) Fast intake variants (when mobile/urgent)

### A) 60-second quick task
```text
QUICK_TASK
- workspace:
- title:
- priority:
- done_when:
- due:
```

### B) Cutover / infra-sensitive task
```text
INFRA_TASK
- scope:
- blast_radius:
- rollback_plan:
- verification_gates:
- freeze_window:
```

---

## 7) Dispatch receipts expected from Hermès

Hermès should reply with:
- status summary
- exact actions/commands
- verification signals
- next step

For agent updates, enforce protocol lines:
- `PROGRESS_UPDATE: ... | next: ... | eta: ...`
- `BLOCKED: ... | need: ... | meanwhile: ...`
- `TASK_COMPLETE: ... | evidence: ...`

---

## 8) Worked example (ready to paste)

```text
MISSION_DAY
- date: 2026-04-22
- top_outcomes:
  - [P0] Stabilize dispatch quality for all active workspaces
  - [P0] Finalize MissionHelm production cutover readiness pack
  - [P1] Clean task backlog and enforce blocker visibility
- hard_deadlines: MissionHelm cutover plan review by 16:00
- non_negotiables: no destructive ops without rollback note
- constraints: mobile-only decisions today
- sequencing_rules:
  - max_parallel_per_workspace: 1
  - allow_parallel_p0: no
```

Then follow with one `WORKSPACE` and one `TASK_PACKET` per priority item.
