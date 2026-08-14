import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createH5Store } from '../store';
import { globalStatusRequested, routeScopeChanged } from './uiSlice';
import { useScopedStatus } from './useScopedStatus';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const renderers: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
});

function StatusProbe({ onReady }: { onReady: (setStatus: (message: string) => void) => void }) {
  const setStatus = useScopedStatus();
  onReady(setStatus);
  return null;
}

function NavigationProbe() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/profile')}>去个人页</button>;
}

describe('useScopedStatus', () => {
  it('captures the route scope and rejects a write after navigation', async () => {
    const store = createH5Store({ storage: undefined });
    let setStatus!: (message: string) => void;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/discover']}>
            <StatusProbe onReady={(callback) => { if (!setStatus) setStatus = callback; }} />
            <NavigationProbe />
          </MemoryRouter>
        </Provider>,
      );
    });
    renderers.push(renderer);

    act(() => {
      setStatus('旧页面提示');
    });
    expect(store.getState().ui.status).toEqual({ scopeId: '', message: '旧页面提示' });

    act(() => { store.dispatch(routeScopeChanged({ scopeId: 'route-key:/profile' })); });

    await act(async () => {
      renderer.root.findByType('button').props.onClick();
    });

    expect(store.getState().ui.status).toBeNull();

    act(() => setStatus('迟到的旧页面提示'));
    expect(store.getState().ui.status).toBeNull();
  });

  it('keeps global status available alongside the scoped adapter', () => {
    const store = createH5Store({ storage: undefined });
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter>
            <StatusProbe onReady={() => undefined} />
          </MemoryRouter>
        </Provider>,
      );
    });
    renderers.push(renderer);

    act(() => { store.dispatch(globalStatusRequested({ message: '登录状态已失效' })); });

    expect(store.getState().ui.status).toEqual({ scopeId: 'global', message: '登录状态已失效' });
  });
});
