import { Provider } from 'react-redux';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { act, create } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../../store/store';
import { sessionCleared, sessionEstablished } from '../../store/auth/authEvents';
import { AppOverlayProvider } from '../../app/overlays/AppOverlayContext';
import { BeadingFeatureContent } from './BeadingFeatureContent';

vi.mock('../../pages/beading/BeadingSessionPage', () => ({
  BeadingSessionPage: ({ session, onOpenInventory }: { session: { projectName: string }; onOpenInventory: () => Promise<void> }) => <><output>{session.projectName}</output><button aria-label="打开库存检测" onClick={() => { void onOpenInventory(); }} /></>,
}));
vi.mock('../../pages/beading/InventoryCheckSheet', () => ({ InventoryCheckSheet: ({ result }: { result: { warehouseName?: string } }) => <aside>{result.warehouseName}</aside> }));

function project(id: string) { return { id, name: `作品 ${id}`, rows: 2, cols: 2, canvasData: JSON.stringify([{ color: '#ffffff', transparent: false }, { color: '#ffffff', transparent: false }, { color: '#ffffff', transparent: false }, { color: '#ffffff', transparent: false }]) }; }
function session(id: string) { return { id: `session-${id}`, projectId: id, projectName: `拼豆 ${id}`, requirements: [], warehouseId: null, warehouseName: null, status: 'in_progress', completedColorCodes: [], progress: { completed: 0, total: 0, percent: 0 }, elapsedSeconds: 0, timerStartedAt: null, inventoryDeducted: false, version: 1 }; }

function authenticatedStore() {
  const store = createH5Store({ storage: undefined });
  store.dispatch(sessionEstablished({ token: 'token', user: { id: 'u1', username: 'u', displayName: '用户', avatarUrl: '', legacyDraftOwnerId: 'u1', likesCount: 0, followingCount: 0, followersCount: 0 } }));
  return store;
}

describe('BeadingFeatureContent route lifecycle', () => {
  beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

  it('loads a beading deep link by URL project id without app-held canvas state', async () => {
    const requestApi = vi.fn(async (path: string) => path === '/projects/p1' ? { project: project('p1') } : { session: session('p1') });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={authenticatedStore()}><MemoryRouter initialEntries={['/projects/p1/beading']}><AppOverlayProvider><BeadingFeatureContent requestApi={requestApi as never} requireLogin={vi.fn()} /></AppOverlayProvider></MemoryRouter></Provider>); });
    expect(requestApi).toHaveBeenCalledWith('/projects/p1', {}, 'token');
    expect(requestApi).toHaveBeenCalledWith('/projects/p1/beading-session', {}, 'token');
    expect(renderer.root.findByType('output').children.join('')).toBe('拼豆 p1');
  });

  it('discards a late project response after navigation switches the URL id', async () => {
    let resolveOne!: (value: unknown) => void;
    const one = new Promise<unknown>((resolve) => { resolveOne = resolve; });
    const requestApi = vi.fn((path: string) => {
      if (path === '/projects/one') return one;
      if (path === '/projects/two') return Promise.resolve({ project: project('two') });
      return Promise.resolve({ session: session('two') });
    });
    function Next() { const navigate = useNavigate(); return <button onClick={() => navigate('/projects/two/beading')}>next</button>; }
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={authenticatedStore()}><MemoryRouter initialEntries={['/projects/one/beading']}><AppOverlayProvider><Next /><BeadingFeatureContent requestApi={requestApi as never} requireLogin={vi.fn()} /></AppOverlayProvider></MemoryRouter></Provider>); });
    await act(async () => { renderer.root.findByType('button').props.onClick(); });
    await act(async () => { resolveOne({ project: project('one') }); await one; });
    expect(renderer.root.findByType('output').children.join('')).toBe('拼豆 two');
  });

  it('opens the shared login gate instead of loading a protected deep link anonymously', async () => {
    const requestApi = vi.fn();
    const requireLogin = vi.fn();
    await act(async () => { create(<Provider store={createH5Store({ storage: undefined })}><MemoryRouter initialEntries={['/projects/private/beading']}><AppOverlayProvider><BeadingFeatureContent requestApi={requestApi} requireLogin={requireLogin} /></AppOverlayProvider></MemoryRouter></Provider>); });
    expect(requireLogin).toHaveBeenCalledOnce();
    expect(requestApi).not.toHaveBeenCalled();
  });

  it('redirects the legacy /beading entry to the project list instead of rendering a blank route', async () => {
    function LocationProbe() { const location = useLocation(); return <output>{location.pathname}</output>; }
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={authenticatedStore()}><MemoryRouter initialEntries={['/beading']}><AppOverlayProvider><LocationProbe /><BeadingFeatureContent requestApi={vi.fn()} requireLogin={vi.fn()} /></AppOverlayProvider></MemoryRouter></Provider>); });
    expect(renderer.root.findByType('output').children.join('')).toBe('/projects');
  });

  it('does not publish a late inventory response after the beading route changes', async () => {
    let resolveInventory!: (value: unknown) => void;
    const inventory = new Promise<unknown>((resolve) => { resolveInventory = resolve; });
    const requestApi = vi.fn((path: string) => {
      if (path === '/projects/one') return Promise.resolve({ project: project('one') });
      if (path === '/projects/two') return Promise.resolve({ project: project('two') });
      if (path === '/projects/one/beading-session') return Promise.resolve({ session: session('one') });
      if (path === '/projects/two/beading-session') return Promise.resolve({ session: session('two') });
      return inventory;
    });
    function Next() { const navigate = useNavigate(); return <button aria-label="切换拼豆作品" onClick={() => navigate('/projects/two/beading')}>next</button>; }
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={authenticatedStore()}><MemoryRouter initialEntries={['/projects/one/beading']}><AppOverlayProvider><Next /><BeadingFeatureContent requestApi={requestApi as never} requireLogin={vi.fn()} /></AppOverlayProvider></MemoryRouter></Provider>); });
    act(() => { renderer.root.findAllByType('button').find((node) => node.props['aria-label'] === '打开库存检测')!.props.onClick(); });
    await act(async () => { renderer.root.findAllByType('button').find((node) => node.props['aria-label'] === '切换拼豆作品')!.props.onClick(); });
    await act(async () => { resolveInventory({ warehouseName: '旧库存', warehouseId: 'w1', items: [], summary: { required: 0, available: 0, missing: 0, sufficient: true } }); await inventory; });
    expect(renderer.root.findByType('output').children.join('')).toBe('拼豆 two');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('旧库存');
  });

  it('does not publish a late inventory response after logout', async () => {
    let resolveInventory!: (value: unknown) => void;
    const inventory = new Promise<unknown>((resolve) => { resolveInventory = resolve; });
    const store = authenticatedStore();
    const requestApi = vi.fn((path: string) => path === '/projects/one' ? Promise.resolve({ project: project('one') }) : path.endsWith('/beading-session') ? Promise.resolve({ session: session('one') }) : inventory);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/projects/one/beading']}><AppOverlayProvider><BeadingFeatureContent requestApi={requestApi as never} requireLogin={vi.fn()} /></AppOverlayProvider></MemoryRouter></Provider>); });
    act(() => { renderer.root.findByType('button').props.onClick(); store.dispatch(sessionCleared()); });
    await act(async () => { resolveInventory({ warehouseName: '旧库存', warehouseId: 'w1', items: [], summary: { required: 0, available: 0, missing: 0, sufficient: true } }); await inventory; });
    expect(JSON.stringify(renderer.toJSON())).not.toContain('旧库存');
  });
});
