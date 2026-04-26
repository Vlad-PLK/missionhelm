     1|# Real-Time Features - Quick Start Guide
     2|
     3|## 🚀 Getting Started
     4|
     5|### 1. Pull Latest Code
     6|
     7|```bash
     8|cd ~/Documents/Shared/la citadel
     9|git pull origin main
    10|npm install
    11|```
    12|
    13|### 2. Start Development Server
    14|
    15|```bash
    16|npm run dev
    17|```
    18|
    19|Open: http://localhost:4000
    20|
    21|### 3. Verify Real-Time is Working
    22|
    23|1. Open La Citadel in your browser
    24|2. Open browser DevTools → Console
    25|3. Look for: `[SSE] Connected` ← This means real-time is active!
    26|4. Open a second browser window side-by-side
    27|5. Create a task in one window
    28|6. Watch it appear in the other window **instantly**
    29|
    30|That's it! Real-time is now active. 🎉
    31|
    32|## 🎯 What's New: Key Features
    33|
    34|### 1. Live Updates (No Refresh Needed!)
    35|- Create/move tasks → All browsers update instantly
    36|- ~100ms latency
    37|- Works across Chrome, Firefox, Safari
    38|
    39|### 2. Task Details Enhanced
    40|When you click on a task, you now see **4 tabs**:
    41|
    42|#### Overview Tab
    43|- Same as before: edit title, description, status, etc.
    44|
    45|#### Activity Tab (NEW! 📝)
    46|- Complete history of everything that happened to this task
    47|- Who did what, when
    48|- Automatically tracked
    49|
    50|#### Deliverables Tab (NEW! 📦)
    51|- Files, URLs, and artifacts created for this task
    52|- Click to open files
    53|- Auto-populated by sub-agents
    54|
    55|#### Sessions Tab (NEW! 🤖)
    56|- Shows sub-agents that worked on this task
    57|- Session duration
    58|- Active status (green pulsing dot = currently running)
    59|
    60|### 3. Agent Counter (NEW!)
    61|- Sidebar now shows: "Active Sub-Agents: X"
    62|- Live count of running sub-agents
    63|- Updates every 10 seconds
    64|
    65|## 🛠️ For Hermès: API Integration
    66|
    67|### Logging Activities
    68|
    69|When orchestrating tasks, log activities so users can see what's happening:
    70|
    71|```typescript
    72|// Log when you triage a task
    73|await fetch(`http://localhost:4000/api/tasks/${taskId}/activities`, {
    74|  method: 'POST',
    75|  headers: { 'Content-Type': 'application/json' },
    76|  body: JSON.stringify({
    77|    activity_type: 'updated',
    78|    message: 'Task triaged and assigned to Developer agent',
    79|    agent_id: myAgentId,
    80|  })
    81|});
    82|```
    83|
    84|**Activity Types:**
    85|- `spawned` - Sub-agent created
    86|- `updated` - Task modified
    87|- `completed` - Work finished
    88|- `file_created` - New file produced
    89|- `status_changed` - Status transition
    90|
    91|### Tracking Deliverables
    92|
    93|When a sub-agent creates files:
    94|
    95|```typescript
    96|await fetch(`http://localhost:4000/api/tasks/${taskId}/deliverables`, {
    97|  method: 'POST',
    98|  headers: { 'Content-Type': 'application/json' },
    99|  body: JSON.stringify({
   100|    deliverable_type: 'file', // or 'url', 'artifact'
   101|    title: 'Implementation Report',
   102|    path: '~/Documents/report.md',
   103|    description: 'Detailed implementation'
   104|  })
   105|});
   106|```
   107|
   108|### Registering Sub-Agents
   109|
   110|When spawning a sub-agent:
   111|
   112|```typescript
   113|// 1. Spawn the sub-agent (your existing code)
   114|const session = await spawnSubAgent(task);
   115|
   116|// 2. Register it in La Citadel
   117|await fetch(`http://localhost:4000/api/tasks/${taskId}/subagent`, {
   118|  method: 'POST',
   119|  headers: { 'Content-Type': 'application/json' },
   120|  body: JSON.stringify({
   121|    openclaw_session_id: session.id,
   122|    agent_name: 'Developer Sub-Agent'
   123|  })
   124|});
   125|```
   126|
   127|## 🧪 Quick Test
   128|
   129|### Test Real-Time Updates
   130|
   131|1. **Open two browser windows:**
   132|   - Window 1: http://localhost:4000
   133|   - Window 2: http://localhost:4000
   134|
   135|2. **Create a task in Window 1:**
   136|   - Click "+ New Task"
   137|   - Title: "Test Real-Time"
   138|   - Save
   139|
   140|3. **Watch Window 2:**
   141|   - Task should appear in INBOX **without refreshing**
   142|   - If it does → Real-time is working! ✅
   143|
   144|4. **Move the task:**
   145|   - Drag to ASSIGNED in Window 1
   146|   - Should move in Window 2 instantly
   147|
   148|### Test Activity Log
   149|
   150|Using your terminal:
   151|
   152|```bash
   153|# Create a test task (copy the ID from response)
   154|curl -X POST http://localhost:4000/api/tasks \
   155|  -H "Content-Type: application/json" \
   156|  -d '{"title": "Test Activity Log", "status": "inbox"}'
   157|
   158|# Log an activity (replace TASK_ID)
   159|curl -X POST http://localhost:4000/api/tasks/TASK_ID/activities \
   160|  -H "Content-Type: application/json" \
   161|  -d '{"activity_type": "updated", "message": "This is a test activity"}'
   162|
   163|# Now open the task in UI and click Activity tab
   164|# You should see your test activity!
   165|```
   166|
   167|## 📊 What to Expect
   168|
   169|### Visual Indicators
   170|
   171|**SSE Connection Status:**
   172|- Browser console shows `[SSE] Connected` = good
   173|- If disconnected, it auto-reconnects in 5 seconds
   174|
   175|**Agent Counter:**
   176|- Sidebar shows "Active Sub-Agents: X" when sub-agents are running
   177|- Updates every 10 seconds
   178|- Green highlight when >0
   179|
   180|**Activity Log:**
   181|- Newest activities at top
   182|- Icons for each activity type (🚀 spawned, ✏️ updated, ✅ completed)
   183|- Relative timestamps ("5 mins ago")
   184|
   185|**Deliverables:**
   186|- File icon for files, link icon for URLs
   187|- Monospace font for paths
   188|- "Open" button for URLs
   189|
   190|**Sessions:**
   191|- Green pulsing dot = active
   192|- Checkmark = completed
   193|- Duration displayed (e.g., "2h 15m")
   194|
   195|## 🔧 Troubleshooting
   196|
   197|### "Real-time not working"
   198|
   199|1. Check browser console:
   200|   - Should see `[SSE] Connected`
   201|   - If not, check Network tab for `/api/events/stream`
   202|
   203|2. Hard refresh:
   204|   - Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
   205|
   206|3. Check server is running:
   207|   - Terminal should show `✓ Ready in XXXXms`
   208|
   209|### "Activity tab is empty"
   210|
   211|Activities only appear after you start logging them via API. Old tasks won't have activities.
   212|
   213|### "Agent counter stuck at 0"
   214|
   215|Counter only shows sub-agents with:
   216|- `session_type = 'subagent'`
   217|- `status = 'active'`
   218|
   219|Make sure you're registering sub-agents via the `/api/tasks/[id]/subagent` endpoint.
   220|
   221|## 📚 More Information
   222|
   223|- **Full Testing Guide:** `docs/TESTING_REALTIME.md`
   224|- **Implementation Details:** `REALTIME_IMPLEMENTATION_SUMMARY.md`
   225|- **API Specification:** `docs/REALTIME_SPEC.md`
   226|- **Changelog:** `CHANGELOG.md`
   227|
   228|## 🎉 You're All Set!
   229|
   230|Real-time integration is now active. Everything you do in La Citadel will broadcast to all connected users instantly.
   231|
   232|Enjoy the new transparency! 🦞✨
   233|
   234|---
   235|
   236|**Questions?** Check the docs above or ask Hermès.
   237|