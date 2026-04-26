     1|# Production Setup Guide
     2|
     3|This guide walks you through setting up La Citadel for production use with proper configuration management.
     4|
     5|## ⚠️ Security First
     6|
     7|**NEVER commit sensitive data to the repository!** This includes:
     8|- IP addresses
     9|- User paths
    10|- Authentication tokens
    11|- API keys
    12|- Database credentials
    13|
    14|All sensitive values go in `.env.local` (which is gitignored).
    15|
    16|## 📦 Initial Setup
    17|
    18|### 1. Clone the Repository
    19|
    20|```bash
    21|git clone https://github.com/yourusername/la citadel.git
    22|cd la citadel
    23|```
    24|
    25|### 2. Install Dependencies
    26|
    27|```bash
    28|npm install
    29|```
    30|
    31|### 3. Configure Environment Variables
    32|
    33|```bash
    34|cp .env.example .env.local
    35|```
    36|
    37|Edit `.env.local` with your configuration:
    38|
    39|```bash
    40|# Database
    41|LA_CITADEL_DATABASE_PATH=./la-citadel.db
    42|
    43|# OpenClaw Gateway
    44|LA_CITADEL_OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
    45|LA_CITADEL_OPENCLAW_GATEWAY_TOKEN=***
    46|
    47|# Workspace Paths
    48|LA_CITADEL_WORKSPACE_BASE_PATH=~/Documents/Shared
    49|LA_CITADEL_PROJECTS_PATH=~/Documents/Shared/projects
    50|
    51|# API URL (auto-detected if not set)
    52|LA_CITADEL_URL=http://localhost:4000
    53|```
    54|
    55|Legacy aliases remain supported for backward compatibility: `DATABASE_PATH`, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_GATEWAY_TOKEN`, `WORKSPACE_BASE_PATH`, `PROJECTS_PATH`, and `MISSION_CONTROL_URL`.
    56|
    57|Execution monitoring environment knobs:
    58|
    59|```bash
    60|MC_EXECUTION_MONITOR_ENABLED=true
    61|MC_EXECUTION_MONITOR_POLL_INTERVAL_MS=10000
    62|MC_EXECUTION_MONITOR_MAX_RUNS_PER_CYCLE=10
    63|MC_EXECUTION_ACK_TIMEOUT_MINUTES=5
    64|MC_EXECUTION_PROGRESS_TIMEOUT_MINUTES=15
    65|MC_EXECUTION_NO_DELTA_TIMEOUT_MINUTES=30
    66|MC_EXECUTION_COMPLETION_INGESTION_TIMEOUT_MINUTES=5
    67|```
    68|
    69|In production, the autonomous execution monitor defaults to enabled unless explicitly disabled. In non-production environments, set `MC_EXECUTION_MONITOR_ENABLED=true` if you want the background poller active.
    70|
    71|### 4. Initialize Database
    72|
    73|```bash
    74|npm run db:seed
    75|```
    76|
    77|This creates the database and seeds it with:
    78|- the master agent
    79|- Sample tasks
    80|- Default business
    81|
    82|### 5. Start Development Server
    83|
    84|```bash
    85|npm run dev
    86|```
    87|
    88|Visit [http://localhost:4000](http://localhost:4000)
    89|
    90|## ⚙️ Configuration Management
    91|
    92|La Citadel supports configuration via **two methods**:
    93|
    94|### Method 1: Environment Variables (.env.local)
    95|
    96|Best for:
    97|- Server-side configuration
    98|- Deployment environments
    99|- Team consistency
   100|
   101|Variables in `.env.local`:
   102|```bash
   103|LA_CITADEL_WORKSPACE_BASE_PATH=~/Documents/Shared
   104|LA_CITADEL_PROJECTS_PATH=~/Documents/Shared/projects
   105|LA_CITADEL_URL=http://your-server-ip:4000
   106|LA_CITADEL_OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
   107|```
   108|
   109|### Method 2: Settings UI
   110|
   111|Best for:
   112|- User-specific preferences
   113|- Quick adjustments
   114|- Per-user customization
   115|
   116|Access via: **Settings** button (top-right) or `/settings`
   117|
   118|Settings stored in browser localStorage:
   119|- Workspace base path
   120|- Projects path
   121|- La Citadel API URL
   122|- Default project name
   123|
   124|**Priority:** Environment variables override UI settings for server operations.
   125|
   126|## 📁 Workspace Structure
   127|
   128|La Citadel organizes files in a structured workspace:
   129|
   130|```
   131|~/Documents/Shared/              # Base workspace
   132|├── projects/                    # All projects
   133|│   ├── [PROJECT_NAME_1]/       # Individual project
   134|│   │   ├── deliverables/       # Task deliverables
   135|│   │   ├── docs/               # Project docs
   136|│   │   └── README.md
   137|│   └── [PROJECT_NAME_2]/
   138|└── la citadel/             # La Citadel app
   139|    └── la citadel.db       # Database
   140|```
   141|
   142|### Configuring Paths
   143|
   144|**Via Environment Variables:**
   145|```bash
   146|LA_CITADEL_WORKSPACE_BASE_PATH=~/Documents/Shared
   147|LA_CITADEL_PROJECTS_PATH=~/Documents/Shared/projects
   148|```
   149|
   150|**Via Settings UI:**
   151|1. Click **Settings** (gear icon)
   152|2. Update "Workspace Base Path"
   153|3. Update "Projects Path"
   154|4. Click **Save Changes**
   155|
   156|### Path Variables
   157|
   158|- `~` expands to your home directory
   159|- Paths can be absolute: `/home/user/workspace`
   160|- Paths can be relative: `./workspace`
   161|
   162|## 🔌 OpenClaw Gateway Setup
   163|
   164|### Local Connection
   165|
   166|```bash
   167|# .env.local
   168|LA_CITADEL_OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
   169|```
   170|
   171|No token required for local connections.
   172|
   173|### Remote Connection (Tailscale)
   174|
   175|```bash
   176|# .env.local
   177|LA_CITADEL_OPENCLAW_GATEWAY_URL=wss://your-machine.tail12345.ts.net
   178|LA_CITADEL_OPENCLAW_GATEWAY_TOKEN=*** rand -hex 32)
   179|```
   180|
   181|**Generate a secure token:**
   182|```bash
   183|openssl rand -hex 32
   184|```
   185|
   186|Copy this token to both:
   187|1. La Citadel's `.env.local`
   188|2. OpenClaw's gateway configuration
   189|
   190|## 🚀 Production Deployment
   191|
   192|### Build for Production
   193|
   194|```bash
   195|npm run build
   196|npm start
   197|```
   198|
   199|### Environment Variables for Production
   200|
   201|Create `.env.production.local`:
   202|
   203|```bash
   204|NODE_ENV=production
   205|LA_CITADEL_DATABASE_PATH=/var/lib/la citadel/la citadel.db
   206|LA_CITADEL_WORKSPACE_BASE_PATH=/var/lib/la citadel/workspace
   207|LA_CITADEL_PROJECTS_PATH=/var/lib/la citadel/workspace/projects
   208|LA_CITADEL_URL=https://la citadel.yourdomain.com
   209|LA_CITADEL_OPENCLAW_GATEWAY_URL=wss://gateway.yourdomain.com
   210|LA_CITADEL_OPENCLAW_GATEWAY_TOKEN=your-p...oken
   211|```
   212|
   213|### Database Backups
   214|
   215|```bash
   216|# Backup database
   217|cp la citadel.db la citadel.backup.$(date +%Y%m%d).db
   218|
   219|# Restore from backup
   220|cp la citadel.backup.20250131.db la citadel.db
   221|```
   222|
   223|## 🧪 Testing Your Setup
   224|
   225|### 1. Verify Configuration
   226|
   227|```bash
   228|# Check environment variables
   229|cat .env.local
   230|
   231|# Verify database
   232|ls -la la citadel.db
   233|```
   234|
   235|### 2. Test OpenClaw Connection
   236|
   237|1. Start OpenClaw Gateway: `openclaw gateway`
   238|2. Open La Citadel: `http://localhost:4000`
   239|3. Check status indicator (top-right): Should show **ONLINE** (green)
   240|
   241|### 3. Test Real-Time Updates
   242|
   243|1. Create a task
   244|2. Assign it to an agent
   245|3. Drag to "In Progress"
   246|4. Watch it update in real-time (no refresh needed)
   247|
   248|✅ **Task cards should move between columns instantly**
   249|
   250|### 4. Test Deliverables
   251|
   252|1. Open a task with deliverables
   253|2. Click the arrow (→) button next to a file deliverable
   254|3. File path should copy to clipboard
   255|
   256|## 🔧 Troubleshooting
   257|
   258|### Real-Time Updates Not Working
   259|
   260|**Symptom:** Task cards don't move when status changes
   261|
   262|**Solutions:**
   263|1. Check browser console for SSE errors
   264|2. Verify SSE endpoint: `/api/events/stream`
   265|3. Clear browser cache
   266|4. Restart dev server
   267|
   268|### OpenClaw Not Connecting
   269|
   270|**Symptom:** Status shows OFFLINE
   271|
   272|**Solutions:**
   273|1. Verify Gateway is running: `openclaw gateway status`
   274|2. Check `OPENCLAW_GATEWAY_URL` in `.env.local`
   275|3. For remote: Verify `OPENCLAW_GATEWAY_TOKEN` matches
   276|4. Test WebSocket connection: `wscat -c ws://127.0.0.1:18789`
   277|
   278|### Deliverables Button Not Working
   279|
   280|**Symptom:** Arrow button does nothing
   281|
   282|**Solutions:**
   283|1. Check browser clipboard permissions
   284|2. Look for console errors
   285|3. Try on a task with a file deliverable (not URL)
   286|
   287|### Hardcoded Paths in Code
   288|
   289|**Symptom:** Paths still reference wrong user
   290|
   291|**Solution:** All hardcoded paths have been removed! If you find any:
   292|1. File a bug report
   293|2. Use `getWorkspaceBasePath()` or `getProjectsPath()` from `@/lib/config`
   294|
   295|## 📚 Configuration Reference
   296|
   297|### Environment Variables
   298|
   299|| Variable | Default | Description |
   300||----------|---------|-------------|
   301|| `DATABASE_PATH` | `./la citadel.db` | SQLite database file path |
   302|| `WORKSPACE_BASE_PATH` | `~/Documents/Shared` | Base directory for workspace |
   303|| `PROJECTS_PATH` | `~/Documents/Shared/projects` | Directory for project folders |
   304|| `MISSION_CONTROL_URL` | Auto-detected | API URL for agent orchestration |
   305|| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
   306|| `OPENCLAW_GATEWAY_TOKEN` | (empty) | Authentication token |
   307|| `MC_APPROVAL_REQUIRE_TEST_EVIDENCE` | `false` | Require latest `test_passed` activity for `review -> done`, unless override reason is logged |
   308|| `MC_APPROVAL_SOFT_ENFORCEMENT` | `false` | Warn and log approval gate failures instead of rejecting the transition |
   309|
   310|### Settings UI Fields
   311|
   312|| Setting | Description |
   313||---------|-------------|
   314|| Workspace Base Path | Root directory for all La Citadel files |
   315|| Projects Path | Where individual project folders are created |
   316|| Default Project Name | Template name for new projects |
   317|| La Citadel URL | API endpoint (usually auto-detected) |
   318|
   319|## 🎯 Next Steps
   320|
   321|1. ✅ Configure `.env.local`
   322|2. ✅ Run database seed
   323|3. ✅ Start dev server
   324|4. ✅ Test real-time updates
   325|5. ✅ Configure workspace paths
   326|6. 🚀 Create your first agent!
   327|
   328|## 📖 Further Reading
   329|
   330|- [Agent Protocol Documentation](docs/AGENT_PROTOCOL.md)
   331|- [Real-Time Implementation](REALTIME_IMPLEMENTATION_SUMMARY.md)
   332|- [Hermès Orchestration Guide](src/lib/orchestration.ts)
   333|- [Verification Checklist](VERIFICATION_CHECKLIST.md)
   334|
   335|---
   336|
   337|**Questions?** File an issue or check the documentation in `/docs`.
   338|