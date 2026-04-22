import { getOpenClawClient } from '@/lib/openclaw/client';

type PlanningRouteOpenClawClient = {
  isConnected(): boolean;
  connect(): Promise<void>;
  call(method: string, params: Record<string, unknown>): Promise<unknown>;
};

type PlanningRouteDeps = {
  getOpenClawClient: () => PlanningRouteOpenClawClient;
};

export const planningRouteDeps: PlanningRouteDeps = {
  getOpenClawClient,
};

export function setPlanningRouteTestDeps(overrides: Partial<PlanningRouteDeps>): void {
  Object.assign(planningRouteDeps, overrides);
}

export function resetPlanningRouteTestDeps(): void {
  planningRouteDeps.getOpenClawClient = getOpenClawClient;
}
