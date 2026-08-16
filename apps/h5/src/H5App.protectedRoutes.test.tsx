import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveAuthRoute } from './features/auth/authRouteGuard';

const routesSource = readFileSync(new URL('./app/h5Routes.ts', import.meta.url), 'utf8');
const editorLoaderSource = readFileSync(new URL('./features/editor/useEditorProjectLoader.ts', import.meta.url), 'utf8');
const warehouseSource = readFileSync(new URL('./features/warehouse/WarehouseFeatureContent.tsx', import.meta.url), 'utf8');

describe('H5 protected deep-link authentication', () => {
  it.each(['/projects/:id/edit', '/projects/:id/beading', '/warehouses/:id'])('uses the protected route family %s', (route) => {
    expect(routesSource).toContain(route.split('/:id')[0]);
  });

  it('waits for restore before project and warehouse requests', () => {
    expect(editorLoaderSource).toContain("authStatus === 'restoring'");
    expect(editorLoaderSource).toContain("authStatus !== 'authenticated'");
    expect(warehouseSource).toContain('if (token && route) void refresh(token);');
  });

  it('maps failed restore to login and cancels stale navigation loads', () => {
    expect(resolveAuthRoute({ status: 'anonymous' })).toBe('login');
    expect(editorLoaderSource).toContain('let cancelled = false');
    expect(editorLoaderSource).toContain('return () => { cancelled = true; };');
    expect(warehouseSource).toContain('requireLogin(work)');
  });
});
