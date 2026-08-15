const HOME_DATA_MAX_AGE_MS = 30_000;

export function shouldRefreshHomeData({
  lastRefreshedAt,
  cachedToken,
  token,
  now,
  maxAgeMs = HOME_DATA_MAX_AGE_MS,
}: {
  lastRefreshedAt: number;
  cachedToken: string;
  token?: string;
  now: number;
  maxAgeMs?: number;
}) {
  return !lastRefreshedAt || cachedToken !== (token || '') || now - lastRefreshedAt >= maxAgeMs;
}

export async function refreshHomeData({ token, loadCommunity, loadRecentProjects, loadNotifications, loadWarehouses, loadProfile }: {
  token?: string;
  loadCommunity: () => Promise<unknown>;
  loadRecentProjects: () => Promise<unknown>;
  loadNotifications: () => Promise<unknown>;
  loadWarehouses: () => Promise<unknown>;
  loadProfile: () => Promise<unknown>;
}) {
  const loaders = token ? [loadCommunity, loadRecentProjects, loadNotifications, loadWarehouses, loadProfile] : [loadCommunity];
  return Promise.allSettled(loaders.map((load) => load()));
}
