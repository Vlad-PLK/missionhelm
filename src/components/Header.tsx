'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Command, LayoutGrid, Menu, Plus, Settings, ChevronLeft, X, Zap } from 'lucide-react';
import { useMissionControl } from '@/lib/store';
import { format } from 'date-fns';
import type { Workspace } from '@/lib/types';
import { APP_DISPLAY_NAME } from '@/lib/branding';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { recordRecentWorkspaceVisit } from '@/lib/ui/operator-prefs';

interface HeaderProps {
  workspace?: Workspace;
  statsOverride?: {
    activeAgents: number;
    tasksInQueue: number;
  };
  onCreateTask?: () => void;
}

export function Header({ workspace, statsOverride, onCreateTask }: HeaderProps) {
  const router = useRouter();
  const { agents, tasks, isOnline } = useMissionControl();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeSubAgents, setActiveSubAgents] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!workspace?.slug) {
      return;
    }

    recordRecentWorkspaceVisit(workspace.slug);
  }, [workspace?.slug]);

  // Load active sub-agent count
  useEffect(() => {
    const loadSubAgentCount = async () => {
      try {
        const res = await fetch('/api/openclaw/sessions?session_type=subagent&status=active');
        if (res.ok) {
          const sessions = await res.json();
          setActiveSubAgents(sessions.length);
        }
      } catch (error) {
        console.error('Failed to load sub-agent count:', error);
      }
    };

    loadSubAgentCount();

    // Poll every 30 seconds (reduced from 10s to reduce load)
    const interval = setInterval(loadSubAgentCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const workingAgents = agents.filter((a) => a.status === 'working').length;
  const activeAgents = statsOverride?.activeAgents ?? (workingAgents + activeSubAgents);
  const tasksInQueue = statsOverride?.tasksInQueue ?? tasks.filter((t) => t.status !== 'done' && t.status !== 'review').length;

  useKeyboardShortcuts({
    onNew: workspace && onCreateTask ? onCreateTask : undefined,
    onGoOperations: () => router.push('/operations'),
    onGoSystem: () => router.push('/admin/system'),
  });

  return (
    <header className="border-b border-mc-border bg-mc-bg-secondary/95 px-4 py-3 backdrop-blur-xl lg:px-6">
      {/* Left: Logo & Title */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 lg:gap-4">
        {/* Mobile hamburger menu */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl border border-mc-border bg-mc-bg lg:hidden"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-mc-bg px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <Zap className="w-4 h-4 text-mc-accent" />
          <span className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-mc-text sm:block">
            {APP_DISPLAY_NAME}
          </span>
        </div>

        {/* Workspace indicator or back to dashboard */}
        {workspace ? (
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-1 text-mc-text-secondary hover:text-mc-accent transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <LayoutGrid className="w-4 h-4" />
            </Link>
            <span className="text-mc-text-secondary hidden sm:inline">/</span>
            <div className="flex items-center gap-2 px-2 lg:px-3 py-1 bg-mc-bg-tertiary rounded">
              <span className="text-lg">{workspace.icon}</span>
              <span className="font-medium text-sm lg:text-base truncate max-w-[100px] lg:max-w-none">
                {workspace.name}
              </span>
            </div>
          </div>
        ) : (
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full border border-mc-border bg-mc-bg px-3 py-2 transition-colors hover:border-mc-accent/30"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="text-sm hidden sm:inline">All Workspaces</span>
          </Link>
        )}
      </div>

      {/* Center: Stats - only show in workspace view on larger screens */}
      {workspace && (
        <div className="hidden md:flex items-center gap-3">
          <div className="rounded-[1.2rem] border border-mc-border bg-mc-bg px-4 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">Agents Active</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-mc-accent">{activeAgents}</div>
          </div>
          <div className="rounded-[1.2rem] border border-mc-border bg-mc-bg px-4 py-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">Tasks in Queue</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-mc-accent-yellow">{tasksInQueue}</div>
          </div>
        </div>
      )}

      {/* Right: Time & Status */}
      <div className="flex items-center gap-2 lg:gap-4">
        {workspace && onCreateTask && (
          <button
            onClick={onCreateTask}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-mc-accent px-4 py-2 text-sm font-medium text-mc-bg transition-colors hover:bg-mc-accent/90"
            title="Create task"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">New Task</span>
          </button>
        )}
        <span className="hidden text-sm font-mono text-mc-text-secondary sm:inline">
          {format(currentTime, 'HH:mm:ss')}
        </span>
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium lg:text-sm ${
            isOnline
              ? 'bg-mc-accent-green/20 border-mc-accent-green text-mc-accent-green'
              : 'bg-mc-accent-red/20 border-mc-accent-red text-mc-accent-red'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-mc-accent-green animate-pulse' : 'bg-mc-accent-red'
            }`}
          />
          <span className="hidden sm:inline">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <button
          onClick={() => router.push('/operations')}
          className="hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-mc-border bg-mc-bg text-mc-text-secondary transition-colors hover:border-mc-accent/30 md:flex"
          title="Operations"
        >
          <Command className="w-4 h-4" />
        </button>
        <button
          onClick={() => router.push('/settings')}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-mc-border bg-mc-bg text-mc-text-secondary transition-colors hover:border-mc-accent/30"
          title="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-[73px] z-40 bg-mc-bg/95 lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <div className="p-4 space-y-4" onClick={e => e.stopPropagation()}>
            {/* Mobile Stats */}
            {workspace && (
              <div className="grid grid-cols-2 gap-3 border-b border-mc-border pb-4">
                <div className="rounded-[1.2rem] border border-mc-border bg-mc-bg px-4 py-3 text-center">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">Agents</div>
                  <div className="mt-1 text-xl font-semibold text-mc-accent">{activeAgents}</div>
                </div>
                <div className="rounded-[1.2rem] border border-mc-border bg-mc-bg px-4 py-3 text-center">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-mc-text-secondary">Queue</div>
                  <div className="mt-1 text-xl font-semibold text-mc-accent-yellow">{tasksInQueue}</div>
                </div>
              </div>
            )}
            
            <div className="rounded-[1.2rem] border border-mc-border bg-mc-bg px-4 py-3 text-xs text-mc-text-secondary">
              Shortcuts: <span className="font-mono text-mc-text">g o</span> operations · <span className="font-mono text-mc-text">n</span> new task
            </div>
            
            {/* Quick Links */}
            <Link
              href={`/workspace/${workspace?.slug || ''}`}
              className="flex min-h-[44px] items-center gap-3 rounded-[1.2rem] border border-mc-border bg-mc-bg-secondary px-4 py-3"
              onClick={() => setMobileMenuOpen(false)}
            >
              <LayoutGrid className="w-5 h-5" />
              <span>Workspace Queue</span>
            </Link>
            {workspace && onCreateTask && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onCreateTask();
                }}
                className="flex w-full min-h-[44px] items-center gap-3 rounded-[1.2rem] bg-mc-accent px-4 py-3 text-mc-bg"
              >
                <Plus className="w-5 h-5" />
                <span>New Task</span>
              </button>
            )}
            <Link
              href="/"
              className="flex min-h-[44px] items-center gap-3 rounded-[1.2rem] border border-mc-border bg-mc-bg-secondary px-4 py-3"
              onClick={() => setMobileMenuOpen(false)}
            >
              <LayoutGrid className="w-5 h-5" />
              <span>All Workspaces</span>
            </Link>
            <Link
              href="/operations"
              className="flex min-h-[44px] items-center gap-3 rounded-[1.2rem] border border-mc-border bg-mc-bg-secondary px-4 py-3"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Command className="w-5 h-5" />
              <span>Operations</span>
            </Link>
            <Link
              href="/settings"
              className="flex min-h-[44px] items-center gap-3 rounded-[1.2rem] border border-mc-border bg-mc-bg-secondary px-4 py-3"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Settings className="w-5 h-5" />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
