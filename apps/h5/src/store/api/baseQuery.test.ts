import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';
import { createApi } from '@reduxjs/toolkit/query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionEstablished, sessionInvalidated } from '../auth/authEvents';
import { authReducer } from '../auth/authSlice';
import type { AuthState, AuthUser } from '../auth/authTypes';
import { API_TAG_TYPES, apiSlice } from './apiSlice';
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
    crossOriginRequired: builder.query<unknown, void>({
      query: () => 'https://example.com/private',
      extraOptions: { auth: 'required' } satisfies AuthExtraOptions,
    }),
    crossOriginOptional: builder.query<unknown, void>({
      query: () => 'https://example.com/profile',
      extraOptions: { auth: 'optional' } satisfies AuthExtraOptions,
    }),
    crossOriginNone: builder.query<unknown, void>({
      query: () => ({
        url: 'https://example.com/public',
        headers: { authorization: 'Bearer caller-token' },
      }),
      extraOptions: { auth: 'none' } satisfies AuthExtraOptions,
    }),
    missingPolicy: builder.query<unknown, void>({
      query: () => 'http://localhost/api/missing-policy',
    }),
    recordHeaders: builder.query<unknown, void>({
      query: () => ({
        url: 'http://localhost/api/record-headers',
        headers: { 'x-custom': 'record-value', 'x-undefined': undefined },
      }),
      extraOptions: { auth: 'none' } satisfies AuthExtraOptions,
    }),
    headersInstance: builder.query<unknown, void>({
      query: () => ({
        url: 'http://localhost/api/headers-instance',
        headers: new Headers({ 'x-custom': 'headers-value' }),
      }),
      extraOptions: { auth: 'none' } satisfies AuthExtraOptions,
    }),
    transportMeta: builder.query<unknown, void>({
      query: () => 'http://localhost/api/transport-meta',
      extraOptions: { auth: 'none' } satisfies AuthExtraOptions,
      transformErrorResponse: (error, meta) => ({
        error,
        requestUrl: meta?.request.url,
        responseStatus: meta?.response?.status,
      }),
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

beforeEach(() => {
  vi.stubGlobal('location', {
    origin: 'http://localhost',
    href: 'http://localhost/app',
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  testApi.util.resetApiState();
});

describe('apiSlice configuration', () => {
  it('registers the complete formal API tag list', () => {
    expect(API_TAG_TYPES).toEqual([
      'CommunityPost',
      'CommunityComment',
      'CommunityProfile',
      'CommunityRelation',
      'Notification',
      'Project',
      'ProjectFolder',
      'Warehouse',
      'Inventory',
      'BeadingSession',
    ]);
  });

  it('keeps unused API data for 120 seconds', () => {
    const initialState = apiSlice.reducer(undefined, { type: '@@INIT' });

    expect(initialState.config.keepUnusedDataFor).toBe(120);
  });
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

  it.each([
    ['required', testApi.endpoints.crossOriginRequired],
    ['optional', testApi.endpoints.crossOriginOptional],
  ] as const)('rejects an authenticated cross-origin absolute URL for %s without fetching', async (
    _name,
    endpoint,
  ) => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = createTestStore();

    const result = await store.dispatch(endpoint.initiate());

    expect(result).toMatchObject({
      error: {
        kind: 'business',
        code: 'CROSS_ORIGIN_AUTH_FORBIDDEN',
        retryable: false,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows a none cross-origin URL but strips caller authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = createTestStore();

    await store.dispatch(testApi.endpoints.crossOriginNone.initiate()).unwrap();

    expect(requestFrom(fetchMock).headers.has('authorization')).toBe(false);
  });

  it('rejects an endpoint that omits its authentication policy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = createTestStore();

    const result = await store.dispatch(testApi.endpoints.missingPolicy.initiate());

    expect(result).toMatchObject({
      error: {
        kind: 'business',
        code: 'AUTH_POLICY_REQUIRED',
        retryable: false,
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filters undefined record headers while preserving custom values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = createTestStore();

    await store.dispatch(testApi.endpoints.recordHeaders.initiate()).unwrap();

    expect(requestFrom(fetchMock).headers.get('x-custom')).toBe('record-value');
    expect(requestFrom(fetchMock).headers.has('x-undefined')).toBe(false);
  });

  it('preserves custom values from a Headers instance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { store } = createTestStore();

    await store.dispatch(testApi.endpoints.headersInstance.initiate()).unwrap();

    expect(requestFrom(fetchMock).headers.get('x-custom')).toBe('headers-value');
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

  it('does not invalidate or increment an anonymous session on required 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: '未登录' }, 401)));
    const { store, actions } = createTestStore(authState('', 3));

    await store.dispatch(testApi.endpoints.required.initiate());

    expect(actions.filter(sessionInvalidated.match)).toHaveLength(0);
    expect(store.getState().auth.sessionVersion).toBe(3);
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

  it('maps a real fetch rejection to a network error and preserves request meta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const { store } = createTestStore();

    const result = await store.dispatch(testApi.endpoints.transportMeta.initiate());

    expect(result).toMatchObject({
      error: {
        error: { kind: 'network', message: 'TypeError: Failed to fetch', retryable: true },
        requestUrl: 'http://localhost/api/transport-meta',
      },
    });
  });

  it('maps an AbortError fetch rejection to an aborted error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('已取消', 'AbortError')));
    const { store } = createTestStore();

    const result = await store.dispatch(testApi.endpoints.transportMeta.initiate());

    expect(result).toMatchObject({ error: { error: { kind: 'aborted', retryable: false } } });
  });

  it('maps an invalid JSON response to parse and preserves response meta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
    const { store } = createTestStore();

    const result = await store.dispatch(testApi.endpoints.transportMeta.initiate());

    expect(result).toMatchObject({
      error: {
        error: { kind: 'parse', status: 200, retryable: false },
        requestUrl: 'http://localhost/api/transport-meta',
        responseStatus: 200,
      },
    });
  });
});
