// Core types for La Citadel

export type AgentStatus = 'standby' | 'working' | 'offline';

export type TaskStatus = 'pending_dispatch' | 'planning' | 'inbox' | 'assigned' | 'in_progress' | 'testing' | 'review' | 'done';

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TaskType = 'feature' | 'bugfix' | 'research' | 'documentation' | 'deployment' | 'general';

export type MessageType = 'text' | 'system' | 'task_update' | 'file';

export type ConversationType = 'direct' | 'group' | 'task';

export type EventType =
  | 'task_created'
  | 'task_assigned'
  | 'task_dispatched'
  | 'task_status_changed'
  | 'task_completed'
  | 'message_sent'
  | 'agent_status_changed'
  | 'agent_joined'
  | 'system';

export type AgentSource = 'local' | 'gateway';

export interface Agent {
  id: string;
  name: string;
  role: string;
  description?: string;
  avatar_emoji: string;
  status: AgentStatus;
  is_master: boolean;
  workspace_id: string;
  soul_md?: string;
  user_md?: string;
  agents_md?: string;
  model?: string;
  source: AgentSource;
  gateway_agent_id?: string;
  session_key_prefix?: string;
  created_at: string;
  updated_at: string;
}

// Agent discovered from the OpenClaw Gateway (not yet imported)
export interface DiscoveredAgent {
  id: string;
  name: string;
  label?: string;
  model?: string;
  model_details?: {
    primary?: string;
    fallbacks?: string[];
  };
  channel?: string;
  status?: string;
  already_imported: boolean;
  existing_agent_id?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  task_type?: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  estimated_hours?: number;
  actual_hours?: number;
  assigned_agent_id: string | null;
  created_by_agent_id: string | null;
  workspace_id: string;
  business_id: string;
  due_date?: string;
  status_reason?: string;
  planning_spec?: string;
  planning_agents?: string;
  planning_session_key?: string;
  planning_messages?: string;
  planning_complete?: number;
  planning_dispatch_error?: string;
  group_id?: string;
  parent_id?: string;
  order_index?: number;
  created_at: string;
  updated_at: string;
  // Joined fields
  assigned_agent?: Agent;
  created_by_agent?: Agent;
}

export interface Conversation {
  id: string;
  title?: string;
  type: ConversationType;
  task_id?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  participants?: Agent[];
  last_message?: Message;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_agent_id?: string;
  content: string;
  message_type: MessageType;
  metadata?: string;
  created_at: string;
  // Joined fields
  sender?: Agent;
}

export interface Event {
  id: string;
  type: EventType;
  agent_id?: string;
  task_id?: string;
  message: string;
  metadata?: string;
  created_at: string;
  // Joined fields
  agent?: Agent;
  task?: Task;
}

export interface Business {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  folder_path?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceStats {
  id: string;
  name: string;
  slug: string;
  icon: string;
  taskCounts: {
    pending_dispatch: number;
    planning: number;
    inbox: number;
    assigned: number;
    in_progress: number;
    testing: number;
    review: number;
    done: number;
    total: number;
  };
  agentCount: number;
}

export interface OpenClawSession {
  id: string;
  agent_id: string;
  openclaw_session_id: string;
  channel?: string;
  status: string;
  session_type: 'persistent' | 'subagent';
  task_id?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
}

export type TaskDispatchStatus = 'queued' | 'sent' | 'failed' | 'superseded';

export type TaskExecutionState =
  | 'queued'
  | 'dispatched'
  | 'acknowledged'
  | 'executing'
  | 'blocked'
  | 'stalled'
  | 'completed'
  | 'ingestion_failed';

export type TaskExecutionIngestionStatus = 'pending' | 'ingested' | 'failed';

export type RuntimeReceiptType =
  | 'dispatch_sent'
  | 'ack_received'
  | 'execution_started'
  | 'progress_seen'
  | 'blocker_seen'
  | 'completion_seen'
  | 'completion_ingested'
  | 'stalled_execution_detected';

export interface TaskDispatchRun {
  id: string;
  task_id: string;
  agent_id: string;
  openclaw_session_id: string;
  session_key: string;
  dispatch_attempt: number;
  dispatch_status: TaskDispatchStatus;
  execution_state: TaskExecutionState;
  idempotency_key?: string | null;
  acknowledged_at?: string | null;
  execution_started_at?: string | null;
  last_progress_at?: string | null;
  last_runtime_signal_at?: string | null;
  last_runtime_signal_type?: string | null;
  completed_at?: string | null;
  ingestion_status: TaskExecutionIngestionStatus;
  source_summary?: string | null;
  source_metadata?: string | null;
  created_at: string;
  updated_at: string;
}

export type ExecutionMonitorCycleReason = 'startup' | 'interval' | 'manual' | 'route';

export interface ExecutionMonitorRunError {
  run_id: string;
  message: string;
}

export interface ExecutionMonitorCycleSummary {
  reason: ExecutionMonitorCycleReason;
  forced: boolean;
  started_at: string;
  completed_at: string;
  active_run_count: number;
  processed_run_count: number;
  processed_run_ids: string[];
  skipped_run_ids: string[];
  incident_count: number;
  run_errors: ExecutionMonitorRunError[];
}

export interface ExecutionMonitorStatus {
  enabled: boolean;
  started: boolean;
  running: boolean;
  interval_ms: number;
  max_runs_per_cycle: number;
  last_started_at: string | null;
  last_completed_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_cycle_reason: ExecutionMonitorCycleReason | null;
  last_cycle_summary: ExecutionMonitorCycleSummary | null;
  total_cycles: number;
  total_failures: number;
  next_scheduled_at: string | null;
}

export type ActivityType = 'spawned' | 'updated' | 'completed' | 'file_created' | 'status_changed' | 'milestone_completed' | 'phase_changed' | 'test_passed' | 'test_failed' | 'blocker_identified' | 'blocker_escalated' | 'blocker_resolved' | 'staleness_detected' | 'staleness_cleared';

export interface TaskMilestone {
  id: string;
  task_id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  phase: string;
  order_index: number;
  completed_at?: string;
  completed_by_agent_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskProgress {
  task_id: string;
  total_milestones: number;
  completed_milestones: number;
  percentage: number;
  current_phase: string;
  current_milestone?: TaskMilestone;
}

export interface TaskActivity {
  id: string;
  task_id: string;
  agent_id?: string;
  activity_type: ActivityType;
  message: string;
  metadata?: string;
  created_at: string;
  // Joined fields
  agent?: Agent;
}

export type DeliverableType = 'file' | 'url' | 'artifact';

export interface TaskDeliverable {
  id: string;
  task_id: string;
  deliverable_type: DeliverableType;
  title: string;
  path?: string;
  description?: string;
  created_at: string;
}

// Blocker types for triage visibility
export type BlockerType = 'external_dependency' | 'approval_pending' | 'resource_unavailable' | 'technical_impediment' | 'spec_ambiguous' | 'test_blocker';

export type BlockerSeverity = 'critical' | 'high' | 'medium' | 'low';

export type BlockerStatus = 'active' | 'escalated' | 'resolved';

export interface TaskBlocker {
  id: string;
  task_id: string;
  blocker_type: BlockerType;
  severity: BlockerSeverity;
  status: BlockerStatus;
  title: string;
  description?: string;
  identified_by_agent_id?: string;
  escalated_at?: string;
  escalated_to_agent_id?: string;
  resolved_at?: string;
  resolved_by_agent_id?: string;
  resolution_note?: string;
  created_at: string;
  updated_at: string;
}

export interface BlockerEscalationSignal {
  id: string;
  blocker_id: string;
  task_id: string;
  escalated_by_agent_id?: string;
  escalated_to_agent_id?: string;
  escalation_note?: string;
  created_at: string;
}

// Staleness detection types
export interface StalenessThreshold {
  status: TaskStatus;
  maxAgeHours: number;
  warningThresholdHours: number;
  escalationLevel: 'none' | 'warning' | 'critical';
}

export interface TaskStaleness {
  task_id: string;
  status: TaskStatus;
  hoursInStatus: number;
  thresholdHours: number;
  warningHours: number;
  isStale: boolean;
  isWarning: boolean;
  isCritical: boolean;
  lastActivityAt: string;
}

export interface StalenessReport {
  task_id: string;
  task_title: string;
  status: TaskStatus;
  hoursInStatus: number;
  isStale: boolean;
  isCritical: boolean;
  blockerCount: number;
  lastActivityAt: string;
}

// Planning types
export type PlanningQuestionType = 'multiple_choice' | 'text' | 'yes_no';

export type PlanningCategory = 
  | 'goal'
  | 'audience'
  | 'scope'
  | 'design'
  | 'content'
  | 'technical'
  | 'timeline'
  | 'constraints';

export interface PlanningQuestionOption {
  id: string;
  label: string;
}

export interface PlanningQuestion {
  id: string;
  task_id: string;
  category: PlanningCategory;
  question: string;
  question_type: PlanningQuestionType;
  options?: PlanningQuestionOption[];
  answer?: string;
  answered_at?: string;
  sort_order: number;
  created_at: string;
}

export interface PlanningSpec {
  id: string;
  task_id: string;
  spec_markdown: string;
  locked_at: string;
  locked_by?: string;
  created_at: string;
}

export interface PlanningState {
  questions: PlanningQuestion[];
  spec?: PlanningSpec;
  progress: {
    total: number;
    answered: number;
    percentage: number;
  };
  isLocked: boolean;
}

// API request/response types
export interface CreateAgentRequest {
  name: string;
  role: string;
  description?: string;
  avatar_emoji?: string;
  is_master?: boolean;
  soul_md?: string;
  user_md?: string;
  agents_md?: string;
  model?: string;
}

export interface UpdateAgentRequest extends Partial<CreateAgentRequest> {
  status?: AgentStatus;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  task_type?: TaskType;
  priority?: TaskPriority;
  estimated_hours?: number;
  actual_hours?: number;
  assigned_agent_id?: string;
  created_by_agent_id?: string;
  business_id?: string;
  workspace_id?: string;
  due_date?: string;
}

export interface UpdateTaskRequest extends Partial<CreateTaskRequest> {
  status?: TaskStatus;
  updated_by_agent_id?: string;
  approval_override_reason?: string;
  approval_notes?: string;
}

export interface SendMessageRequest {
  conversation_id: string;
  sender_agent_id: string;
  content: string;
  message_type?: MessageType;
  metadata?: string;
}

// OpenClaw WebSocket message types
export interface OpenClawMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface OpenClawSessionInfo {
  id: string;
  channel: string;
  peer?: string;
  model?: string;
  status: string;
}

// OpenClaw history message format (from Gateway)
export interface OpenClawHistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

// Agent with OpenClaw session info (extended for UI use)
export interface AgentWithOpenClaw extends Agent {
  openclawSession?: OpenClawSession | null;
}

// Real-time SSE event types
export type SSEEventType =
  | 'task_updated'
  | 'task_created'
  | 'task_deleted'
  | 'activity_logged'
  | 'deliverable_added'
  | 'agent_spawned'
  | 'agent_completed';

export interface SSEEvent {
  type: SSEEventType;
  payload: Task | TaskActivity | TaskDeliverable | {
    taskId: string;
    sessionId: string;
    agentName?: string;
    summary?: string;
    deleted?: boolean;
  } | {
    id: string;  // For task_deleted events
  };
}
