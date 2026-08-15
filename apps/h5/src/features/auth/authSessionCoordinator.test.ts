import { describe, expect, it, vi } from 'vitest';
import { createAuthSessionCoordinator } from './authSessionCoordinator';

describe('auth session coordinator', () => {
  it('normalizes username and phone login responses and completes only the captured gate request', () => {
    const dispatch = vi.fn();
    const completeLogin = vi.fn();
    const coordinator = createAuthSessionCoordinator({ dispatch, completeLogin, isCurrentLoginRequest: (id) => id === 'gate-1' });
    const userResponse = { token: 'u-token', user: { id: 'u1', username: 'alice', nickname: 'Alice', avatarUrl: null } };
    const phoneResponse = { accessToken: 'p-token', user: { id: 'p1', username: '13800000000', nickname: 'Phone', avatarUrl: '/p.png' } };

    const first = coordinator.establishFromUsername(userResponse, { gateRequestId: 'gate-1', legacyDraftOwnerId: 'alice' });
    const second = coordinator.establishFromPhone(phoneResponse, { gateRequestId: 'gate-2', legacyDraftOwnerId: 'legacy-phone' });

    expect(first.token).toBe('u-token');
    expect(first.user.legacyDraftOwnerId).toBe('alice');
    expect(second.token).toBe('p-token');
    expect(second.user.legacyDraftOwnerId).toBe('legacy-phone');
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(completeLogin).toHaveBeenCalledWith('gate-1');
    expect(completeLogin).not.toHaveBeenCalledWith('gate-2');
  });

  it('does not complete a stale gate request twice', () => {
    const completeLogin = vi.fn();
    const coordinator = createAuthSessionCoordinator({ dispatch: vi.fn(), completeLogin, isCurrentLoginRequest: (id) => id === 'new' });
    coordinator.establishFromUsername({ token: 'token', user: { id: '1', username: 'a' } }, { gateRequestId: 'old' });
    coordinator.establishFromUsername({ token: 'token2', user: { id: '2', username: 'b' } }, { gateRequestId: 'new' });
    expect(completeLogin).toHaveBeenCalledTimes(1);
  });
});
