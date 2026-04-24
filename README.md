# La Citadel

La Citadel is our **Hermès-first centralized command platform** for orchestrating AI delivery across projects, workspaces, and agents.

It is designed for one job: keep execution moving from intent to verified completion with full operational visibility.

La Citadel positions the system as a single, powerful operations citadel: one control plane, one runtime truth, one place to command execution.

---

## What this repository is

La Citadel combines:

- **Hermès (operator brain):** intake, triage, dispatch, verification, recovery
- **La Citadel (control plane):** dashboard + APIs + workflow enforcement
- **OpenClaw (execution runtime):** agent sessions and tool-capable task execution
- **Session telemetry:** traceable activity, deliverables, and state transitions

This repo is our canonical implementation for that process.

---

## Product philosophy

1. **Execution-first over planning theater**
2. **Runtime truth over assumptions**
3. **Receipts over claims**
4. **Operator control with automated momentum**
5. **Review gates before closure**

---

## Core lifecycle

Task lifecycle in La Citadel:

```text
pending_dispatch -> planning -> inbox -> assigned -> in_progress -> testing -> review -> done
```

Operational meaning:

- `pending_dispatch`: queued to dispatch runtime
- `planning`: AI planning / clarifications in progress
- `inbox`: ready for operator assignment
- `assigned`: linked to agent, dispatch ready
- `in_progress`: active execution
- `testing`: verification stage
- `review`: human/owner validation gate
- `done`: accepted and closed

A task is considered complete only when:
- implementation exists,
- verification passes,
- activity + deliverables are logged,
- closure is explicit.

---

## Session model (important)

La Citadel is session-centric. We track multiple layers:

- **OpenClaw execution sessions** (`openclaw_sessions`) for runtime activity
- **Sub-agent sessions** registered under task context
- **Operator session receipts** in `task_activities` and `events`
- **Conversation continuity** through Hermès handoffs (including Telegram operations)

If work is not visible in sessions/activities/deliverables, it is operationally incomplete.

---

## Runtime truth surfaces

Primary health and state surfaces:

- `GET /` (dashboard reachability)
- `GET /api/tasks`
- `GET /api/workspaces?stats=true`
- `GET /api/agents`
- `GET /api/openclaw/status`

Note: `/api/health` may not exist in all deployments; do not use it as sole health signal.

---

## Local quick start

### Prerequisites

- Node.js 18+
- OpenClaw gateway running and reachable
- Gateway token configured

### Setup

```bash
git clone https://github.com/Vlad-PLK/missionhelm.git
cd missionhelm
npm install
cp .env.example .env.local
```

Set at minimum:

```env
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=***
```

Run:

```bash
npm run dev
```

Open: `http://localhost:4000`

---

## Production baseline

```bash
npm run build
npx next start -p 4000
```

For containerized deployment, use `docker-compose.yml` with persistent volume mounts for `/app/data` and `/app/workspace`.

---

## Documentation map

- `ORCHESTRATION.md` — master operator playbook (Hermès + La Citadel + OpenClaw)
- `docs/AGENT_PROTOCOL.md` — strict agent reporting protocol and status hygiene
- `docs/ORCHESTRATION_WORKFLOW.md` — API-level orchestration workflow and receipts
- `PRODUCTION_SETUP.md` — production deployment baseline
- `VERIFICATION_CHECKLIST.md` — runtime verification and release confidence checks

---

## Security and safety

- Bearer-token API auth supported (`MC_API_TOKEN`)
- Webhook signature support (`WEBHOOK_SECRET`)
- Zod schema validation across API boundaries
- Approval governance on critical transitions (review -> done)

Never treat configuration as equivalent to verified runtime.

---

## Source note

This repository began as a fork of the original open-source Mission Control project and has been reshaped into our own La Citadel operating model.

---

## License

MIT — see `LICENSE`.
