'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, FolderSync, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { Header } from '@/components/Header';
import { TaskModal } from '@/components/TaskModal';
import { WorkspaceSubnav } from '@/components/WorkspaceSubnav';
import type { Agent, Task, Workspace } from '@/lib/types';

const PROTECTED_WORKSPACES = new Set(['default', 'cafe-fino', 'autonomous-workflow', 'cronjobs-review']);

interface DeletePreview {
  workspace: {
    id: string;
    name: string;
    slug: string;
    folder_path?: string | null;
  };
  protected: boolean;
  counts: Record<string, number>;
  warnings: string[];
}

export default function WorkspaceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingFolderPath, setSavingFolderPath] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [form, setForm] = useState({ name: '', description: '', icon: '📁', folder_path: '' });
  const [notFound, setNotFound] = useState(false);
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
      setForm({
        name: workspaceData.name || '',
        description: workspaceData.description || '',
        icon: workspaceData.icon || '📁',
        folder_path: workspaceData.folder_path || '',
      });

      const [tasksRes, agentsRes, previewRes] = await Promise.all([
        fetch(`/api/tasks?workspace_id=${workspaceData.id}`),
        fetch(`/api/agents?workspace_id=${workspaceData.id}`),
        fetch(`/api/workspaces/${workspaceData.id}/delete-preview`),
      ]);

      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (previewRes.ok) setPreview(await previewRes.json());
    } catch (error) {
      console.error('Failed to load workspace settings:', error);
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

  if (loading || !workspace) {
    if (notFound) {
      return (
        <div className="min-h-screen bg-mc-bg flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-5xl mb-4">⚙️</div>
            <h1 className="text-2xl font-semibold mb-2">Workspace not found</h1>
            <p className="text-mc-text-secondary mb-6">The workspace settings surface could not load the requested workspace.</p>
            <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-mc-accent text-mc-bg font-medium">
              <ArrowLeft className="w-4 h-4" />
              Back to dashboard
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🦞</div>
          <p className="text-mc-text-secondary">Loading workspace settings...</p>
        </div>
      </div>
    );
  }

  const isProtected = PROTECTED_WORKSPACES.has(workspace.slug) || !!preview?.protected;
  const confirmationMatches = confirmSlug.trim() === workspace.slug;

  const saveGeneral = async () => {
    setSavingGeneral(true);
    try {
      await fetch(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          icon: form.icon,
        }),
      });
      await loadPage();
    } finally {
      setSavingGeneral(false);
    }
  };

  const saveFolderPath = async () => {
    setSavingFolderPath(true);
    try {
      await fetch(`/api/workspaces/${workspace.id}/folder-path`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_path: form.folder_path }),
      });
      await loadPage();
    } finally {
      setSavingFolderPath(false);
    }
  };

  const deleteWorkspace = async () => {
    if (isProtected || !confirmationMatches) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/');
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-mc-bg pb-10">
      <Header workspace={workspace} statsOverride={headerStats} onCreateTask={() => setShowCreateTaskModal(true)} />
      <WorkspaceSubnav workspaceSlug={workspace.slug} />

      <main className="max-w-6xl mx-auto px-4 lg:px-6 py-6 space-y-6">
        <section>
          <Link href={`/workspace/${workspace.slug}`} className="inline-flex items-center gap-2 text-sm text-mc-text-secondary hover:text-mc-text mb-3">
            <ArrowLeft className="w-4 h-4" />
            Back to Queue
          </Link>
          <h1 className="text-2xl lg:text-3xl font-semibold">Workspace Settings and Operations</h1>
          <p className="text-mc-text-secondary mt-2 max-w-3xl">
            Manage workspace metadata, repository path targeting, imported agents, and destructive operations from one explicit surface.
          </p>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.85fr)] gap-6">
          <div className="space-y-6">
            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
              <div className="text-sm font-medium">Workspace Metadata</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-2 text-sm">
                  <span className="block text-mc-text-secondary">Name</span>
                  <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-2" />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="block text-mc-text-secondary">Icon</span>
                  <input value={form.icon} onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} className="w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-2" />
                </label>
              </div>
              <label className="space-y-2 text-sm block">
                <span className="block text-mc-text-secondary">Description</span>
                <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={4} className="w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-2" />
              </label>
              <button onClick={saveGeneral} disabled={savingGeneral} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-mc-accent text-mc-bg font-medium disabled:opacity-50">
                <Save className="w-4 h-4" />
                {savingGeneral ? 'Saving...' : 'Save Metadata'}
              </button>
            </div>

            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
              <div className="text-sm font-medium">Workspace Folder Path</div>
              <p className="text-sm text-mc-text-secondary">
                This path is used for repo-aware task dispatch, so coding work can execute inside an existing repository instead of a generated project folder.
              </p>
              <label className="space-y-2 text-sm block">
                <span className="block text-mc-text-secondary">folder_path</span>
                <input value={form.folder_path} onChange={(event) => setForm((current) => ({ ...current, folder_path: event.target.value }))} placeholder="/home/vlad-plk/clients/cafe-fino" className="w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-2 font-mono text-sm" />
              </label>
              <button onClick={saveFolderPath} disabled={savingFolderPath} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-mc-border bg-mc-bg text-mc-text disabled:opacity-50">
                <FolderSync className="w-4 h-4" />
                {savingFolderPath ? 'Saving...' : 'Save Folder Path'}
              </button>
            </div>

            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
              <div className="text-sm font-medium">Imported Agent Overview</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {agents.length === 0 ? (
                  <div className="text-sm text-mc-text-secondary">No agents are currently attached to this workspace.</div>
                ) : (
                  agents.map((agent) => (
                    <div key={agent.id} className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
                      <div className="font-medium text-sm">{agent.avatar_emoji} {agent.name}</div>
                      <div className="text-xs text-mc-text-secondary mt-1">{agent.source === 'gateway' ? 'Imported from gateway' : 'Local agent'} · {agent.status}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-mc-border bg-mc-bg-secondary p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldAlert className="w-4 h-4 text-mc-accent-yellow" />
                Protection and Delete Preview
              </div>

              <div className={`rounded-lg border px-3 py-3 text-sm ${isProtected ? 'border-mc-accent-yellow/30 bg-mc-accent-yellow/10' : 'border-mc-border bg-mc-bg'}`}>
                {isProtected ? 'This workspace is protected. Destructive deletion is blocked in both the UI and API.' : 'This workspace can be deleted once the typed confirmation matches the slug.'}
              </div>

              {preview && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(preview.counts).map(([key, value]) => (
                      <div key={key} className="rounded-lg border border-mc-border bg-mc-bg px-3 py-3">
                        <div className="text-[11px] uppercase tracking-wider text-mc-text-secondary">{key.replace(/_/g, ' ')}</div>
                        <div className="font-medium mt-1">{value}</div>
                      </div>
                    ))}
                  </div>

                  {preview.warnings.length > 0 && (
                    <div className="space-y-2">
                      {preview.warnings.map((warning) => (
                        <div key={warning} className="rounded-lg border border-mc-accent-yellow/30 bg-mc-accent-yellow/10 px-3 py-3 text-sm text-mc-text-secondary">
                          <AlertTriangle className="w-4 h-4 inline-block mr-2 text-mc-accent-yellow" />
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-mc-accent-red/25 bg-mc-accent-red/10 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-mc-text">
                <Trash2 className="w-4 h-4 text-mc-accent-red" />
                Dangerous Action
              </div>
              <p className="text-sm text-mc-text-secondary">
                Type <code>{workspace.slug}</code> to enable deletion. This is intentionally separate from the dashboard so the operator sees dependency counts before acting.
              </p>
              <input value={confirmSlug} onChange={(event) => setConfirmSlug(event.target.value)} className="w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-2" placeholder={workspace.slug} disabled={isProtected} />
              <button onClick={deleteWorkspace} disabled={isProtected || !confirmationMatches || deleting} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-mc-accent-red text-white font-medium disabled:opacity-50">
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Deleting...' : 'Delete Workspace'}
              </button>
            </div>
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
