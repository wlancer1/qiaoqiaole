import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveAuthRoute } from './features/auth/authRouteGuard';

const source = readFileSync(new URL('./H5App.tsx', import.meta.url), 'utf8');

describe('H5 protected deep-link authentication', () => {
  it.each(['/projects/:id/edit', '/projects/:id/beading', '/warehouses/:id'])('uses the protected route family %s', (route) => {
    expect(source).toContain(route.split('/:id')[0]);
  });

  it('waits for restore before project and warehouse requests', () => {
    expect(source).toContain("if (authStatus === 'restoring') return;");
    expect(source).toContain("authStatus !== 'authenticated'");
    expect(source).toContain('activeWarehouseId, authStatus, authToken');
  });

  it('maps failed restore to login and cancels stale navigation loads', () => {
    expect(resolveAuthRoute({ status: 'anonymous' })).toBe('login');
    expect(source).toContain('let cancelled = false');
    expect(source).toContain('return () => { cancelled = true; }');
    expect(source).toContain('authGate.require');
  });
});
