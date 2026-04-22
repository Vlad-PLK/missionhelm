'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Header } from '@/components/Header';
import { TaskModal } from '@/components/TaskModal';
import { WorkspaceSubnav } from '@/components/WorkspaceSubnav';
import { PlanningTab } from '@/components/PlanningTab';
import type { Agent, Task, Workspace } from '@/lib/types';

export default function WorkspacePlanningPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const workspaceRes = await fetch(`/api/workspaces/${slug}`);
      if (!workspaceRes.ok) {
        setNotFound(true);
        return;
      }

      const workspaceData = await workspaceRes.json();
      setWorkspace(workspaceData);

      const [tasksRes, agentsRes] = await Promise.all([
        fetch(`/api/tasks?workspace_id=${workspaceData.id}&status=planning,pending_dispatch`),
        fetch(`/api/agents?workspace_id=${workspaceData.id}`),
      ]);

      if (tasksRes.ok) {
        const taskData = await tasksRes.json();
        setTasks(taskData);
        setSelectedTaskId((current) => current && taskData.some((task: Task) => task.id === current) ? current : taskData[0]?.id || null);
      }
      if (agentsRes.ok) setAgents(await agentsRes.json());
    } catch (error) {
      console.error('Failed to load planning workbench:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const headerStats = useMemo(() => ({
    activeAgents: agents.filter((agent) => agent.status === 'working').length,
    tasksInQueue: tasks.filter((task) => task.status !== 'done' && task.status !== 'review').length,
  }), [agents, tasks]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;

  const retryDispatch = async (taskId: string) => {
    setRetryingTaskId(taskId);
    try {
      await fetch(`/api/tasks/${taskId}/planning/retry-dispatch`, { method: 'POST' });
      await loadPage();
    } finally {
      setRetryingTaskId(null);
    }
  };

  if (notFound) {
    return <SimpleFallback title="Workspace not found" href="/" />;
  }

  if (loading || !workspace) {
    return <SimpleLoading message="Loading planning workbench..." />;
  }

  return (
    <div className="min-h-screen bg-mc-bg pb-10">
      <Header workspace={workspace} statsOverride={headerStats} onCreateTask={() => setShowCreateTaskModal(true)} />
      <WorkspaceSubnav workspaceSlug={workspace.slug} />

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        <section>
          <Link href={`/workspace/${workspace.slug}`} className="inline-flex items-center gap-2 text-sm text-mc-text-secondary hover:text-mc-text mb-3">
            <ArrowLeft className="w-4 h-4" />
              Back to Queue
            </Link>
          <h1 className="text-2xl lg:text-3xl font-semibold">Planning Workbench</h1>
          <p className="text-mc-text-secondary mt-2 max-w-3xl">
            Manage tasks in planning, inspect the current question, and recover cleanly from dispatch failures without hunting through modals.
          </p>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6">
          <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-3">
            <div className="text-sm font-medium">Planning Queue</div>
            {tasks.length === 0 ? (
              <div className="text-sm text-mc-text-secondary">No tasks are currently in planning or pending dispatch.</div>
            ) : (
              tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`w-full text-left rounded-lg border px-3 py-3 ${selectedTaskId === task.id ? 'border-mc-accent bg-mc-accent/5' : 'border-mc-border bg-mc-bg'}`}
                >
                  <div className="font-medium text-sm">{task.title}</div>
                  <div className="text-xs text-mc-text-secondary mt-1 uppercase">{task.status.replace('_', ' ')}</div>
                  {task.planning_dispatch_error && (
                    <div className="text-xs text-mc-accent-red mt-2 line-clamp-2">{task.planning_dispatch_error}</div>
                  )}
                </button>
              ))
            )}
          </div>

          <div className="space-y-6">
            {selectedTask ? (
              <>
                <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Selected Task</div>
                      <div className="text-xl font-semibold mt-1">{selectedTask.title}</div>
                    </div>
                    {selectedTask.planning_dispatch_error && (
                      <button
                        onClick={() => retryDispatch(selectedTask.id)}
                        disabled={retryingTaskId === selectedTask.id}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-sm"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {retryingTaskId === selectedTask.id ? 'Retrying...' : 'Retry Dispatch'}
                      </button>
                    )}
                  </div>
                  {selectedTask.description && <div className="text-sm text-mc-text-secondary">{selectedTask.description}</div>}
                  {selectedTask.planning_dispatch_error && (
                    <div className="rounded-lg border border-mc-accent-red/30 bg-mc-accent-red/10 px-3 py-3 text-sm text-mc-text-secondary">
                      {selectedTask.planning_dispatch_error}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4">
                  <PlanningTab taskId={selectedTask.id} onSpecLocked={loadPage} />
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-6 text-sm text-mc-text-secondary">
                Select a planning task to inspect its live planning state.
              </div>
            )}
          </div>
        </section>
      </main>

      {showCreateTaskModal && (
        <TaskModal
          workspaceId={workspace.id}
          onClose={() => {
            setShowCreateTaskModal(false);
            void loadPage();
          }}
        />
      )}
    </div>
  );
}

function SimpleLoading({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">🦞</div>
        <p className="text-mc-text-secondary">{message}</p>
      </div>
    </div>
  );
}

function SimpleFallback({ title, href }: { title: string; href: string }) {
  return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">🗂️</div>
        <h1 className="text-2xl font-semibold mb-2">{title}</h1>
        <Link href={href} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-mc-accent text-mc-bg font-medium mt-6">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
      </div>
    </div>
  );
}
