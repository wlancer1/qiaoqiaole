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
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const store = createH5Store({ storage: undefined });
    store.dispatch(sessionEstablished({ token: 'token-a', user: { id: 'u1', username: 'u', displayName: 'u', avatarUrl: '', legacyDraftOwnerId: '', likesCount: 0, followingCount: 0, followersCount: 0 } }));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<Provider store={store}><MemoryRouter initialEntries={['/warehouses']}><AppOverlayProvider><Navigator /><WarehouseFeatureContent requireLogin={vi.fn()} /></AppOverlayProvider></MemoryRouter></Provider>); });
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/warehouses', expect.anything());
    await act(async () => { navigate?.('/profile'); store.dispatch(sessionCleared()); });
    await act(async () => { pending.resolve(new Response(JSON.stringify({ warehouses: [{ id: 'stale', name: '旧仓库' }] }), { status: 200, headers: { 'content-type': 'application/json' } })); await Promise.resolve(); });
    expect(store.getState().warehouses.items).toEqual([]);
    await act(async () => { renderer.unmount(); });
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
});
