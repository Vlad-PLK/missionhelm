import { getOpenClawClient } from '@/lib/openclaw/client';

type DispatchRouteOpenClawClient = {
  isConnected(): boolean;
  connect(): Promise<void>;
  call(method: string, params: Record<string, unknown>): Promise<unknown>;
};

type DispatchRouteDeps = {
  getOpenClawClient: () => DispatchRouteOpenClawClient;
};

export const dispatchRouteDeps: DispatchRouteDeps = {
  getOpenClawClient,
};

export function setDispatchRouteTestDeps(overrides: Partial<DispatchRouteDeps>): void {
  Object.assign(dispatchRouteDeps, overrides);
}

export function resetDispatchRouteTestDeps(): void {
  dispatchRouteDeps.getOpenClawClient = getOpenClawClient;
}
