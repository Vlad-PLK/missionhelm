# Mission Control Frontend Roadmap

This document turns recent UI/UX recommendations into a concrete implementation roadmap that can be handed directly to a coding agent.

## Objective

Evolve Mission Control from a mostly board-centric control panel into a clearer operator-facing command center that fully exposes the backend capabilities already present in the system.

The next frontend phase should focus on:

- surfacing existing backend features
- reducing modal overload
- improving operator workflows for planning, dispatch, review, and workspace administration
- making system health and agent activity visible at a glance

## Product Direction

Mission Control should feel like an AI operations cockpit.

Users should be able to:

- understand workspace health immediately
- see what needs attention now
- inspect a task without losing context
- review testing and deliverables efficiently
- manage agents and imported gateway agents safely
- perform workspace operations without hidden risk

## Current Confirmed State

The roadmap below assumes the following are already implemented and working:

- workspace support
- task lifecycle with statuses including planning, assigned, in_progress, testing, review, done
- task planning flow
- task activities, deliverables, and sessions
- OpenClaw connectivity from the Dockerized Mission Control app via host networking
- agent discovery/import from OpenClaw Gateway
- safer workspace deletion with preview and protected workspace enforcement
- import-agent crash fix via model normalization

## Scope Rules

This roadmap is frontend-first.

Do not invent major new backend systems unless a frontend requirement is blocked by something truly missing. Prefer exposing and organizing backend capabilities that already exist.

## Primary Workspaces To Use For Validation

Use these workspaces for testing and validation:

- `cafe-fino` as the main golden workspace
- `autonomous-workflow` as a smaller orchestration-focused workspace
- `default` for edge cases around protected resources and shared agents

## High-Level Delivery Strategy

Implement in phases.

Each phase should leave the product in a shippable state.

## Phase 1: Workspace Command Center

### Goal

Upgrade the workspace page from a basic three-pane shell into a true operational overview without breaking the current mental model.

### Pages and components

Enhance:

- `src/app/workspace/[slug]/page.tsx`
- `src/components/MissionQueue.tsx`
- `src/components/AgentsSidebar.tsx`
- `src/components/LiveFeed.tsx`
- `src/components/Header.tsx`

Add a workspace summary layer above or around the existing queue.

### New UI elements

Add a workspace overview section with cards for:

- active tasks
- tasks in testing
- tasks in review
- blocked or stalled tasks if derivable
- active agents
- active OpenClaw sessions or subagents
- gateway connection state
- recent failures or warnings

Add quick actions:

- New Task
- Import Agents
- Open Activity Dashboard
- Open Workspace Settings

### UX requirements

- keep queue access immediate
- do not hide the kanban flow
- make high-priority problems visible before passive metrics
- mobile layout must still be usable

### Acceptance criteria

- workspace page shows operational summary without opening modals
- operator can access import, activity, and settings in one click
- gateway status is visible at workspace level
- cards update from current backend data without fake placeholders

## Phase 2: Task Detail Upgrade

### Goal

Replace modal-heavy task depth with a clearer, durable task detail experience.

### Pages and components

Refactor or expand:

- `src/components/TaskModal.tsx`
- `src/components/PlanningTab.tsx`
- `src/components/ActivityLog.tsx`
- `src/components/DeliverablesList.tsx`
- `src/components/SessionsList.tsx`

Introduce either:

- a full task detail page, or
- a persistent side drawer with URL state

Preferred route shape if page-based:

- `src/app/workspace/[slug]/tasks/[taskId]/page.tsx`

### Task detail sections

Include first-class sections for:

- Overview
- Planning Spec
- Progress / Milestones
- Activity Timeline
- Deliverables
- Sessions
- Review / Approval
- Testing Results if available

### Milestones and progress

Backend already has milestone/progress structures. Surface them even if initially read-only.

### Acceptance criteria

- task inspection no longer depends only on a transient modal
- user can review planning, execution, and outputs in one place
- lifecycle state is clear
- deliverables and sessions are easier to understand than today

## Phase 3: Review and Testing Surface

### Goal

Make testing and review a real operator workflow instead of just status columns.

### New surfaces

Add a review/testing workspace panel or page.

Possible route:

- `src/app/workspace/[slug]/review/page.tsx`

### Show tasks in:

- `testing`
- `review`
- optionally `pending_dispatch` with failure info

### Per-task review card content

- title and status
- assigned agent
- latest activity
- latest deliverables
- test run status
- screenshots/artifacts if available
- approve / send back / reassign actions

### Acceptance criteria

- tasks awaiting operator action are visible in one place
- review is faster than scanning the full kanban board
- testing state is understandable and actionable

## Phase 4: Workspace Settings and Destructive Operations

### Goal

Create a proper operations/settings surface for each workspace.

### New route

- `src/app/workspace/[slug]/settings/page.tsx`

### Surface these capabilities

- workspace metadata
- icon/name/description editing if supported
- folder path visibility and editing if supported
- protected workspace explanation
- delete preview with dependency counts
- dangerous action confirmation flow
- imported agent overview for the workspace

### Existing APIs to use

- `GET /api/workspaces/[id]`
- `PATCH /api/workspaces/[id]`
- `GET /api/workspaces/[id]/delete-preview`
- `DELETE /api/workspaces/[id]`

### Acceptance criteria

- user can understand why a workspace can or cannot be deleted
- delete preview is visible before destructive action
- protected workspaces are clearly marked in UI

## Phase 5: Agent Directory and Agent Detail

### Goal

Make agent operations first-class.

### New routes

- `src/app/workspace/[slug]/agents/page.tsx`
- optional: `src/app/workspace/[slug]/agents/[agentId]/page.tsx`

### Required features

- roster view for all workspace agents
- local vs gateway badge
- current model/source display
- orchestrator/master visibility
- connection status to OpenClaw
- current status: standby, working, offline
- recent assigned tasks
- recent sessions if available

### Existing APIs to surface

- `/api/agents?workspace_id=...`
- `/api/agents/discover`
- `/api/agents/import`
- `/api/agents/[id]/openclaw`

### Acceptance criteria

- imported and local agents are distinguishable instantly
- operator can understand which agents are usable and connected
- import workflow is discoverable outside of sidebar-only entry points

## Phase 6: Planning Workbench

### Goal

Turn planning into a clear workflow rather than a hidden task sub-mode.

### New route

- `src/app/workspace/[slug]/planning/page.tsx`

### Show

- tasks in planning
- current planning question
- question history
- generated spec summary
- planning completion state
- dispatch readiness / retry state

### Existing APIs to surface

- `/api/tasks/[id]/planning`
- `/api/tasks/[id]/planning/answer`
- `/api/tasks/[id]/planning/approve`
- `/api/tasks/[id]/planning/poll`
- `/api/tasks/[id]/planning/retry-dispatch`

### Acceptance criteria

- planning tasks can be managed from a dedicated view
- operator can see which tasks are blocked in planning and why

## Phase 7: System / Gateway Admin Surface

### Goal

Expose system-level backend state that operators need but currently have to infer.

### New route

- `src/app/admin/system/page.tsx`

### Surface

- OpenClaw connection state
- gateway URL / mode
- discovered models
- imported-vs-discoverable agents summary
- active sessions
- possibly dispatch errors or recent system warnings

### Existing APIs to use

- `/api/openclaw/status`
- `/api/openclaw/models`
- `/api/openclaw/sessions`
- `/api/agents/discover`

### Acceptance criteria

- operator can assess health of the orchestration layer without reading logs

## Phase 8: Global Operations Home

### Goal

Provide a top-level mission-control overview across all workspaces.

### Candidate route

- `/operations`

### Surface

- review backlog across workspaces
- tasks needing attention
- active agents/subagents
- dispatch failures
- recent important events grouped by workspace

### Acceptance criteria

- operator can identify what needs action now without opening each workspace individually

## Frontend Prioritization

### P0

- Phase 1: Workspace Command Center
- Phase 2: Task Detail Upgrade
- Phase 3: Review and Testing Surface
- Phase 4: Workspace Settings and Destructive Operations

### P1

- Phase 5: Agent Directory and Agent Detail
- Phase 6: Planning Workbench
- Phase 7: System / Gateway Admin Surface

### P2

- Phase 8: Global Operations Home
- richer session history UX
- richer milestone editing

## Implementation Principles

- prefer stable pages or drawers over stacking more modal depth
- preserve current working flows during migration
- use real backend state, not fake placeholders
- avoid introducing new concepts when existing API structures already support the need
- keep mobile functional, even if desktop is the primary operator environment

## Concrete Backend Features That Must Be Surfaced Better

These exist or partially exist and should influence implementation:

- delete preview for workspaces
- protected workspace behavior
- agent discovery/import
- OpenClaw connection state
- live events feed
- sessions and session history
- task activities and deliverables
- planning lifecycle APIs
- task testing and review stages
- milestones and progress tables

## Suggested Delivery Breakdown For A Coding Agent

### Sprint A

- implement Workspace Command Center
- implement Task Detail Upgrade foundation
- add links to Activity Dashboard and Settings from workspace shell

### Sprint B

- implement Review/Testing surface
- implement Workspace Settings page using delete preview and protection rules

### Sprint C

- implement Agent Directory and import-centered management flow
- expose gateway/system health

### Sprint D

- implement Planning Workbench and Global Operations Home

## Definition of Done

The roadmap is considered successfully implemented when:

- the workspace page behaves like an operator command center
- task execution depth is no longer trapped only in a modal
- review and testing are visible, not hidden in board state alone
- workspace settings and deletion are explainable and safe
- agents are manageable as a roster, not just a sidebar list
- system and gateway health are visible in UI
- the frontend reflects the real backend capabilities without requiring operator guesswork

## Handoff Summary For Another Agent

If assigning this as a large implementation task, instruct the agent to:

- treat `cafe-fino` as the primary validation workspace
- preserve existing working APIs and flows
- implement in phases with shippable checkpoints
- avoid speculative backend additions unless blocked
- prioritize surfacing hidden capabilities over inventing new ones
