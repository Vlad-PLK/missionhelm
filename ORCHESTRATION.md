# MissionHelm Orchestration Playbook

This playbook defines how we operate MissionHelm as a live control plane with Hermès as orchestrator and OpenClaw as execution runtime.

---

## 1) Roles and boundaries

### Hermès (orchestrator)

- Owns intake, triage, dispatch decisions, verification, and closure
- Detects stalls early and forces explicit blocker reporting
- Enforces lifecycle hygiene and evidence-based completion

### OpenClaw (runtime)

- Runs agent sessions and execution loops
- Delivers progress through messages and session-level telemetry
- Does not replace operator review authority

### MissionHelm (control plane)

- Persists tasks/agents/workspaces/sessions/events
- Broadcasts activity and status transitions
- Provides API surfaces for auditability and recovery

---

## 2) Golden loop (always)

1. Assess current state
2. Select highest-leverage next action
3. Execute
4. Verify with runtime signals
5. Record visibility receipts
6. Set explicit next step or close

If one step is skipped, orchestration quality degrades.

---

## 3) Lifecycle contract

```text
pending_dispatch -> planning -> inbox -> assigned -> in_progress -> testing -> review -> done
```

### Transition hygiene

- Never move to `done` without review intent and evidence
- `review -> done` requires deliverables and approval authority
- Any regression or mismatch returns task to prior actionable state

---

## 4) Required reporting protocol for agents

Accepted structured receipts:

- `TASK_COMPLETE: <summary> | deliverables: <paths/urls> | verification: <how verified>`
- `PROGRESS_UPDATE: <delta> | next: <next action> | eta: <time>`
- `BLOCKED: <blocker> | need: <specific input> | meanwhile: <fallback action>`

Vague completions are rejected.

---

## 5) Session discipline

MissionHelm is session-driven:

- Link execution to an OpenClaw session (`openclaw_sessions`)
- Register sub-agent sessions under task context when applicable
- Ensure each material step writes `task_activities`
- Attach outputs via `task_deliverables`

A claim without session/activity/deliverable evidence is not operational truth.

---

## 6) Runtime truth checks

Use these checks for reality, not assumptions:

```bash
# dashboard reachability
curl -sS http://127.0.0.1:4000/ >/dev/null && echo OK

# operational state
curl -sS http://127.0.0.1:4000/api/tasks | jq 'length'
curl -sS "http://127.0.0.1:4000/api/workspaces?stats=true" | jq 'length'
curl -sS http://127.0.0.1:4000/api/agents | jq 'length'
curl -sS http://127.0.0.1:4000/api/openclaw/status | jq '{connected,gateway_url}'
```

If one endpoint fails, continue with partial signal and report the failure explicitly.

---

## 7) Day-start operating sequence

1. Confirm MissionHelm + OpenClaw runtime health
2. Pull workspace/task histograms
3. Identify stale `assigned`/`in_progress`/`testing` tasks
4. Validate session-to-task consistency
5. Redispatch or reclassify blocked/stale tasks
6. Publish concise operator status update with next actions

---

## 8) Review and closure standard

A task can be closed only when all are true:

- Scope is implemented
- Verification result is explicit
- Deliverables exist and are reviewable
- Activity timeline shows meaningful execution
- Closure decision is documented

---

## 9) Common failure modes

- Agent marked `working` with no active owned task
- Tasks stuck in `in_progress` without new activity
- DB-active sessions while runtime session is absent
- Deliverables logged without real files/urls
- Approval attempts without evidence

Handle by reconciliation, not by status cosmetics.

---

## 10) Non-negotiables

- Prioritize live verification over assumptions
- Preserve operational visibility at every step
- Keep changes minimal and reversible
- Separate configured state from verified-running state
- Never declare done from intent alone
