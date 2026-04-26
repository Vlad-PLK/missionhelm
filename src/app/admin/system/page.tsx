'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Cable, CheckCircle2, Copy, Cpu, ExternalLink, Radio, Server, ShieldAlert } from 'lucide-react';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { Agent, Task, WorkspaceStats } from '@/lib/types';

interface ModelsResponse {
  defaultModel?: string;
  availableModels: string[];
  source: string;
  error?: string;
}

type ReadinessResponse = {
  ready: boolean;
  degraded: boolean;
  warnings?: string[];
  execution_monitor?: {
    enabled: boolean;
    started: boolean;
    running: boolean;
    last_error: string | null;
    last_cycle_reason: string | null;
    interval_ms: number;
    max_runs_per_cycle: number;
  };
};

export default function SystemAdminPage() {
  const router = useRouter();

  const [status, setStatus] = useState<any>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [discover, setDiscover] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceStats[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useKeyboardShortcuts({
    onGoOperations: () => router.push('/operations'),
    onGoSystem: () => router.push('/admin/system'),
  });

  useEffect(() => {
    void loadPage();
  }, []);

  const loadPage = async () => {
    setLoading(true);
    try {
      const [statusRes, readinessRes, modelsRes, sessionsRes, discoverRes, tasksRes, workspacesRes, agentsRes] = await Promise.all([
        fetch('/api/openclaw/status'),
        fetch('/api/health/readiness'),
        fetch('/api/openclaw/models'),
        fetch('/api/openclaw/sessions?status=active'),
        fetch('/api/agents/discover'),
        fetch('/api/tasks'),
        fetch('/api/workspaces?stats=true'),
        fetch('/api/agents'),
      ]);

      if (statusRes.ok) setStatus(await statusRes.json());
      if (readinessRes.ok) setReadiness(await readinessRes.json());
      if (modelsRes.ok) setModels(await modelsRes.json());
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
      if (discoverRes.ok) setDiscover((await discoverRes.json()).agents || []);
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (workspacesRes.ok) setWorkspaces(await workspacesRes.json());
      if (agentsRes.ok) setAgents(await agentsRes.json());
    } finally {
      setLoading(false);
    }
  };

  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const workspacesById = useMemo(() => new Map(workspaces.map((workspace) => [workspace.id, workspace])), [workspaces]);
  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);

  const monitorState = readiness?.execution_monitor ?? status?.execution_monitor ?? null;
  const gatewayTone = !status?.connected ? 'danger' : status?.error ? 'warning' : 'success';
  const monitorTone =
    !monitorState?.enabled ? 'default' : !monitorState.started || monitorState.last_error ? 'warning' : monitorState.running ? 'success' : 'default';

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
    } catch (error) {
      console.error('Failed to copy value:', error);
    }
  };

  if (loading) {
    return <PageLoading message="Loading system admin..." />;
  }

  return (
    <div className="min-h-[100dvh] bg-mc-bg pb-10">
      <header className="border-b border-mc-border bg-mc-bg-secondary/95 px-4 py-5 backdrop-blur-xl lg:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)] lg:items-end">
            <div>
              <Link href="/operations" className="mb-3 inline-flex items-center gap-2 text-sm text-mc-text-secondary transition-colors hover:text-mc-text">
                <ArrowLeft className="h-4 w-4" />
                Back to operations
              </Link>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-mc-bg px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-mc-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <Server className="h-3.5 w-3.5 text-mc-accent" />
                System
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-mc-text lg:text-5xl">System / Gateway Admin</h1>
              <p className="mt-3 max-w-[66ch] text-sm leading-relaxed text-mc-text-secondary lg:text-base">
                Inspect gateway health, execution monitor state, active sessions, and importable agents from one operator-focused surface.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(88,166,255,0.14),rgba(13,17,23,0.22))] p-4 shadow-[0_20px_50px_-34px_rgba(0,0,0,0.8)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="text-[11px] uppercase tracking-[0.22em] text-mc-text-secondary">Operator jump</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/operations" className="inline-flex min-h-[40px] items-center rounded-full border border-mc-border bg-mc-bg px-3 py-2 text-sm text-mc-text-secondary transition-colors hover:text-mc-text">
                  Operations
                </Link>
                <Link href="/" className="inline-flex min-h-[40px] items-center rounded-full border border-mc-border bg-mc-bg px-3 py-2 text-sm text-mc-text-secondary transition-colors hover:text-mc-text">
                  Dashboard
                </Link>
                <span className="inline-flex min-h-[40px] items-center rounded-full border border-mc-border bg-mc-bg px-3 py-2 text-xs text-mc-text-secondary">
                  g o for operations
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricPanel label="Gateway" value={status?.connected ? 'Online' : 'Offline'} tone={gatewayTone} detail={status?.error || status?.gateway_url || 'No gateway URL'} />
          <MetricPanel label="Execution Monitor" value={monitorState?.running ? 'Running' : monitorState?.enabled ? 'Idle' : 'Disabled'} tone={monitorTone} detail={monitorState?.last_error || `interval ${monitorState?.interval_ms ?? 0} ms`} />
          <MetricPanel label="Live Sessions" value={sessions.length} tone={sessions.length > 0 ? 'default' : 'warning'} detail={`${status?.sessions_count || 0} visible from gateway`} />
          <MetricPanel label="Importable Agents" value={discover.length} tone={discover.length > 0 ? 'success' : 'default'} detail={`${discover.filter((agent) => agent.already_imported).length} already imported`} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <Panel title="Gateway Health" icon={<Radio className="h-4 w-4 text-mc-accent-green" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <HealthField label="Connected" value={status?.connected ? 'Yes' : 'No'} tone={status?.connected ? 'success' : 'danger'} />
              <HealthField label="Gateway URL" value={status?.gateway_url || 'Unavailable'} />
              <HealthField label="Session Count" value={String(status?.sessions_count || 0)} />
              <HealthField label="Readiness" value={readiness?.ready ? 'Ready' : 'Not ready'} tone={readiness?.ready ? 'success' : 'danger'} />
            </div>

            {status?.error ? (
              <Callout tone="danger" title="Gateway warning">
                {status.error}
              </Callout>
            ) : null}

            {readiness?.warnings?.length ? (
              <div className="space-y-2">
                {readiness.warnings.map((warning) => (
                  <Callout key={warning} tone="warning" title="Readiness warning">
                    {warning}
                  </Callout>
                ))}
              </div>
            ) : null}
          </Panel>

          <Panel title="Execution Monitor" icon={<ShieldAlert className="h-4 w-4 text-mc-accent-yellow" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <HealthField label="Enabled" value={monitorState?.enabled ? 'Yes' : 'No'} tone={monitorState?.enabled ? 'success' : 'default'} />
              <HealthField label="Started" value={monitorState?.started ? 'Yes' : 'No'} tone={monitorState?.started ? 'success' : 'warning'} />
              <HealthField label="Running" value={monitorState?.running ? 'Yes' : 'No'} tone={monitorState?.running ? 'success' : 'warning'} />
              <HealthField label="Last Cycle" value={monitorState?.last_cycle_reason || 'Unknown'} />
              <HealthField label="Interval" value={`${monitorState?.interval_ms ?? 0} ms`} />
              <HealthField label="Max Runs" value={String(monitorState?.max_runs_per_cycle ?? 0)} />
            </div>

            {monitorState?.last_error ? (
              <Callout tone="warning" title="Monitor degraded">
                {monitorState.last_error}
              </Callout>
            ) : (
              <Callout tone="success" title="Monitor healthy">
                Automatic polling is enabled and no recent monitor error is recorded.
              </Callout>
            )}
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <Panel title="Active Sessions" icon={<Server className="h-4 w-4 text-mc-accent" />}>
            <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
              {sessions.length === 0 ? (
                <div className="rounded-2xl border border-mc-border bg-mc-bg px-4 py-4 text-sm text-mc-text-secondary">
                  No active sessions recorded.
                </div>
              ) : (
                sessions.map((session) => {
                  const task = session.task_id ? tasksById.get(session.task_id) : undefined;
                  const workspace = task ? workspacesById.get(task.workspace_id) : undefined;
                  const agent = session.agent_id ? agentsById.get(session.agent_id) : undefined;

                  return (
                    <div key={session.id} className="rounded-[1.5rem] border border-mc-border bg-mc-bg px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <SessionStatusPill status={session.status} />
                            <span className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">{session.session_type}</span>
                          </div>
                          <div className="mt-2 break-all text-sm font-medium text-mc-text">{session.openclaw_session_id}</div>
                          <div className="mt-2 text-xs text-mc-text-secondary">
                            {agent ? agent.name : 'Unknown agent'}
                            {workspace ? ` · ${workspace.name}` : ''}
                            {task ? ` · ${task.title}` : ''}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <ActionPill onClick={() => void copyValue(`session:${session.id}`, session.openclaw_session_id)}>
                            <Copy className="h-3.5 w-3.5" />
                            {copied === `session:${session.id}` ? 'Copied' : 'Copy ID'}
                          </ActionPill>
                          <Link href={`/api/openclaw/sessions/${session.id}`} target="_blank" className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-mc-border px-3 py-1.5 text-xs text-mc-text-secondary transition-colors hover:text-mc-text">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Diagnostics
                          </Link>
                          <Link href={`/api/openclaw/sessions/${session.id}/history`} target="_blank" className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-mc-border px-3 py-1.5 text-xs text-mc-text-secondary transition-colors hover:text-mc-text">
                            <ExternalLink className="h-3.5 w-3.5" />
                            History
                          </Link>
                          {workspace ? (
                            <Link href={`/workspace/${workspace.slug}`} className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-mc-border px-3 py-1.5 text-xs text-mc-text-secondary transition-colors hover:text-mc-text">
                              Open workspace
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>

          <Panel title="Importable Agents" icon={<Cable className="h-4 w-4 text-mc-accent-cyan" />}>
            <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
              {discover.length === 0 ? (
                <div className="rounded-2xl border border-mc-border bg-mc-bg px-4 py-4 text-sm text-mc-text-secondary">
                  No agents returned from gateway discovery.
                </div>
              ) : (
                discover.map((agent) => {
                  const importedAgent = agent.existing_agent_id ? agentsById.get(agent.existing_agent_id) : undefined;
                  const importedWorkspace = importedAgent ? workspacesById.get(importedAgent.workspace_id) : undefined;

                  return (
                    <div key={agent.id} className="rounded-[1.5rem] border border-mc-border bg-mc-bg px-4 py-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <AgentStatusPill alreadyImported={agent.already_imported} />
                            {agent.model ? <span className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">{agent.model}</span> : null}
                          </div>
                          <div className="mt-2 text-sm font-medium text-mc-text">{agent.name}</div>
                          <div className="mt-2 text-xs text-mc-text-secondary">
                            {agent.channel || 'No channel'}
                            {importedAgent ? ` · linked to ${importedAgent.name}` : ''}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <ActionPill onClick={() => void copyValue(`agent:${agent.id}`, agent.id)}>
                            <Copy className="h-3.5 w-3.5" />
                            {copied === `agent:${agent.id}` ? 'Copied' : 'Copy ID'}
                          </ActionPill>
                          {importedAgent && importedWorkspace ? (
                            <Link href={`/workspace/${importedWorkspace.slug}/agents`} className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-mc-border px-3 py-1.5 text-xs text-mc-text-secondary transition-colors hover:text-mc-text">
                              Open team
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <Panel title="Model Discovery" icon={<Cpu className="h-4 w-4 text-mc-accent" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <HealthField label="Source" value={models?.source || 'Unknown'} />
              <HealthField label="Default Model" value={models?.defaultModel || 'None'} />
            </div>
            <div className="rounded-[1.5rem] border border-mc-border bg-mc-bg px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">Available Models</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {models?.availableModels?.length ? (
                  models.availableModels.map((model) => (
                    <span key={model} className="rounded-full border border-mc-border bg-mc-bg-secondary px-3 py-1.5 text-xs text-mc-text-secondary">
                      {model}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-mc-text-secondary">No models returned.</span>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Operator Notes" icon={<CheckCircle2 className="h-4 w-4 text-mc-accent-green" />}>
            <div className="space-y-3">
              <Callout tone="default" title="What this page is for">
                Use it to verify gateway health, execution monitor status, and active session routes before diving into a workspace.
              </Callout>
              <Callout tone="default" title="Immediate next steps">
                If gateway connectivity is degraded, go to Operations next. If sessions are mismatched, open diagnostics or history directly from the session panel.
              </Callout>
            </div>
          </Panel>
        </section>
      </main>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[1.8rem] border border-mc-border bg-mc-bg-secondary/88 p-5 shadow-[0_18px_40px_-36px_rgba(0,0,0,0.75)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-mc-text">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function HealthField({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-mc-accent-green/25 bg-mc-accent-green/10'
      : tone === 'warning'
        ? 'border-mc-accent-yellow/25 bg-mc-accent-yellow/10'
        : tone === 'danger'
          ? 'border-mc-accent-red/25 bg-mc-accent-red/10'
          : 'border-mc-border bg-mc-bg';

  return (
    <div className={`rounded-[1.35rem] border px-4 py-3 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-mc-text">{value}</div>
    </div>
  );
}

function MetricPanel({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-mc-accent-green/25 bg-[linear-gradient(180deg,rgba(63,185,80,0.08),rgba(22,27,34,0.9))]'
      : tone === 'warning'
        ? 'border-mc-accent-yellow/25 bg-[linear-gradient(180deg,rgba(210,153,34,0.08),rgba(22,27,34,0.9))]'
        : tone === 'danger'
          ? 'border-mc-accent-red/25 bg-[linear-gradient(180deg,rgba(248,81,73,0.08),rgba(22,27,34,0.9))]'
          : 'border-mc-border bg-mc-bg-secondary/88';

  return (
    <div className={`rounded-[1.6rem] border p-4 shadow-[0_18px_36px_-34px_rgba(0,0,0,0.75)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-[0.22em] text-mc-text-secondary">{label}</div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-mc-text">{value}</div>
      <div className="mt-2 text-sm text-mc-text-secondary">{detail}</div>
    </div>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: 'default' | 'success' | 'warning' | 'danger';
  title: string;
  children: ReactNode;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-mc-accent-green/25 bg-mc-accent-green/10'
      : tone === 'warning'
        ? 'border-mc-accent-yellow/25 bg-mc-accent-yellow/10'
        : tone === 'danger'
          ? 'border-mc-accent-red/25 bg-mc-accent-red/10'
          : 'border-mc-border bg-mc-bg';

  return (
    <div className={`rounded-[1.35rem] border px-4 py-3 ${toneClass}`}>
      <div className="text-sm font-medium text-mc-text">{title}</div>
      <div className="mt-1 text-sm leading-relaxed text-mc-text-secondary">{children}</div>
    </div>
  );
}

function SessionStatusPill({ status }: { status: string }) {
  const toneClass =
    status === 'active'
      ? 'border-mc-accent-green/25 bg-mc-accent-green/10 text-mc-accent-green'
      : 'border-mc-accent-yellow/25 bg-mc-accent-yellow/10 text-mc-accent-yellow';

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${toneClass}`}>{status}</span>;
}

function AgentStatusPill({ alreadyImported }: { alreadyImported: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${
        alreadyImported
          ? 'border-mc-border bg-mc-bg-secondary text-mc-text-secondary'
          : 'border-mc-accent-green/25 bg-mc-accent-green/10 text-mc-accent-green'
      }`}
    >
      {alreadyImported ? 'Imported' : 'Available'}
    </span>
  );
}

function ActionPill({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-mc-border px-3 py-1.5 text-xs text-mc-text-secondary transition-colors hover:text-mc-text"
    >
      {children}
    </button>
  );
}

function PageLoading({ message }: { message: string }) {
  return (
    <div className="min-h-[100dvh] bg-mc-bg px-4 py-8 lg:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="h-32 animate-pulse rounded-[2rem] border border-mc-border bg-mc-bg-secondary/70" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-[1.6rem] border border-mc-border bg-mc-bg-secondary/70" />
          ))}
        </div>
        <div className="rounded-[1.8rem] border border-mc-border bg-mc-bg-secondary/70 px-5 py-10 text-center text-sm text-mc-text-secondary">{message}</div>
      </div>
    </div>
  );
}
