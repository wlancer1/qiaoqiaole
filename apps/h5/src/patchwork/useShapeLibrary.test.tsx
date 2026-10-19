import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../store/store';
import { sessionEstablished } from '../store/auth/authEvents';
import { apiSlice } from '../store/api/apiSlice';
import { useShapeLibrary } from './useShapeLibrary';
import { SHAPE_TEMPLATES_KEY } from './shapeLibrary';

let renderer: ReactTestRenderer | undefined;
let store: ReturnType<typeof createH5Store>;
let library: ReturnType<typeof useShapeLibrary>;
const originalRequest = globalThis.Request;
const shape = { id: 'local-one', name: '旧形状', points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 100 }] };
const records = new Map<string, Map<string, typeof shape>>();
let rejectWrites = false;
const calls: { token: string; method: string }[] = [];
function login(id: string) {
  store.dispatch(sessionEstablished({ token: id, user: { id, username: id, displayName: id, avatarUrl: '', legacyDraftOwnerId: '', likesCount: 0, followersCount: 0, followingCount: 0 } }));
}
function mount() {
  function Probe() { library = useShapeLibrary(); return null; }
  store = createH5Store();
  act(() => { renderer = create(<Provider store={store}><Probe /></Provider>); });
}
async function settle(check: () => void) { await act(async () => { await vi.waitFor(check, { timeout: 5000, interval: 20 }); }); }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const memory = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) });
  vi.stubGlobal('Request', class extends originalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) { super(typeof input === 'string' ? new URL(input, 'http://localhost').href : input, init); }
  });
  rejectWrites = false; records.clear(); calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url), token = request.headers.get('authorization')!.replace('Bearer ', '');
    const map = records.get(token) || new Map(); records.set(token, map);
    calls.push({ token, method: request.method });
    if (request.method !== 'GET') {
      if (rejectWrites) return Response.json({ message: 'offline' }, { status: 503 });
      const value = await request.json(); const id = url.pathname.split('/').pop()!; map.set(id, { ...map.get(id), ...value });
      return Response.json({ saved: true });
    }
    return Response.json({ shapes: [...map.entries()].map(([id, value]) => ({ ...value, id, previewPoints: value.points })), total: map.size, page: 1, pageSize: 30, hasMore: false });
  }));
});
afterEach(() => {
  act(() => { renderer?.unmount(); store?.dispatch(apiSlice.util.resetApiState()); });
  vi.unstubAllGlobals();
});
describe('account shape library', () => {
  it('claims and migrates legacy shapes, then exposes only the selected account', async () => {
    localStorage.setItem(SHAPE_TEMPLATES_KEY, JSON.stringify([shape])); mount();
    expect(library.templates[0].name).toBe('旧形状');
    act(() => login('a'));
    await settle(() => expect(records.get('a')?.has(shape.id)).toBe(true));
    expect(localStorage.getItem(SHAPE_TEMPLATES_KEY)).toBeNull();
    const staleUpdate = library.updateTemplates;
    act(() => login('b'));
    await settle(() => { expect(library.loading).toBe(false); expect(library.templates).toHaveLength(0); });
    expect(calls.filter((c) => c.token === 'b' && c.method === 'PUT')).toHaveLength(0);
    let staleSaved = true;
    await act(async () => { staleSaved = await staleUpdate([shape]); });
    expect(staleSaved).toBe(false);
  });
  it('invalidates list summaries after metadata changes without uploading preview geometry', async () => {
    mount(); act(() => login('a'));
    await act(async () => { await library.updateTemplates([shape]); });
    await settle(() => expect(library.templates.find((s) => s.id === shape.id)?.remote).toBe(true));
    const listsBefore = calls.filter((c) => c.method === 'GET').length;
    await act(async () => { await library.updateTemplates(library.templates.map((s) => ({ ...s, favorite: true }))); });
    await settle(() => expect(library.templates[0]?.favorite).toBe(true));
    expect(calls.some((c) => c.method === 'PATCH')).toBe(true);
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(listsBefore);
    expect(records.get('a')?.get(shape.id)?.points).toEqual(shape.points);
  });
  it('keeps failed uploads scoped to their account and retries them', async () => {
    mount(); act(() => login('a')); rejectWrites = true;
    let saved = true;
    await act(async () => { saved = await library.updateTemplates([shape]); });
    expect(saved).toBe(false); expect(library.error).toContain('未完成');
    expect(JSON.parse(localStorage.getItem(SHAPE_TEMPLATES_KEY + ':pending:a')!)).toHaveLength(1);
    act(() => login('b'));
    await settle(() => { expect(library.loading).toBe(false); expect(library.templates).toHaveLength(0); });
    rejectWrites = false; act(() => login('a'));
    await settle(() => expect(records.get('a')?.has(shape.id)).toBe(true));
    await settle(() => expect(JSON.parse(localStorage.getItem(SHAPE_TEMPLATES_KEY + ':pending:a')!)).toHaveLength(0));
    expect(records.get('b')?.size || 0).toBe(0);
  });
});
