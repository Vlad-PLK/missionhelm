# MissionHelm Production Cutover Plan (Safe Merge from Current Mission Control Runtime)

> For Hermes: execute in phases, verify each gate, and do not delete rollback artifacts until 7-day stability passes.

Goal
- Move production runtime identity from Mission Control -> MissionHelm without losing credentials, DB state, workspace files, or OpenClaw connectivity.

Current verified baseline
- Running container: mission-control
- Image: mission-control:latest
- DB path in container: /app/data/mission-control.db
- Workspace path in container: /app/workspace
- OpenClaw gateway target: ws://127.0.0.1:18789
- Dashboard/API endpoint: http://127.0.0.1:4000
- Source repo: https://github.com/Vlad-PLK/missionhelm (public)

Non-negotiables
1) Preserve data volumes and DB file
2) Preserve env secrets/tokens (never print values)
3) Preserve API behavior and OpenClaw connectivity
4) Keep rollback path under 2 minutes

---

## Phase 0 — Change Freeze + Snapshot

Objective
- Create a restorable snapshot before changing runtime identity.

Steps
1. Freeze deploys during cutover window (no concurrent pushes/restarts).
2. Capture runtime receipts:
   - docker ps
   - docker inspect mission-control (image/env/volumes)
   - curl /api/openclaw/status and /api/health/readiness
3. Backup DB + workspace (host-level backup artifact):
   - DB export/copy from mounted volume
   - workspace tarball
4. Tag currently running image as rollback alias:
   - mission-control:pre-missionhelm-cutover

Verification gate
- Backups exist and are readable
- Rollback image tag exists

Rollback (Phase 0)
- none needed; no runtime mutation yet

---

## Phase 1 — Create MissionHelm Runtime Manifests (Compatibility-First)

Objective
- Introduce MissionHelm service definitions while keeping data paths and env semantics stable.

Design choice (recommended)
- Keep existing volume names initially (mission-control-data, mission-control-workspace)
- Keep env keys currently used by app code (e.g., MISSION_CONTROL_URL) until dedicated rename release
- Rebrand external identity first, infra internals second

Files to create/modify
- Create: deploy/compose/missionhelm.compose.yml
- Create: deploy/env/missionhelm.env.template (no secret values)
- Create: deploy/scripts/cutover-check.sh
- Create: deploy/scripts/rollback-missionhelm.sh

Key settings in missionhelm.compose.yml
- service name: missionhelm
- container_name: missionhelm
- image: missionhelm:latest (or pinned sha)
- network_mode: host
- volumes:
  - mission-control-data:/app/data
  - mission-control-workspace:/app/workspace
- env_file: missionhelm.env (local, not committed)
- environment defaults:
  - NODE_ENV=production
  - DATABASE_PATH=/app/data/mission-control.db
  - WORKSPACE_BASE_PATH=/app/workspace
  - PROJECTS_PATH=/app/workspace/projects
  - OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789

Verification gate
- Compose config validates (`docker compose -f ... config`)
- No secrets committed in git

Rollback (Phase 1)
- none; not switched traffic yet

---

## Phase 2 — Parallel Staging on Alternate Port (No Traffic Cut)

Objective
- Run MissionHelm in parallel and prove parity before replacing prod.

Steps
1. Build missionhelm image from current missionhelm-main commit.
2. Start parallel container on alternate port (e.g., 4002) OR host alias route.
3. Point parallel runtime to same OpenClaw gateway and same data volumes (read/write as per current behavior; run in low-traffic window).
4. Execute smoke tests on parallel endpoint:
   - /api/openclaw/status
   - /api/tasks
   - /api/workspaces?stats=true
   - critical UI route load
5. Validate task lifecycle transitions and webhook path with a test task.

Verification gate
- API parity pass (status codes + response shapes)
- No DB migration regressions
- No OpenClaw session breakage

Rollback (Phase 2)
- Stop parallel missionhelm container; existing mission-control remains primary

---

## Phase 3 — Controlled Cutover to MissionHelm

Objective
- Switch primary runtime from mission-control to missionhelm with rapid rollback capability.

Steps
1. Stop mission-control container (do not remove volumes/images).
2. Start missionhelm container bound to production port 4000.
3. Run immediate health checks:
   - curl /api/openclaw/status
   - curl /api/health/readiness
   - one task creation/update check
4. Monitor logs for 10-15 minutes:
   - DB errors
   - websocket/auth errors
   - 5xx spikes

Verification gate
- All checks green for 15 min
- no sustained 5xx
- OpenClaw connected=true

Rollback (Phase 3)
1. Stop missionhelm
2. Start mission-control using pre-cutover image/tag
3. Re-run health checks

Expected rollback duration: 1-2 minutes

---

## Phase 4 — Stabilization (72h) + Deferred Cleanup

Objective
- Keep reversibility while validating real workload behavior.

Steps
1. Keep rollback image tags and compose files for 72h minimum.
2. Daily verification:
   - API health/readiness
   - OpenClaw status
   - task/workspace consistency
3. After 72h, optional cleanup:
   - remove unused old container name aliases
   - keep backup branch/tag and backup artifacts
4. After 7 days stable, optional infra naming cleanup:
   - rename volume labels and DB filename to missionhelm equivalents (requires dedicated migration window)

Verification gate
- 72h no major incident
- no data drift reports

---

## Credential and Secret Preservation Rules

- Never rewrite or rotate secrets during identity cutover unless compromise is suspected.
- Reuse existing env secret material from current production env file.
- Do not print secret values to terminal or logs.
- Keep env key compatibility first; rename keys in a later explicit migration.

---

## Practical Command Checklist (Execution Day)

Preflight
- git checkout missionhelm-main
- git pull origin main
- docker ps
- docker inspect mission-control

Backup
- backup DB file and workspace tar
- docker image tag mission-control:latest mission-control:pre-missionhelm-cutover

Parallel verify
- docker compose -f deploy/compose/missionhelm.compose.yml up -d missionhelm-parallel
- run smoke checks against alternate endpoint

Cutover
- docker stop mission-control
- docker compose -f deploy/compose/missionhelm.compose.yml up -d missionhelm
- run smoke checks on :4000

Rollback (if needed)
- docker stop missionhelm
- docker run ... mission-control:pre-missionhelm-cutover

---

## Scope Separation (Important)

- Public repo identity: MissionHelm (already done)
- Production operational identity: migrate safely in phases
- Keep infrastructure continuity over cosmetic renaming

This plan intentionally prioritizes runtime safety and data continuity over immediate internal naming purity.
