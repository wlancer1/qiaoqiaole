import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiSlice } from '../api/apiSlice';
import { sessionCleared, sessionEstablished, sessionInvalidated } from './authEvents';
import { restoreSession } from './authThunks';
import { MAX_HANDLED_EVENTS } from './authListener';
import { createH5Store } from '../store';
import { AUTH_STORAGE_KEY } from './authStorage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const user = { id: 'user-a', username: 'alice', displayName: 'Alice', avatarUrl: '', legacyDraftOwnerId: 'alice', likesCount: 1, followingCount: 2, followersCount: 3 };

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

it('persists established sessions and clears the persisted record on session changes', async () => {
  const storage = new MemoryStorage();
  const store = createH5Store({ storage });
  store.dispatch(sessionEstablished({ token: 'token-a', user }));
  await Promise.resolve();
  expect(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)!)).toMatchObject({ token: 'token-a', userId: 'user-a' });
  store.dispatch(sessionCleared());
  await Promise.resolve();
  expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
});

it('persists a valid restore and resets the API cache', async () => {
  const resetApiState = vi.spyOn(apiSlice.util, 'resetApiState');
  const storage = new MemoryStorage();
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'token-a', username: 'alice' }));
  const store = createH5Store({ storage });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ user: { id: 'user-a', username: 'alice' } })));

  await store.dispatch(restoreSession({ sessionVersion: 0 }));

  expect(resetApiState).toHaveBeenCalledTimes(1);
  resetApiState.mockRestore();
});

it('clears invalid restore storage and resets the API cache', async () => {
  const resetApiState = vi.spyOn(apiSlice.util, 'resetApiState');
  const storage = new MemoryStorage();
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'token-a', username: 'alice' }));
  const store = createH5Store({ storage });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ message: 'expired' }, 401)));

  await store.dispatch(restoreSession({ sessionVersion: 0 }));

  expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  expect(resetApiState).toHaveBeenCalledTimes(1);
  resetApiState.mockRestore();
});

it('does not reset the new account cache when an old restore settles', async () => {
  const resetApiState = vi.spyOn(apiSlice.util, 'resetApiState');
  let resolveFetch!: (value: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; })));
  const storage = new MemoryStorage();
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'old-token' }));
  const store = createH5Store({ storage });
  const restore = store.dispatch(restoreSession({ sessionVersion: 0 }));
  store.dispatch(sessionEstablished({ token: 'new-token', user }));
  const afterNewLogin = resetApiState.mock.calls.length;
  resolveFetch(response({ user: { id: 'old-user', username: 'old' } }));
  await restore;

  expect(resetApiState).toHaveBeenCalledTimes(afterNewLogin);
  resetApiState.mockRestore();
});

it('deduplicates repeated invalidation events for the same identity', async () => {
  const resetApiState = vi.spyOn(apiSlice.util, 'resetApiState');
  const storage = new MemoryStorage();
  const store = createH5Store({ storage });
  store.dispatch(sessionEstablished({ token: 'token-a', user }));
  await Promise.resolve();
  resetApiState.mockClear();
  const invalidation = sessionInvalidated({ token: 'token-a', sessionVersion: 1 });
  store.dispatch(invalidation);
  store.dispatch(invalidation);
  await Promise.resolve();

  expect(resetApiState).toHaveBeenCalledTimes(1);
  resetApiState.mockRestore();
});

describe('auth listener factory', () => {
  it('uses a bounded handled-event window', () => {
    expect(MAX_HANDLED_EVENTS).toBeGreaterThan(0);
    expect(MAX_HANDLED_EVENTS).toBeLessThanOrEqual(128);
  });

  it('is isolated per storage instance and removes auth on clear', async () => {
    const storage = new MemoryStorage();
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: 'token-a' }));
    const store = createH5Store({ storage });
    const configured = createH5Store({ storage });
    configured.dispatch(sessionCleared());
    expect(configured.getState().auth.status).toBe('anonymous');
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(store.getState().auth.token).toBe('token-a');
  });

  it('does not clear a newer session for an old invalidation payload', async () => {
    const storage = new MemoryStorage();
    const store = createH5Store({ storage });
    store.dispatch(sessionEstablished({ token: 'new-token', user }));
    store.dispatch(sessionInvalidated({ token: 'old-token', sessionVersion: 1 }));
    await Promise.resolve();
    expect(store.getState().auth.token).toBe('new-token');
  });
});
