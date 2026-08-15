import { describe, expect, it, vi } from 'vitest';
import { createAuthLoginFlows } from './authLoginFlows';

describe('auth login flows', () => {
  it('executes username and phone login with injectable requests', async () => {
    const submit = vi.fn()
      .mockResolvedValueOnce({ token: 'u', user: { id: '1', username: 'alice' } })
      .mockResolvedValueOnce({ accessToken: 'p', user: { id: '2', username: '13800000000' } });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const flows = createAuthLoginFlows({ request: submit, refreshFeatures: refresh });

    await flows.username({ username: 'alice', password: 'password' });
    await flows.phone({ phone: '13800000000', password: 'password' });

    expect(submit).toHaveBeenNthCalledWith(1, '/auth/login', expect.objectContaining({ username: 'alice' }));
    expect(submit).toHaveBeenNthCalledWith(2, '/v1/auth/sms/login', expect.objectContaining({ phone: '13800000000' }));
    expect(refresh).toHaveBeenNthCalledWith(1, 'u');
    expect(refresh).toHaveBeenNthCalledWith(2, 'p');
  });
});
