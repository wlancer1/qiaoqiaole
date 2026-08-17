import { lazy, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppScreen } from '../shared/h5Types';
import { H5RoutedContent, type H5RoutePages } from './H5RoutedContent';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const renderers: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers) act(() => renderer.unmount());
  renderers.length = 0;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function LocationProbe() {
  const location = useLocation();
  return <output data-location={location.pathname}>{location.pathname}</output>;
}

function NavigationProbe() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/')}>返回首页</button>;
}

function pageFor(screen: AppScreen): ReactNode {
  return <main aria-label={`page:${screen}`}>{screen}</main>;
}

function routePages(overrides: H5RoutePages = {}): H5RoutePages {
  return {
    home: pageFor('home'), following: pageFor('following'), followers: pageFor('followers'),
    'pattern-detail': pageFor('pattern-detail'), 'author-profile': pageFor('author-profile'),
    'my-works': pageFor('my-works'), canvas: pageFor('canvas'), beading: pageFor('beading'),
    warehouse: pageFor('warehouse'), 'warehouse-detail': pageFor('warehouse-detail'),
    split: pageFor('split'), 'split-crop': pageFor('split-crop'), 'split-preview': pageFor('split-preview'),
    ...overrides,
  };
}

async function renderAt(pathname: string, pages: H5RoutePages = routePages(), authStatus?: 'restoring' | 'authenticated' | 'anonymous') {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <MemoryRouter initialEntries={[pathname]}>
        <LocationProbe />
        <H5RoutedContent pages={pages} authStatus={authStatus} />
      </MemoryRouter>,
    );
  });
  renderers.push(renderer);
  return renderer;
}

describe('H5RoutedContent', () => {
  it.each([
    ['/discover', 'home'],
    ['/community/posts/post-1', 'pattern-detail'],
    ['/community/users/user-1', 'author-profile'],
    ['/projects/project-1/edit', 'canvas'],
    ['/warehouses/warehouse-1', 'warehouse-detail'],
  ] as const)('matches %s to the %s page while preserving the location', async (pathname, screen) => {
    const renderer = await renderAt(pathname);

    expect(renderer.root.findByProps({ 'data-location': pathname }).children).toEqual([pathname]);
    expect(renderer.root.findByProps({ 'aria-label': `page:${screen}` }).children).toEqual([screen]);
  });

  it('redirects an unknown route to the home page', async () => {
    const renderer = await renderAt('/missing');

    expect(renderer.root.findByProps({ 'data-location': '/' }).children).toEqual(['/']);
    expect(renderer.root.findByProps({ 'aria-label': 'page:home' }).children).toEqual(['home']);
  });

  it('redirects anonymous users away from protected deep links before rendering the page', async () => {
    const renderer = await renderAt('/projects/project-1/edit', routePages(), 'anonymous');

    expect(renderer.root.findByProps({ 'data-location': '/' }).children).toEqual(['/']);
    expect(renderer.root.findByProps({ 'aria-label': 'page:home' }).children).toEqual(['home']);
  });

  it('keeps the message list route available to anonymous visitors', async () => {
    const renderer = await renderAt('/messages', routePages(), 'anonymous');

    expect(renderer.root.findByProps({ 'data-location': '/messages' }).children).toEqual(['/messages']);
    expect(renderer.root.findByProps({ 'aria-label': 'page:home' }).children).toEqual(['home']);
  });

  it('renders the direct page node registered for the matched route', async () => {
    const renderer = await renderAt('/projects/project-1/edit', routePages({ canvas: <main aria-label="editor-route-page">编辑器</main> }));

    expect(renderer.root.findByProps({ 'aria-label': 'editor-route-page' }).children).toEqual(['编辑器']);
  });

  it('shows the accessible delayed fallback until a lazy route resolves', async () => {
    vi.useFakeTimers();
    let resolveRoute!: (value: { default: () => ReactNode }) => void;
    const LazyRoute = lazy(() => new Promise<{ default: () => ReactNode }>((resolve) => {
      resolveRoute = resolve;
    }));
    const renderer = await renderAt('/canvas', routePages({ canvas: <LazyRoute /> }));

    expect(renderer.root.findByProps({ 'aria-hidden': 'true' }).props.className).toBe('route-loading-delay');
    act(() => { vi.advanceTimersByTime(300); });
    expect(renderer.root.findByProps({ role: 'status' }).props['aria-label']).toBe('正在准备页面');

    await act(async () => {
      resolveRoute({ default: () => <main aria-label="lazy-page">画布</main> });
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ 'aria-label': 'lazy-page' }).children).toEqual(['画布']);
  });

  it('catches a rejected lazy route and clears the error after navigation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const RejectedRoute = lazy(() => Promise.reject(new Error('chunk failed')));
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/canvas']}>
          <LocationProbe />
          <NavigationProbe />
          <H5RoutedContent pages={routePages({ canvas: <RejectedRoute /> })} onReload={vi.fn()} />
        </MemoryRouter>,
      );
      await Promise.resolve();
    });
    renderers.push(renderer);

    expect(renderer.root.findByProps({ role: 'alert' }).props['aria-label']).toBe('页面加载失败');

    await act(async () => {
      const backButton = renderer.root.findAllByType('button').find((button) => button.children.includes('返回首页'));
      expect(backButton).toBeDefined();
      backButton?.props.onClick();
    });

    expect(renderer.root.findByProps({ 'data-location': '/' }).children).toEqual(['/']);
    expect(renderer.root.findByProps({ 'aria-label': 'page:home' }).children).toEqual(['home']);
    expect(consoleError).toHaveBeenCalled();
  });
});
