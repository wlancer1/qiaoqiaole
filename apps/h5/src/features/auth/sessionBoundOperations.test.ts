import { describe, expect, it, vi } from 'vitest';
import { createSessionBoundOperation } from './sessionBoundOperations';

describe('session-bound operations', () => {
  it('does not commit a result after the session changes', async () => {
    let current = { token: 'a', sessionVersion: 1 };
    const commit = vi.fn();
    const operation = createSessionBoundOperation({ getIdentity: () => current });
    const result = operation.run(async () => {
      current = { token: 'b', sessionVersion: 2 };
      return 'old-result';
    }, commit);

    await result;
    expect(commit).not.toHaveBeenCalled();
  });
});
