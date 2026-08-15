import { describe, expect, it, vi } from 'vitest';
import { refreshHomeData, shouldRefreshHomeData } from './homeRefresh';

const deps = () => ({
  loadCommunity: vi.fn().mockResolvedValue('community'),
  loadRecentProjects: vi.fn().mockResolvedValue('projects'),
  loadNotifications: vi.fn().mockResolvedValue('notifications'),
  loadWarehouses: vi.fn().mockResolvedValue('warehouses'),
  loadProfile: vi.fn().mockResolvedValue('profile'),
});

describe('refreshHomeData', () => {
  it('reuses fresh home data when returning with the same login state', () => {
    expect(shouldRefreshHomeData({ lastRefreshedAt: 1_000, cachedToken: 'token', token: 'token', now: 30_999 })).toBe(false);
  });

  it('refreshes stale data and data from a different login state', () => {
    expect(shouldRefreshHomeData({ lastRefreshedAt: 1_000, cachedToken: 'token', token: 'token', now: 31_000 })).toBe(true);
    expect(shouldRefreshHomeData({ lastRefreshedAt: 10_000, cachedToken: '', token: 'token', now: 10_001 })).toBe(true);
  });

  it('refreshes only public community data anonymously', async () => {
    const input = deps();
    await refreshHomeData({ token: '', ...input });
    expect(input.loadCommunity).toHaveBeenCalledTimes(1);
    expect(input.loadRecentProjects).not.toHaveBeenCalled();
    expect(input.loadNotifications).not.toHaveBeenCalled();
    expect(input.loadWarehouses).not.toHaveBeenCalled();
    expect(input.loadProfile).not.toHaveBeenCalled();
  });

  it('refreshes all home resources independently for a logged-in user', async () => {
    const input = deps();
    input.loadNotifications.mockRejectedValue(new Error('stale notifications'));
    const results = await refreshHomeData({ token: 'token', ...input });
    expect(input.loadCommunity).toHaveBeenCalledTimes(1);
    expect(input.loadRecentProjects).toHaveBeenCalledTimes(1);
    expect(input.loadNotifications).toHaveBeenCalledTimes(1);
    expect(input.loadWarehouses).toHaveBeenCalledTimes(1);
    expect(input.loadProfile).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(5);
    expect(results.some((result) => result.status === 'rejected')).toBe(true);
  });
});
