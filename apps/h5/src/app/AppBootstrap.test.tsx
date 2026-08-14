import React, { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { useStore } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../store/store';
import type { H5Store } from '../store/store';
import * as authThunks from '../store/auth/authThunks';
import { AuthGateProvider, useAuthGate } from '../store/ui/AuthGateContext';
import { routeScopeId } from './RouteScopeBridge';
import { routeScopeChanged } from '../store/ui/uiSlice';
import { useLocation } from 'react-router-dom';
import { AppBootstrap } from './AppBootstrap';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const renderers: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
  vi.restoreAllMocks();
});

describe('AppBootstrap', () => {
  it('attaches one gate owner and dispatches restore with the store generation', async () => {
    const store = createH5Store({ storage: undefined });
    store.dispatch(routeScopeChanged({ scopeId: 'default:/home' }));
    const dispatch = vi.spyOn(store, 'dispatch');
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/home']}>
            <AppBootstrap><output>页面</output></AppBootstrap>
          </MemoryRouter>
        </Provider>,
      );
    });
    renderers.push(renderer);
    await act(async () => { await Promise.resolve(); });
    expect(dispatch.mock.calls.some(([action]) => typeof action === 'function')).toBe(true);
  });

  it('runs restore once under StrictMode and settles gate waiters on unmount', async () => {
    const storage = {
      getItem: vi.fn(() => JSON.stringify({ token: 'token', username: 'alice' })),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as Storage;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      user: { id: 'user-1', username: 'alice' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const restoreSpy = vi.spyOn(authThunks, 'restoreSession');
    const store = createH5Store({ storage });
    const waiters: Promise<boolean>[] = [];
    function WaiterProbe() {
      const gate = useAuthGate();
      const location = useLocation();
      useEffect(() => {
        gate.attach('probe');
        waiters.push(gate.require({ scopeId: routeScopeId(location) }));
        return () => gate.release('probe');
      }, [gate, location]);
      return null;
    }

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <React.StrictMode>
          <Provider store={store}>
            <MemoryRouter initialEntries={['/home']}>
              <AppBootstrap><WaiterProbe /></AppBootstrap>
            </MemoryRouter>
          </Provider>
        </React.StrictMode>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(restoreSpy).toHaveBeenCalledWith({ sessionVersion: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.status).toBe('authenticated');

    await act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });
    await expect(waiters[0]).resolves.toBe(false);
    expect(store.getState().ui.loginRequest).toBeNull();
  });

  it('does not create another Provider or Router', async () => {
    const store = createH5Store({ storage: undefined });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/home']}>
            <AppBootstrap><output>页面</output></AppBootstrap>
          </MemoryRouter>
        </Provider>,
      );
    });
    renderers.push(renderer);
    expect(renderer.root.findAllByType('output')).toHaveLength(1);
  });

  it('keeps a rebuilt AuthGate request isolated from the old provider release', async () => {
    const store = createH5Store({ storage: undefined });
    store.dispatch(routeScopeChanged({ scopeId: 'default:/home' }));
    let latestGate!: ReturnType<typeof useAuthGate>;
    function GateProbe() {
      latestGate = useAuthGate();
      return null;
    }

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/home']}>
            <AuthGateProvider><GateProbe /></AuthGateProvider>
          </MemoryRouter>
        </Provider>,
      );
    });

    const oldGate = latestGate;
    oldGate.attach('probe');
    const oldPending = oldGate.require({ scopeId: 'default:/home' });
    oldGate.release('probe');

    await act(async () => {
      renderer.unmount();
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/home']}>
            <AuthGateProvider><GateProbe /></AuthGateProvider>
          </MemoryRouter>
        </Provider>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const newGate = latestGate;
    newGate.attach('probe');
    const newPending = newGate.require({ scopeId: 'default:/home' });
    await Promise.resolve();
    await expect(oldPending).resolves.toBe(false);
    expect(store.getState().ui.loginRequest).not.toBeNull();
    newGate.cancelLogin(store.getState().ui.loginRequest!.id);
    await expect(newPending).resolves.toBe(false);
  });
});
