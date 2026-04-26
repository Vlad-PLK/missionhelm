# Codex-First Dispatch Hardening Plan

Goal: Make La Citadel coding-task execution Codex-first, keep OpenCode as optional fallback, and enforce safer assignment/dispatch behavior for code-lead workflows.

## Step 1 — Simplify executor template
- File: `src/lib/prompt-templates.ts`
- Codex path now uses strict two-phase pipeline:
  - **PLAN**: `codex exec --sandbox read-only --ask-for-approval never --reasoning-effort high --json`
  - **BUILD**: `codex exec --sandbox workspace-write --ask-for-approval never --reasoning-effort medium --json`
- PLAN output is persisted to `.mission-control/plans/<task-id>.json` and validated before BUILD.
- Prompt enforces deterministic JSON schema (`steps[].id`, `steps[].type`, `steps[].params`) and no prose outside JSON.
- OpenCode branch remains available when `MC_CODING_EXECUTOR=opencode`.

### New codex tuning env vars
- `MC_CODEX_MODEL` (default `gpt-5.4`)
- `MC_CODEX_PLAN_REASONING` (default `high`)
- `MC_CODEX_BUILD_REASONING` (default `medium`)
- `MC_CODEX_PLAN_SANDBOX` (default `read-only`)
- `MC_CODEX_BUILD_SANDBOX` (default `workspace-write`)

## Step 2 — Enforce coding dispatch prerequisite
- File: `src/app/api/tasks/[id]/dispatch/route.ts`
- For coding tasks, block dispatch when workspace `folder_path` is missing.
- Return `409` with remediation message instead of sending an unusable prompt.

## Step 3 — Default assignment toward code-lead
- File: `src/app/api/tasks/route.ts`
- If task is coding-like and no explicit `assigned_agent_id`, auto-assign code-lead:
  - Prefer code-lead in same workspace
  - Fallback to global/gateway code-lead

## Step 4 — Improve route-agent recommendation bias
- File: `src/app/api/tasks/[id]/route-agent/route.ts`
- Add strong score bias for `code-lead` on coding-like tasks.

## Step 5 — Verify
- Run typecheck: `npx tsc --noEmit`
- Verify runtime API health and key task routes remain functional.

## Rollout note
- Runtime container must be rebuilt/redeployed for API/template behavior changes to take effect in production.
