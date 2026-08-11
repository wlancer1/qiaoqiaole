import { describe, expect, it, vi } from 'vitest';
import { refreshHomeData } from './homeRefresh';

const deps = () => ({ loadCommunity: vi.fn().mockResolvedValue('community'), loadRecentProjects: vi.fn().mockResolvedValue('projects'), loadNotifications: vi.fn().mockResolvedValue('notifications'), loadWarehouses: vi.fn().mockResolvedValue('warehouses') });

describe('refreshHomeData', () => {
  it('refreshes only public community data anonymously', async () => {
    const input = deps();
    await refreshHomeData({ token: '', ...input });
    expect(input.loadCommunity).toHaveBeenCalledTimes(1);
    expect(input.loadRecentProjects).not.toHaveBeenCalled();
    expect(input.loadNotifications).not.toHaveBeenCalled();
    expect(input.loadWarehouses).not.toHaveBeenCalled();
  });

  it('refreshes all home resources independently for a logged-in user', async () => {
    const input = deps();
    input.loadNotifications.mockRejectedValue(new Error('stale notifications'));
    const results = await refreshHomeData({ token: 'token', ...input });
    expect(input.loadCommunity).toHaveBeenCalledTimes(1);
    expect(input.loadRecentProjects).toHaveBeenCalledTimes(1);
    expect(input.loadNotifications).toHaveBeenCalledTimes(1);
    expect(input.loadWarehouses).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(4);
    expect(results.some((result) => result.status === 'rejected')).toBe(true);
  });
});
