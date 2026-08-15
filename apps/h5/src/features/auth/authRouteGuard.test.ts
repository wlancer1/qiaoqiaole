import { describe, expect, it } from 'vitest';
import { resolveAuthRoute } from './authRouteGuard';

describe('auth route guard', () => {
  it('waits during restore, allows authenticated users, and requires login anonymously', () => {
    expect(resolveAuthRoute({ status: 'restoring' })).toBe('wait');
    expect(resolveAuthRoute({ status: 'authenticated' })).toBe('allow');
    expect(resolveAuthRoute({ status: 'anonymous' })).toBe('login');
  });
});
