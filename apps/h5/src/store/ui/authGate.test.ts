import { describe, expect, it, vi } from 'vitest';
import { createAuthGate, type AuthGateState } from './authGate';
import {
  loginRequestCancelled,
  loginRequestCompleted,
  loginRequestReconciled,
  loginRequestStarted,
  routeScopeChanged,
} from './uiSlice';

function createHarness(overrides: Partial<AuthGateState> = {}) {
  let state: AuthGateState = {
    auth: { status: 'anonymous' },
    ui: { currentRouteScope: 'route-a', loginRequest: null },
    ...overrides,
  };
  const dispatch = vi.fn((action: unknown) => {
    if (typeof action !== 'object' || action === null || !('type' in action)) return action;
    const typed = action as { type: string; payload?: any };
    if (typed.type === routeScopeChanged.type) state.ui.currentRouteScope = typed.payload.scopeId;
    if (typed.type === loginRequestStarted.type) state.ui.loginRequest = typed.payload;
    if (typed.type === loginRequestReconciled.type) state.ui.loginRequest = typed.payload;
    if (typed.type === loginRequestCompleted.type || typed.type === loginRequestCancelled.type) {
      if (state.ui.loginRequest?.id === typed.payload.id) state.ui.loginRequest = null;
    }
    return action;
  });
  return { getState: () => state, dispatch };
}

describe('createAuthGate', () => {
  it('resolves authenticated and stale requests without opening login', async () => {
    const authenticated = createHarness({ auth: { status: 'authenticated' } });
    const gate = createAuthGate(authenticated);
    await expect(gate.require({ scopeId: 'route-a' })).resolves.toBe(true);
    expect(authenticated.dispatch).not.toHaveBeenCalled();

    const stale = createHarness();
    const staleGate = createAuthGate(stale);
    await expect(staleGate.require({ scopeId: 'route-b' })).resolves.toBe(false);
    expect(stale.dispatch).not.toHaveBeenCalled();
  });

  it('shares one visible request while retaining waiter order and first valid returnTo', async () => {
    const harness = createHarness();
    const gate = createAuthGate(harness);
    gate.attach('app');
    const first = gate.require({ scopeId: 'route-a' });
    const second = gate.require({ scopeId: 'route-a', returnTo: '   ' });
    const third = gate.require({ scopeId: 'route-a', returnTo: '/projects/3' });
    expect(harness.dispatch).toHaveBeenCalledTimes(2);
    const requestId = harness.getState().ui.loginRequest?.id;
    expect(requestId).toBeTruthy();
    expect(harness.getState().ui.loginRequest?.returnTo).toBe('/projects/3');
    gate.completeLogin(requestId!);
    await expect(Promise.all([first, second, third])).resolves.toEqual([true, true, true]);
  });

  it('accepts only safe same-origin path return targets', async () => {
    const harness = createHarness();
    const gate = createAuthGate(harness);
    gate.attach('app');
    const safe = gate.require({ scopeId: 'route-a', returnTo: '/foo' });
    const requestId = harness.getState().ui.loginRequest!.id;
    expect(harness.getState().ui.loginRequest?.returnTo).toBe('/foo');
    gate.cancelLogin(requestId);
    await expect(safe).resolves.toBe(false);

    for (const returnTo of ['//evil.example', 'https://evil.example', 'javascript:alert(1)', '/foo\n/bar']) {
      const pending = gate.require({ scopeId: 'route-a', returnTo });
      expect(harness.getState().ui.loginRequest?.returnTo).toBeUndefined();
      gate.cancelLogin(harness.getState().ui.loginRequest!.id);
      await expect(pending).resolves.toBe(false);
    }
  });

  it('settles old scope, preserves surviving waiters, and reconciles UI metadata', async () => {
    const harness = createHarness();
    const gate = createAuthGate(harness);
    gate.attach('app');
    const old = gate.require({ scopeId: 'route-a', returnTo: '/old' });
    harness.dispatch(routeScopeChanged({ scopeId: 'route-b' }));
    const surviving = gate.require({ scopeId: 'route-b', returnTo: '/new' });
    gate.routeChanged('route-b');
    await expect(old).resolves.toBe(false);
    expect(harness.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: loginRequestReconciled.type }));
    expect(harness.getState().ui.loginRequest).toMatchObject({ scopeId: 'route-b', returnTo: '/new' });
    gate.completeLogin(harness.getState().ui.loginRequest!.id);
    await expect(surviving).resolves.toBe(true);
  });

  it('settles a late require as stale and cancels a request with no surviving waiter', async () => {
    const harness = createHarness();
    const gate = createAuthGate(harness);
    gate.attach('app');
    const pending = gate.require({ scopeId: 'route-a' });
    harness.dispatch(routeScopeChanged({ scopeId: 'route-b' }));
    gate.routeChanged('route-b');
    await expect(pending).resolves.toBe(false);
    await expect(gate.require({ scopeId: 'route-a' })).resolves.toBe(false);
    expect(harness.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: loginRequestCancelled.type }));
  });

  it('ignores stale completion and cancellation IDs', async () => {
    const harness = createHarness();
    const gate = createAuthGate(harness);
    gate.attach('app');
    const pending = gate.require({ scopeId: 'route-a' });
    const requestId = harness.getState().ui.loginRequest!.id;
    gate.completeLogin('stale');
    gate.cancelLogin('stale');
    expect(harness.getState().ui.loginRequest?.id).toBe(requestId);
    gate.cancelLogin(requestId);
    await expect(pending).resolves.toBe(false);
  });

  it('completes only waiters in the current UI scope', async () => {
    const harness = createHarness();
    const gate = createAuthGate(harness);
    gate.attach('app');
    const current = gate.require({ scopeId: 'route-a' });
    harness.dispatch(routeScopeChanged({ scopeId: 'route-b' }));
    const old = gate.require({ scopeId: 'route-b' });
    const requestId = harness.getState().ui.loginRequest!.id;
    gate.completeLogin(requestId);
    await expect(current).resolves.toBe(false);
    await expect(old).resolves.toBe(true);
  });

  it('does not let a released old gate cancel a same-named request from a new gate', async () => {
    const harness = createHarness();
    const oldGate = createAuthGate(harness);
    oldGate.attach('old');
    const oldPending = oldGate.require({ scopeId: 'route-a' });
    oldGate.release('old');

    const newGate = createAuthGate(harness);
    newGate.attach('new');
    const newPending = newGate.require({ scopeId: 'route-a' });
    await Promise.resolve();
    expect(harness.getState().ui.loginRequest?.id).not.toBeNull();
    newGate.cancelLogin(harness.getState().ui.loginRequest!.id);
    await expect(oldPending).resolves.toBe(false);
    await expect(newPending).resolves.toBe(false);
  });

  it('defers final release so StrictMode attach/release replay does not cancel', async () => {
    const harness = createHarness();
    const gate = createAuthGate(harness);
    gate.attach('owner');
    const pending = gate.require({ scopeId: 'route-a' });
    gate.release('owner');
    gate.attach('owner');
    await Promise.resolve();
    expect(harness.getState().ui.loginRequest).not.toBeNull();
    gate.release('owner');
    await Promise.resolve();
    await expect(pending).resolves.toBe(false);
  });
});
