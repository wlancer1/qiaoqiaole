import { lazy, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppScreen } from '../shared/h5Types';
import { H5RoutedContent } from './H5RoutedContent';

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

async function renderAt(pathname: string, renderPage: (screen: AppScreen) => ReactNode = pageFor, authStatus?: 'restoring' | 'authenticated' | 'anonymous') {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <MemoryRouter initialEntries={[pathname]}>
        <LocationProbe />
        <H5RoutedContent renderPage={renderPage} authStatus={authStatus} />
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
    const renderer = await renderAt('/projects/project-1/edit', pageFor, 'anonymous');

    expect(renderer.root.findByProps({ 'data-location': '/' }).children).toEqual(['/']);
    expect(renderer.root.findByProps({ 'aria-label': 'page:home' }).children).toEqual(['home']);
  });

  it('invokes only the matched route renderer', async () => {
    const renderPage = vi.fn(pageFor);

    await renderAt('/projects/project-1/edit', renderPage);

    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(renderPage).toHaveBeenCalledWith('canvas');
  });

  it('shows the accessible delayed fallback until a lazy route resolves', async () => {
    vi.useFakeTimers();
    let resolveRoute!: (value: { default: () => ReactNode }) => void;
    const LazyRoute = lazy(() => new Promise<{ default: () => ReactNode }>((resolve) => {
      resolveRoute = resolve;
    }));
    const renderer = await renderAt('/canvas', () => <LazyRoute />);

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
    const renderPage = (screen: AppScreen) => screen === 'canvas'
      ? <RejectedRoute />
      : pageFor(screen);
    let renderer!: ReactTestRenderer;

    await act(async () => {
      renderer = create(
        <MemoryRouter initialEntries={['/canvas']}>
          <LocationProbe />
          <NavigationProbe />
          <H5RoutedContent renderPage={renderPage} onReload={vi.fn()} />
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
