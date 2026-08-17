import { act, create } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppOverlayProvider } from '../../app/overlays/AppOverlayContext';
import { AppOverlayHost } from '../../app/overlays/AppOverlayHost';
import { createH5Store } from '../../store/store';
import { sessionCleared, sessionEstablished } from '../../store/auth/authEvents';
import { WarehouseFeatureContent } from './WarehouseFeatureContent';

let navigate: ReturnType<typeof useNavigate> | null = null;
function Navigator() { navigate = useNavigate(); return null; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((next) => { resolve = next; }); return { promise, resolve }; }

describe('WarehouseFeatureContent async route guards', () => {
  beforeEach(() => { navigate = null; (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; Object.assign(globalThis, { window: new EventTarget() }); });

  it('does not restore warehouse list after navigation and logout while the route request is pending', async () => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const store = createH5Store({ storage: undefined });
    store.dispatch(sessionEstablished({ token: 'token-a', user: { id: 'u1', username: 'u', displayName: 'u', avatarUrl: '', legacyDraftOwnerId: '', likesCount: 0, followingCount: 0, followersCount: 0 } }));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/warehouses']}><AppOverlayProvider><Navigator /><WarehouseFeatureContent requireLogin={vi.fn()} /></AppOverlayProvider></MemoryRouter></Provider>); });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/warehouses', expect.anything());
    act(() => { vi.advanceTimersByTime(300); });
    expect(renderer.root.findByProps({ 'aria-label': '正在加载仓库列表' }).props.role).toBe('status');
    await act(async () => { navigate?.('/profile'); store.dispatch(sessionCleared()); });
    await act(async () => { pending.resolve(new Response(JSON.stringify({ warehouses: [{ id: 'stale', name: '旧仓库' }] }), { status: 200, headers: { 'content-type': 'application/json' } })); await Promise.resolve(); });
    expect(store.getState().warehouses.items).toEqual([]);
    await act(async () => { renderer.unmount(); });
    vi.useRealTimers();
  });

  it('sends one create request when duplicate anonymous taps resume after login', async () => {
    const resumes: Array<(token: string) => void> = [];
    const requireLogin = vi.fn((resume: (token: string) => void) => { resumes.push(resume); return new Promise<boolean>(() => undefined); });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ warehouse: { id: 'new', name: '新仓库' } }), { status: 200, headers: { 'content-type': 'application/json' } }))));
    const store = createH5Store({ storage: undefined });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/warehouses']}><AppOverlayProvider><Navigator /><WarehouseFeatureContent requireLogin={requireLogin} /><AppOverlayHost /></AppOverlayProvider></MemoryRouter></Provider>); });
    const opener = renderer.root.findAllByType('button').find((button) => button.children.includes('新建豆子仓库'))!;
    await act(async () => { opener.props.onClick(); });
    const submit = renderer.root.findAllByType('button').find((button) => button.children.includes('创建仓库'))!;
    await act(async () => { submit.props.onClick(); submit.props.onClick(); });
    expect(resumes).toHaveLength(1);
    await act(async () => { resumes[0]('token-a'); resumes[0]('token-a'); await Promise.resolve(); });
    const createCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([, options]) => options?.method === 'POST');
    expect(createCalls).toHaveLength(1);
    await act(async () => { renderer.unmount(); });
  });

  it('releases the create gate after login is cancelled so retry opens a new login request', async () => {
    const cancelled = deferred<boolean>();
    const requireLogin = vi.fn(() => cancelled.promise);
    const store = createH5Store({ storage: undefined });
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/warehouses']}><AppOverlayProvider><Navigator /><WarehouseFeatureContent requireLogin={requireLogin} /><AppOverlayHost /></AppOverlayProvider></MemoryRouter></Provider>); });
    const opener = renderer.root.findAllByType('button').find((button) => button.children.includes('新建豆子仓库'))!;
    await act(async () => { opener.props.onClick(); });
    const submit = () => renderer.root.findAllByType('button').find((button) => button.children.includes('创建仓库'))!;
    await act(async () => { submit().props.onClick(); });
    expect(requireLogin).toHaveBeenCalledTimes(1);
    await act(async () => { cancelled.resolve(false); await Promise.resolve(); });
    await act(async () => { submit().props.onClick(); });
    expect(requireLogin).toHaveBeenCalledTimes(2);
    await act(async () => { renderer.unmount(); });
  });

  it('shows a light success status after stock is added', async () => {
    vi.stubGlobal('fetch', vi.fn((path: string, options?: RequestInit) => {
      if (path === '/api/warehouses') {
        return Promise.resolve(new Response(JSON.stringify({ warehouses: [{ id: 'w1', name: '默认仓库' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      if (path === '/api/warehouses/w1/inventory' && options?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ inventory: { A1: 100 } }), { status: 200, headers: { 'content-type': 'application/json' } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ inventory: {} }), { status: 200, headers: { 'content-type': 'application/json' } }));
    }));
    const store = createH5Store({ storage: undefined });
    store.dispatch(sessionEstablished({ token: 'token-a', user: { id: 'u1', username: 'u', displayName: 'u', avatarUrl: '', legacyDraftOwnerId: '', likesCount: 0, followingCount: 0, followersCount: 0 } }));
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/warehouses/w1']}><AppOverlayProvider><WarehouseFeatureContent requireLogin={vi.fn()} /></AppOverlayProvider></MemoryRouter></Provider>);
      await Promise.resolve();
      await Promise.resolve();
    });
    const color = renderer.root.findAllByType('button').find((button) => button.props['aria-label'] === 'A1 库存 0 颗')!;
    await act(async () => { color.props.onClick(); });
    const stockIn = renderer.root.findAllByType('button').find((button) => button.children.includes('入库'))!;
    await act(async () => { stockIn.props.onClick(); await Promise.resolve(); });

    expect(store.getState().ui.status?.message).toBe('入库成功');
    await act(async () => { renderer.unmount(); });
  });
});
