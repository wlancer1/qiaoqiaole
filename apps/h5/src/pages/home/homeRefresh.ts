export async function refreshHomeData({ token, loadCommunity, loadRecentProjects, loadNotifications, loadWarehouses }: {
  token?: string;
  loadCommunity: () => Promise<unknown>;
  loadRecentProjects: () => Promise<unknown>;
  loadNotifications: () => Promise<unknown>;
  loadWarehouses: () => Promise<unknown>;
}) {
  const loaders = token ? [loadCommunity, loadRecentProjects, loadNotifications, loadWarehouses] : [loadCommunity];
  return Promise.allSettled(loaders.map((load) => load()));
}
