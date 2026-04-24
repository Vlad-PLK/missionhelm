# Orchestration Workflow (API + Runtime)

This document is the implementation-level workflow for operating MissionHelm with Hermès and OpenClaw.

---

## 1) Control objective

Keep every active task observable, progressing, and recoverable.

Observable means:
- activity events,
- deliverable records,
- status transitions,
- session state coherence.

---

## 2) Core API surfaces

Base URL (local default):

```text
http://127.0.0.1:4000
```

### State endpoints

- `GET /api/workspaces?stats=true`
- `GET /api/tasks`
- `GET /api/agents`
- `GET /api/openclaw/status`
- `GET /api/openclaw/sessions?status=active`

### Task evidence endpoints

- `GET /api/tasks/{taskId}`
- `GET /api/tasks/{taskId}/activities`
- `GET /api/tasks/{taskId}/deliverables`

---

## 3) Operational cycle

### Step A — assess

1. Pull workspace + task inventory
2. Build status histogram
3. Detect stale active tasks
4. Detect agent/task hygiene drift

### Step B — execute

- dispatch pending actionable work,
- log activities as soon as work starts,
- keep progress cadence visible,
- escalate blockers fast.

### Step C — verify

Before any closure decision, verify:

- completion evidence in activities,
- deliverables are present and valid,
- runtime and DB session signals are coherent.

### Step D — close or next action

- Move to `done` only after approval gate
- Otherwise define exact next action and owner

---

## 4) Stale-task heuristics

Treat as stale when all are true:

- task is active (`assigned|in_progress|testing|planning|pending_dispatch`)
- no meaningful activity in last cycle window
- no new deliverable signal

Typical response:

1. check assigned agent status,
2. check OpenClaw live session presence,
3. reconcile state or redispatch.

---

## 5) Session drift rules

Known pattern:
- DB may show active sessions while OpenClaw has no live runtime session.

Interpretation:
- not proof of active execution,
- indicates stale control/session record risk,
- requires reconciliation logic before trusting status.

---

## 6) Minimal evidence chain for completion claims

For a target task, fetch in order:

1. `/api/tasks/{taskId}`
2. `/api/tasks/{taskId}/activities`
3. `/api/tasks/{taskId}/deliverables`
4. `/api/openclaw/status`
5. `/api/openclaw/sessions?status=active`

Accept completion as operationally reported only when:

- status advanced to `review` or `done`,
- completion/final activity exists,
- deliverables are present.

---

## 7) Status transition guidance

- `in_progress -> testing`: include verification plan
- `testing -> review`: attach validation result and artifacts
- `review -> done`: apply approval governance with evidence

Never skip intermediate evidence logging to “fast-close” tasks.

---

## 8) Monitoring output contract

For scheduled monitors and operator reports, use this structure:

- `STATUS: green|yellow|red`
- Key deltas since previous cycle
- Active blockers/stalls
- Agent hygiene mismatches
- Focus-task snapshot
- Next recommended action

---

## 9) Practical command snippets

```bash
# Workspace and task snapshot
curl -sS "http://127.0.0.1:4000/api/workspaces?stats=true"
curl -sS "http://127.0.0.1:4000/api/tasks"

# Runtime connectivity
curl -sS "http://127.0.0.1:4000/api/openclaw/status"

# Task evidence
TASK_ID="<task-id>"
curl -sS "http://127.0.0.1:4000/api/tasks/$TASK_ID"
curl -sS "http://127.0.0.1:4000/api/tasks/$TASK_ID/activities"
curl -sS "http://127.0.0.1:4000/api/tasks/$TASK_ID/deliverables"
```

---

## 10) Quality bar

A workflow step is finished only when:

1. change applied,
2. runtime verification passed,
3. visibility preserved,
4. explicit next step or closure recorded.
