     1|# Changelog
     2|
     3|All notable changes to La Citadel will be documented in this file.
     4|
     5|The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
     6|and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
     7|
     8|---
     9|
    10|## [1.4.0] - 2026-04-21
    11|
    12|### Added
    13|- **Repo-Aware Dispatch** — Workspaces can now store a `folder_path` so coding tasks can target an existing repository instead of a generated project folder.
    14|- **Task Milestones** — Added milestone and progress APIs for tracking intermediate phases on a task.
    15|- **Workspace Delete Preview** — New `GET /api/workspaces/[id]/delete-preview` endpoint exposes dependency counts and warnings before destructive actions.
    16|- **Workspace Folder Path API** — New `GET/PATCH /api/workspaces/[id]/folder-path` endpoint for reading and updating repository paths cleanly.
    17|
    18|### Changed
    19|- **Dispatch Prompt Refactor** — Task dispatch now uses a shared prompt builder with planning context, deliverables, and repo-aware OpenCode instructions.
    20|- **OpenCode Dispatch Model** — Coding-task prompt templates now target `openai/gpt-5.4`.
    21|- **Workspace Deletion Flow** — Deletion now uses a shared preview/delete engine with protected workspace enforcement and safer agent/session retention handling.
    22|
    23|### Fixed
    24|- **Import Agent Modal Crash** — Gateway agent discovery/import now normalizes model payloads so object-shaped model metadata no longer crashes the frontend.
    25|- **Safer Dispatch Commands** — OpenCode command examples now use safer shell quoting and heredoc-style prompts to avoid broken commands from spaces or prompt content.
    26|- **Milestone Progress Consistency** — Milestone updates and deletions now keep `task_progress` in sync and clear stale completion timestamps when milestones are reopened.
    27|
    28|---
    29|
    30|## [1.3.0] - 2026-03-02
    31|
    32|### Added
    33|- **Agent Activity Dashboard** — Dedicated page for monitoring agent work with mobile card layout.
    34|- **Remote Model Discovery** — Discover AI models from OpenClaw Gateway via `MODEL_DISCOVERY=true` env var.
    35|- **Proxy Troubleshooting** — Added docs for users behind HTTP proxies experiencing 502 errors on agent callbacks.
    36|
    37|### Fixed
    38|- **Force-Dynamic API Routes** — All API routes now use `force-dynamic` to prevent stale cached responses.
    39|- **Null Agent Assignment** — `assigned_agent_id` can now be null in task creation schema.
    40|- **Dispatch Spec Forwarding** — Planning spec and agent instructions now forwarded in dispatch messages.
    41|- **Dispatch Failure Recovery** — Tasks stuck in `pending_dispatch` auto-reset to planning status.
    42|
    43|---
    44|
    45|## [1.2.0] - 2026-02-19
    46|
    47|### Added
    48|
    49|- **Gateway Agent Discovery** — Import existing agents from your OpenClaw Gateway into La Citadel. New "Import from Gateway" button in the agent sidebar opens a discovery modal that lists all Gateway agents, shows which are already imported, and lets you bulk-import with one click. Imported agents display a `GW` badge for provenance tracking.
    50|- **Docker Support** — Production-ready multi-stage Dockerfile, docker-compose.yml with persistent volumes, and `.dockerignore`. Runs as non-root, uses `dumb-init` for signal handling, includes health checks.
    51|- **Agent Protocol Conventions** — Added `PROGRESS_UPDATE` and `BLOCKED` message formats to the Agent Protocol docs to prevent agent stalling.
    52|
    53|### Fixed
    54|
    55|- **Planning Flow Improvements** — Refactored polling to prevent stale state issues, fixed "Other" free-text option (case mismatch bug), made `due_date` nullable, increased planning timeout to 90s for larger models, auto-start polling on page load.
    56|- **WebSocket RPC Deduplication Bug** — The event deduplication cache was silently dropping repeated RPC responses with the same payload hash, causing request timeouts. RPC responses now bypass dedup entirely.
    57|- **Next.js Response Caching** — Dynamic API routes that query live state (e.g., agent discovery) now use `force-dynamic` to prevent stale cached responses.
    58|
    59|---
    60|
    61|## [1.1.0] - 2026-02-16
    62|
    63|### 🔒 Security
    64|
    65|- **API Authentication Middleware** — Bearer token authentication for all API routes. Set `MC_API_TOKEN` in `.env.local` to enable. Same-origin browser requests are automatically allowed.
    66|- **Webhook HMAC-SHA256 Validation** — Agent completion webhooks now require a valid `X-Webhook-Signature` header. Set `WEBHOOK_SECRET` in `.env.local` to enable.
    67|- **Path Traversal Protection** — File download endpoint now uses `realpathSync` to resolve symlinks and validate all paths are within the allowed directory.
    68|- **Error Message Sanitization** — API error responses no longer leak internal details (stack traces, file paths) in production.
    69|- **Security Headers** — Added `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` headers via Next.js config.
    70|- **Input Validation (Zod)** — Request payloads for tasks, agents, and workspaces are validated with Zod schemas before processing.
    71|- **Repository Audit** — Purged sensitive files from git history, updated `.gitignore` to block database files and backups.
    72|
    73|### Added
    74|
    75|- **Ed25519 Device Identity** — Gateway pairing now uses Ed25519 key-based device identity for secure handshakes.
    76|- **ARIA Hook** — Real-time agent tracking bridge between ARIA and La Citadel (`scripts/aria-mc-hook.sh`).
    77|- **Planning Poll Endpoint** — New `POST /api/tasks/[id]/planning/poll` for long-poll planning updates.
    78|- **Retry Dispatch** — New `POST /api/tasks/[id]/planning/retry-dispatch` to retry failed task dispatches.
    79|- **Auto-Dispatch Module** — `src/lib/auto-dispatch.ts` for automatic task assignment after planning.
    80|- **Planning Utilities** — `src/lib/planning-utils.ts` with shared planning logic.
    81|- **MC Bridge Scripts** — Python and shell bridge scripts for external integrations.
    82|
    83|### Changed
    84|
    85|- **Node.js v25 Support** — Updated `better-sqlite3` to v12.6.2 for Node v25 compatibility.
    86|- **Default Port** — La Citadel now defaults to port 4000 (previously 3000).
    87|- **Improved Planning Tab** — Enhanced UI with better question rendering, progress tracking, and error handling.
    88|- **Agent Sidebar Improvements** — Better status display, model selection, and agent management.
    89|- **Activity Log Overhaul** — Cleaner timeline UI with better type icons and formatting.
    90|- **Live Feed Improvements** — Better real-time event display with filtering options.
    91|
    92|### Fixed
    93|
    94|- **Same-origin browser requests** — Auth middleware no longer blocks the UI's own API calls.
    95|
    96|---
    97|
    98|## [1.0.1] - 2026-02-04
    99|
   100|### Changed
   101|
   102|- **Clickable Deliverables** - URL deliverables now have clickable titles and paths that open in new tabs
   103|- Improved visual feedback on deliverable links (hover states, external link icons)
   104|
   105|---
   106|
   107|## [1.0.0] - 2026-02-04
   108|
   109|### 🎉 First Official Release
   110|
   111|This is the first stable, tested, and working release of La Citadel.
   112|
   113|### Added
   114|
   115|- **Task Management**
   116| - Create, edit, and delete tasks
   117| - Drag-and-drop Kanban board with 7 status columns
   118| - Task priority levels (low, normal, high, urgent)
   119| - Due date support
   120|
   121|- **AI Planning Mode**
   122| - Interactive Q&A planning flow with AI
   123| - Multiple choice questions with "Other" option for custom answers
   124| - Automatic spec generation from planning answers
   125| - Planning session persistence (resume interrupted planning)
   126|
   127|- **Agent System**
   128| - Automatic agent creation based on task requirements
   129| - Agent avatars with emoji support
   130| - Agent status tracking (standby, working, idle)
   131| - Custom SOUL.md personality for each agent
   132|
   133|- **Task Dispatch**
   134| - Automatic dispatch after planning completes
   135| - Task instructions sent to agent with full context
   136| - Project directory creation for deliverables
   137| - Activity logging and deliverable tracking
   138|
   139|- **OpenClaw Integration**
   140| - WebSocket connection to OpenClaw Gateway
   141| - Session management for planning and agent sessions
   142| - Chat history synchronization
   143| - Multi-machine support (local and remote gateways)
   144|
   145|- **Dashboard UI**
   146| - Clean, dark-themed interface
   147| - Real-time task updates
   148| - Event feed showing system activity
   149| - Agent status panel
   150| - Responsive design
   151|
   152|- **API Endpoints**
   153| - Full REST API for tasks, agents, and events
   154| - File upload endpoint for deliverables
   155| - OpenClaw proxy endpoints for session management
   156| - Activity and deliverable tracking endpoints
   157|
   158|### Technical Details
   159|
   160|- Built with Next.js 14 (App Router)
   161|- SQLite database with automatic migrations
   162|- Tailwind CSS for styling
   163|- TypeScript throughout
   164|- WebSocket client for OpenClaw communication
   165|
   166|---
   167|
   168|## [0.1.0] - 2026-02-03
   169|
   170|### Added
   171|
   172|- Initial project setup
   173|- Basic task CRUD
   174|- Kanban board prototype
   175|- OpenClaw connection proof of concept
   176|
   177|---
   178|
   179|## Roadmap
   180|
   181|- [x] Multiple workspaces
   182|- [x] Webhook integrations
   183|- [x] API authentication & security hardening
   184|- [ ] Team collaboration
   185|- [ ] Task dependencies
   186|- [ ] Agent performance metrics
   187|- [ ] Mobile-responsive improvements
   188|- [ ] Dark/light theme toggle
   189|
   190|---
   191|
   192|[1.4.0]: https://github.com/Vlad-PLK/la citadel/compare/v1.3.0...v1.4.0
   193|[1.3.0]: https://github.com/Vlad-PLK/la citadel/compare/v1.2.0...v1.3.0
   194|[1.2.0]: https://github.com/Vlad-PLK/la citadel/releases/tag/v1.2.0
   195|[1.1.0]: https://github.com/Vlad-PLK/la citadel/releases/tag/v1.1.0
   196|[1.0.1]: https://github.com/Vlad-PLK/la citadel/releases/tag/v1.0.1
   197|[1.0.0]: https://github.com/Vlad-PLK/la citadel/releases/tag/v1.0.0
   198|[0.1.0]: https://github.com/Vlad-PLK/la citadel/releases/tag/v0.1.0
   199|