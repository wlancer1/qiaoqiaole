import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';
import { createApi } from '@reduxjs/toolkit/query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionEstablished, sessionInvalidated } from '../auth/authEvents';
import { authReducer } from '../auth/authSlice';
import type { AuthState, AuthUser } from '../auth/authTypes';
import { authenticatedBaseQuery, type AuthExtraOptions } from './baseQuery';

const authenticatedUser: AuthUser = {
  id: 'user-a',
  username: 'alice',
  displayName: 'Alice',
  avatarUrl: '',
  legacyDraftOwnerId: 'legacy-a',
  likesCount: 1,
  followingCount: 2,
  followersCount: 3,
};

function authState(token = 'token-a', sessionVersion = 7): AuthState {
  return {
    status: token ? 'authenticated' : 'anonymous',
    token,
    user: token ? authenticatedUser : null,
    restoreIdentityHint: null,
    restoreRequestId: null,
    sessionVersion,
  };
}

const testApi = createApi({
  reducerPath: 'baseQueryTestApi',
  baseQuery: authenticatedBaseQuery,
  endpoints: (builder) => ({
    required: builder.query<unknown, void>({
      query: () => 'http://localhost/api/required',
      extraOptions: { auth: 'required' } satisfies AuthExtraOptions,
    }),
    optional: builder.query<unknown, void>({
      query: () => 'http://localhost/api/optional',
      extraOptions: { auth: 'optional' } satisfies AuthExtraOptions,
    }),
    none: builder.query<unknown, void>({
      query: () => 'http://localhost/api/none',
      extraOptions: { auth: 'none' } satisfies AuthExtraOptions,
    }),
    business: builder.query<unknown, void>({
      query: () => 'http://localhost/api/business',
      extraOptions: { auth: 'optional' } satisfies AuthExtraOptions,
    }),
    serverQuery: builder.query<unknown, void>({
      query: () => 'http://localhost/api/server-query',
      extraOptions: { auth: 'none' } satisfies AuthExtraOptions,
    }),
    serverMutation: builder.mutation<unknown, void>({
      query: () => ({ url: 'http://localhost/api/server-mutation', method: 'POST' }),
      extraOptions: { auth: 'none' } satisfies AuthExtraOptions,
    }),
  }),
});

function createTestStore(initialAuth = authState()) {
  const actions: UnknownAction[] = [];
  const captureActions: Middleware = () => (next) => (action) => {
    actions.push(action as UnknownAction);
    return next(action);
  };
  const store = configureStore({
    reducer: {
      auth: authReducer,
      [testApi.reducerPath]: testApi.reducer,
    },
    preloadedState: { auth: initialAuth },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware()
      .concat(captureActions, testApi.middleware),
  });
  return { store, actions };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestFrom(fetchMock: ReturnType<typeof vi.fn>, call = 0): Request {
  return fetchMock.mock.calls[call][0] as Request;
}

afterEach(() => {
  vi.unstubAllGlobals();
  testApi.util.resetApiState();
});

describe('authenticatedBaseQuery auth policy', () => {
  it.each([
    ['required', testApi.endpoints.required],
    ['optional', testApi.endpoints.optional],
  ] as const)('%s requests attach the captured token when present', async (_name, endpoint) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = createTestStore();

    await store.dispatch(endpoint.initiate()).unwrap();

    expect(requestFrom(fetchMock).headers.get('authorization')).toBe('Bearer token-a');
  });

  it('none requests never attach a token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = createTestStore();

    await store.dispatch(testApi.endpoints.none.initiate()).unwrap();

    expect(requestFrom(fetchMock).headers.has('authorization')).toBe(false);
  });

  it('optional requests remain anonymous when no token exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = createTestStore(authState('', 3));

    await store.dispatch(testApi.endpoints.optional.initiate()).unwrap();

    expect(requestFrom(fetchMock).headers.has('authorization')).toBe(false);
  });
});

describe('authenticatedBaseQuery invalidation', () => {
  it.each([
    ['optional', testApi.endpoints.optional, false],
    ['none', testApi.endpoints.none, false],
    ['required', testApi.endpoints.required, true],
  ] as const)('dispatches session invalidation for %s 401 according to policy', async (
    _name,
    endpoint,
    shouldInvalidate,
  ) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: '未登录' }, 401)));
    const { store, actions } = createTestStore();

    await store.dispatch(endpoint.initiate());

    const invalidations = actions.filter(sessionInvalidated.match);
    expect(invalidations).toHaveLength(shouldInvalidate ? 1 : 0);
    if (shouldInvalidate) {
      expect(invalidations[0]?.payload).toEqual({ token: 'token-a', sessionVersion: 7 });
    }
  });

  it('uses the identity captured before fetch when identity changes in flight', async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { store, actions } = createTestStore();

    const request = store.dispatch(testApi.endpoints.required.initiate());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    store.dispatch(sessionEstablished({
      token: 'token-b',
      user: { ...authenticatedUser, id: 'user-b', username: 'bob' },
    }));
    resolveFetch(jsonResponse({ message: '旧会话失效' }, 401));
    await request;

    const invalidation = actions.filter(sessionInvalidated.match).at(-1);
    expect(invalidation?.payload).toEqual({ token: 'token-a', sessionVersion: 7 });
    expect(store.getState().auth).toMatchObject({ token: 'token-b', sessionVersion: 8 });
  });
});

describe('authenticatedBaseQuery error mapping', () => {
  it('maps a 2xx explicit business failure to ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      success: false,
      code: 'POST_HIDDEN',
      message: '作品不可见',
    })));
    const { store } = createTestStore();

    const result = await store.dispatch(testApi.endpoints.business.initiate());

    expect(result).toMatchObject({
      error: {
        kind: 'business',
        status: 200,
        code: 'POST_HIDDEN',
        message: '作品不可见',
        retryable: false,
      },
    });
  });

  it('marks a query 500 as retryable and performs exactly one fetch attempt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: '服务器异常' }, 500));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = createTestStore();

    const result = await store.dispatch(testApi.endpoints.serverQuery.initiate());

    expect(result).toMatchObject({ error: { kind: 'http', status: 500, retryable: true } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks the same mutation 500 as non-retryable and performs exactly one fetch attempt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: '服务器异常' }, 500));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = createTestStore();

    const result = await store.dispatch(testApi.endpoints.serverMutation.initiate());

    expect(result).toMatchObject({ error: { kind: 'http', status: 500, retryable: false } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
