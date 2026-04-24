# La Citadel Production Workflow Input Guide

Purpose
- Define exactly what Hermès needs from Vladimir to run La Citadel in a production-ready way.
- Remove ambiguity during task intake, dispatch, execution tracking, and closure.

Core principle
- Hermès is the La Citadel orchestrator/operator, not the coding executor.
- The best results come from clear priorities + atomic tasks + explicit done criteria + fast blocker resolution.

## 1) Daily control contract (what to send every day)

Send one "MISSION_DAY" message at the start of day:

- date
- Top outcomes (max 3)
- Priority class per outcome: P0/P1/P2
- Hard deadlines (today/this week)
- Non-negotiables (must happen no matter what)
- Constraints (people/tools/access/risk limits)

Template:

```text
MISSION_DAY
- date:
- outcomes:
  - [P0] ...
  - [P0] ...
  - [P1] ...
- hard_deadlines:
- non_negotiables:
- constraints:
```

## 2) Workspace definition contract

For each workspace/project, provide:

- workspace_name
- business objective (why this workspace exists)
- current phase (discovery/build/stabilize/release/maintenance)
- success metric (how we know this workspace is winning)
- primary risk
- owner/decision-maker

Template:

```text
WORKSPACE
- workspace_name:
- objective:
- phase:
- success_metric:
- primary_risk:
- owner:
```

## 3) Task packet contract (required for reliable dispatch)

Every task should be atomic and dispatch-ready:

Required fields:
- workspace
- title (verb + deliverable)
- priority (P0/P1/P2)
- owner_type (backend/frontend/design/research/devops/content/etc.)
- definition_of_done (objective checks, not vague statements)
- subtasks (ordered)
- dependencies (task IDs or "none")
- due (date/time window)

Recommended fields:
- acceptance test/check command
- links/files/context references
- risk notes
- fallback if blocked

Template:

```text
TASK
- workspace:
- title:
- priority:
- owner_type:
- definition_of_done:
- subtasks:
  1)
  2)
  3)
- dependencies:
- due:
- acceptance_checks:
- context_links:
- fallback_if_blocked:
```

## 4) Subtask quality standard

A good subtask is:
- specific (single action)
- observable (produces a concrete output)
- verifiable (can be checked by endpoint/log/file/test)
- short (prefer 15–90 minute chunks)

Avoid:
- "improve", "optimize", "handle everything"
- multi-goal subtasks with unclear ownership

## 5) Priority policy for production flow

Use this policy:
- P0 = blocking production value or hard deadline within 24h
- P1 = high impact, can follow after P0 stabilization
- P2 = useful but deferrable

Dispatch rule:
- keep one critical path per workspace unless explicitly approved for parallel execution.

## 6) Blocker escalation contract

When blocked, send:
- blocker summary
- exact missing input/decision/access
- latest attempted action
- fallback path available now
- decision needed by (time)

Template:

```text
BLOCKER
- task_id:
- blocker:
- need_from_vladimir:
- attempted:
- fallback_now:
- decision_deadline:
```

## 7) Completion and closure contract

A task is only complete when all are true:
1. intended change exists,
2. verification passed,
3. visibility exists (activity/deliverable/status),
4. next step or closure note is explicit.

Closure receipt should include:
- what changed
- evidence (endpoint/log/test/artifact)
- risk/rollback notes if infra-impacting
- next action (if any)

## 8) Cadence for best orchestration performance

Recommended cadence:
- Morning: mission-day + new tasks + priority updates
- Midday: blocker/dependency decisions + reprioritization
- End of day: closure receipts + carry-over decisions

## 9) Minimum viable production-ready operating model

To run production-ready now, maintain:
- clear daily priorities
- structured task packets
- strict blocker escalation
- evidence-based closure
- explicit carry-over governance

If one is missing, execution quality drops and stalls increase.

## 10) What Hermès expects from Vladimir (summary)

Hermès expects:
- decisive priority ordering,
- complete task packets,
- rapid blocker decisions,
- explicit tradeoff calls when capacity is constrained,
- end-of-day closure confirmation.

In return, Hermès will:
- keep workflows moving,
- dispatch in highest-leverage order,
- surface blockers early,
- enforce status hygiene,
- report verified progress with clear next steps.
