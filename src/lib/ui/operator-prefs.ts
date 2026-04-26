export interface OperatorPrefs {
  pinnedWorkspaces: string[];
  recentWorkspaces: string[];
}

const STORAGE_KEY = 'mc-operator-prefs';
const MAX_RECENT_WORKSPACES = 5;

const DEFAULT_PREFS: OperatorPrefs = {
  pinnedWorkspaces: [],
  recentWorkspaces: [],
};

function canUseStorage() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function sanitizePrefs(input: Partial<OperatorPrefs> | null | undefined): OperatorPrefs {
  if (!input) {
    return DEFAULT_PREFS;
  }

  const pinnedWorkspaces = Array.isArray(input.pinnedWorkspaces)
    ? input.pinnedWorkspaces.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
  const recentWorkspaces = Array.isArray(input.recentWorkspaces)
    ? input.recentWorkspaces.filter((value): value is string => typeof value === 'string' && value.length > 0).slice(0, MAX_RECENT_WORKSPACES)
    : [];

  return {
    pinnedWorkspaces: Array.from(new Set(pinnedWorkspaces)),
    recentWorkspaces: Array.from(new Set(recentWorkspaces)),
  };
}

export function getOperatorPrefs(): OperatorPrefs {
  if (!canUseStorage()) {
    return DEFAULT_PREFS;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFS;
    }

    return sanitizePrefs(JSON.parse(raw) as Partial<OperatorPrefs>);
  } catch (error) {
    console.error('Failed to read operator preferences:', error);
    return DEFAULT_PREFS;
  }
}

export function saveOperatorPrefs(prefs: OperatorPrefs): OperatorPrefs {
  const sanitized = sanitizePrefs(prefs);

  if (!canUseStorage()) {
    return sanitized;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (error) {
    console.error('Failed to save operator preferences:', error);
  }

  return sanitized;
}

export function togglePinnedWorkspace(slug: string): OperatorPrefs {
  const current = getOperatorPrefs();
  const pinnedWorkspaces = current.pinnedWorkspaces.includes(slug)
    ? current.pinnedWorkspaces.filter((item) => item !== slug)
    : [slug, ...current.pinnedWorkspaces];

  return saveOperatorPrefs({
    ...current,
    pinnedWorkspaces,
  });
}

export function recordRecentWorkspaceVisit(slug: string): OperatorPrefs {
  const current = getOperatorPrefs();

  return saveOperatorPrefs({
    ...current,
    recentWorkspaces: [slug, ...current.recentWorkspaces.filter((item) => item !== slug)].slice(0, MAX_RECENT_WORKSPACES),
  });
}

