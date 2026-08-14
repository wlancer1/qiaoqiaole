import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createH5Store } from '../store/store';
import { statusRequested } from '../store/ui/uiSlice';
import { RouteScopeBridge } from './RouteScopeBridge';

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

describe('RouteScopeBridge', () => {
  it('stores location key, pathname, and search and clears old status on navigation', async () => {
    const store = createH5Store({ storage: undefined });
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/discover?sort=hot']}>
            <RouteScopeBridge />
            <Probe />
          </MemoryRouter>
        </Provider>,
      );
    });
    renderers.push(renderer);

    const initialLocation = store.getState().ui.currentRouteScope;
    expect(initialLocation).toContain(':/discover?sort=hot');
    store.dispatch(statusRequested({ scopeId: initialLocation, message: '旧提示' }));

    await act(async () => {
      renderer.root.findByType('button').props.onClick();
    });

    const nextLocation = store.getState().ui.currentRouteScope;
    expect(nextLocation).toContain(':/profile?tab=likes');
    expect(nextLocation).not.toBe(initialLocation);
    expect(store.getState().ui.status).toBeNull();
  });
});
