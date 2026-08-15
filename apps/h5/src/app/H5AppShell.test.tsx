import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createH5Store } from '../store/store';
import { statusRequested } from '../store/ui/uiSlice';
import { AppBootstrap } from './AppBootstrap';
import { H5AppShell } from './H5AppShell';
import { H5RoutedContent } from './H5RoutedContent';

const mainSource = readFileSync(resolve(__dirname, '../main.tsx'), 'utf8');

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const renderers: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
});

function LegacyRoutedContent() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <H5RoutedContent
      renderPage={(screen) => (
        <main aria-label={`page:${screen}`}>
          <output data-testid="route-scope">{`${location.key}${location.pathname}${location.search}`}</output>
          <button type="button" onClick={() => navigate('/projects?page=2')}>前往作品</button>
        </main>
      )}
    />
  );
}

describe('H5AppShell', () => {
  it('is the compatibility shell mounted by the production application entry', () => {
    expect(mainSource).toContain("import { H5AppShell } from './app/H5AppShell';");
    expect(mainSource).toMatch(/const content = showBeadingFixture[\s\S]*: <H5AppShell \/>;/);
    expect(mainSource).toMatch(/<AppBootstrap>\{content\}<\/AppBootstrap>/);
  });

  it('keeps the durable overlay slot mounted while real routed content navigates', async () => {
    const store = createH5Store({ storage: undefined });
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <Provider store={store}>
          <MemoryRouter initialEntries={['/discover?sort=hot']}>
            <AppBootstrap>
              <H5AppShell legacyContent={<LegacyRoutedContent />} />
            </AppBootstrap>
          </MemoryRouter>
        </Provider>,
      );
      await Promise.resolve();
    });
    renderers.push(renderer);

    const shellBeforeNavigation = renderer.root.findByProps({ 'data-testid': 'h5-app-shell' });
    const overlaySlotBeforeNavigation = renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-slot' });
    const initialScope = renderer.root.findByProps({ 'data-testid': 'route-scope' }).children.join('');

    expect(initialScope).toBe('default/discover?sort=hot');
    expect(store.getState().ui.currentRouteScope).toBe(initialScope);
    store.dispatch(statusRequested({ scopeId: initialScope, message: '旧页面提示' }));
    expect(store.getState().ui.status).toEqual({ scopeId: initialScope, message: '旧页面提示' });

    await act(async () => {
      renderer.root.findByType('button').props.onClick();
      await Promise.resolve();
    });

    const nextScope = renderer.root.findByProps({ 'data-testid': 'route-scope' }).children.join('');
    expect(nextScope).toContain('/projects?page=2');
    expect(nextScope).not.toBe(initialScope);
    expect(store.getState().ui.currentRouteScope).toBe(nextScope);
    expect(store.getState().ui.status).toBeNull();
    expect(renderer.root.findByProps({ 'data-testid': 'h5-app-shell' })).toBe(shellBeforeNavigation);
    expect(renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-slot' })).toBe(overlaySlotBeforeNavigation);

    store.dispatch(statusRequested({ scopeId: initialScope, message: '过期请求提示' }));
    expect(store.getState().ui.status).toBeNull();
  });
});
