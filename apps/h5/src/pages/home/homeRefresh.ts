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
