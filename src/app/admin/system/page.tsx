'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Cable, Cpu, Radio, Server } from 'lucide-react';

interface ModelsResponse {
  defaultModel?: string;
  availableModels: string[];
  source: string;
  error?: string;
}

export default function SystemAdminPage() {
  const [status, setStatus] = useState<any>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [discover, setDiscover] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, modelsRes, sessionsRes, discoverRes] = await Promise.all([
        fetch('/api/openclaw/status'),
        fetch('/api/openclaw/models'),
        fetch('/api/openclaw/sessions?status=active'),
        fetch('/api/agents/discover'),
      ]);

      if (statusRes.ok) setStatus(await statusRes.json());
      if (modelsRes.ok) setModels(await modelsRes.json());
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
      if (discoverRes.ok) setDiscover((await discoverRes.json()).agents || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  if (loading) {
    return <PageLoading message="Loading system admin..." />;
  }

  return (
    <div className="min-h-screen bg-mc-bg pb-10">
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 lg:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <Link href="/operations" className="inline-flex items-center gap-2 text-sm text-mc-text-secondary hover:text-mc-text mb-3">
              <ArrowLeft className="w-4 h-4" />
              Back to operations
            </Link>
            <h1 className="text-2xl lg:text-3xl font-semibold">System / Gateway Admin</h1>
            <p className="text-mc-text-secondary mt-2 max-w-3xl">
              Inspect gateway health, model discovery, active sessions, and importable agents without opening logs.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <PanelMetric label="Gateway" value={status?.connected ? 'Online' : 'Offline'} />
          <PanelMetric label="Live Sessions" value={sessions.length} />
          <PanelMetric label="Models" value={models?.availableModels.length || 0} />
          <PanelMetric label="Discoverable Agents" value={discover.length} />
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Panel title="Gateway Status" icon={<Radio className="w-4 h-4 text-mc-accent-green" />}>
            <div className="space-y-2 text-sm">
              <Detail label="Connected" value={status?.connected ? 'Yes' : 'No'} />
              <Detail label="Gateway URL" value={status?.gateway_url || 'Unavailable'} />
              <Detail label="Session Count" value={String(status?.sessions_count || 0)} />
              {status?.error && <div className="rounded-lg border border-mc-accent-red/30 bg-mc-accent-red/10 px-3 py-3 text-sm text-mc-text-secondary">{status.error}</div>}
            </div>
          </Panel>

          <Panel title="Model Discovery" icon={<Cpu className="w-4 h-4 text-mc-accent-cyan" />}>
            <div className="space-y-2 text-sm">
              <Detail label="Source" value={models?.source || 'Unknown'} />
              <Detail label="Default Model" value={models?.defaultModel || 'None'} />
              <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3 max-h-72 overflow-y-auto">
                <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary mb-2">Available Models</div>
                <div className="space-y-1 text-sm">
                  {models?.availableModels.map((model) => (
                    <div key={model}>{model}</div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Panel title="Active Sessions" icon={<Server className="w-4 h-4 text-mc-accent" />}>
            <div className="space-y-2 text-sm max-h-80 overflow-y-auto">
              {sessions.length === 0 ? <div className="text-mc-text-secondary">No active sessions recorded.</div> : sessions.map((session) => (
                <div key={session.id} className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
                  <div className="font-medium">{session.openclaw_session_id}</div>
                  <div className="text-xs text-mc-text-secondary mt-1">{session.session_type} · {session.status}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Importable Agents" icon={<Cable className="w-4 h-4 text-blue-300" />}>
            <div className="space-y-2 text-sm max-h-80 overflow-y-auto">
              {discover.length === 0 ? <div className="text-mc-text-secondary">No agents returned from gateway discovery.</div> : discover.map((agent) => (
                <div key={agent.id} className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
                  <div className="font-medium">{agent.name}</div>
                  <div className="text-xs text-mc-text-secondary mt-1">{agent.model || 'No model'} · {agent.already_imported ? 'Already imported' : 'Available'}</div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      </main>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
      <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary">{label}</div>
      <div className="font-medium mt-1 break-words">{value}</div>
    </div>
  );
}

function PanelMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4">
      <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary">{label}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
    </div>
  );
}

function PageLoading({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-mc-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">🦞</div>
        <p className="text-mc-text-secondary">{message}</p>
      </div>
    </div>
  );
}
