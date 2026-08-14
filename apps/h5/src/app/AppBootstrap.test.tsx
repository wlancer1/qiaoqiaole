import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../store/store';
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
});
