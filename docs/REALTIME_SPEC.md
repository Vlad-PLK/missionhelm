     1|# Real-Time Integration Specification
     2|
     3|## Goal
     4|Full transparency and real-time updates for La Citadel task orchestration.
     5|
     6|## Requirements
     7|
     8|### 1. Database Schema Extensions
     9|
    10|#### task_activities table
    11|```sql
    12|CREATE TABLE task_activities (
    13|  id TEXT PRIMARY KEY,
    14|  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    15|  agent_id TEXT REFERENCES agents(id),
    16|  activity_type TEXT NOT NULL, -- 'spawned', 'updated', 'completed', 'file_created', 'status_changed'
    17|  message TEXT NOT NULL,
    18|  metadata TEXT, -- JSON with extra context
    19|  created_at TEXT DEFAULT (datetime('now'))
    20|);
    21|
    22|CREATE INDEX idx_activities_task ON task_activities(task_id, created_at DESC);
    23|```
    24|
    25|#### task_deliverables table
    26|```sql
    27|CREATE TABLE task_deliverables (
    28|  id TEXT PRIMARY KEY,
    29|  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    30|  deliverable_type TEXT NOT NULL, -- 'file', 'url', 'artifact'
    31|  title TEXT NOT NULL,
    32|  path TEXT, -- file path or URL
    33|  description TEXT,
    34|  created_at TEXT DEFAULT (datetime('now'))
    35|);
    36|
    37|CREATE INDEX idx_deliverables_task ON task_deliverables(task_id);
    38|```
    39|
    40|#### openclaw_sessions table (enhance existing)
    41|Add columns:
    42|```sql
    43|ALTER TABLE openclaw_sessions ADD COLUMN session_type TEXT DEFAULT 'persistent'; -- 'persistent' or 'subagent'
    44|ALTER TABLE openclaw_sessions ADD COLUMN task_id TEXT REFERENCES tasks(id);
    45|ALTER TABLE openclaw_sessions ADD COLUMN ended_at TEXT;
    46|```
    47|
    48|### 2. WebSocket Server
    49|
    50|#### Implementation
    51|- Use Next.js API route with WebSocket upgrade
    52|- Endpoint: `/api/ws`
    53|- Broadcast events to all connected clients
    54|
    55|#### Events to broadcast
    56|```typescript
    57|type WSEvent = 
    58|  | { type: 'task_updated', payload: Task }
    59|  | { type: 'task_created', payload: Task }
    60|  | { type: 'activity_logged', payload: TaskActivity }
    61|  | { type: 'deliverable_added', payload: TaskDeliverable }
    62|  | { type: 'agent_spawned', payload: { taskId: string, sessionId: string, agentName: string } }
    63|  | { type: 'agent_completed', payload: { taskId: string, sessionId: string, summary: string } }
    64|```
    65|
    66|### 3. Backend API Endpoints
    67|
    68|#### POST /api/tasks/[id]/activities
    69|Log activity for a task
    70|```typescript
    71|{
    72|  activity_type: 'spawned' | 'updated' | 'completed' | 'file_created' | 'status_changed',
    73|  message: string,
    74|  agent_id?: string,
    75|  metadata?: object
    76|}
    77|```
    78|
    79|#### GET /api/tasks/[id]/activities
    80|Get all activities for a task (sorted by created_at DESC)
    81|
    82|#### POST /api/tasks/[id]/deliverables
    83|Add deliverable to a task
    84|```typescript
    85|{
    86|  deliverable_type: 'file' | 'url' | 'artifact',
    87|  title: string,
    88|  path: string,
    89|  description?: string
    90|}
    91|```
    92|
    93|#### GET /api/tasks/[id]/deliverables
    94|Get all deliverables for a task
    95|
    96|#### POST /api/tasks/[id]/subagent
    97|Register a sub-agent session for a task
    98|```typescript
    99|{
   100|  openclaw_session_id: string,
   101|  agent_name: string
   102|}
   103|```
   104|
   105|### 4. Frontend Changes
   106|
   107|#### Task Detail Modal
   108|Add tabs:
   109|- **Overview** (existing content)
   110|- **Activity Log** (chronological list of all activities)
   111|- **Deliverables** (list of output files/links with download/open buttons)
   112|- **Sessions** (list of OpenClaw sub-agent sessions)
   113|
   114|#### WebSocket Client
   115|```typescript
   116|// Connect to WebSocket
   117|const ws = new WebSocket('ws://localhost:4000/api/ws');
   118|
   119|// Listen for events
   120|ws.onmessage = (event) => {
   121|  const data = JSON.parse(event.data);
   122|  
   123|  switch (data.type) {
   124|    case 'task_updated':
   125|      // Update task in UI
   126|      break;
   127|    case 'activity_logged':
   128|      // Add activity to log
   129|      break;
   130|    case 'deliverable_added':
   131|      // Show new deliverable
   132|      break;
   133|    case 'agent_spawned':
   134|      // Increment active agent count
   135|      break;
   136|  }
   137|};
   138|```
   139|
   140|#### Live Updates
   141|- Auto-update Kanban columns when tasks change
   142|- Show toast notifications for important events
   143|- Real-time activity feed in task detail
   144|- Agent counter updates live
   145|
   146|#### Agent Counter
   147|Display in sidebar:
   148|```
   149|Active Sub-Agents: 2
   150|```
   151|Counts openclaw_sessions where status='active' and session_type='subagent'
   152|
   153|### 5. Orchestration Integration
   154|
   155|Hermès's workflow when orchestrating tasks:
   156|
   157|```typescript
   158|// 1. Task found in inbox
   159|const task = await fetch('http://localhost:4000/api/tasks?status=inbox').then(r => r.json());
   160|
   161|// 2. Log triage activity
   162|await fetch(`http://localhost:4000/api/tasks/${task.id}/activities`, {
   163|  method: 'POST',
   164|  body: JSON.stringify({
   165|    activity_type: 'updated',
   166|    message: 'Task triaged and assigned to Developer agent',
   167|    agent_id: orchestratorAgentId
   168|  })
   169|});
   170|
   171|// 3. Update status
   172|await fetch(`http://localhost:4000/api/tasks/${task.id}`, {
   173|  method: 'PATCH',
   174|  body: JSON.stringify({ status: 'assigned' })
   175|});
   176|
   177|// 4. Spawn sub-agent
   178|const { childSessionKey } = await spawnSubAgent(task);
   179|
   180|// 5. Register sub-agent in La Citadel
   181|await fetch(`http://localhost:4000/api/tasks/${task.id}/subagent`, {
   182|  method: 'POST',
   183|  body: JSON.stringify({
   184|    openclaw_session_id: childSessionKey,
   185|    agent_name: 'Developer Sub-Agent'
   186|  })
   187|});
   188|
   189|// 6. Log spawn activity
   190|await fetch(`http://localhost:4000/api/tasks/${task.id}/activities`, {
   191|  method: 'POST',
   192|  body: JSON.stringify({
   193|    activity_type: 'spawned',
   194|    message: 'Spawned sub-agent for task execution',
   195|    metadata: { session_id: childSessionKey }
   196|  })
   197|});
   198|
   199|// 7. When sub-agent completes and creates files
   200|await fetch(`http://localhost:4000/api/tasks/${task.id}/deliverables`, {
   201|  method: 'POST',
   202|  body: JSON.stringify({
   203|    deliverable_type: 'file',
   204|    title: 'Test Page',
   205|    path: '~/Documents/Shared/la citadel/test-page.html',
   206|    description: 'HTML test page with styling and dynamic content'
   207|  })
   208|});
   209|
   210|// 8. Log completion
   211|await fetch(`http://localhost:4000/api/tasks/${task.id}/activities`, {
   212|  method: 'POST',
   213|  body: JSON.stringify({
   214|    activity_type: 'completed',
   215|    message: 'Sub-agent completed task in 20 seconds'
   216|  })
   217|});
   218|
   219|// 9. Update to review
   220|await fetch(`http://localhost:4000/api/tasks/${task.id}`, {
   221|  method: 'PATCH',
   222|  body: JSON.stringify({ status: 'review' })
   223|});
   224|```
   225|
   226|## Implementation Notes
   227|
   228|### WebSocket Setup (Next.js)
   229|Next.js doesn't natively support WebSocket in API routes. Options:
   230|1. Use `ws` library with custom server
   231|2. Use Server-Sent Events (SSE) instead (simpler, one-way)
   232|3. Use external WebSocket server (overkill)
   233|
   234|**Recommendation: Use SSE** (simpler, works with Next.js out of the box)
   235|
   236|### SSE Endpoint: /api/events/stream
   237|```typescript
   238|export async function GET(request: NextRequest) {
   239|  const encoder = new TextEncoder();
   240|  const stream = new ReadableStream({
   241|    start(controller) {
   242|      // Register client
   243|      clients.add(controller);
   244|      
   245|      // Send keep-alive
   246|      const interval = setInterval(() => {
   247|        controller.enqueue(encoder.encode(': keep-alive\n\n'));
   248|      }, 30000);
   249|      
   250|      // Cleanup on close
   251|      request.signal.addEventListener('abort', () => {
   252|        clearInterval(interval);
   253|        clients.delete(controller);
   254|      });
   255|    }
   256|  });
   257|  
   258|  return new Response(stream, {
   259|    headers: {
   260|      'Content-Type': 'text/event-stream',
   261|      'Cache-Control': 'no-cache',
   262|      'Connection': 'keep-alive'
   263|    }
   264|  });
   265|}
   266|```
   267|
   268|### Broadcasting Events
   269|```typescript
   270|// In API routes that modify data
   271|import { broadcast } from '@/lib/events';
   272|
   273|// After creating/updating task
   274|broadcast({
   275|  type: 'task_updated',
   276|  payload: task
   277|});
   278|```
   279|
   280|## Testing Checklist
   281|
   282|- [ ] Database migrations run successfully
   283|- [ ] New API endpoints work (activities, deliverables, subagent)
   284|- [ ] SSE connection established from frontend
   285|- [ ] Real-time updates appear without refresh
   286|- [ ] Activity log shows all actions chronologically
   287|- [ ] Deliverables display with file paths
   288|- [ ] Agent counter updates when sub-agents spawn
   289|- [ ] Hermès's orchestration posts to new endpoints
   290|- [ ] No memory leaks from SSE connections
   291|- [ ] Works on production server after git pull
   292|
   293|## Files to Modify/Create
   294|
   295|### Backend
   296|- `src/lib/db/schema.ts` - Add new tables
   297|- `src/lib/db/migrations.ts` - Migration runner
   298|- `src/lib/events.ts` - SSE event broadcaster
   299|- `src/app/api/events/stream/route.ts` - SSE endpoint
   300|- `src/app/api/tasks/[id]/activities/route.ts` - Activities CRUD
   301|- `src/app/api/tasks/[id]/deliverables/route.ts` - Deliverables CRUD
   302|- `src/app/api/tasks/[id]/subagent/route.ts` - Sub-agent registration
   303|
   304|### Frontend
   305|- `src/components/TaskModal.tsx` - Add tabs (Activity, Deliverables, Sessions)
   306|- `src/components/ActivityLog.tsx` - New component
   307|- `src/components/DeliverablesList.tsx` - New component
   308|- `src/components/SessionsList.tsx` - New component
   309|- `src/hooks/useSSE.ts` - SSE connection hook
   310|- `src/lib/store.ts` - Add event handling to Zustand store
   311|- `src/components/AgentsSidebar.tsx` - Add active sub-agent counter
   312|
   313|### Documentation
   314|- Update `README.md` with real-time features
   315|- Update `CHANGELOG.md`
   316|
   317|## Success Criteria
   318|
   319|1. User adds task to INBOX
   320|2. Within 60 seconds, sees it move to ASSIGNED in real-time (no refresh)
   321|3. Agent counter shows "Active Sub-Agents: 1"
   322|4. Opens task detail, sees Activity Log with entries like:
   323|   - "Task triaged and assigned to Developer agent"
   324|   - "Spawned sub-agent for task execution"
   325|   - "Created file: test-page.html"
   326|   - "Sub-agent completed task in 20 seconds"
   327|5. Sees Deliverables tab with link to test-page.html
   328|6. Task moves to REVIEW in real-time
   329|7. All without refreshing the page
   330|