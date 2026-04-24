# La Citadel Operator UI/UX Improvements Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make La Citadel faster and easier for Vladimir to operate daily by improving scanability, anomaly detection, shortcut access, and action discoverability across the home dashboard, operations page, and system admin surfaces.

**Architecture:** Keep the current UI structure intact, but add operator-focused layers on top: semantic badges, attention states, pinned/recent navigation, top-level summary metrics, quick actions, and lightweight command ergonomics. This should feel like upgrading a directory UI into a command board without redesigning the app from scratch.

**Tech Stack:** Next.js app router, React client components, existing Tailwind utility classes, current workspace/task API routes, lucide-react icons.

---

## Product intent

La Citadel is already functional, but for a daily operator the top-level UX still behaves more like a clean directory than a true command console.

This plan upgrades the interface in the highest-leverage places so the operator can:
- identify problem workspaces faster
- navigate to high-frequency surfaces faster
- act directly from summary views
- reduce scanning/click cost during live operations
- keep focus on active missions rather than passive lists

---

## Grounded current-state observations

Inspected live surfaces:
- Home dashboard (`src/components/WorkspaceDashboard.tsx`)
- Operations home (`src/app/operations/page.tsx`)
- System / Gateway Admin (`src/app/admin/system/page.tsx`)

Observed UX gaps:
1. Workspace cards are visually clean but do not strongly surface operational anomalies.
2. Task/agent counts are plain text, so high-risk states do not stand out enough.
3. Workspace home lacks sort/filter/search controls for large workspace sets.
4. There is no pinned/recent section for frequent operator targets.
5. Actions often require opening a workspace first.
6. Operations page provides useful data but not enough prioritization and route ergonomics.
7. System Admin is informative but not optimized for quick health scanning or action follow-through.
8. Duplicate workspace creation CTAs weaken hierarchy slightly.

---

## Success criteria

This implementation is successful when:
1. Home dashboard immediately highlights “needs attention” workspaces.
2. Workspace discovery is faster through search, filter, and sorting.
3. High-frequency workspaces are reachable from a pinned/recent area.
4. Operators can access common actions from card-level quick actions.
5. Operations page becomes a true triage board with stronger prioritization.
6. System Admin becomes easier to scan for health problems and session/model state.
7. UI changes remain additive and low-risk — no major architectural rewrite.
8. Visual hierarchy improves while preserving the current La Citadel style.

---

## File targets

### Core UI surfaces
- Modify: `src/components/WorkspaceDashboard.tsx`
- Modify: `src/app/operations/page.tsx`
- Modify: `src/app/admin/system/page.tsx`
- Modify: `src/components/Header.tsx` (if global quick access/search/shortcut entry is added)

### Supporting operator views
- Modify: `src/components/WorkspaceCommandCenter.tsx`
- Modify: `src/components/TaskReviewPanel.tsx`
- Possibly modify: `src/app/workspace/[slug]/page.tsx`
- Possibly modify: `src/app/workspace/[slug]/review/page.tsx`

### Types / utility / persistence support
- Modify if needed: `src/lib/types.ts`
- Create if needed: `src/lib/ui/operator-prefs.ts`
- Create if needed: `src/hooks/useKeyboardShortcuts.ts`
- Create if needed: `src/components/WorkspaceQuickActions.tsx`
- Create if needed: `src/components/WorkspaceAttentionBadge.tsx`

### Tests / verification
- Create if useful: lightweight component/unit tests for sorting/filter logic
- Use browser-based manual verification for final acceptance

---

## Phase 1 — Upgrade workspace home into a real operator board

### Task 1: Add top summary bar with operator metrics

**Objective:** Turn the home page into a quick command summary rather than only a grid of cards.

**Files:**
- Modify: `src/components/WorkspaceDashboard.tsx`

**Implementation:**
Add a compact summary bar above the workspace grid with cards/chips for:
- total workspaces
- total open tasks
- total in-progress tasks
- total active agents
- workspaces needing attention

Use existing workspace stats data first; if task-status granularity is insufficient, fetch `/api/tasks` alongside `/api/workspaces?stats=true`.

**Verification:**
- Home dashboard shows summary metrics before the workspace cards.
- Metrics update on reload and match real data.

**Commit:**
```bash
git add src/components/WorkspaceDashboard.tsx
git commit -m "feat: add operator summary metrics to workspace dashboard"
```

### Task 2: Add search, filter, and sort controls to workspace dashboard

**Objective:** Reduce scanning overhead when many workspaces exist.

**Files:**
- Modify: `src/components/WorkspaceDashboard.tsx`

**Implementation:**
Add a toolbar above the grid with:
- text search by workspace name/slug
- filter toggles:
  - has tasks
  - has agents
  - needs attention
  - empty
- sort options:
  - most tasks
  - most agents
  - alphabetical
  - recently active (if available; otherwise defer or derive from task/event metadata only if low-effort)

Use local memoized client-side filtering/sorting.

**Verification:**
- Search narrows cards live.
- Sorting changes grid order correctly.
- Filters can be combined without visual breakage.

**Commit:**
```bash
git add src/components/WorkspaceDashboard.tsx
git commit -m "feat: add workspace dashboard search filter and sorting controls"
```

### Task 3: Add semantic attention badges to workspace cards

**Objective:** Make risky workspaces visually obvious.

**Files:**
- Modify: `src/components/WorkspaceDashboard.tsx`
- Create: `src/components/WorkspaceAttentionBadge.tsx` (optional)

**Implementation:**
Convert plain counts into chips/badges with meaning:
- tasks badge
- agents badge
- conditional `Needs Attention` badge when:
  - tasks > 0 and agents == 0
  - or another simple high-signal heuristic available from existing stats

Also color/highlight metrics:
- high task counts in amber/red
- empty but harmless in muted gray
- attention badge in amber/red

**Verification:**
- Risky workspace cards are easier to spot visually.
- Low-risk/empty cards remain quieter.

**Commit:**
```bash
git add src/components/WorkspaceDashboard.tsx src/components/WorkspaceAttentionBadge.tsx
git commit -m "feat: add semantic workspace attention badges"
```

### Task 4: Add pinned/recent workspaces section

**Objective:** Let the operator reach high-frequency workspaces immediately.

**Files:**
- Modify: `src/components/WorkspaceDashboard.tsx`
- Create if needed: `src/lib/ui/operator-prefs.ts`

**Implementation:**
Add a `Pinned` or `Recent` section above `All Workspaces`.

Low-risk persistence options:
- localStorage only
- store pinned workspace slugs and recent workspace visits

Features:
- pin/unpin from card
- auto-show recent 3–5 workspaces

**Verification:**
- Pinning persists across reloads.
- Pinned/recent section appears above full grid.

**Commit:**
```bash
git add src/components/WorkspaceDashboard.tsx src/lib/ui/operator-prefs.ts
git commit -m "feat: add pinned and recent workspaces to dashboard"
```

### Task 5: Add quick actions on workspace cards

**Objective:** Reduce navigation steps for common operator actions.

**Files:**
- Modify: `src/components/WorkspaceDashboard.tsx`
- Create: `src/components/WorkspaceQuickActions.tsx` (optional)

**Implementation:**
Add a card-level quick action menu or inline icon cluster for:
- open workspace
- open review
- open planning
- open agents
- settings
- existing delete/archive path where allowed

Prefer a small overflow menu so cards stay clean.

**Verification:**
- Quick actions are reachable without opening the workspace first.
- Card click still works normally.
- Delete behavior remains safe and unchanged.

**Commit:**
```bash
git add src/components/WorkspaceDashboard.tsx src/components/WorkspaceQuickActions.tsx
git commit -m "feat: add workspace card quick actions"
```

### Task 6: Clean hierarchy and CTA duplication on workspace home

**Objective:** Improve visual clarity with minimal redesign.

**Files:**
- Modify: `src/components/WorkspaceDashboard.tsx`

**Implementation:**
Refine:
- stronger title hierarchy
- smaller/lower-contrast slug text
- more compact metrics row
- better hover affordance on cards
- either remove or restyle the bottom “Add Workspace” tile so it does not compete with top-right primary CTA

**Verification:**
- Page feels cleaner and more command-oriented.
- CTA hierarchy is unambiguous.

**Commit:**
```bash
git add src/components/WorkspaceDashboard.tsx
git commit -m "refactor: improve workspace dashboard hierarchy and cta clarity"
```

---

## Phase 2 — Improve operations home for triage speed

### Task 7: Add stronger prioritization to “Attention by Workspace”

**Objective:** Make operations page rank and explain urgency better.

**Files:**
- Modify: `src/app/operations/page.tsx`

**Implementation:**
Sort `Attention by Workspace` by urgency, using simple heuristics from current data:
- review/testing first
- higher task count next
- planning/pending_dispatch next

Add per-workspace chips such as:
- `review`
- `planning`
- `pending dispatch`
- `2 tasks need attention`

**Verification:**
- The most urgent workspaces appear first.
- Workspace cards explain *why* attention is needed.

**Commit:**
```bash
git add src/app/operations/page.tsx
git commit -m "feat: prioritize and clarify workspace attention states on operations home"
```

### Task 8: Upgrade Recent Important Events into a usable operational feed

**Objective:** Make event feed easier to scan and navigate.

**Files:**
- Modify: `src/app/operations/page.tsx`

**Implementation:**
Add:
- event type chip
- timestamp formatting
- optional workspace/task link where derivable
- tighter grouping/spacing
- color semantics for important types

**Verification:**
- Operators can identify what happened, where, and why faster.

**Commit:**
```bash
git add src/app/operations/page.tsx
git commit -m "feat: improve operations event feed readability and linking"
```

### Task 9: Expand Quick Routes into operator presets

**Objective:** Make Operations page a launchpad for real workflows.

**Files:**
- Modify: `src/app/operations/page.tsx`

**Implementation:**
Replace hard-coded or narrow quick routes with a more useful preset block:
- most active workspace review
- default workspace agents
- system admin
- mission-control execution workspace
- pinned routes if available

**Verification:**
- Quick Routes feel relevant to active operations instead of static examples.

**Commit:**
```bash
git add src/app/operations/page.tsx
git commit -m "feat: upgrade operations quick routes into operator presets"
```

---

## Phase 3 — Improve system admin scanability

### Task 10: Make Gateway/System Admin health more glanceable

**Objective:** Let the operator spot system issues instantly.

**Files:**
- Modify: `src/app/admin/system/page.tsx`

**Implementation:**
Enhance the top metrics and status panel with stronger semantic treatment:
- green/amber/red state chips
- explicit error/warning callouts
- clearer difference between connected vs degraded vs session mismatch

If `execution_monitor` is already exposed in status APIs, surface it here too.

**Verification:**
- Operator can read gateway + monitor state without parsing raw text blocks.

**Commit:**
```bash
git add src/app/admin/system/page.tsx
git commit -m "feat: improve system admin health scanability"
```

### Task 11: Add actionable session and agent affordances

**Objective:** Reduce friction when triaging sessions/agents.

**Files:**
- Modify: `src/app/admin/system/page.tsx`

**Implementation:**
For active sessions/importable agents, add practical operator affordances such as:
- copy session id
- open diagnostics/history
- open related workspace/task if known
- stronger status labels

Keep this low-risk and additive.

**Verification:**
- Session and agent panels become easier to operate directly.

**Commit:**
```bash
git add src/app/admin/system/page.tsx
git commit -m "feat: add actionable session and agent affordances to system admin"
```

---

## Phase 4 — Add operator ergonomics across the app

### Task 12: Add keyboard shortcuts for command-surface actions

**Objective:** Improve speed for power users.

**Files:**
- Modify: `src/components/Header.tsx`
- Create if needed: `src/hooks/useKeyboardShortcuts.ts`

**Implementation:**
Add low-risk keyboard shortcuts:
- `/` focus search/filter if visible
- `g o` or similar for Operations
- `g s` for System
- `n` for New Workspace

If multi-key sequences are too much for first pass, start with single-key shortcuts behind a safe focus guard.

**Verification:**
- Shortcuts do not trigger inside text inputs.
- Actions are discoverable in UI hint text or help tooltip.

**Commit:**
```bash
git add src/components/Header.tsx src/hooks/useKeyboardShortcuts.ts
git commit -m "feat: add operator keyboard shortcuts"
```

### Task 13: Improve review/command surfaces where daily triage happens

**Objective:** Carry the same visual logic into detailed workspace surfaces.

**Files:**
- Modify: `src/components/WorkspaceCommandCenter.tsx`
- Modify: `src/components/TaskReviewPanel.tsx`
- Possibly modify: `src/app/workspace/[slug]/review/page.tsx`

**Implementation:**
Add the same semantics used on top-level pages:
- clearer attention chips
- better stat hierarchy
- stronger action grouping
- visible “next operator action” affordance where possible

**Verification:**
- Detailed triage surfaces feel consistent with new dashboard/operations behavior.

**Commit:**
```bash
git add src/components/WorkspaceCommandCenter.tsx src/components/TaskReviewPanel.tsx src/app/workspace/[slug]/review/page.tsx
git commit -m "refactor: align review and command surfaces with operator-first ui"
```

---

## Verification plan

### Manual browser verification
Check all of these in the live app:
1. Home dashboard
   - search/filter/sort works
   - pinned/recent section works
   - risky workspaces stand out
   - quick actions behave correctly
2. Operations page
   - highest urgency workspaces appear first
   - event feed is easier to scan
   - quick routes are useful
3. System Admin
   - health state is immediately readable
   - sessions/agents have better action affordances
4. Keyboard shortcuts
   - only work when appropriate
   - do not interfere with typing/forms

### Regression checks
Run:
```bash
npm run lint
npm run build
```

If component tests are added:
```bash
node --import tsx --test <added-test-files>
```

---

## Recommended implementation order

Highest-value quick wins first:
1. Task 1 — top summary bar
2. Task 2 — search/filter/sort
3. Task 3 — attention badges
4. Task 4 — pinned/recent
5. Task 5 — quick actions
6. Task 7 — operations prioritization
7. Task 8 — event feed readability
8. Task 10 — system admin health scanability
9. Task 12 — keyboard shortcuts
10. Task 13 — detailed surface alignment

---

## Definition of done

This UI/UX initiative is done when:
1. La Citadel home feels like an operator command board, not just a workspace directory.
2. High-risk workspaces are visually obvious.
3. High-frequency navigation is meaningfully faster.
4. Operations and system admin surfaces are easier to scan and act from.
5. Build/lint/manual verification pass.
6. The UI reduces operator friction for the next deep working sessions.
