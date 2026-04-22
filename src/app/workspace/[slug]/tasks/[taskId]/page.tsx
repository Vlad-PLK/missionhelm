'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarDays, Pencil, RefreshCw, User2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Header } from '@/components/Header';
import { WorkspaceSubnav } from '@/components/WorkspaceSubnav';
import { PlanningTab } from '@/components/PlanningTab';
import { ActivityLog } from '@/components/ActivityLog';
import { DeliverablesList } from '@/components/DeliverablesList';
import { SessionsList } from '@/components/SessionsList';
import { TaskModal } from '@/components/TaskModal';
import { TaskMilestonesPanel } from '@/components/TaskMilestonesPanel';
import { TaskReviewPanel } from '@/components/TaskReviewPanel';
import type { Agent, OpenClawSession, Task, Workspace } from '@/lib/types';

interface PlanningSpecData {
  summary?: string;
  deliverables?: string[];
  success_criteria?: string[];
  constraints?: Record<string, unknown>;
}

export default function WorkspaceTaskDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const taskId = params.taskId as string;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeSessions, setActiveSessions] = useState<OpenClawSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const loadTaskDetail = useCallback(async () => {
    setLoading(true);
    try {
      const workspaceRes = await fetch(`/api/workspaces/${slug}`);
      if (!workspaceRes.ok) {
        setNotFound(true);
        return;
      }

      const workspaceData = await workspaceRes.json();
      setWorkspace(workspaceData);

      const [taskRes, agentsRes, tasksRes, sessionsRes] = await Promise.all([
        fetch(`/api/tasks/${taskId}`),
        fetch(`/api/agents?workspace_id=${workspaceData.id}`),
        fetch(`/api/tasks?workspace_id=${workspaceData.id}`),
        fetch('/api/openclaw/sessions?status=active'),
      ]);

      if (!taskRes.ok) {
        setNotFound(true);
        return;
      }

      const taskData = await taskRes.json();
      if (taskData.workspace_id !== workspaceData.id) {
        setNotFound(true);
        return;
      }

      setTask(taskData);
      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (sessionsRes.ok) setActiveSessions(await sessionsRes.json());
    } catch (error) {
      console.error('Failed to load task detail:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug, taskId]);

  useEffect(() => {
    loadTaskDetail();
  }, [loadTaskDetail]);

  const headerStats = useMemo(() => {
    return {
      activeAgents: agents.filter((agent) => agent.status === 'working').length + activeSessions.filter((session) => session.session_type === 'subagent').length,
      tasksInQueue: tasks.filter((candidate) => candidate.status !== 'done' && candidate.status !== 'review').length,
    };
  }, [agents, activeSessions, tasks]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">🧭</div>
          <h1 className="text-2xl font-semibold mb-2">Task not found</h1>
          <p className="text-mc-text-secondary mb-6">
            The task you are trying to inspect does not exist in this workspace anymore.
          </p>
          <Link href={`/workspace/${slug}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-mc-accent text-mc-bg font-medium">
            <ArrowLeft className="w-4 h-4" />
            Back to workspace
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !workspace || !task) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading task detail...</p>
        </div>
      </div>
    );
  }

  const planningSpec = parsePlanningSpec(task.planning_spec);
  const currentAssignedAgent = agents.find((agent) => agent.id === task.assigned_agent_id);

  return (
    <div className="min-h-screen bg-mc-bg pb-10">
      <Header workspace={workspace} statsOverride={headerStats} onCreateTask={() => setShowCreateTaskModal(true)} />
      <WorkspaceSubnav workspaceSlug={workspace.slug} taskId={task.id} />

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        <section className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-3 min-w-0">
            <Link href={`/workspace/${workspace.slug}`} className="inline-flex items-center gap-2 text-sm text-mc-text-secondary hover:text-mc-text">
              <ArrowLeft className="w-4 h-4" />
              Back to Queue
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
              </div>
              <h1 className="text-2xl lg:text-3xl font-semibold leading-tight">{task.title}</h1>
              {task.description && (
                <p className="text-mc-text-secondary mt-2 max-w-3xl leading-relaxed">{task.description}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/40"
            >
              <Pencil className="w-4 h-4" />
              Edit Task
            </button>
            <button
              onClick={() => loadTaskDetail()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/40"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-6">
          <div className="space-y-6">
            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
              <div className="text-sm font-medium">Overview</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <InfoCard label="Assigned Agent" value={currentAssignedAgent?.name || 'Unassigned'} icon={<User2 className="w-4 h-4" />} helper={currentAssignedAgent?.avatar_emoji} />
                <InfoCard label="Due Date" value={task.due_date ? new Date(task.due_date).toLocaleString() : 'No due date'} icon={<CalendarDays className="w-4 h-4" />} helper={task.due_date ? formatDistanceToNow(new Date(task.due_date), { addSuffix: true }) : undefined} />
                <InfoCard label="Created" value={new Date(task.created_at).toLocaleString()} helper={formatDistanceToNow(new Date(task.created_at), { addSuffix: true })} />
                <InfoCard label="Last Updated" value={new Date(task.updated_at).toLocaleString()} helper={formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })} />
              </div>
            </div>

            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
              <div className="text-sm font-medium">Planning Spec</div>
              {task.status === 'planning' ? (
                <PlanningTab taskId={task.id} onSpecLocked={loadTaskDetail} />
              ) : planningSpec ? (
                <PlanningSpecSection spec={planningSpec} />
              ) : (
                <div className="text-sm text-mc-text-secondary">No planning specification is stored for this task.</div>
              )}
            </div>

            <TaskMilestonesPanel taskId={task.id} />

            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
              <div className="text-sm font-medium">Activity Timeline</div>
              <ActivityLog taskId={task.id} />
            </div>

            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
              <div className="text-sm font-medium">Deliverables</div>
              <DeliverablesList taskId={task.id} />
            </div>
          </div>

          <div className="space-y-6">
            <TaskReviewPanel
              task={task}
              onTaskUpdated={(updatedTask) => {
                setTask(updatedTask);
                setTasks((current) => current.map((entry) => (entry.id === updatedTask.id ? updatedTask : entry)));
              }}
            />

            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
              <div className="text-sm font-medium">Sessions</div>
              <SessionsList taskId={task.id} />
            </div>
          </div>
        </section>
      </main>

      {showCreateTaskModal && (
        <TaskModal
          workspaceId={workspace.id}
          onClose={() => {
            setShowCreateTaskModal(false);
            void loadTaskDetail();
          }}
        />
      )}

      {showEditModal && (
        <TaskModal
          task={task}
          workspaceId={workspace.id}
          onClose={() => {
            setShowEditModal(false);
            void loadTaskDetail();
          }}
        />
      )}
    </div>
  );
}

function parsePlanningSpec(raw?: string): PlanningSpecData | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PlanningSpecData;
  } catch {
    return { summary: raw };
  }
}

function PlanningSpecSection({ spec }: { spec: PlanningSpecData }) {
  return (
    <div className="space-y-4 text-sm">
      {spec.summary && <p className="text-mc-text-secondary leading-relaxed">{spec.summary}</p>}

      {spec.success_criteria && spec.success_criteria.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-mc-text-secondary mb-2">Success Criteria</div>
          <ul className="space-y-2">
            {spec.success_criteria.map((criterion) => (
              <li key={criterion} className="rounded-lg border border-mc-border bg-mc-bg px-3 py-2">{criterion}</li>
            ))}
          </ul>
        </div>
      )}

      {spec.deliverables && spec.deliverables.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-mc-text-secondary mb-2">Deliverables</div>
          <ul className="space-y-2">
            {spec.deliverables.map((deliverable) => (
              <li key={deliverable} className="rounded-lg border border-mc-border bg-mc-bg px-3 py-2">{deliverable}</li>
            ))}
          </ul>
        </div>
      )}

      {spec.constraints && Object.keys(spec.constraints).length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-mc-text-secondary mb-2">Constraints</div>
          <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3 font-mono text-xs whitespace-pre-wrap break-words">
            {JSON.stringify(spec.constraints, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
      <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary flex items-center gap-2">
        {icon}
        {label}
      </div>
      <div className="font-medium mt-2">{value}</div>
      {helper && <div className="text-xs text-mc-text-secondary mt-1">{helper}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: Task['status'] }) {
  const styles: Record<Task['status'], string> = {
    pending_dispatch: 'bg-mc-text-secondary/20 text-mc-text-secondary',
    planning: 'bg-mc-accent-purple/20 text-mc-accent-purple',
    inbox: 'bg-mc-accent-pink/20 text-mc-accent-pink',
    assigned: 'bg-mc-accent-yellow/20 text-mc-accent-yellow',
    in_progress: 'bg-mc-accent/20 text-mc-accent',
    testing: 'bg-mc-accent-cyan/20 text-mc-accent-cyan',
    review: 'bg-mc-accent-purple/20 text-mc-accent-purple',
    done: 'bg-mc-accent-green/20 text-mc-accent-green',
  };

  return <span className={`px-2 py-1 rounded-full text-xs uppercase ${styles[status]}`}>{status.replace('_', ' ')}</span>;
}

function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  const styles: Record<Task['priority'], string> = {
    low: 'bg-mc-text-secondary/20 text-mc-text-secondary',
    normal: 'bg-mc-accent/20 text-mc-accent',
    high: 'bg-mc-accent-yellow/20 text-mc-accent-yellow',
    urgent: 'bg-mc-accent-red/20 text-mc-accent-red',
  };

  return <span className={`px-2 py-1 rounded-full text-xs uppercase ${styles[priority]}`}>{priority}</span>;
}
