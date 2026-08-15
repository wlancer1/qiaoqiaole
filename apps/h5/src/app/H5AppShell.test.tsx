import { StrictMode, useEffect, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import H5App from '../H5App';
import { H5Application } from '../main';
import { createH5Store } from '../store/store';
import { H5AppShell } from './H5AppShell';
import { H5RoutedContent } from './H5RoutedContent';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const renderers: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
  vi.unstubAllGlobals();
});

function installRuntimeDom() {
  vi.stubGlobal('document', {
    activeElement: null,
    visibilityState: 'visible',
    body: {
      classList: {
        remove: vi.fn(),
        toggle: vi.fn(),
      },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
  });
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    cancelAnimationFrame: vi.fn(),
    clearInterval,
    clearTimeout,
    getComputedStyle: vi.fn(() => ({ overflow: 'visible', overflowY: 'visible' })),
    history: { back: vi.fn(), pushState: vi.fn(), state: null },
    localStorage: { getItem: vi.fn(() => null), removeItem: vi.fn(), setItem: vi.fn() },
    location: {
      href: 'http://localhost/discover?sort=hot',
      origin: 'http://localhost',
      pathname: '/discover',
    },
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn(() => 1),
    scrollTo: vi.fn(),
    setInterval,
    setTimeout,
  });
}

function RuntimeRouter({ children, onNavigateReady }: {
  children: ReactNode;
  onNavigateReady: (navigate: NavigateFunction) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    onNavigateReady(navigate);
  }, [navigate, onNavigateReady]);

  return (
    <>
      <output data-testid="runtime-location">{`${location.pathname}${location.search}`}</output>
      {children}
    </>
  );
}

describe('H5AppShell', () => {
  it('runs the production app tree with the shell defaulting to H5App routed content across navigation', async () => {
    const store = createH5Store({ storage: undefined });
    installRuntimeDom();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    let navigate!: NavigateFunction;
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <StrictMode>
          <H5Application
            appStore={store}
            renderRouter={(children) => (
              <MemoryRouter initialEntries={['/discover?sort=hot']}>
                <RuntimeRouter onNavigateReady={(nextNavigate) => { navigate = nextNavigate; }}>
                  {children}
                </RuntimeRouter>
              </MemoryRouter>
            )}
          />
        </StrictMode>,
      );
      await Promise.resolve();
    });
    renderers.push(renderer);

    const shellBeforeNavigation = renderer.root.findByProps({ 'data-testid': 'h5-app-shell' });
    const overlaySlotBeforeNavigation = renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-slot' });
    expect(renderer.root.findByType(H5AppShell).props.legacyContent).toBeUndefined();
    expect(renderer.root.findAllByType(H5App)).toHaveLength(1);
    expect(renderer.root.findAllByType(H5RoutedContent)).toHaveLength(1);
    expect(renderer.root.findByProps({ 'data-testid': 'runtime-location' }).children.join(''))
      .toBe('/discover?sort=hot');

    await act(async () => {
      navigate('/projects?page=2');
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ 'data-testid': 'runtime-location' }).children.join(''))
      .toBe('/projects?page=2');
    expect(store.getState().ui.currentRouteScope).toContain('/projects?page=2');
    expect(renderer.root.findByProps({ 'data-testid': 'h5-app-shell' })).toBe(shellBeforeNavigation);
    expect(renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-slot' })).toBe(overlaySlotBeforeNavigation);
  });
});
