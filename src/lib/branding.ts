export const APP_DISPLAY_NAME = 'La Citadel';
export const LEGACY_APP_DISPLAY_NAME = 'Mission Control';

export const APP_SLUG = 'la-citadel';
export const LEGACY_APP_SLUG = 'mission-control';

export const APP_CONFIG_KEY = 'la-citadel-config';
export const LEGACY_APP_CONFIG_KEY = 'mission-control-config';

export const APP_DB_FILENAME = 'la-citadel.db';
export const LEGACY_APP_DB_FILENAME = 'mission-control.db';

export const APP_RUNTIME_CHANNEL = 'la-citadel';
export const LEGACY_APP_RUNTIME_CHANNEL = 'mission-control';

export const APP_RUNTIME_SESSION_PREFIX = 'la-citadel';
export const LEGACY_APP_RUNTIME_SESSION_PREFIX = 'mission-control';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function getFirstDefinedEnv(keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return fallback;
}

export function getAppUrl(): string {
  return getFirstDefinedEnv(['LA_CITADEL_URL', 'MISSION_CONTROL_URL'], 'http://localhost:4000');
}

export function getWorkspaceBasePathEnv(): string {
  return getFirstDefinedEnv(['LA_CITADEL_WORKSPACE_BASE_PATH', 'WORKSPACE_BASE_PATH'], '~/Documents/Shared');
}

export function getProjectsPathEnv(): string {
  return getFirstDefinedEnv(['LA_CITADEL_PROJECTS_PATH', 'PROJECTS_PATH'], '~/Documents/Shared/projects');
}

export function getOpenClawGatewayUrl(): string {
  return getFirstDefinedEnv(['LA_CITADEL_OPENCLAW_GATEWAY_URL', 'OPENCLAW_GATEWAY_URL'], 'ws://127.0.0.1:18789');
}

export function getOpenClawGatewayToken(): string {
  return getFirstDefinedEnv(['LA_CITADEL_OPENCLAW_GATEWAY_TOKEN', 'OPENCLAW_GATEWAY_TOKEN']);
}

export function getDatabasePath(cwd = process.cwd()): string {
  const configured = getFirstDefinedEnv(['LA_CITADEL_DATABASE_PATH', 'DATABASE_PATH']);
  if (configured) {
    return configured;
  }

  // Keep this helper client-safe (no fs/path imports) because branding constants are used in UI bundles.
  return `${cwd.replace(/\/$/, '')}/${APP_DB_FILENAME}`;
}

export function loadStoredConfig(storage: StorageLike): string | null {
  return storage.getItem(APP_CONFIG_KEY) ?? storage.getItem(LEGACY_APP_CONFIG_KEY);
}

export function saveStoredConfig(storage: StorageLike, value: string): void {
  storage.setItem(APP_CONFIG_KEY, value);
  storage.setItem(LEGACY_APP_CONFIG_KEY, value);
}

export function clearStoredConfig(storage: StorageLike): void {
  storage.removeItem(APP_CONFIG_KEY);
  storage.removeItem(LEGACY_APP_CONFIG_KEY);
}
