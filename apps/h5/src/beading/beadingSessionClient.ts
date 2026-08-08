export type BeadingSession = {
  id: string;
  projectId: string | null;
  projectName: string;
  requirements: Array<{ colorCode: string; required: number }>;
  warehouseId: string | null;
  warehouseName: string | null;
  status: string;
  completedColorCodes: string[];
  progress: { completed: number; total: number; percent: number };
  elapsedSeconds: number;
  timerStartedAt: string | null;
  inventoryDeducted: boolean;
  version: number;
};

export type InventoryCheck = {
  projectRevision: number | null;
  warehouseId: string | null;
  warehouseName?: string | null;
  items: Array<{ colorCode: string; required: number; available: number; missing: number; sufficient: boolean }>;
  summary: { required: number; available: number; missing: number; sufficient: boolean };
};

export async function beadingApi<T>(path: string, options: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<T> {
  const response = await fetcher(`/api/v1${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.message || '拼豆服务请求失败'), { code: body.error || body.code, status: response.status, body });
  return body as T;
}

export function checkProjectInventory(projectId: string, warehouseId?: string, expectedProjectRevision?: number): Promise<InventoryCheck> {
  return beadingApi<InventoryCheck>(`/projects/${projectId}/inventory-check`, { method: 'POST', body: JSON.stringify({ warehouseId, expectedProjectRevision }) });
}

export function getOrCreateBeadingSession(projectId: string, body: { warehouseId?: string; expectedProjectRevision?: number; restart?: boolean } = {}): Promise<{ session: BeadingSession; reused?: boolean }> {
  return beadingApi(`/projects/${projectId}/beading-session`, { method: 'POST', body: JSON.stringify(body) });
}

export function patchBeadingSession(sessionId: string, body: Record<string, unknown>): Promise<{ session: BeadingSession }> {
  return beadingApi(`/beading-sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function completeBeadingSession(sessionId: string, idempotencyKey: string, deductInventory: boolean, warehouseId?: string): Promise<{ session: BeadingSession; warehouseId: string | null; deducted: boolean }> {
  return beadingApi(`/beading-sessions/${sessionId}/complete`, { method: 'POST', body: JSON.stringify({ idempotencyKey, deductInventory, warehouseId }) });
}
