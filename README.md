     1|# La Citadel
     2|
     3|La Citadel is our **Hermès-first centralized command platform** for orchestrating AI delivery across projects, workspaces, and agents.
     4|
     5|It is designed for one job: keep execution moving from intent to verified completion with full operational visibility.
     6|
     7|La Citadel positions the system as a single, powerful operations citadel: one control plane, one runtime truth, one place to command execution.
     8|
     9|---
    10|
    11|## What this repository is
    12|
    13|La Citadel combines:
    14|
    15|- **Hermès (operator brain):** intake, triage, dispatch, verification, recovery
    16|- **La Citadel (control plane):** dashboard + APIs + workflow enforcement
    17|- **OpenClaw (execution runtime):** agent sessions and tool-capable task execution
    18|- **Session telemetry:** traceable activity, deliverables, and state transitions
    19|
    20|This repo is our canonical implementation for that process.
    21|
    22|---
    23|
    24|## Product philosophy
    25|
    26|1. **Execution-first over planning theater**
    27|2. **Runtime truth over assumptions**
    28|3. **Receipts over claims**
    29|4. **Operator control with automated momentum**
    30|5. **Review gates before closure**
    31|
    32|---
    33|
    34|## Core lifecycle
    35|
    36|Task lifecycle in La Citadel:
    37|
    38|```text
    39|pending_dispatch -> planning -> inbox -> assigned -> in_progress -> testing -> review -> done
    40|```
    41|
    42|Operational meaning:
    43|
    44|- `pending_dispatch`: queued to dispatch runtime
    45|- `planning`: AI planning / clarifications in progress
    46|- `inbox`: ready for operator assignment
    47|- `assigned`: linked to agent, dispatch ready
    48|- `in_progress`: active execution
    49|- `testing`: verification stage
    50|- `review`: human/owner validation gate
    51|- `done`: accepted and closed
    52|
    53|A task is considered complete only when:
    54|- implementation exists,
    55|- verification passes,
    56|- activity + deliverables are logged,
    57|- closure is explicit.
    58|
    59|---
    60|
    61|## Session model (important)
    62|
    63|La Citadel is session-centric. We track multiple layers:
    64|
    65|- **OpenClaw execution sessions** (`openclaw_sessions`) for runtime activity
    66|- **Sub-agent sessions** registered under task context
    67|- **Operator session receipts** in `task_activities` and `events`
    68|- **Conversation continuity** through Hermès handoffs (including Telegram operations)
    69|
    70|If work is not visible in sessions/activities/deliverables, it is operationally incomplete.
    71|
    72|---
    73|
    74|## Runtime truth surfaces
    75|
    76|Primary health and state surfaces:
    77|
    78|- `GET /` (dashboard reachability)
    79|- `GET /api/tasks`
    80|- `GET /api/workspaces?stats=true`
    81|- `GET /api/agents`
    82|- `GET /api/openclaw/status`
    83|
    84|Note: `/api/health` may not exist in all deployments; do not use it as sole health signal.
    85|
    86|---
    87|
    88|## Local quick start
    89|
    90|### Prerequisites
    91|
    92|- Node.js 18+
    93|- OpenClaw gateway running and reachable
    94|- Gateway token configured
    95|
    96|### Setup
    97|
    98|```bash
    99|git clone https://github.com/Vlad-PLK/la citadel.git
   100|cd la citadel
   101|npm install
   102|cp .env.example .env.local
   103|```
   104|
   105|Set at minimum:
   106|
   107|```env
   108|OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
   109|OPENCLAW_GATEWAY_TOKEN=***
   110|```
   111|
   112|Run:
   113|
   114|```bash
   115|npm run dev
   116|```
   117|
   118|Open: `http://localhost:4000`
   119|
   120|---
   121|
   122|## Production baseline
   123|
   124|```bash
   125|npm run build
   126|npx next start -p 4000
   127|```
   128|
   129|For containerized deployment, use `docker-compose.yml` with persistent volume mounts for `/app/data` and `/app/workspace`.
   130|
   131|---
   132|
   133|## Documentation map
   134|
   135|- `ORCHESTRATION.md` — master operator playbook (Hermès + La Citadel + OpenClaw)
   136|- `docs/AGENT_PROTOCOL.md` — strict agent reporting protocol and status hygiene
   137|- `docs/ORCHESTRATION_WORKFLOW.md` — API-level orchestration workflow and receipts
   138|- `PRODUCTION_SETUP.md` — production deployment baseline
   139|- `VERIFICATION_CHECKLIST.md` — runtime verification and release confidence checks
   140|
   141|---
   142|
   143|## Security and safety
   144|
   145|- Bearer-token API auth supported (`MC_API_TOKEN`)
   146|- Webhook signature support (`WEBHOOK_SECRET`)
   147|- Zod schema validation across API boundaries
   148|- Approval governance on critical transitions (review -> done)
   149|
   150|Never treat configuration as equivalent to verified runtime.
   151|
   152|---
   153|
   154|## Source note
   155|
   156|This repository began as a fork of the original open-source La Citadel project and has been reshaped into our own La Citadel operating model.
   157|
   158|---
   159|
   160|## License
   161|
   162|MIT — see `LICENSE`.
   163|