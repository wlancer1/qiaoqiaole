import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../store';
import { useAppDispatch } from '../hooks';
import { routeScopeChanged, statusRequested } from './uiSlice';
import { useStatusAutoDismiss } from './useStatusAutoDismiss';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const renderers: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

function RouteScopeProbe() {
  const location = useLocation();
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(routeScopeChanged({ scopeId: `${location.key}:${location.pathname}${location.search}` }));
  }, [dispatch, location.key, location.pathname, location.search]);
  useStatusAutoDismiss();
  return null;
}

function NavigationProbe() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/route-b')}>去 B</button>;
}

describe('useStatusAutoDismiss', () => {
  it('clears a non-sticky status after 2.8 seconds for its matching scope', async () => {
    const store = createH5Store({ storage: undefined });
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/route-a']}>
            <AutoDismissProbe />
          </MemoryRouter>
        </Provider>,
      );
    });
    renderers.push(renderer);

    const scopeId = store.getState().ui.currentRouteScope;
    act(() => { store.dispatch(statusRequested({ scopeId, message: '保存成功' })); });
    expect(store.getState().ui.status?.message).toBe('保存成功');

    act(() => { vi.advanceTimersByTime(2799); });
    expect(store.getState().ui.status?.message).toBe('保存成功');
    act(() => { vi.advanceTimersByTime(1); });
    expect(store.getState().ui.status).toBeNull();
  });

  it('does not let the Route A timer clear a new Route B status', async () => {
    const store = createH5Store({ storage: undefined });
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/route-a']}>
            <RouteScopeProbe />
            <NavigationProbe />
          </MemoryRouter>
        </Provider>,
      );
    });
    renderers.push(renderer);

    const routeAScope = store.getState().ui.currentRouteScope;
    act(() => { store.dispatch(statusRequested({ scopeId: routeAScope, message: 'A 完成' })); });
    act(() => { vi.advanceTimersByTime(1000); });
    await act(async () => renderer.root.findByType('button').props.onClick());

    const routeBScope = store.getState().ui.currentRouteScope;
    act(() => { store.dispatch(statusRequested({ scopeId: routeBScope, message: 'B 完成' })); });
    act(() => { vi.advanceTimersByTime(1800); });
    expect(store.getState().ui.status).toEqual({ scopeId: routeBScope, message: 'B 完成' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(store.getState().ui.status).toBeNull();
  });

  it('keeps messages beginning with 正在 until explicitly replaced or cleared', async () => {
    const store = createH5Store({ storage: undefined });
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/route-a']}>
            <RouteScopeProbe />
          </MemoryRouter>
        </Provider>,
      );
    });
    renderers.push(renderer);

    const scopeId = store.getState().ui.currentRouteScope;
    act(() => { store.dispatch(statusRequested({ scopeId, message: '正在保存' })); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(store.getState().ui.status).toEqual({ scopeId, message: '正在保存' });
  });
});

function AutoDismissProbe() {
  return <RouteScopeProbe />;
}
