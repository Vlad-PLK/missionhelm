# Agent Protocol (Hermès + OpenClaw + La Citadel)

This protocol defines how execution agents must report work so La Citadel remains auditable and actionable.

---

## 1) Why this exists

Without structured reporting, tasks appear active but are operationally opaque.

This protocol guarantees:

- clear progress signals,
- explicit blockers,
- deliverable traceability,
- safe review and closure.

---

## 2) Required message formats

### Acknowledgement

```text
ACK_TASK: <brief restatement> | next: <first step>
```

### Completion

```text
TASK_COMPLETE: <summary> | deliverables: <paths/urls> | verification: <checks performed>
```

### Progress

```text
PROGRESS_UPDATE: <what changed> | next: <next step> | eta: <time>
```

### Blocker

```text
BLOCKED: <blocker> | need: <specific input> | meanwhile: <fallback work>
```

Rules:
- No empty completions (`TASK_COMPLETE: done`) 
- No silent stalls
- No blocker report without parallel fallback work
- Autonomous monitoring ingests only explicit protocol messages; vague assistant chatter is not treated as acknowledgement

---

## 3) Lifecycle expectations

La Citadel lifecycle:

```text
pending_dispatch -> planning -> inbox -> assigned -> in_progress -> testing -> review -> done
```

Execution expectations:

- `assigned` -> `in_progress`: explicit `ACK_TASK` expected quickly, followed by first meaningful work signal
- `in_progress`: continuous `PROGRESS_UPDATE` cadence
- `testing`: verification evidence recorded
- `review`: task is materially complete and reviewable

---

## 4) Deliverable discipline

Deliverables must be concrete and inspectable:

- file path
- URL
- artifact reference

For code tasks, include touched files and verification command outputs in summary.

---

## 5) Session discipline

Each active execution stream should map to a session record:

- OpenClaw session exists and linked
- Task activity timeline references meaningful actions
- Session closure aligns with task transition intent

If runtime session says done but task remains active, flag reconciliation required.

---

## 6) Review gate behavior

`review -> done` is controlled by operator/master authority.

Before closure, ensure:

- deliverables exist,
- verification is explicit,
- no unresolved blockers,
- operator agrees output meets scope.

---

## 7) Examples

### Good completion

```text
TASK_COMPLETE: implemented provider booking guardrail and UI restriction | deliverables: src/features/booking/RatingGate.tsx, src/api/bookings/rating.ts | verification: npm test -- rating-gate.spec.ts (pass), manual flow validated on /bookings/123
```

### Good blocker

```text
BLOCKED: OpenClaw callback rejected by proxy | need: NO_PROXY=localhost,127.0.0.1 in runtime env | meanwhile: finished unit tests and prepared patch for retry
```

### Bad completion (reject)

```text
TASK_COMPLETE: done
```

---

## 8) Operator response rules (Hermès)

- Accept only evidence-backed completion
- If blocked: capture blocker, request input, keep fallback work moving
- If stale: trigger redispatch or state reconciliation
- If status drift detected: repair state based on runtime truth

---

## 9) Definition of operationally reported

A task is operationally reported only when:

1. status reached `review` (or `done`),
2. recent completion activity exists,
3. deliverables are present,
4. verification signal is readable.

Anything less is partial reporting, not closure.
