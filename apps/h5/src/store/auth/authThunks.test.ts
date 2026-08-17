import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiSlice } from '../api/apiSlice';
import { sessionEstablished } from './authEvents';
import { restoreSession, logoutSession } from './authThunks';
import { AUTH_STORAGE_KEY } from './authStorage';
import { createH5Store } from '../store';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const restoredUser = {
  id: 'user-a', username: 'alice', nickname: ' Alice ', avatarUrl: null,
  likesCount: 3, followingCount: 4, followersCount: 5,
};

function storageWith(record: unknown): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(record));
  return storage;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function authMeResponse(data: unknown, status = 200): Response {
  return response({ code: 'OK', message: 'success', data }, status);
}

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe('restoreSession', () => {
  it('does not request the current-user endpoint without a token', async () => {
    const fetchMock = vi.mocked(fetch);
    const store = createH5Store({ storage: new MemoryStorage() });

    const result = await store.dispatch(restoreSession({ sessionVersion: 0 }));

    expect(result.meta.requestStatus).toBe('rejected');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes a valid phone-auth current-user response and consumes the initialized hint', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(authMeResponse({ user: restoredUser }));
    const storage = storageWith({ token: 'token-a', username: 'legacy-name', userId: 'user-a' });
    const store = createH5Store({ storage });

    const result = await store.dispatch(restoreSession({ sessionVersion: 0 }));

    expect(result.meta.requestStatus).toBe('fulfilled');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/me');
    expect(store.getState().auth).toMatchObject({
      status: 'authenticated', token: 'token-a', restoreIdentityHint: null, restoreRequestId: null,
      user: {
        id: 'user-a', username: 'alice', displayName: 'Alice', avatarUrl: '',
        legacyDraftOwnerId: 'legacy-name', likesCount: 3, followingCount: 4, followersCount: 5,
      },
    });
  });

  it('restores the standardized phone-auth me envelope using nickname as the compatibility identity', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(response({
      code: 'OK', message: 'success', data: {
        user: { id: 'user-phone', nickname: '用户8000', avatarUrl: null, status: 'ACTIVE' },
        likesCount: 3, followingCount: 4, followersCount: 5,
      },
    }));
    const store = createH5Store({ storage: storageWith({ token: 'phone-token', username: '旧昵称' }) });

    const result = await store.dispatch(restoreSession({ sessionVersion: 0 }));

    expect(result.meta.requestStatus).toBe('fulfilled');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/me', expect.objectContaining({
      headers: { authorization: 'Bearer phone-token' },
    }));
    expect(store.getState().auth.user).toMatchObject({
      id: 'user-phone', username: '用户8000', displayName: '用户8000',
      likesCount: 3, followingCount: 4, followersCount: 5,
    });
  });

  it('refreshes an expired access token once before restoring the phone-auth session', async () => {
    const fetchMock = vi.mocked(fetch)
      .mockResolvedValueOnce(response({ code: 'AUTH_UNAUTHORIZED', message: '请先登录' }, 401))
      .mockResolvedValueOnce(response({ code: 'OK', message: 'success', data: { accessToken: 'fresh-token' } }))
      .mockResolvedValueOnce(authMeResponse({ user: restoredUser }));
    const store = createH5Store({ storage: storageWith({ token: 'expired-token', username: 'legacy-name' }) });

    const result = await store.dispatch(restoreSession({ sessionVersion: 0 }));

    expect(result.meta.requestStatus).toBe('fulfilled');
    expect(store.getState().auth.token).toBe('fresh-token');
    expect(fetchMock.mock.calls).toEqual(expect.arrayContaining([
      ['/api/v1/auth/token/refresh', expect.objectContaining({
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}',
      })],
      ['/api/v1/auth/me', expect.objectContaining({ headers: { authorization: 'Bearer fresh-token' } })],
    ]));
  });

  it('clears malformed responses and persisted auth', async () => {
    vi.mocked(fetch).mockResolvedValue(authMeResponse({ user: { nickname: 'missing id' } }));
    const storage = storageWith({ token: 'token-a', username: 'alice' });
    const store = createH5Store({ storage });

    await store.dispatch(restoreSession({ sessionVersion: 0 }));

    expect(store.getState().auth.status).toBe('anonymous');
    expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('uses the explicit generation while reading token and hint from initialized state', async () => {
    vi.mocked(fetch).mockResolvedValue(authMeResponse({ user: restoredUser }));
    const storage = storageWith({ token: 'token-a', username: 'legacy-name' });
    const store = createH5Store({ storage });

    await store.dispatch(restoreSession({ sessionVersion: 0 }));

    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      headers: { authorization: 'Bearer token-a' },
    });
  });

  it('rejects a duplicate restore dispatch without a second fetch', async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveFetch = resolve; });
    vi.mocked(fetch).mockReturnValue(pending);
    const store = createH5Store({ storage: storageWith({ token: 'token-a' }) });

    const first = store.dispatch(restoreSession({ sessionVersion: 0 }));
    const second = store.dispatch(restoreSession({ sessionVersion: 0 }));
    resolveFetch(authMeResponse({ user: restoredUser }));
    const results = await Promise.all([first, second]);

    expect(results.filter((item) => item.meta.requestStatus === 'fulfilled')).toHaveLength(1);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale restore overwrite a newer session', async () => {
    let resolveFetch!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const storage = storageWith({ token: 'old-token' });
    const store = createH5Store({ storage });
    const restore = store.dispatch(restoreSession({ sessionVersion: 0 }));
    store.dispatch(sessionEstablished({
      token: 'new-token',
      user: { id: 'new-user', username: 'new', displayName: 'New', avatarUrl: '', legacyDraftOwnerId: 'new', likesCount: 0, followingCount: 0, followersCount: 0 },
    }));
    resolveFetch(authMeResponse({ user: { ...restoredUser, id: 'old-user' } }));
    await restore;

    expect(store.getState().auth.user?.id).toBe('new-user');
    expect(store.getState().auth.token).toBe('new-token');
    await Promise.resolve();
    expect(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)!)).toMatchObject({ token: 'new-token' });
  });

  it('does not let a stale rejected restore remove newer persisted auth', async () => {
    let rejectFetch!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((resolve) => { rejectFetch = resolve; }));
    const storage = storageWith({ token: 'old-token' });
    const store = createH5Store({ storage });
    const restore = store.dispatch(restoreSession({ sessionVersion: 0 }));
    store.dispatch(sessionEstablished({
      token: 'new-token',
      user: { id: 'new-user', username: 'new', displayName: 'New', avatarUrl: '', legacyDraftOwnerId: 'new', likesCount: 0, followingCount: 0, followersCount: 0 },
    }));
    rejectFetch(response({ message: 'expired' }, 401));
    await restore;
    await Promise.resolve();

    expect(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)!)).toMatchObject({ token: 'new-token' });
  });
});

describe('logout', () => {
  it('clears memory synchronously before best-effort server logout', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(response({ ok: true }));
    const store = createH5Store({ storage: storageWith({ token: 'token-a' }) });
    store.dispatch(sessionEstablished({
      token: 'token-a',
      user: { id: 'user-a', username: 'alice', displayName: 'Alice', avatarUrl: '', legacyDraftOwnerId: 'alice', likesCount: 0, followingCount: 0, followersCount: 0 },
    }));

    const request = store.dispatch(logoutSession());
    expect(store.getState().auth.status).toBe('anonymous');
    expect(store.getState().auth.token).toBe('');
    await request;

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/logout', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', authorization: 'Bearer token-a' },
      body: '{}',
    }));
    expect(store.getState().auth.status).toBe('anonymous');
  });

  it('keeps the local session cleared when server logout rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const store = createH5Store({ storage: storageWith({ token: 'token-a' }) });
    store.dispatch(sessionEstablished({
      token: 'token-a',
      user: { id: 'user-a', username: 'alice', displayName: 'Alice', avatarUrl: '', legacyDraftOwnerId: 'alice', likesCount: 0, followingCount: 0, followersCount: 0 },
    }));

    await expect(store.dispatch(logoutSession())).resolves.toMatchObject({ meta: { requestStatus: 'fulfilled' } });
    expect(store.getState().auth).toMatchObject({ status: 'anonymous', token: '', user: null });
  });
});

it('keeps the API reducer usable while auth thunks are installed', () => {
  const store = createH5Store({ storage: new MemoryStorage() });
  expect(() => store.dispatch(apiSlice.util.resetApiState())).not.toThrow();
});
