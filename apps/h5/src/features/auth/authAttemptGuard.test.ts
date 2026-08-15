import { describe, expect, it } from 'vitest';
import { createAuthAttemptGuard } from './authAttemptGuard';

describe('auth attempt guard', () => {
  it('invalidates an older attempt when a newer username or phone attempt starts', () => {
    const guard = createAuthAttemptGuard();
    const first = guard.start('username');
    const second = guard.start('phone');

    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    expect(guard.currentKind()).toBe('phone');
  });

  it('only the current attempt can commit success, error, or finally', () => {
    const guard = createAuthAttemptGuard();
    const first = guard.start('username');
    const second = guard.start('phone');

    expect(first.commitSuccess()).toBe(false);
    expect(first.commitError('old')).toBe(false);
    expect(first.commitFinally()).toBe(false);
    expect(second.commitSuccess()).toBe(true);
    expect(second.commitFinally()).toBe(true);
  });
});
