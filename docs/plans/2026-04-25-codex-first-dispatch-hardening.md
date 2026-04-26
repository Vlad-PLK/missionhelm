     1|# Codex-First Dispatch Hardening Plan
     2|
     3|Goal: Make La Citadel coding-task execution Codex-first, keep OpenCode as optional fallback, and enforce safer assignment/dispatch behavior for code-lead workflows.
     4|
     5|## Step 1 — Simplify executor template
     6|- File: `src/lib/prompt-templates.ts`
     7|- Codex path now uses strict two-phase pipeline:
     8|  - **PLAN**: `codex exec --sandbox read-only --ask-for-approval never --reasoning-effort high --json`
     9|  - **BUILD**: `codex exec --sandbox workspace-write --ask-for-approval never --reasoning-effort medium --json`
    10|- PLAN output is persisted to `.la-citadel/plans/<task-id>.json` and validated before BUILD.
    11|- Prompt enforces deterministic JSON schema (`steps[].id`, `steps[].type`, `steps[].params`) and no prose outside JSON.
    12|- OpenCode branch remains available when `MC_CODING_EXECUTOR=opencode`.
    13|
    14|### New codex tuning env vars
    15|- `MC_CODEX_MODEL` (default `gpt-5.4`)
    16|- `MC_CODEX_PLAN_REASONING` (default `high`)
    17|- `MC_CODEX_BUILD_REASONING` (default `medium`)
    18|- `MC_CODEX_PLAN_SANDBOX` (default `read-only`)
    19|- `MC_CODEX_BUILD_SANDBOX` (default `workspace-write`)
    20|
    21|## Step 2 — Enforce coding dispatch prerequisite
    22|- File: `src/app/api/tasks/[id]/dispatch/route.ts`
    23|- For coding tasks, block dispatch when workspace `folder_path` is missing.
    24|- Return `409` with remediation message instead of sending an unusable prompt.
    25|
    26|## Step 3 — Default assignment toward code-lead
    27|- File: `src/app/api/tasks/route.ts`
    28|- If task is coding-like and no explicit `assigned_agent_id`, auto-assign code-lead:
    29|  - Prefer code-lead in same workspace
    30|  - Fallback to global/gateway code-lead
    31|
    32|## Step 4 — Improve route-agent recommendation bias
    33|- File: `src/app/api/tasks/[id]/route-agent/route.ts`
    34|- Add strong score bias for `code-lead` on coding-like tasks.
    35|
    36|## Step 5 — Verify
    37|- Run typecheck: `npx tsc --noEmit`
    38|- Verify runtime API health and key task routes remain functional.
    39|
    40|## Rollout note
    41|- Runtime container must be rebuilt/redeployed for API/template behavior changes to take effect in production.
    42|