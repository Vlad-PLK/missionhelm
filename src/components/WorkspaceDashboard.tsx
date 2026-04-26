'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ActivitySquare,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckSquare,
  FolderOpen,
  LayoutDashboard,
  Pin,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Agent, Task, WorkspaceStats } from '@/lib/types';
import { APP_DISPLAY_NAME } from '@/lib/branding';
import { WorkspaceAttentionBadge, getWorkspaceAttentionLabel, getWorkspaceAttentionLevel } from '@/components/WorkspaceAttentionBadge';
import { WorkspaceQuickActions } from '@/components/WorkspaceQuickActions';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import {
  getOperatorPrefs,
  recordRecentWorkspaceVisit,
  togglePinnedWorkspace,
  type OperatorPrefs,
} from '@/lib/ui/operator-prefs';

const PROTECTED_WORKSPACE_SLUGS = new Set(['default', 'cafe-fino', 'autonomous-workflow', 'cronjobs-review']);

type DashboardSortKey = 'attention' | 'tasks' | 'agents' | 'alphabetical';

interface WorkspaceDeletePreview {
  workspace: {
    id: string;
    name: string;
    slug: string;
    folder_path?: string | null;
  };
  protected: boolean;
  counts: {
    tasks: number;
    agents: number;
    openclaw_sessions: number;
    messages: number;
    events: number;
    task_activities: number;
    task_deliverables: number;
    planning_questions: number;
    planning_specs: number;
    conversations: number;
    conversation_participants: number;
    task_groups: number;
    task_dependencies: number;
    workspace_agents: number;
    task_milestones: number;
    task_progress: number;
  };
  warnings: string[];
}

function createDefaultPrefs(): OperatorPrefs {
  return {
    pinnedWorkspaces: [],
    recentWorkspaces: [],
  };
}

function workspaceTaskPressure(workspace: WorkspaceStats) {
  return (
    workspace.taskCounts.review * 5 +
    workspace.taskCounts.testing * 4 +
    workspace.taskCounts.pending_dispatch * 3 +
    workspace.taskCounts.planning * 2 +
    workspace.taskCounts.assigned
  );
}

function workspaceNeedsAttention(workspace: WorkspaceStats) {
  return getWorkspaceAttentionLevel(workspace) !== 'clear';
}

export function WorkspaceDashboard() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceStats[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<DashboardSortKey>('attention');
  const [filters, setFilters] = useState({
    hasTasks: false,
    hasAgents: false,
    needsAttention: false,
    empty: false,
  });
  const [prefs, setPrefs] = useState<OperatorPrefs>(createDefaultPrefs);

  useKeyboardShortcuts({
    onSearch: () => searchInputRef.current?.focus(),
    onNew: () => setShowCreateModal(true),
    onGoOperations: () => router.push('/operations'),
    onGoSystem: () => router.push('/admin/system'),
  });

  useEffect(() => {
    setPrefs(getOperatorPrefs());
    void loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const [workspacesRes, tasksRes, agentsRes] = await Promise.all([
        fetch('/api/workspaces?stats=true'),
        fetch('/api/tasks'),
        fetch('/api/agents'),
      ]);

      if (!workspacesRes.ok || !tasksRes.ok || !agentsRes.ok) {
        throw new Error('Failed to load operator board');
      }

      const [workspaceData, taskData, agentData] = await Promise.all([
        workspacesRes.json() as Promise<WorkspaceStats[]>,
        tasksRes.json() as Promise<Task[]>,
        agentsRes.json() as Promise<Agent[]>,
      ]);

      setWorkspaces(workspaceData);
      setTasks(taskData);
      setAgents(agentData);
    } catch (error) {
      console.error('Failed to load workspaces:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load operator board');
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const openTasks = tasks.filter((task) => task.status !== 'done').length;
    const inProgressTasks = tasks.filter((task) => task.status === 'in_progress').length;
    const activeAgents = agents.filter((agent) => agent.status === 'working').length;
    const attentionCount = workspaces.filter(workspaceNeedsAttention).length;

    return {
      totalWorkspaces: workspaces.length,
      openTasks,
      inProgressTasks,
      activeAgents,
      attentionCount,
    };
  }, [agents, tasks, workspaces]);

  const filteredWorkspaces = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = workspaces.filter((workspace) => {
      if (query) {
        const matches = workspace.name.toLowerCase().includes(query) || workspace.slug.toLowerCase().includes(query);
        if (!matches) {
          return false;
        }
      }

      if (filters.hasTasks && workspace.taskCounts.total === 0) {
        return false;
      }

      if (filters.hasAgents && workspace.agentCount === 0) {
        return false;
      }

      if (filters.needsAttention && !workspaceNeedsAttention(workspace)) {
        return false;
      }

      if (filters.empty && (workspace.taskCounts.total > 0 || workspace.agentCount > 0)) {
        return false;
      }

      return true;
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'alphabetical') {
        return left.name.localeCompare(right.name);
      }

      if (sortBy === 'agents') {
        return right.agentCount - left.agentCount || left.name.localeCompare(right.name);
      }

      if (sortBy === 'tasks') {
        return right.taskCounts.total - left.taskCounts.total || left.name.localeCompare(right.name);
      }

      const urgencyDelta = workspaceTaskPressure(right) - workspaceTaskPressure(left);
      if (urgencyDelta !== 0) {
        return urgencyDelta;
      }

      const attentionDelta = Number(workspaceNeedsAttention(right)) - Number(workspaceNeedsAttention(left));
      if (attentionDelta !== 0) {
        return attentionDelta;
      }

      return left.name.localeCompare(right.name);
    });
  }, [filters.empty, filters.hasAgents, filters.hasTasks, filters.needsAttention, search, sortBy, workspaces]);

  const pinnedWorkspaces = filteredWorkspaces.filter((workspace) => prefs.pinnedWorkspaces.includes(workspace.slug));
  const recentWorkspaces = filteredWorkspaces.filter(
    (workspace) => prefs.recentWorkspaces.includes(workspace.slug) && !prefs.pinnedWorkspaces.includes(workspace.slug),
  );
  const primaryGrid = filteredWorkspaces.filter(
    (workspace) => !prefs.pinnedWorkspaces.includes(workspace.slug) && !prefs.recentWorkspaces.includes(workspace.slug),
  );

  const toggleFilter = (key: keyof typeof filters) => {
    setFilters((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleTogglePin = (slug: string) => {
    setPrefs(togglePinnedWorkspace(slug));
  };

  const handleWorkspaceOpened = (slug: string) => {
    setPrefs(recordRecentWorkspaceVisit(slug));
  };

  return (
    <div className="min-h-[100dvh] bg-mc-bg">
      <header className="border-b border-mc-border bg-mc-bg-secondary/95 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 lg:px-6 lg:py-5">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-mc-bg px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-mc-text-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <LayoutDashboard className="h-3.5 w-3.5 text-mc-accent" />
                Operator Board
              </div>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)] lg:items-end">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-mc-text lg:text-5xl">{APP_DISPLAY_NAME}</h1>
                  <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-mc-text-secondary lg:text-base">
                    Triage risky workspaces first, jump into the next operator action faster, and keep the live mission queue visible without opening every surface.
                  </p>
                </div>

                <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,rgba(88,166,255,0.14),rgba(13,17,23,0.2))] p-4 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.8)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-mc-text-secondary">Shortcuts</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-mc-text-secondary">
                    <KeyboardHint label="/" description="search" />
                    <KeyboardHint label="g o" description="operations" />
                    <KeyboardHint label="g s" description="system" />
                    <KeyboardHint label="n" description="new workspace" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/operations"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-mc-border bg-mc-bg px-4 py-2 text-sm font-medium text-mc-text transition-all duration-300 hover:border-mc-accent/40 hover:text-white active:scale-[0.98]"
              >
                <ActivitySquare className="h-4 w-4 text-mc-accent" />
                Operations
              </Link>
              <Link
                href="/admin/system"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-mc-border bg-mc-bg px-4 py-2 text-sm font-medium text-mc-text transition-all duration-300 hover:border-mc-accent/40 hover:text-white active:scale-[0.98]"
              >
                <Settings2 className="h-4 w-4 text-mc-accent-yellow" />
                System
              </Link>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-mc-accent px-4 py-2 text-sm font-medium text-mc-bg transition-all duration-300 hover:bg-mc-accent/90 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                New Workspace
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6 lg:py-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <SummaryTile
            title="Workspaces"
            value={summary.totalWorkspaces}
            tone="default"
            detail={`${summary.attentionCount} need attention`}
            icon={<FolderOpen className="h-4 w-4 text-mc-accent" />}
          />
          <SummaryTile
            title="Open Tasks"
            value={summary.openTasks}
            tone="default"
            detail={`${summary.inProgressTasks} in active execution`}
            icon={<CheckSquare className="h-4 w-4 text-mc-accent-yellow" />}
          />
          <SummaryTile
            title="Active Agents"
            value={summary.activeAgents}
            tone={summary.activeAgents > 0 ? 'success' : 'warning'}
            detail={`${agents.length} agents registered`}
            icon={<Bot className="h-4 w-4 text-mc-accent-green" />}
          />
          <SummaryTile
            title="Attention Queue"
            value={summary.attentionCount}
            tone={summary.attentionCount > 0 ? 'warning' : 'success'}
            detail="Review, testing, dispatch, or staffing pressure"
            icon={<ShieldAlert className="h-4 w-4 text-mc-accent-red" />}
          />
        </section>

        <section className="mt-6 rounded-[1.75rem] border border-mc-border bg-mc-bg-secondary/80 p-4 shadow-[0_20px_50px_-36px_rgba(0,0,0,0.7)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] lg:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.7fr)] xl:items-end">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-[0.22em] text-mc-text-secondary">Search and triage</div>
                <label className="block">
                  <span className="sr-only">Search workspaces</span>
                  <div className="flex items-center gap-3 rounded-[1.25rem] border border-mc-border bg-mc-bg px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 focus-within:border-mc-accent/40">
                    <Search className="h-4 w-4 text-mc-text-secondary" />
                    <input
                      ref={searchInputRef}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search by workspace name or slug"
                      className="w-full bg-transparent text-sm text-mc-text outline-none placeholder:text-mc-text-secondary"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-mc-bg-secondary text-mc-text-secondary transition-colors hover:text-mc-text"
                        aria-label="Clear workspace search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <FilterChip active={filters.hasTasks} label="Has tasks" onClick={() => toggleFilter('hasTasks')} />
                <FilterChip active={filters.hasAgents} label="Has agents" onClick={() => toggleFilter('hasAgents')} />
                <FilterChip active={filters.needsAttention} label="Needs attention" onClick={() => toggleFilter('needsAttention')} />
                <FilterChip active={filters.empty} label="Empty" onClick={() => toggleFilter('empty')} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-mc-border bg-mc-bg px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-mc-text-secondary">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Sort
                </div>
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as DashboardSortKey)}
                  className="w-full bg-transparent text-sm text-mc-text outline-none"
                >
                  <option value="attention">Most urgent</option>
                  <option value="tasks">Most tasks</option>
                  <option value="agents">Most agents</option>
                  <option value="alphabetical">Alphabetical</option>
                </select>
              </div>

              <div className="rounded-[1.25rem] border border-mc-border bg-mc-bg px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="text-[11px] uppercase tracking-[0.22em] text-mc-text-secondary">Visible</div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-mc-text">{filteredWorkspaces.length}</div>
                <div className="mt-1 text-xs text-mc-text-secondary">after filters and search</div>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <DashboardSkeleton />
        ) : loadError ? (
          <section className="mt-6 rounded-[1.75rem] border border-mc-accent-red/30 bg-mc-accent-red/10 p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-mc-accent-red" />
              <div>
                <h2 className="text-lg font-medium text-mc-text">Operator board unavailable</h2>
                <p className="mt-2 text-sm leading-relaxed text-mc-text-secondary">{loadError}</p>
                <button
                  onClick={() => void loadDashboard()}
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-mc-accent-red/30 bg-mc-bg px-4 py-2 text-sm font-medium text-mc-text transition-colors hover:border-mc-accent-red"
                >
                  Retry load
                </button>
              </div>
            </div>
          </section>
        ) : workspaces.length === 0 ? (
          <EmptyDashboardState onCreate={() => setShowCreateModal(true)} />
        ) : (
          <>
            {pinnedWorkspaces.length > 0 ? (
              <WorkspaceSection
                title="Pinned Workspaces"
                description="Your high-frequency operational surfaces."
                workspaces={pinnedWorkspaces}
                onDelete={(id) => setWorkspaces((current) => current.filter((workspace) => workspace.id !== id))}
                onTogglePin={handleTogglePin}
                pinnedSlugs={prefs.pinnedWorkspaces}
                onWorkspaceOpened={handleWorkspaceOpened}
              />
            ) : null}

            {recentWorkspaces.length > 0 ? (
              <WorkspaceSection
                title="Recent Visits"
                description="Resume the last workspaces you touched."
                workspaces={recentWorkspaces}
                onDelete={(id) => setWorkspaces((current) => current.filter((workspace) => workspace.id !== id))}
                onTogglePin={handleTogglePin}
                pinnedSlugs={prefs.pinnedWorkspaces}
                onWorkspaceOpened={handleWorkspaceOpened}
              />
            ) : null}

            <WorkspaceSection
              title="All Workspaces"
              description="Ranked for operator scan speed instead of alphabetical browsing."
              workspaces={primaryGrid}
              onDelete={(id) => setWorkspaces((current) => current.filter((workspace) => workspace.id !== id))}
              onTogglePin={handleTogglePin}
              pinnedSlugs={prefs.pinnedWorkspaces}
              onWorkspaceOpened={handleWorkspaceOpened}
              emptyState={
                <div className="rounded-[1.75rem] border border-dashed border-mc-border bg-mc-bg-secondary/60 px-6 py-10 text-sm text-mc-text-secondary">
                  No workspaces match the current search and filter combination.
                </div>
              }
            />
          </>
        )}
      </main>

      {showCreateModal ? (
        <CreateWorkspaceModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            void loadDashboard();
          }}
        />
      ) : null}
    </div>
  );
}

function WorkspaceSection({
  title,
  description,
  workspaces,
  onDelete,
  onTogglePin,
  pinnedSlugs,
  onWorkspaceOpened,
  emptyState,
}: {
  title: string;
  description: string;
  workspaces: WorkspaceStats[];
  onDelete: (id: string) => void;
  onTogglePin: (slug: string) => void;
  pinnedSlugs: string[];
  onWorkspaceOpened: (slug: string) => void;
  emptyState?: ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-mc-text lg:text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-mc-text-secondary">{description}</p>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-mc-text-secondary">{workspaces.length} visible</div>
      </div>

      {workspaces.length === 0 ? (
        emptyState ?? null
      ) : (
        <motion.div layout className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {workspaces.map((workspace) => (
              <motion.div
                key={workspace.id}
                layout
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              >
                <WorkspaceCard
                  workspace={workspace}
                  pinned={pinnedSlugs.includes(workspace.slug)}
                  onDelete={onDelete}
                  onTogglePin={onTogglePin}
                  onWorkspaceOpened={onWorkspaceOpened}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </section>
  );
}

function WorkspaceCard({
  workspace,
  pinned,
  onDelete,
  onTogglePin,
  onWorkspaceOpened,
}: {
  workspace: WorkspaceStats;
  pinned: boolean;
  onDelete: (id: string) => void;
  onTogglePin: (slug: string) => void;
  onWorkspaceOpened: (slug: string) => void;
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePreview, setDeletePreview] = useState<WorkspaceDeletePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const isProtected = PROTECTED_WORKSPACE_SLUGS.has(workspace.slug);
  const attentionLevel = getWorkspaceAttentionLevel(workspace);
  const typedConfirmationRequired = (deletePreview?.counts.tasks || 0) > 0 || (deletePreview?.counts.agents || 0) > 0;
  const confirmationMatches = confirmText.trim() === workspace.slug;

  const openDeleteModal = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (isProtected) {
      alert(`Workspace "${workspace.name}" is protected and cannot be deleted.`);
      return;
    }

    setShowDeleteConfirm(true);
    setDeletePreview(null);
    setConfirmText('');
    setLoadingPreview(true);

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/delete-preview`);
      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to load workspace delete preview');
        setShowDeleteConfirm(false);
        return;
      }

      setDeletePreview(data);
    } catch {
      alert('Failed to load workspace delete preview');
      setShowDeleteConfirm(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDelete = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (isProtected) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, { method: 'DELETE' });

      if (!response.ok) {
        const payload = await response.json();
        alert(payload.error || 'Failed to delete workspace');
        return;
      }

      onDelete(workspace.id);
    } catch {
      alert('Failed to delete workspace');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setConfirmText('');
    }
  };

  return (
    <>
      <Link
        href={`/workspace/${workspace.slug}`}
        onClick={() => onWorkspaceOpened(workspace.slug)}
        className={`group block rounded-[1.9rem] border p-5 transition-all duration-300 hover:-translate-y-1 hover:border-mc-accent/40 hover:shadow-[0_25px_45px_-32px_rgba(0,0,0,0.85)] ${
          attentionLevel === 'critical'
            ? 'border-mc-accent-red/35 bg-[linear-gradient(180deg,rgba(248,81,73,0.08),rgba(22,27,34,0.92))]'
            : attentionLevel === 'warning'
              ? 'border-mc-accent-yellow/30 bg-[linear-gradient(180deg,rgba(210,153,34,0.08),rgba(22,27,34,0.92))]'
              : 'border-mc-border bg-mc-bg-secondary/90'
        } shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-mc-bg text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <span aria-hidden="true">{workspace.icon}</span>
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold tracking-tight text-mc-text transition-colors duration-300 group-hover:text-white">
                  {workspace.name}
                </h3>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-mc-text-secondary">/{workspace.slug}</p>
              </div>
            </div>

            <WorkspaceAttentionBadge workspace={workspace} />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onTogglePin(workspace.slug);
              }}
              className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border transition-all duration-300 active:scale-[0.98] ${
                pinned
                  ? 'border-mc-accent/40 bg-mc-accent/10 text-mc-accent'
                  : 'border-mc-border bg-mc-bg/90 text-mc-text-secondary hover:border-mc-accent/40 hover:text-mc-text'
              }`}
              aria-label={pinned ? 'Unpin workspace' : 'Pin workspace'}
            >
              <Pin className="h-4 w-4" />
            </button>

            <WorkspaceQuickActions workspaceSlug={workspace.slug} />

            {!isProtected ? (
              <button
                onClick={openDeleteModal}
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-full border border-mc-border bg-mc-bg/90 text-mc-text-secondary transition-all duration-300 hover:border-mc-accent-red/40 hover:text-mc-accent-red active:scale-[0.98]"
                title="Delete workspace"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <MetricChip icon={<CheckSquare className="h-4 w-4" />} label="Tasks" value={workspace.taskCounts.total} />
          <MetricChip icon={<Users className="h-4 w-4" />} label="Agents" value={workspace.agentCount} />
          <MetricChip icon={<ShieldAlert className="h-4 w-4" />} label="Review" value={workspace.taskCounts.review} tone={workspace.taskCounts.review > 0 ? 'warning' : 'neutral'} />
          <MetricChip
            icon={<Workflow className="h-4 w-4" />}
            label="Dispatch"
            value={workspace.taskCounts.pending_dispatch}
            tone={workspace.taskCounts.pending_dispatch > 0 ? 'danger' : 'neutral'}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.16em]">
          {workspace.taskCounts.testing > 0 ? <InlineSignal label={`${workspace.taskCounts.testing} testing`} tone="warning" /> : null}
          {workspace.taskCounts.planning > 0 ? <InlineSignal label={`${workspace.taskCounts.planning} planning`} tone="default" /> : null}
          {workspace.taskCounts.in_progress > 0 ? <InlineSignal label={`${workspace.taskCounts.in_progress} executing`} tone="success" /> : null}
          {workspace.taskCounts.total === 0 && workspace.agentCount === 0 ? <InlineSignal label="quiet" tone="muted" /> : null}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/5 pt-4">
          <div className="text-sm text-mc-text-secondary">{getWorkspaceAttentionLabel(workspace)}</div>
          <span className="inline-flex items-center gap-2 text-sm font-medium text-mc-accent transition-colors duration-300 group-hover:text-white">
            Open workspace
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </Link>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div
            className="modal-content w-full max-w-lg rounded-[1.8rem] border border-mc-border bg-mc-bg-secondary p-5 shadow-[0_32px_80px_-36px_rgba(0,0,0,0.85)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-mc-accent-red/30 bg-mc-accent-red/10 p-3">
                <AlertTriangle className="h-5 w-5 text-mc-accent-red" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-mc-text">Delete workspace</h3>
                <p className="mt-1 text-sm text-mc-text-secondary">This removes the workspace and its linked operator data.</p>
              </div>
            </div>

            {loadingPreview ? (
              <div className="mt-6 space-y-3">
                <div className="h-5 w-40 animate-pulse rounded-full bg-mc-bg" />
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="h-16 animate-pulse rounded-2xl bg-mc-bg" />
                  <div className="h-16 animate-pulse rounded-2xl bg-mc-bg" />
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-4 text-sm text-mc-text-secondary">
                <p>
                  Delete <span className="font-medium text-mc-text">{workspace.name}</span> and all of its linked history.
                </p>

                {deletePreview ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <DeleteMetric label="Tasks" value={deletePreview.counts.tasks} />
                      <DeleteMetric label="Agents" value={deletePreview.counts.agents} />
                      <DeleteMetric label="Sessions" value={deletePreview.counts.openclaw_sessions} />
                      <DeleteMetric label="Events" value={deletePreview.counts.events} />
                    </div>

                    {deletePreview.warnings.length > 0 ? (
                      <div className="space-y-2">
                        {deletePreview.warnings.map((warning) => (
                          <div key={warning} className="flex items-start gap-2 rounded-2xl border border-mc-accent-yellow/25 bg-mc-accent-yellow/10 px-3 py-3 text-sm text-mc-text">
                            <AlertTriangle className="mt-0.5 h-4 w-4 text-mc-accent-yellow" />
                            <span>{warning}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {typedConfirmationRequired ? (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-mc-text">
                          Type <code className="rounded bg-mc-bg px-1.5 py-0.5 text-xs">{workspace.slug}</code> to confirm
                        </label>
                        <input
                          type="text"
                          value={confirmText}
                          onChange={(event) => setConfirmText(event.target.value)}
                          className="w-full rounded-2xl border border-mc-border bg-mc-bg px-4 py-3 text-sm text-mc-text outline-none transition-colors focus:border-mc-accent"
                        />
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="min-h-[44px] rounded-full border border-mc-border px-4 py-2 text-sm font-medium text-mc-text-secondary transition-colors hover:text-mc-text"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || loadingPreview || !deletePreview || (typedConfirmationRequired && !confirmationMatches)}
                className="min-h-[44px] rounded-full bg-mc-accent-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mc-accent-red/90 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete workspace'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SummaryTile({
  title,
  value,
  detail,
  icon,
  tone,
}: {
  title: string;
  value: number;
  detail: string;
  icon: ReactNode;
  tone: 'default' | 'warning' | 'success';
}) {
  return (
    <div
      className={`rounded-[1.75rem] border p-4 shadow-[0_16px_40px_-34px_rgba(0,0,0,0.8)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${
        tone === 'warning'
          ? 'border-mc-accent-yellow/25 bg-[linear-gradient(180deg,rgba(210,153,34,0.08),rgba(22,27,34,0.9))]'
          : tone === 'success'
            ? 'border-mc-accent-green/25 bg-[linear-gradient(180deg,rgba(63,185,80,0.08),rgba(22,27,34,0.9))]'
            : 'border-mc-border bg-mc-bg-secondary/85'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-mc-text-secondary">{title}</div>
        {icon}
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-mc-text">{value}</div>
      <div className="mt-2 text-sm leading-relaxed text-mc-text-secondary">{detail}</div>
    </div>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[40px] items-center rounded-full border px-3 py-2 text-sm transition-all duration-300 active:scale-[0.98] ${
        active
          ? 'border-mc-accent/40 bg-mc-accent/10 text-mc-accent'
          : 'border-mc-border bg-mc-bg text-mc-text-secondary hover:border-mc-accent/30 hover:text-mc-text'
      }`}
    >
      {label}
    </button>
  );
}

function MetricChip({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone?: 'default' | 'neutral' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-mc-accent-red/20 bg-mc-accent-red/10 text-mc-text'
      : tone === 'warning'
        ? 'border-mc-accent-yellow/20 bg-mc-accent-yellow/10 text-mc-text'
        : tone === 'neutral'
          ? 'border-mc-border bg-mc-bg/80 text-mc-text'
          : 'border-mc-border bg-mc-bg/80 text-mc-text';

  return (
    <div className={`rounded-2xl border px-3 py-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-mc-text-secondary">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-mc-text">{value}</div>
    </div>
  );
}

function InlineSignal({ label, tone }: { label: string; tone: 'default' | 'success' | 'warning' | 'muted' }) {
  const toneClass =
    tone === 'success'
      ? 'border-mc-accent-green/20 bg-mc-accent-green/10 text-mc-accent-green'
      : tone === 'warning'
        ? 'border-mc-accent-yellow/20 bg-mc-accent-yellow/10 text-mc-accent-yellow'
        : tone === 'muted'
          ? 'border-mc-border bg-mc-bg text-mc-text-secondary'
          : 'border-mc-accent/20 bg-mc-accent/10 text-mc-accent';

  return <span className={`rounded-full border px-2.5 py-1 ${toneClass}`}>{label}</span>;
}

function DashboardSkeleton() {
  return (
    <div className="mt-6 space-y-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-64 animate-pulse rounded-[1.9rem] border border-mc-border bg-mc-bg-secondary/70" />
        ))}
      </div>
    </div>
  );
}

function EmptyDashboardState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="mt-8 rounded-[2rem] border border-mc-border bg-mc-bg-secondary/80 p-8 text-center shadow-[0_20px_50px_-32px_rgba(0,0,0,0.8)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-mc-border bg-mc-bg">
        <FolderOpen className="h-7 w-7 text-mc-accent" />
      </div>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight text-mc-text">No workspaces yet</h2>
      <p className="mx-auto mt-3 max-w-[52ch] text-sm leading-relaxed text-mc-text-secondary">
        Create the first workspace to start routing tasks, attaching agents, and turning this operator board into a live command surface.
      </p>
      <button
        onClick={onCreate}
        className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-mc-accent px-4 py-2 text-sm font-medium text-mc-bg transition-colors hover:bg-mc-accent/90"
      >
        <Plus className="h-4 w-4" />
        Create workspace
      </button>
    </section>
  );
}

function DeleteMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-mc-border bg-mc-bg px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">{label}</div>
      <div className="mt-1 text-lg font-semibold text-mc-text">{value}</div>
    </div>
  );
}

function KeyboardHint({ label, description }: { label: string; description: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-mc-border bg-mc-bg px-2.5 py-1">
      <span className="rounded-md border border-white/10 bg-mc-bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-mc-text">{label}</span>
      <span>{description}</span>
    </span>
  );
}

function CreateWorkspaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📁');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const icons = ['📁', '💼', '🏢', '🚀', '💡', '🎯', '📊', '🔧', '🌟', '🏠'];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), icon }),
      });

      if (!response.ok) {
        const payload = await response.json();
        setError(payload.error || 'Failed to create workspace');
        return;
      }

      onCreated();
    } catch {
      setError('Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <div
        className="modal-content w-full max-w-xl rounded-[1.8rem] border border-mc-border bg-mc-bg-secondary shadow-[0_32px_80px_-36px_rgba(0,0,0,0.85)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-mc-border px-5 py-5 lg:px-6">
          <h2 className="text-xl font-semibold tracking-tight text-mc-text">Create a new workspace</h2>
          <p className="mt-2 text-sm text-mc-text-secondary">Name the mission surface and choose the icon already used across the board.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5 lg:px-6 lg:py-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-mc-text">Workspace icon</label>
            <div className="grid grid-cols-5 gap-2">
              {icons.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  onClick={() => setIcon(candidate)}
                  className={`flex h-12 items-center justify-center rounded-2xl border text-xl transition-all duration-300 active:scale-[0.98] ${
                    icon === candidate
                      ? 'border-mc-accent bg-mc-accent/10'
                      : 'border-mc-border bg-mc-bg hover:border-mc-accent/40'
                  }`}
                >
                  {candidate}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-mc-text">Workspace name</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="La Citadel, Backoffice Relay, Cafe Fino"
              className="w-full rounded-2xl border border-mc-border bg-mc-bg px-4 py-3 text-sm text-mc-text outline-none transition-colors focus:border-mc-accent"
              autoFocus
            />
            <p className="text-xs text-mc-text-secondary">The slug is derived automatically from the name.</p>
          </div>

          {error ? <div className="rounded-2xl border border-mc-accent-red/30 bg-mc-accent-red/10 px-4 py-3 text-sm text-mc-text">{error}</div> : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] rounded-full border border-mc-border px-4 py-2 text-sm font-medium text-mc-text-secondary transition-colors hover:text-mc-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="min-h-[44px] rounded-full bg-mc-accent px-4 py-2 text-sm font-medium text-mc-bg transition-colors hover:bg-mc-accent/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
