import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';
import type { WorkspaceStats } from '@/lib/types';

interface WorkspaceAttentionBadgeProps {
  workspace: WorkspaceStats;
  compact?: boolean;
}

export function getWorkspaceAttentionLevel(workspace: WorkspaceStats) {
  const attentionSignals = [
    workspace.taskCounts.review > 0,
    workspace.taskCounts.testing > 0,
    workspace.taskCounts.pending_dispatch > 0,
    workspace.taskCounts.total > 0 && workspace.agentCount === 0,
  ].filter(Boolean).length;

  if (attentionSignals >= 2 || (workspace.taskCounts.total > 6 && workspace.agentCount < 2)) {
    return 'critical';
  }

  if (attentionSignals === 1 || workspace.taskCounts.planning > 0 || workspace.taskCounts.assigned > 4) {
    return 'warning';
  }

  return 'clear';
}

export function getWorkspaceAttentionLabel(workspace: WorkspaceStats) {
  if (workspace.taskCounts.total > 0 && workspace.agentCount === 0) {
    return 'No agents assigned';
  }

  if (workspace.taskCounts.review > 0) {
    return `${workspace.taskCounts.review} awaiting review`;
  }

  if (workspace.taskCounts.testing > 0) {
    return `${workspace.taskCounts.testing} in testing`;
  }

  if (workspace.taskCounts.pending_dispatch > 0) {
    return `${workspace.taskCounts.pending_dispatch} pending dispatch`;
  }

  if (workspace.taskCounts.total === 0) {
    return 'Quiet workspace';
  }

  return 'Stable';
}

export function WorkspaceAttentionBadge({
  workspace,
  compact = false,
}: WorkspaceAttentionBadgeProps) {
  const level = getWorkspaceAttentionLevel(workspace);
  const label = getWorkspaceAttentionLabel(workspace);

  if (level === 'clear') {
    return (
      <span className={`inline-flex items-center gap-2 rounded-full border border-mc-accent-green/30 bg-mc-accent-green/10 px-3 py-1 text-xs font-medium text-mc-accent-green ${compact ? 'px-2.5 py-0.5' : ''}`}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  }

  if (level === 'warning') {
    return (
      <span className={`inline-flex items-center gap-2 rounded-full border border-mc-accent-yellow/30 bg-mc-accent-yellow/10 px-3 py-1 text-xs font-medium text-mc-accent-yellow ${compact ? 'px-2.5 py-0.5' : ''}`}>
        <Clock3 className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-mc-accent-red/30 bg-mc-accent-red/10 px-3 py-1 text-xs font-medium text-mc-accent-red ${compact ? 'px-2.5 py-0.5' : ''}`}>
      <AlertTriangle className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

