import { StrictMode, useEffect, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import H5ApplicationContent from './H5Application';
import { H5Application } from '../main';
import { createH5Store } from '../store/store';
import { sessionEstablished } from '../store/auth/authEvents';
import { statusRequested } from '../store/ui/uiSlice';
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
      style: { overflow: 'auto' },
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

describe('H5AppShell production overlay ownership', () => {
  it('renders the current server page for a project URL and keeps the durable host through routed folder navigation', async () => {
    const store = createH5Store({ storage: undefined });
    store.dispatch(sessionEstablished({ token: 'token-project', user: { id: 'user-1', username: 'u', displayName: '用户', avatarUrl: '', legacyDraftOwnerId: '', likesCount: 0, followingCount: 0, followersCount: 0 } }));
    installRuntimeDom();
    const fetchMock = vi.fn(async (input: string) => {
      if (input.includes('/projects?folder=folder-1&page=2&pageSize=12')) return new Response(JSON.stringify({ projects: [{ id: 'project-page-2', name: '第二页作品', rows: 1, cols: 1, tone: 'recent', createdAt: '2026-01-01', updatedAt: '2026-01-01', folderId: 'folder-1' }], page: 2, pageSize: 12, total: 40, hasMore: false }), { status: 200 });
      if (input.includes('/projects?folder=folder-1&page=1&pageSize=12')) return new Response(JSON.stringify({ projects: [{ id: 'project-page-1', name: '第一页作品', rows: 1, cols: 1, tone: 'recent', createdAt: '2026-01-01', updatedAt: '2026-01-01', folderId: 'folder-1' }], page: 1, pageSize: 12, total: 40, hasMore: true }), { status: 200 });
      if (input.includes('/project-folders')) return new Response(JSON.stringify({ folders: [{ id: 'folder-1', name: '收藏', projectCount: 40 }] }), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    let navigate!: NavigateFunction;
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<H5Application appStore={store} renderRouter={(children) => <MemoryRouter initialEntries={['/projects?folder=folder-1&page=2']}><RuntimeRouter onNavigateReady={(next) => { navigate = next; }}>{children}</RuntimeRouter></MemoryRouter>} />); await Promise.resolve(); });
    renderers.push(renderer);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/projects?folder=folder-1&page=2&pageSize=12'))).toBe(true);
    expect(renderer.root.findAll((node) => node.children.join('').includes('第二页作品'))).not.toHaveLength(0);
    expect(renderer.root.findByProps({ className: 'my-works-count' }).children.join('')).toBe('40 件');
    expect(renderer.root.findByProps({ className: 'author-profile-stats my-works-stats' }).findAllByType('strong')[0].children.join('')).toBe('40');
    expect(renderer.root.findByProps({ className: 'my-works-folder-scroll' }).findAllByType('span').some((node) => node.children.join('') === '40')).toBe(true);
    const host = renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-host' });
    await act(async () => { navigate('/projects?folder=folder-1'); await Promise.resolve(); });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/projects?folder=folder-1&page=1&pageSize=12'))).toBe(true);
    expect(renderer.root.findAll((node) => node.children.join('').includes('第一页作品'))).not.toHaveLength(0);
    await act(async () => { navigate(-1); await Promise.resolve(); });
    expect(renderer.root.findAll((node) => node.children.join('').includes('第二页作品'))).not.toHaveLength(0);
    expect(renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-host' })).toBe(host);
    act(() => renderer.root.findByProps({ 'aria-label': '打开文件夹 收藏 操作' }).props.onContextMenu({ preventDefault() {} }));
    act(() => renderer.root.findByProps({ 'aria-label': '删除文件夹 收藏' }).props.onClick());
    expect(renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-host' })).toBe(host);
  });
  it('keeps the host durable while real legacy status, login, and confirmation UI migrate across routes', async () => {
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
    const overlayHostBeforeNavigation = renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-host' });
    expect(renderer.root.findByType(H5AppShell).props.legacyContent).toBeUndefined();
    expect(renderer.root.findAllByType(H5ApplicationContent)).toHaveLength(1);
    expect(renderer.root.findAllByType(H5RoutedContent)).toHaveLength(1);
    expect(document.body.style.overflow).toBe('auto');
    expect(renderer.root.findByProps({ 'data-testid': 'runtime-location' }).children.join(''))
      .toBe('/discover?sort=hot');
    const initialScope = store.getState().ui.currentRouteScope;
    act(() => { store.dispatch(statusRequested({ scopeId: initialScope, message: '遗留协调器提示' })); });
    expect(renderer.root.findAllByProps({ role: 'status' }).filter((node) => node.children.join('').includes('遗留协调器提示'))).toHaveLength(1);

    await act(async () => {
      navigate('/projects?page=2');
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ 'data-testid': 'runtime-location' }).children.join(''))
      .toBe('/projects?page=2');
    expect(store.getState().ui.currentRouteScope).toContain('/projects?page=2');
    expect(renderer.root.findAllByProps({ role: 'status' }).filter((node) => node.children.join('').includes('遗留协调器提示'))).toHaveLength(0);
    act(() => { store.dispatch(statusRequested({ scopeId: initialScope, message: '过期提示' })); });
    expect(renderer.root.findAllByProps({ role: 'status' }).filter((node) => node.children.join('').includes('过期提示'))).toHaveLength(0);
    expect(renderer.root.findByProps({ 'data-testid': 'h5-app-shell' })).toBe(shellBeforeNavigation);
    expect(renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-host' })).toBe(overlayHostBeforeNavigation);

    await act(async () => {
      navigate('/');
      await Promise.resolve();
    });
    const loginButton = renderer.root.findAllByType('button').find((button) => button.children.join('') === '立即登录');
    expect(loginButton).toBeDefined();
    await act(async () => {
      loginButton?.props.onClick();
      await Promise.resolve();
    });
    const password = renderer.root.findByProps({ 'aria-label': '密码' });
    expect(overlayHostBeforeNavigation.findAllByProps({ 'aria-label': '密码' })).toHaveLength(1);
    act(() => password.props.onChange({ target: { value: 'password-123' } }));
    expect(renderer.root.findByProps({ 'aria-label': '密码' }).props.value).toBe('password-123');
    const checkboxes = renderer.root.findAllByType('input').filter((input) => input.props.type === 'checkbox');
    act(() => checkboxes[0].props.onChange({ target: { checked: true } }));
    act(() => checkboxes[1].props.onChange({ target: { checked: true } }));
    expect(renderer.root.findAllByType('input').filter((input) => input.props.type === 'checkbox').map((input) => input.props.checked)).toEqual([true, true]);
    await act(async () => {
      navigate('/discover');
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-host' })).toBe(overlayHostBeforeNavigation);
    expect(renderer.root.findAllByProps({ 'aria-label': '密码' })).toHaveLength(0);

    await act(async () => {
      navigate('/');
      await Promise.resolve();
    });
    const secondLoginButton = renderer.root.findAllByType('button').find((button) => button.children.join('') === '立即登录');
    await act(async () => {
      secondLoginButton?.props.onClick();
      await Promise.resolve();
    });
    act(() => renderer.root.findByProps({ 'aria-label': '关闭登录' }).props.onClick());
    act(() => {
      store.dispatch(sessionEstablished({
        token: 'token-a',
        user: { id: 'user-a', username: 'alice', displayName: 'Alice', avatarUrl: '', legacyDraftOwnerId: '', likesCount: 0, followingCount: 0, followersCount: 0 },
      }));
    });
    act(() => renderer.root.findByProps({ 'aria-label': '我的' }).props.onClick());
    act(() => renderer.root.findByProps({ className: 'profile-edit-btn' }).props.onClick());
    expect(overlayHostBeforeNavigation.findAllByProps({ className: 'profile-edit-panel' })).toHaveLength(1);
    act(() => renderer.root.findByProps({ className: 'profile-logout-btn' }).props.onClick());
    expect(overlayHostBeforeNavigation.findAllByProps({ role: 'alertdialog' })).toHaveLength(1);
  });
});
