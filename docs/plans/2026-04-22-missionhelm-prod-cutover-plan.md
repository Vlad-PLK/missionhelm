     1|# La Citadel Production Cutover Plan (Safe Merge from Current Production Runtime)
     2|
     3|> For Hermes: execute in phases, verify each gate, and do not delete rollback artifacts until 7-day stability passes.
     4|
     5|Goal
     6|- Move production runtime identity to La Citadel without losing credentials, DB state, workspace files, or OpenClaw connectivity.
     7|
     8|Current verified baseline
     9|- Running container: la-citadel
    10|- Image: la-citadel:latest
    11|- DB path in container: /app/data/la-citadel.db
    12|- Workspace path in container: /app/workspace
    13|- OpenClaw gateway target: ws://127.0.0.1:18789
    14|- Dashboard/API endpoint: http://127.0.0.1:4000
    15|- Source repo: https://github.com/Vlad-PLK/la citadel (public)
    16|
    17|Non-negotiables
    18|1) Preserve data volumes and DB file
    19|2) Preserve env secrets/tokens (never print values)
    20|3) Preserve API behavior and OpenClaw connectivity
    21|4) Keep rollback path under 2 minutes
    22|
    23|---
    24|
    25|## Phase 0 — Change Freeze + Snapshot
    26|
    27|Objective
    28|- Create a restorable snapshot before changing runtime identity.
    29|
    30|Steps
    31|1. Freeze deploys during cutover window (no concurrent pushes/restarts).
    32|2. Capture runtime receipts:
    33|   - docker ps
    34|   - docker inspect la-citadel (image/env/volumes)
    35|   - curl /api/openclaw/status and /api/health/readiness
    36|3. Backup DB + workspace (host-level backup artifact):
    37|   - DB export/copy from mounted volume
    38|   - workspace tarball
    39|4. Tag currently running image as rollback alias:
    40|   - la-citadel:pre-la citadel-cutover
    41|
    42|Verification gate
    43|- Backups exist and are readable
    44|- Rollback image tag exists
    45|
    46|Rollback (Phase 0)
    47|- none needed; no runtime mutation yet
    48|
    49|---
    50|
    51|## Phase 1 — Create La Citadel Runtime Manifests (Compatibility-First)
    52|
    53|Objective
    54|- Introduce La Citadel service definitions while keeping data paths and env semantics stable.
    55|
    56|Design choice (recommended)
    57|- Keep existing volume names initially (la-citadel-data, la-citadel-workspace)
    58|- Keep env keys currently used by app code (e.g., MISSION_CONTROL_URL) until dedicated rename release
    59|- Rebrand external identity first, infra internals second
    60|
    61|Files to create/modify
    62|- Create: deploy/compose/la citadel.compose.yml
    63|- Create: deploy/env/la citadel.env.template (no secret values)
    64|- Create: deploy/scripts/cutover-check.sh
    65|- Create: deploy/scripts/rollback-la citadel.sh
    66|
    67|Key settings in la citadel.compose.yml
    68|- service name: la citadel
    69|- container_name: la citadel
    70|- image: la citadel:latest (or pinned sha)
    71|- network_mode: host
    72|- volumes:
    73|  - la-citadel-data:/app/data
    74|  - la-citadel-workspace:/app/workspace
    75|- env_file: la citadel.env (local, not committed)
    76|- environment defaults:
    77|  - NODE_ENV=production
    78|  - DATABASE_PATH=/app/data/la-citadel.db
    79|  - WORKSPACE_BASE_PATH=/app/workspace
    80|  - PROJECTS_PATH=/app/workspace/projects
    81|  - OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
    82|
    83|Verification gate
    84|- Compose config validates (`docker compose -f ... config`)
    85|- No secrets committed in git
    86|
    87|Rollback (Phase 1)
    88|- none; not switched traffic yet
    89|
    90|---
    91|
    92|## Phase 2 — Parallel Staging on Alternate Port (No Traffic Cut)
    93|
    94|Objective
    95|- Run La Citadel in parallel and prove parity before replacing prod.
    96|
    97|Steps
    98|1. Build la citadel image from current la citadel-main commit.
    99|2. Start parallel container on alternate port (e.g., 4002) OR host alias route.
   100|3. Point parallel runtime to same OpenClaw gateway and same data volumes (read/write as per current behavior; run in low-traffic window).
   101|4. Execute smoke tests on parallel endpoint:
   102|   - /api/openclaw/status
   103|   - /api/tasks
   104|   - /api/workspaces?stats=true
   105|   - critical UI route load
   106|5. Validate task lifecycle transitions and webhook path with a test task.
   107|
   108|Verification gate
   109|- API parity pass (status codes + response shapes)
   110|- No DB migration regressions
   111|- No OpenClaw session breakage
   112|
   113|Rollback (Phase 2)
   114|- Stop parallel la citadel container; existing la-citadel remains primary
   115|
   116|---
   117|
   118|## Phase 3 — Controlled Cutover to La Citadel
   119|
   120|Objective
   121|- Switch primary runtime from la-citadel to la citadel with rapid rollback capability.
   122|
   123|Steps
   124|1. Stop la-citadel container (do not remove volumes/images).
   125|2. Start la citadel container bound to production port 4000.
   126|3. Run immediate health checks:
   127|   - curl /api/openclaw/status
   128|   - curl /api/health/readiness
   129|   - one task creation/update check
   130|4. Monitor logs for 10-15 minutes:
   131|   - DB errors
   132|   - websocket/auth errors
   133|   - 5xx spikes
   134|
   135|Verification gate
   136|- All checks green for 15 min
   137|- no sustained 5xx
   138|- OpenClaw connected=true
   139|
   140|Rollback (Phase 3)
   141|1. Stop la citadel
   142|2. Start la-citadel using pre-cutover image/tag
   143|3. Re-run health checks
   144|
   145|Expected rollback duration: 1-2 minutes
   146|
   147|---
   148|
   149|## Phase 4 — Stabilization (72h) + Deferred Cleanup
   150|
   151|Objective
   152|- Keep reversibility while validating real workload behavior.
   153|
   154|Steps
   155|1. Keep rollback image tags and compose files for 72h minimum.
   156|2. Daily verification:
   157|   - API health/readiness
   158|   - OpenClaw status
   159|   - task/workspace consistency
   160|3. After 72h, optional cleanup:
   161|   - remove unused old container name aliases
   162|   - keep backup branch/tag and backup artifacts
   163|4. After 7 days stable, optional infra naming cleanup:
   164|   - rename volume labels and DB filename to la citadel equivalents (requires dedicated migration window)
   165|
   166|Verification gate
   167|- 72h no major incident
   168|- no data drift reports
   169|
   170|---
   171|
   172|## Credential and Secret Preservation Rules
   173|
   174|- Never rewrite or rotate secrets during identity cutover unless compromise is suspected.
   175|- Reuse existing env secret material from current production env file.
   176|- Do not print secret values to terminal or logs.
   177|- Keep env key compatibility first; rename keys in a later explicit migration.
   178|
   179|---
   180|
   181|## Practical Command Checklist (Execution Day)
   182|
   183|Preflight
   184|- git checkout la citadel-main
   185|- git pull origin main
   186|- docker ps
   187|- docker inspect la-citadel
   188|
   189|Backup
   190|- backup DB file and workspace tar
   191|- docker image tag la-citadel:latest la-citadel:pre-la citadel-cutover
   192|
   193|Parallel verify
   194|- docker compose -f deploy/compose/la citadel.compose.yml up -d la citadel-parallel
   195|- run smoke checks against alternate endpoint
   196|
   197|Cutover
   198|- docker stop la-citadel
   199|- docker compose -f deploy/compose/la citadel.compose.yml up -d la citadel
   200|- run smoke checks on :4000
   201|
   202|Rollback (if needed)
   203|- docker stop la citadel
   204|- docker run ... la-citadel:pre-la citadel-cutover
   205|
   206|---
   207|
   208|## Scope Separation (Important)
   209|
   210|- Public repo identity: La Citadel (already done)
   211|- Production operational identity: migrate safely in phases
   212|- Keep infrastructure continuity over cosmetic renaming
   213|
   214|This plan intentionally prioritizes runtime safety and data continuity over immediate internal naming purity.
   215|