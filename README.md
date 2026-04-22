<h1 align="center">MissionHelm</h1>

<p align="center">
  <em>Formerly known as Mission Control</em><br>
  <a href="https://github.com/Vlad-PLK/missionhelm">github.com/Vlad-PLK/missionhelm</a>
</p>

<p align="center">
  <strong>AI Agent Orchestration Dashboard</strong><br>
  Create tasks. Plan with AI. Dispatch to agents. Watch them work.
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/Vlad-PLK/missionhelm?style=flat-square" alt="GitHub Stars" />
  <img src="https://img.shields.io/github/issues/Vlad-PLK/missionhelm?style=flat-square" alt="GitHub Issues" />
  <img src="https://img.shields.io/github/license/Vlad-PLK/missionhelm?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square" alt="PRs Welcome" />
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
</p>

<p align="center">
  <a href="https://demo.your-domain.example"><strong>🎮 Live Demo</strong></a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-docker">Docker</a> •
  <a href="#-features">Features</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-configuration">Configuration</a> •
  <a href="#-changelog">Changelog</a>
</p>

---

## 🆕 What's New in v1.3.0

- **Agent Activity Dashboard** — Dedicated view for monitoring agent work in real-time, with mobile-optimized card layout
- **Remote Model Discovery** — Discover and select AI models directly from your OpenClaw Gateway (`MODEL_DISCOVERY=true`)
- **Dispatch Recovery** — Tasks stuck in `pending_dispatch` now auto-reset to planning so you can retry
- **Planning Spec Forwarding** — Dispatch messages now include the full planning spec and agent instructions

See the full [CHANGELOG](CHANGELOG.md) for details.

---

## ✨ Features

🎯 **Task Management** — Kanban board with drag-and-drop across 7 status columns

🧠 **AI Planning** — Interactive Q&A flow where AI asks clarifying questions before starting work

🤖 **Agent System** — Auto-creates specialized agents, assigns tasks, tracks progress in real-time

🔗 **Gateway Agent Discovery** — Import existing agents from your OpenClaw Gateway with one click — no need to recreate them

🔌 **OpenClaw Integration** — WebSocket connection to [OpenClaw Gateway](https://github.com/openclaw/openclaw) for AI agent orchestration

🐳 **Docker Ready** — Production-optimized Dockerfile and docker-compose for easy deployment

🔒 **Security First** — Bearer token auth, HMAC webhooks, Zod validation, path traversal protection, security headers

🛡️ **Privacy First** — No built-in analytics trackers or centralized user-data collection; data stays in your deployment by default

📡 **Live Feed** — Real-time event stream showing agent activity, task updates, and system events

🌐 **Multi-Machine** — Run the dashboard and AI agents on different computers (supports Tailscale for remote)

---

## 🛡️ Privacy

MissionHelm is open-source and self-hosted. The project does **not** include ad trackers, third-party analytics beacons, or a centralized data collector run by us.

By default, your task/project data stays in your own deployment (SQLite + workspace). If you connect external services (for example AI providers or remote gateways), only the data you explicitly send to those services leaves your environment and is governed by their policies.

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                       YOUR MACHINE                           │
│                                                              │
│  ┌─────────────────┐          ┌──────────────────────────┐  │
│  │ MissionHelm  │◄────────►│    OpenClaw Gateway      │  │
│  │   (Next.js)      │   WS     │  (AI Agent Runtime)      │  │
│  │   Port 4000      │          │  Port 18789              │  │
│  └────────┬─────────┘          └───────────┬──────────────┘  │
│           │                                │                  │
│           ▼                                ▼                  │
│  ┌─────────────────┐          ┌──────────────────────────┐  │
│  │     SQLite       │          │     AI Provider          │  │
│  │    Database      │          │  (Anthropic / OpenAI)    │  │
│  └─────────────────┘          └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**MissionHelm** = The dashboard you interact with (this project)
**OpenClaw Gateway** = The AI runtime that executes tasks ([separate project](https://github.com/openclaw/openclaw))

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+ ([download](https://nodejs.org/))
- **OpenClaw Gateway** — `npm install -g openclaw`
- **AI API Key** — Anthropic (recommended), OpenAI, Google, or others via OpenRouter

### Install

```bash
# Clone
git clone https://github.com/Vlad-PLK/missionhelm.git
cd missionhelm

# Install dependencies
npm install

# Configure
cp .env.example .env.local
```

Edit `.env.local`:

```env
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-token-here
```

> **Where to find the token:** Check `~/.openclaw/openclaw.json` under `gateway.token`

### Run

```bash
# Start OpenClaw (separate terminal)
openclaw gateway start

# Start MissionHelm
npm run dev
```

Open **http://localhost:4000** — you're in! 🎉

### Production

```bash
npm run build
npx next start -p 4000
```

---

## 🐳 Docker

You can run MissionHelm in a container using the included `Dockerfile` and `docker-compose.yml`.

### Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- OpenClaw Gateway running locally or remotely

### 1. Configure environment

Create a `.env` file for Compose:

```bash
cp .env.example .env
```

Then set at least:

```env
OPENCLAW_GATEWAY_URL=ws://host.docker.internal:18789
OPENCLAW_GATEWAY_TOKEN=your-token-here
```

Notes:
- Use `host.docker.internal` when OpenClaw runs on your host machine.
- If OpenClaw is on another machine, set its reachable `ws://` or `wss://` URL instead.

### 2. Build and start

```bash
docker compose up -d --build
```

Open **http://localhost:4000**.

### 3. Useful commands

```bash
# View logs
docker compose logs -f missionhelm

# Stop containers
docker compose down

# Stop and remove volumes (deletes SQLite/workspace data)
docker compose down -v
```

### Data persistence

Compose uses named volumes:
- `missionhelm-data` for SQLite (`/app/data`)
- `missionhelm-workspace` for workspace files (`/app/workspace`)

---

## 🎯 How It Works

```
 CREATE          PLAN            ASSIGN          EXECUTE         DELIVER
┌────────┐    ┌────────┐    ┌────────────┐    ┌──────────┐    ┌────────┐
│  New   │───►│  AI    │───►│   Agent    │───►│  Agent   │───►│  Done  │
│  Task  │    │  Q&A   │    │  Created   │    │  Works   │    │  ✓     │
└────────┘    └────────┘    └────────────┘    └──────────┘    └────────┘
```

1. **Create a Task** — Give it a title and description
2. **AI Plans It** — The AI asks you clarifying questions to understand exactly what you need
3. **Agent Assigned** — A specialized agent is auto-created based on your answers
4. **Work Happens** — The agent writes code, browses the web, creates files — whatever's needed
5. **Delivery** — Completed work shows up in MissionHelm with deliverables

### Task Flow

```
PLANNING → INBOX → ASSIGNED → IN PROGRESS → TESTING → REVIEW → DONE
```

Drag tasks between columns or let the system auto-advance them.

---

## ⚙️ Configuration

### Environment Variables

| Variable | Required | Default | Description |
|:---------|:--------:|:--------|:------------|
| `OPENCLAW_GATEWAY_URL` | ✅ | `ws://127.0.0.1:18789` | WebSocket URL to OpenClaw Gateway |
| `OPENCLAW_GATEWAY_TOKEN` | ✅ | — | Authentication token for OpenClaw |
| `MC_API_TOKEN` | — | — | API auth token (enables auth middleware) |
| `WEBHOOK_SECRET` | — | — | HMAC secret for webhook validation |
| `DATABASE_PATH` | — | `./missionhelm.db` | SQLite database location |
| `WORKSPACE_BASE_PATH` | — | `~/Documents/Shared` | Base directory for workspace files |
| `PROJECTS_PATH` | — | `~/Documents/Shared/projects` | Directory for project folders |

### Security (Production)

Generate secure tokens:

```bash
# API authentication token
openssl rand -hex 32

# Webhook signature secret
openssl rand -hex 32
```

Add to `.env.local`:

```env
MC_API_TOKEN=your-64-char-hex-token
WEBHOOK_SECRET=your-64-char-hex-token
```

When `MC_API_TOKEN` is set:
- External API calls require `Authorization: Bearer <token>`
- Browser UI works automatically (same-origin requests are allowed)
- SSE streams accept token as query param

See [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) for the full production guide.

---

## 🌐 Multi-Machine Setup

Run MissionHelm on one machine and OpenClaw on another:

```env
# Point to the remote machine
OPENCLAW_GATEWAY_URL=ws://YOUR_SERVER_IP:18789
OPENCLAW_GATEWAY_TOKEN=your-shared-token
```

### With Tailscale (Recommended)

```env
OPENCLAW_GATEWAY_URL=wss://your-machine.tailnet-name.ts.net
OPENCLAW_GATEWAY_TOKEN=your-shared-token
```

---

## 🗄 Database

SQLite database auto-created at `./missionhelm.db`.

```bash
# Reset (start fresh)
rm missionhelm.db

# Inspect
sqlite3 missionhelm.db ".tables"
```

---

## 📁 Project Structure

```
missionhelm/
├── src/
│   ├── app/                    # Next.js pages & API routes
│   │   ├── api/
│   │   │   ├── tasks/          # Task CRUD + planning + dispatch
│   │   │   ├── agents/         # Agent management
│   │   │   ├── openclaw/       # Gateway proxy endpoints
│   │   │   └── webhooks/       # Agent completion webhooks
│   │   ├── settings/           # Settings page
│   │   └── workspace/[slug]/   # Workspace dashboard
│   ├── components/             # React components
│   │   ├── MissionQueue.tsx    # Kanban board
│   │   ├── PlanningTab.tsx     # AI planning interface
│   │   ├── AgentsSidebar.tsx   # Agent panel
│   │   ├── LiveFeed.tsx        # Real-time events
│   │   └── TaskModal.tsx       # Task create/edit
│   └── lib/
│       ├── db/                 # SQLite + migrations
│       ├── openclaw/           # Gateway client + device identity
│       ├── validation.ts       # Zod schemas
│       └── types.ts            # TypeScript types
├── scripts/                    # Bridge & hook scripts
├── src/middleware.ts            # Auth middleware
├── .env.example                # Environment template
└── CHANGELOG.md                # Version history
```

---

## 🔧 Troubleshooting

### Can't connect to OpenClaw Gateway

1. Check OpenClaw is running: `openclaw gateway status`
2. Verify URL and token in `.env.local`
3. Check firewall isn't blocking port 18789

### Planning questions not loading

1. Check OpenClaw logs: `openclaw gateway logs`
2. Verify your AI API key is valid
3. Refresh and click the task again

### Port 4000 already in use

```bash
lsof -i :4000
kill -9 <PID>
```

### Agent callbacks failing behind a proxy (502 errors)

If you're behind an HTTP proxy (corporate VPN, Hiddify, etc.), agent callbacks to `localhost` may fail because the proxy intercepts local requests.

**Fix:** Set `NO_PROXY` so localhost bypasses the proxy:

```bash
# Linux / macOS
export NO_PROXY=localhost,127.0.0.1

# Windows (cmd)
set NO_PROXY=localhost,127.0.0.1

# Docker
docker run -e NO_PROXY=localhost,127.0.0.1 ...
```

See [open issues](https://github.com/Vlad-PLK/missionhelm/issues) for current status.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 🧭 Source Attribution

MissionHelm is an independent project evolved from the open-source foundation originally published at:
https://github.com/crshdn/mission-control

Current implementation, architecture, roadmap, and operations are maintained in this repository.

---

## ⭐ Star History

<a href="https://www.star-history.com/#Vlad-PLK/missionhelm&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=Vlad-PLK/missionhelm&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=Vlad-PLK/missionhelm&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=Vlad-PLK/missionhelm&type=Date" width="600" />
  </picture>
</a>

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

[![OpenClaw](https://img.shields.io/badge/OpenClaw-Gateway-blue?style=for-the-badge)](https://github.com/open-claw/open-claw-gateway)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Anthropic](https://img.shields.io/badge/Anthropic-Claude-orange?style=for-the-badge)](https://www.anthropic.com/)

---

<p align="center">
  <strong>Happy orchestrating!</strong> 🚀
</p>
