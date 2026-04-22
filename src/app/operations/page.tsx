'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, ArrowRight, Bot, Radio, Settings2 } from 'lucide-react';
import type { Event, Task, WorkspaceStats } from '@/lib/types';

export default function OperationsPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceStats[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [workspacesRes, tasksRes, eventsRes] = await Promise.all([
        fetch('/api/workspaces?stats=true'),
        fetch('/api/tasks'),
        fetch('/api/events?limit=100'),
      ]);

      if (workspacesRes.ok) setWorkspaces(await workspacesRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (eventsRes.ok) setEvents(await eventsRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const tasksNeedingAttention = useMemo(() => tasks.filter((task) => ['testing', 'review', 'pending_dispatch', 'planning'].includes(task.status)), [tasks]);

  const tasksByWorkspace = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasksNeedingAttention) {
      const list = map.get(task.workspace_id) || [];
      list.push(task);
      map.set(task.workspace_id, list);
    }
    return map;
  }, [tasksNeedingAttention]);

  const recentImportantEvents = useMemo(() => events.filter((event) => ['task_completed', 'task_status_changed', 'agent_status_changed'].includes(event.type)).slice(0, 12), [events]);

  if (loading) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading operations home...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mc-bg pb-10">
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 lg:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold">Operations Home</h1>
            <p className="text-mc-text-secondary mt-2 max-w-3xl">
              Scan all workspaces for review pressure, planning stalls, and operational changes without opening each workspace individually.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/system" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/40">
              <Settings2 className="w-4 h-4" />
              System Admin
            </Link>
            <Link href="/" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text hover:border-mc-accent/40">
              Workspace Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <OpsMetric label="Workspaces" value={workspaces.length} />
          <OpsMetric label="Needs Attention" value={tasksNeedingAttention.length} />
          <OpsMetric label="Review" value={tasks.filter((task) => task.status === 'review').length} />
          <OpsMetric label="Testing" value={tasks.filter((task) => task.status === 'testing').length} />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)] gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="w-4 h-4 text-mc-accent-yellow" />
              Attention by Workspace
            </div>
            {workspaces.map((workspace) => {
              const workspaceTasks = tasksByWorkspace.get(workspace.id) || [];
              return (
                <article key={workspace.id} className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-lg">{workspace.icon} {workspace.name}</div>
                      <div className="text-sm text-mc-text-secondary mt-1">{workspaceTasks.length} task{workspaceTasks.length === 1 ? '' : 's'} need attention</div>
                    </div>
                    <Link href={`/workspace/${workspace.slug}`} className="inline-flex items-center gap-2 text-sm text-mc-accent hover:text-mc-accent/80">
                      Open
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>

                  <div className="mt-4 space-y-2">
                    {workspaceTasks.length === 0 ? (
                      <div className="text-sm text-mc-text-secondary">No active review/planning backlog.</div>
                    ) : (
                      workspaceTasks.slice(0, 4).map((task) => (
                        <Link key={task.id} href={`/workspace/${workspace.slug}/tasks/${task.id}`} className="block rounded-lg border border-mc-border bg-mc-bg px-3 py-3 hover:border-mc-accent/40">
                          <div className="font-medium text-sm">{task.title}</div>
                          <div className="text-xs text-mc-text-secondary mt-1 uppercase">{task.status.replace('_', ' ')}</div>
                        </Link>
                      ))
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Activity className="w-4 h-4 text-mc-accent-cyan" />
              Recent Important Events
            </div>
            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-2">
              {recentImportantEvents.length === 0 ? (
                <div className="text-sm text-mc-text-secondary">No recent events recorded.</div>
              ) : recentImportantEvents.map((event) => (
                <div key={event.id} className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3 text-sm">
                  <div>{event.message}</div>
                  <div className="text-[11px] text-mc-text-secondary mt-1">{event.type}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Radio className="w-4 h-4 text-mc-accent-green" />
                Quick Routes
              </div>
              <div className="flex flex-col gap-2">
                <Link href="/workspace/cafe-fino/review" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text">
                  <Bot className="w-4 h-4" />
                  Cafe Fino Review
                </Link>
                <Link href="/workspace/cafe-fino/planning" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text">
                  <Bot className="w-4 h-4" />
                  Cafe Fino Planning
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function OpsMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4">
      <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary">{label}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
    </div>
  );
}
