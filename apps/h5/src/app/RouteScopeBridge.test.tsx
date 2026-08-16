import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Provider, useStore } from 'react-redux';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createH5Store } from '../store/store';
import type { H5Store } from '../store/store';
import { statusRequested } from '../store/ui/uiSlice';
import { routeScopeId, RouteScopeBridge } from './RouteScopeBridge';
import { AuthGateProvider } from '../store/ui/AuthGateContext';
import { useAuthGate } from '../store/ui/AuthGateContext';
import { useRouteScopedStatus } from './useRouteScopedStatus';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const renderers: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
});

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-location={`${location.pathname}${location.search}`}>{location.pathname}</output>
      <button type="button" onClick={() => navigate('/profile?tab=likes')}>导航</button>
    </>
  );
}

function LoginProbe({ onReady }: { onReady: (pending: Promise<boolean>, gate: ReturnType<typeof useAuthGate>) => void }) {
  const gate = useAuthGate();
  const location = useLocation();
  const scopeId = routeScopeId(location);
  useEffect(() => {
    gate.attach('route-test');
    onReady(gate.require({ scopeId, returnTo: '/discover' }), gate);
    return () => gate.release('route-test');
  }, [gate, onReady, scopeId]);
  return null;
}

function RouteStatusProbe({
  onTargetRouteLayout,
}: {
  onTargetRouteLayout: (status: string | null, oldScope: string) => void;
}) {
  const location = useLocation();
  const store = useStore() as H5Store;
  const status = useRouteScopedStatus();
  const initialScopeRef = useRef(routeScopeId(location));
  const scopeId = routeScopeId(location);

  useLayoutEffect(() => {
    if (scopeId === initialScopeRef.current) return;
    onTargetRouteLayout(status?.message ?? null, initialScopeRef.current);
    store.dispatch(statusRequested({
      scopeId: initialScopeRef.current,
      message: '过期请求提示',
    }));
  }, [onTargetRouteLayout, scopeId, store]);

  return <output data-status={status?.message ?? ''}>{`${location.pathname}${location.search}`}</output>;
}

describe('RouteScopeBridge', () => {
  it('creates a scope by concatenating the location key, pathname, and search exactly', () => {
    expect(routeScopeId({ key: 'route-key', pathname: '/discover', search: '?sort=hot' }))
      .toBe('route-key/discover?sort=hot');
  });

  it('stores location key, pathname, and search and clears old status on navigation', async () => {
    const store = createH5Store({ storage: undefined });
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/discover?sort=hot']}>
            <AuthGateProvider>
              <RouteScopeBridge />
              <Probe />
            </AuthGateProvider>
          </MemoryRouter>
        </Provider>,
      );
    });
    renderers.push(renderer);

    const initialLocation = store.getState().ui.currentRouteScope;
    expect(initialLocation).toBe('default/discover?sort=hot');
    store.dispatch(statusRequested({ scopeId: initialLocation, message: '旧提示' }));

    await act(async () => {
      renderer.root.findByType('button').props.onClick();
    });

    const nextLocation = store.getState().ui.currentRouteScope;
    expect(nextLocation).toContain('/profile?tab=likes');
    expect(nextLocation).not.toBe(initialLocation);
    expect(store.getState().ui.status).toBeNull();
  });

  it('changes scope before target-route layout can read old status or an old callback can publish', async () => {
    const store = createH5Store({ storage: undefined });
    const targetRouteStatuses: Array<string | null> = [];
    const acceptedLateStatuses: string[] = [];
    const unsubscribe = store.subscribe(() => {
      const message = store.getState().ui.status?.message;
      if (message === '过期请求提示') acceptedLateStatuses.push(message);
    });
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/discover?sort=hot']}>
            <AuthGateProvider>
              <RouteScopeBridge />
              <RouteStatusProbe onTargetRouteLayout={(status) => targetRouteStatuses.push(status)} />
              <Probe />
            </AuthGateProvider>
          </MemoryRouter>
        </Provider>,
      );
      await Promise.resolve();
    });
    renderers.push(renderer);

    const oldScope = store.getState().ui.currentRouteScope;
    act(() => {
      store.dispatch(statusRequested({ scopeId: oldScope, message: '旧页面提示' }));
    });

    await act(async () => {
      renderer.root.findByType('button').props.onClick();
    });
    unsubscribe();

    expect(targetRouteStatuses).toEqual([null]);
    expect(acceptedLateStatuses).toEqual([]);
    expect(store.getState().ui.status).toBeNull();
  });

  it('settles the old gate waiter before the next route creates its reconciled request', async () => {
    const store = createH5Store({ storage: undefined });
    const pendingRequests: Promise<boolean>[] = [];
    let gate!: ReturnType<typeof useAuthGate>;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/discover']}>
            <AuthGateProvider>
              <RouteScopeBridge />
              <LoginProbe onReady={(pending, nextGate) => {
                pendingRequests.push(pending);
                gate = nextGate;
              }} />
              <Probe />
            </AuthGateProvider>
          </MemoryRouter>
        </Provider>,
      );
      await Promise.resolve();
    });
    renderers.push(renderer);
    await act(async () => { await Promise.resolve(); });
    expect(pendingRequests).toHaveLength(1);

    await act(async () => {
      renderer.root.findByType('button').props.onClick();
      await Promise.resolve();
    });

    await expect(pendingRequests[0]).resolves.toBe(false);
    expect(store.getState().ui.loginRequest).toMatchObject({
      scopeId: expect.stringContaining('/profile?tab=likes'),
      returnTo: '/discover',
    });
    gate.completeLogin(store.getState().ui.loginRequest!.id);
    await expect(pendingRequests[1]).resolves.toBe(true);
  });
});
