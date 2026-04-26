     1|# La Citadel Frontend Roadmap
     2|
     3|This document turns recent UI/UX recommendations into a concrete implementation roadmap that can be handed directly to a coding agent.
     4|
     5|## Objective
     6|
     7|Evolve La Citadel from a mostly board-centric control panel into a clearer operator-facing command center that fully exposes the backend capabilities already present in the system.
     8|
     9|The next frontend phase should focus on:
    10|
    11|- surfacing existing backend features
    12|- reducing modal overload
    13|- improving operator workflows for planning, dispatch, review, and workspace administration
    14|- making system health and agent activity visible at a glance
    15|
    16|## Product Direction
    17|
    18|La Citadel should feel like an AI operations cockpit.
    19|
    20|Users should be able to:
    21|
    22|- understand workspace health immediately
    23|- see what needs attention now
    24|- inspect a task without losing context
    25|- review testing and deliverables efficiently
    26|- manage agents and imported gateway agents safely
    27|- perform workspace operations without hidden risk
    28|
    29|## Current Confirmed State
    30|
    31|The roadmap below assumes the following are already implemented and working:
    32|
    33|- workspace support
    34|- task lifecycle with statuses including planning, assigned, in_progress, testing, review, done
    35|- task planning flow
    36|- task activities, deliverables, and sessions
    37|- OpenClaw connectivity from the Dockerized La Citadel app via host networking
    38|- agent discovery/import from OpenClaw Gateway
    39|- safer workspace deletion with preview and protected workspace enforcement
    40|- import-agent crash fix via model normalization
    41|
    42|## Scope Rules
    43|
    44|This roadmap is frontend-first.
    45|
    46|Do not invent major new backend systems unless a frontend requirement is blocked by something truly missing. Prefer exposing and organizing backend capabilities that already exist.
    47|
    48|## Primary Workspaces To Use For Validation
    49|
    50|Use these workspaces for testing and validation:
    51|
    52|- `cafe-fino` as the main golden workspace
    53|- `autonomous-workflow` as a smaller orchestration-focused workspace
    54|- `default` for edge cases around protected resources and shared agents
    55|
    56|## High-Level Delivery Strategy
    57|
    58|Implement in phases.
    59|
    60|Each phase should leave the product in a shippable state.
    61|
    62|## Phase 1: Workspace Command Center
    63|
    64|### Goal
    65|
    66|Upgrade the workspace page from a basic three-pane shell into a true operational overview without breaking the current mental model.
    67|
    68|### Pages and components
    69|
    70|Enhance:
    71|
    72|- `src/app/workspace/[slug]/page.tsx`
    73|- `src/components/MissionQueue.tsx`
    74|- `src/components/AgentsSidebar.tsx`
    75|- `src/components/LiveFeed.tsx`
    76|- `src/components/Header.tsx`
    77|
    78|Add a workspace summary layer above or around the existing queue.
    79|
    80|### New UI elements
    81|
    82|Add a workspace overview section with cards for:
    83|
    84|- active tasks
    85|- tasks in testing
    86|- tasks in review
    87|- blocked or stalled tasks if derivable
    88|- active agents
    89|- active OpenClaw sessions or subagents
    90|- gateway connection state
    91|- recent failures or warnings
    92|
    93|Add quick actions:
    94|
    95|- New Task
    96|- Import Agents
    97|- Open Activity Dashboard
    98|- Open Workspace Settings
    99|
   100|### UX requirements
   101|
   102|- keep queue access immediate
   103|- do not hide the kanban flow
   104|- make high-priority problems visible before passive metrics
   105|- mobile layout must still be usable
   106|
   107|### Acceptance criteria
   108|
   109|- workspace page shows operational summary without opening modals
   110|- operator can access import, activity, and settings in one click
   111|- gateway status is visible at workspace level
   112|- cards update from current backend data without fake placeholders
   113|
   114|## Phase 2: Task Detail Upgrade
   115|
   116|### Goal
   117|
   118|Replace modal-heavy task depth with a clearer, durable task detail experience.
   119|
   120|### Pages and components
   121|
   122|Refactor or expand:
   123|
   124|- `src/components/TaskModal.tsx`
   125|- `src/components/PlanningTab.tsx`
   126|- `src/components/ActivityLog.tsx`
   127|- `src/components/DeliverablesList.tsx`
   128|- `src/components/SessionsList.tsx`
   129|
   130|Introduce either:
   131|
   132|- a full task detail page, or
   133|- a persistent side drawer with URL state
   134|
   135|Preferred route shape if page-based:
   136|
   137|- `src/app/workspace/[slug]/tasks/[taskId]/page.tsx`
   138|
   139|### Task detail sections
   140|
   141|Include first-class sections for:
   142|
   143|- Overview
   144|- Planning Spec
   145|- Progress / Milestones
   146|- Activity Timeline
   147|- Deliverables
   148|- Sessions
   149|- Review / Approval
   150|- Testing Results if available
   151|
   152|### Milestones and progress
   153|
   154|Backend already has milestone/progress structures. Surface them even if initially read-only.
   155|
   156|### Acceptance criteria
   157|
   158|- task inspection no longer depends only on a transient modal
   159|- user can review planning, execution, and outputs in one place
   160|- lifecycle state is clear
   161|- deliverables and sessions are easier to understand than today
   162|
   163|## Phase 3: Review and Testing Surface
   164|
   165|### Goal
   166|
   167|Make testing and review a real operator workflow instead of just status columns.
   168|
   169|### New surfaces
   170|
   171|Add a review/testing workspace panel or page.
   172|
   173|Possible route:
   174|
   175|- `src/app/workspace/[slug]/review/page.tsx`
   176|
   177|### Show tasks in:
   178|
   179|- `testing`
   180|- `review`
   181|- optionally `pending_dispatch` with failure info
   182|
   183|### Per-task review card content
   184|
   185|- title and status
   186|- assigned agent
   187|- latest activity
   188|- latest deliverables
   189|- test run status
   190|- screenshots/artifacts if available
   191|- approve / send back / reassign actions
   192|
   193|### Acceptance criteria
   194|
   195|- tasks awaiting operator action are visible in one place
   196|- review is faster than scanning the full kanban board
   197|- testing state is understandable and actionable
   198|
   199|## Phase 4: Workspace Settings and Destructive Operations
   200|
   201|### Goal
   202|
   203|Create a proper operations/settings surface for each workspace.
   204|
   205|### New route
   206|
   207|- `src/app/workspace/[slug]/settings/page.tsx`
   208|
   209|### Surface these capabilities
   210|
   211|- workspace metadata
   212|- icon/name/description editing if supported
   213|- folder path visibility and editing if supported
   214|- protected workspace explanation
   215|- delete preview with dependency counts
   216|- dangerous action confirmation flow
   217|- imported agent overview for the workspace
   218|
   219|### Existing APIs to use
   220|
   221|- `GET /api/workspaces/[id]`
   222|- `PATCH /api/workspaces/[id]`
   223|- `GET /api/workspaces/[id]/delete-preview`
   224|- `DELETE /api/workspaces/[id]`
   225|
   226|### Acceptance criteria
   227|
   228|- user can understand why a workspace can or cannot be deleted
   229|- delete preview is visible before destructive action
   230|- protected workspaces are clearly marked in UI
   231|
   232|## Phase 5: Agent Directory and Agent Detail
   233|
   234|### Goal
   235|
   236|Make agent operations first-class.
   237|
   238|### New routes
   239|
   240|- `src/app/workspace/[slug]/agents/page.tsx`
   241|- optional: `src/app/workspace/[slug]/agents/[agentId]/page.tsx`
   242|
   243|### Required features
   244|
   245|- roster view for all workspace agents
   246|- local vs gateway badge
   247|- current model/source display
   248|- orchestrator/master visibility
   249|- connection status to OpenClaw
   250|- current status: standby, working, offline
   251|- recent assigned tasks
   252|- recent sessions if available
   253|
   254|### Existing APIs to surface
   255|
   256|- `/api/agents?workspace_id=...`
   257|- `/api/agents/discover`
   258|- `/api/agents/import`
   259|- `/api/agents/[id]/openclaw`
   260|
   261|### Acceptance criteria
   262|
   263|- imported and local agents are distinguishable instantly
   264|- operator can understand which agents are usable and connected
   265|- import workflow is discoverable outside of sidebar-only entry points
   266|
   267|## Phase 6: Planning Workbench
   268|
   269|### Goal
   270|
   271|Turn planning into a clear workflow rather than a hidden task sub-mode.
   272|
   273|### New route
   274|
   275|- `src/app/workspace/[slug]/planning/page.tsx`
   276|
   277|### Show
   278|
   279|- tasks in planning
   280|- current planning question
   281|- question history
   282|- generated spec summary
   283|- planning completion state
   284|- dispatch readiness / retry state
   285|
   286|### Existing APIs to surface
   287|
   288|- `/api/tasks/[id]/planning`
   289|- `/api/tasks/[id]/planning/answer`
   290|- `/api/tasks/[id]/planning/approve`
   291|- `/api/tasks/[id]/planning/poll`
   292|- `/api/tasks/[id]/planning/retry-dispatch`
   293|
   294|### Acceptance criteria
   295|
   296|- planning tasks can be managed from a dedicated view
   297|- operator can see which tasks are blocked in planning and why
   298|
   299|## Phase 7: System / Gateway Admin Surface
   300|
   301|### Goal
   302|
   303|Expose system-level backend state that operators need but currently have to infer.
   304|
   305|### New route
   306|
   307|- `src/app/admin/system/page.tsx`
   308|
   309|### Surface
   310|
   311|- OpenClaw connection state
   312|- gateway URL / mode
   313|- discovered models
   314|- imported-vs-discoverable agents summary
   315|- active sessions
   316|- possibly dispatch errors or recent system warnings
   317|
   318|### Existing APIs to use
   319|
   320|- `/api/openclaw/status`
   321|- `/api/openclaw/models`
   322|- `/api/openclaw/sessions`
   323|- `/api/agents/discover`
   324|
   325|### Acceptance criteria
   326|
   327|- operator can assess health of the orchestration layer without reading logs
   328|
   329|## Phase 8: Global Operations Home
   330|
   331|### Goal
   332|
   333|Provide a top-level la citadel overview across all workspaces.
   334|
   335|### Candidate route
   336|
   337|- `/operations`
   338|
   339|### Surface
   340|
   341|- review backlog across workspaces
   342|- tasks needing attention
   343|- active agents/subagents
   344|- dispatch failures
   345|- recent important events grouped by workspace
   346|
   347|### Acceptance criteria
   348|
   349|- operator can identify what needs action now without opening each workspace individually
   350|
   351|## Frontend Prioritization
   352|
   353|### P0
   354|
   355|- Phase 1: Workspace Command Center
   356|- Phase 2: Task Detail Upgrade
   357|- Phase 3: Review and Testing Surface
   358|- Phase 4: Workspace Settings and Destructive Operations
   359|
   360|### P1
   361|
   362|- Phase 5: Agent Directory and Agent Detail
   363|- Phase 6: Planning Workbench
   364|- Phase 7: System / Gateway Admin Surface
   365|
   366|### P2
   367|
   368|- Phase 8: Global Operations Home
   369|- richer session history UX
   370|- richer milestone editing
   371|
   372|## Implementation Principles
   373|
   374|- prefer stable pages or drawers over stacking more modal depth
   375|- preserve current working flows during migration
   376|- use real backend state, not fake placeholders
   377|- avoid introducing new concepts when existing API structures already support the need
   378|- keep mobile functional, even if desktop is the primary operator environment
   379|
   380|## Concrete Backend Features That Must Be Surfaced Better
   381|
   382|These exist or partially exist and should influence implementation:
   383|
   384|- delete preview for workspaces
   385|- protected workspace behavior
   386|- agent discovery/import
   387|- OpenClaw connection state
   388|- live events feed
   389|- sessions and session history
   390|- task activities and deliverables
   391|- planning lifecycle APIs
   392|- task testing and review stages
   393|- milestones and progress tables
   394|
   395|## Suggested Delivery Breakdown For A Coding Agent
   396|
   397|### Sprint A
   398|
   399|- implement Workspace Command Center
   400|- implement Task Detail Upgrade foundation
   401|- add links to Activity Dashboard and Settings from workspace shell
   402|
   403|### Sprint B
   404|
   405|- implement Review/Testing surface
   406|- implement Workspace Settings page using delete preview and protection rules
   407|
   408|### Sprint C
   409|
   410|- implement Agent Directory and import-centered management flow
   411|- expose gateway/system health
   412|
   413|### Sprint D
   414|
   415|- implement Planning Workbench and Global Operations Home
   416|
   417|## Definition of Done
   418|
   419|The roadmap is considered successfully implemented when:
   420|
   421|- the workspace page behaves like an operator command center
   422|- task execution depth is no longer trapped only in a modal
   423|- review and testing are visible, not hidden in board state alone
   424|- workspace settings and deletion are explainable and safe
   425|- agents are manageable as a roster, not just a sidebar list
   426|- system and gateway health are visible in UI
   427|- the frontend reflects the real backend capabilities without requiring operator guesswork
   428|
   429|## Handoff Summary For Another Agent
   430|
   431|If assigning this as a large implementation task, instruct the agent to:
   432|
   433|- treat `cafe-fino` as the primary validation workspace
   434|- preserve existing working APIs and flows
   435|- implement in phases with shippable checkpoints
   436|- avoid speculative backend additions unless blocked
   437|- prioritize surfacing hidden capabilities over inventing new ones
   438|