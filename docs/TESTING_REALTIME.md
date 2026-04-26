     1|# Real-Time Integration Testing Guide
     2|
     3|## Quick Start
     4|
     5|```bash
     6|cd ~/Documents/Shared/la citadel
     7|npm install
     8|npm run dev
     9|```
    10|
    11|Open http://localhost:4000 (production server) or http://localhost:4000 (local)
    12|
    13|## Test Scenarios
    14|
    15|### 1. SSE Connection Test
    16|
    17|**What to verify:**
    18|- Open browser DevTools → Network tab → Filter by "stream"
    19|- Should see `/api/events/stream` connection with status `(pending)` or `200`
    20|- Connection stays open (not immediately closing)
    21|- Console should log: `[SSE] Connected`
    22|
    23|**Expected behavior:**
    24|- Connection established within 1-2 seconds
    25|- Keep-alive pings every 30 seconds
    26|- Auto-reconnect if connection drops
    27|
    28|### 2. Real-Time Task Updates
    29|
    30|**Test steps:**
    31|1. Open La Citadel in two browser windows side-by-side
    32|2. In Window 1: Create a new task (click "+ New Task")
    33|3. In Window 2: Task should appear in INBOX column **without refresh**
    34|4. In Window 1: Drag task to ASSIGNED column
    35|5. In Window 2: Task should move to ASSIGNED **without refresh**
    36|
    37|**Expected behavior:**
    38|- Tasks appear/move in real-time across all connected clients
    39|- No need to refresh the page
    40|- Changes reflected within 1 second
    41|
    42|### 3. Activity Log Test
    43|
    44|**Test steps:**
    45|1. Create a task via API or UI
    46|2. Open the task detail modal
    47|3. Click the "Activity" tab
    48|4. Send POST request to log activities:
    49|
    50|```bash
    51|curl -X POST http://localhost:4000/api/tasks/TASK_ID/activities \
    52|  -H "Content-Type: application/json" \
    53|  -d '{
    54|    "activity_type": "updated",
    55|    "message": "Task triaged and assigned to Developer agent",
    56|    "agent_id": "AGENT_ID"
    57|  }'
    58|```
    59|
    60|5. Activity should appear in the log immediately
    61|
    62|**Expected behavior:**
    63|- Activities appear in chronological order (newest first)
    64|- Each activity shows: icon, agent info, message, timestamp
    65|- Relative timestamps ("2 mins ago", "1 hour ago")
    66|
    67|### 4. Deliverables Test
    68|
    69|**Test steps:**
    70|1. Open a task detail modal
    71|2. Click "Deliverables" tab
    72|3. Send POST request to add a deliverable:
    73|
    74|```bash
    75|curl -X POST http://localhost:4000/api/tasks/TASK_ID/deliverables \
    76|  -H "Content-Type: application/json" \
    77|  -d '{
    78|    "deliverable_type": "file",
    79|    "title": "Implementation Report",
    80|    "path": "~/Documents/report.md",
    81|    "description": "Detailed implementation report"
    82|  }'
    83|```
    84|
    85|4. Deliverable should appear in the list immediately
    86|
    87|**Expected behavior:**
    88|- Deliverables show with icon, title, description, path
    89|- File paths displayed in monospace font
    90|- "Open" button for URLs (opens in new tab)
    91|
    92|### 5. Sub-Agent Tracking Test
    93|
    94|**Test steps:**
    95|1. Open a task detail modal
    96|2. Click "Sessions" tab
    97|3. Register a sub-agent via API:
    98|
    99|```bash
   100|curl -X POST http://localhost:4000/api/tasks/TASK_ID/subagent \
   101|  -H "Content-Type: application/json" \
   102|  -d '{
   103|    "openclaw_session_id": "agent:main:subagent:test-123",
   104|    "agent_name": "Test Sub-Agent"
   105|  }'
   106|```
   107|
   108|4. Sub-agent should appear in Sessions list
   109|5. Check sidebar: "Active Sub-Agents" counter should increment
   110|
   111|**Expected behavior:**
   112|- Sessions list shows agent avatar, session ID, status, duration
   113|- Active sub-agents (status='active') shown with green pulsing dot
   114|- Sidebar counter updates within 10 seconds (polling interval)
   115|
   116|### 6. Task Modal Tabs Test
   117|
   118|**Test steps:**
   119|1. Open any existing task
   120|2. Verify tabs: Overview, Activity, Deliverables, Sessions
   121|3. Click each tab and verify content loads
   122|4. Save/Delete buttons should only appear on Overview tab
   123|
   124|**Expected behavior:**
   125|- Tabs switch without closing modal
   126|- Content loads independently per tab
   127|- Overview tab shows form (editable)
   128|- Other tabs show read-only data
   129|
   130|### 7. Multi-Client SSE Test
   131|
   132|**Test steps:**
   133|1. Open La Citadel in 3 different browsers (Chrome, Firefox, Safari)
   134|2. Create/update a task in Browser 1
   135|3. Verify all browsers receive the update simultaneously
   136|
   137|**Expected behavior:**
   138|- All clients receive SSE events
   139|- Updates appear in real-time across all browsers
   140|- No duplicate events
   141|- Console logs show event receipt in each browser
   142|
   143|### 8. Database Schema Test
   144|
   145|**Verify tables exist:**
   146|```bash
   147|cd ~/Documents/Shared/la citadel
   148|sqlite3 la citadel.db
   149|
   150|.tables
   151|# Should include: task_activities, task_deliverables
   152|
   153|.schema task_activities
   154|.schema task_deliverables
   155|.schema openclaw_sessions
   156|```
   157|
   158|**Expected behavior:**
   159|- All new tables exist
   160|- Indexes created: `idx_activities_task`, `idx_deliverables_task`, `idx_openclaw_sessions_task`
   161|- `openclaw_sessions` has new columns: `session_type`, `task_id`, `ended_at`
   162|
   163|## Integration Test: Full Workflow
   164|
   165|**Scenario: Agent orchestration flow**
   166|
   167|1. **Hermès (main agent) creates task:**
   168|   ```bash
   169|   curl -X POST http://localhost:4000/api/tasks \
   170|     -H "Content-Type: application/json" \
   171|     -d '{
   172|       "title": "Build authentication system",
   173|       "description": "Implement JWT-based auth",
   174|       "status": "inbox",
   175|       "priority": "high"
   176|     }'
   177|   ```
   178|
   179|2. **Hermès triages and assigns:**
   180|   ```bash
   181|   TASK_ID="..." # from step 1
   182|   
   183|   # Log triage activity
   184|   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/activities \
   185|     -H "Content-Type: application/json" \
   186|     -d '{
   187|       "activity_type": "updated",
   188|       "message": "Task triaged and assigned to Developer agent"
   189|     }'
   190|   
   191|   # Update status to assigned
   192|   curl -X PATCH http://localhost:4000/api/tasks/$TASK_ID \
   193|     -H "Content-Type: application/json" \
   194|     -d '{"status": "assigned"}'
   195|   ```
   196|
   197|3. **Sub-agent spawns:**
   198|   ```bash
   199|   # Register sub-agent
   200|   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/subagent \
   201|     -H "Content-Type: application/json" \
   202|     -d '{
   203|       "openclaw_session_id": "agent:main:subagent:dev-auth",
   204|       "agent_name": "Developer Sub-Agent"
   205|     }'
   206|   
   207|   # Log spawn activity
   208|   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/activities \
   209|     -H "Content-Type: application/json" \
   210|     -d '{
   211|       "activity_type": "spawned",
   212|       "message": "Spawned sub-agent for task execution"
   213|     }'
   214|   ```
   215|
   216|4. **Sub-agent creates deliverables:**
   217|   ```bash
   218|   # Add file deliverable
   219|   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/deliverables \
   220|     -H "Content-Type: application/json" \
   221|     -d '{
   222|       "deliverable_type": "file",
   223|       "title": "auth.ts",
   224|       "path": "~/project/src/auth.ts",
   225|       "description": "JWT authentication implementation"
   226|     }'
   227|   
   228|   # Log file creation
   229|   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/activities \
   230|     -H "Content-Type: application/json" \
   231|     -d '{
   232|       "activity_type": "file_created",
   233|       "message": "Created auth.ts with JWT implementation"
   234|     }'
   235|   ```
   236|
   237|5. **Sub-agent completes:**
   238|   ```bash
   239|   # Log completion
   240|   curl -X POST http://localhost:4000/api/tasks/$TASK_ID/activities \
   241|     -H "Content-Type: application/json" \
   242|     -d '{
   243|       "activity_type": "completed",
   244|       "message": "Sub-agent completed task in 45 seconds"
   245|     }'
   246|   
   247|   # Move to review
   248|   curl -X PATCH http://localhost:4000/api/tasks/$TASK_ID \
   249|     -H "Content-Type: application/json" \
   250|     -d '{"status": "review"}'
   251|   ```
   252|
   253|6. **Verify in UI:**
   254|   - Task moves through columns in real-time
   255|   - Activity log shows complete timeline
   256|   - Deliverables list shows auth.ts
   257|   - Sessions tab shows sub-agent (now completed)
   258|   - Sidebar counter decrements when sub-agent ends
   259|
   260|## Performance Tests
   261|
   262|### SSE Connection Stress Test
   263|
   264|**Test many concurrent clients:**
   265|```javascript
   266|// Run in browser console
   267|const connections = [];
   268|for (let i = 0; i < 50; i++) {
   269|  const es = new EventSource('/api/events/stream');
   270|  es.onmessage = (e) => console.log(`Client ${i}:`, e.data);
   271|  connections.push(es);
   272|}
   273|
   274|// Should handle 50+ concurrent connections
   275|// Check memory usage doesn't spike
   276|```
   277|
   278|### Broadcast Performance Test
   279|
   280|**Send rapid updates:**
   281|```bash
   282|for i in {1..100}; do
   283|  curl -X POST http://localhost:4000/api/tasks/TASK_ID/activities \
   284|    -H "Content-Type: application/json" \
   285|    -d "{\"activity_type\": \"updated\", \"message\": \"Test $i\"}" &
   286|done
   287|wait
   288|```
   289|
   290|**Expected behavior:**
   291|- All events broadcast successfully
   292|- No dropped connections
   293|- UI updates smoothly without lag
   294|
   295|## Troubleshooting
   296|
   297|### SSE Not Connecting
   298|
   299|1. Check browser console for errors
   300|2. Verify `/api/events/stream` endpoint returns `text/event-stream`
   301|3. Check for CORS issues
   302|4. Ensure no proxy/nginx buffering SSE responses
   303|
   304|### Events Not Broadcasting
   305|
   306|1. Check server logs for broadcast calls
   307|2. Verify `broadcast()` is called after DB operations
   308|3. Check SSE client count: browser console should log connection
   309|4. Verify event payload structure matches SSEEvent type
   310|
   311|### UI Not Updating
   312|
   313|1. Verify SSE connection is active (check Network tab)
   314|2. Check browser console for event receipt logs
   315|3. Ensure Zustand store is updating (`updateTask`, `addTask`)
   316|4. Verify component is subscribed to store changes
   317|
   318|### Database Errors
   319|
   320|1. Delete `la citadel.db` and restart (recreates schema)
   321|2. Check foreign key constraints are enabled
   322|3. Verify SQLite version supports JSON and indexes
   323|4. Check file permissions on database file
   324|
   325|## Success Criteria Checklist
   326|
   327|- [ ] SSE connection established automatically on page load
   328|- [ ] Tasks update in real-time across multiple browser windows
   329|- [ ] Activity log shows all task actions chronologically
   330|- [ ] Deliverables display with file paths and open buttons
   331|- [ ] Sub-agent sessions tracked with active status
   332|- [ ] Agent counter shows live sub-agent count
   333|- [ ] Task modal tabs work without closing modal
   334|- [ ] Database migrations work without errors
   335|- [ ] No memory leaks from SSE connections
   336|- [ ] Works on production server after git pull and npm install
   337|
   338|## API Endpoint Reference
   339|
   340|### SSE Stream
   341|- `GET /api/events/stream` - Connect to SSE stream
   342|
   343|### Activities
   344|- `GET /api/tasks/[id]/activities` - List activities
   345|- `POST /api/tasks/[id]/activities` - Log activity
   346|
   347|### Deliverables
   348|- `GET /api/tasks/[id]/deliverables` - List deliverables
   349|- `POST /api/tasks/[id]/deliverables` - Add deliverable
   350|
   351|### Sub-Agents
   352|- `GET /api/tasks/[id]/subagent` - List sub-agents
   353|- `POST /api/tasks/[id]/subagent` - Register sub-agent
   354|
   355|### OpenClaw Sessions
   356|- `GET /api/openclaw/sessions?session_type=subagent&status=active` - Count active sub-agents
   357|