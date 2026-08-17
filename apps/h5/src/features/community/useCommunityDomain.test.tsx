import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useCommunityDomain, type CommunityDomainResult, type CommunityRequestApi } from './useCommunityDomain';
import type { CommunityNotification, CommunityPost } from '../../community/communityData';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

function post(id: string, likesCount: number, sharedAt = '2026-08-01T00:00:00.000Z'): CommunityPost {
  return {
    id,
    name: id,
    author: '作者',
    rows: 10,
    cols: 10,
    tone: 'recent-flower',
    likesCount,
    commentsCount: 0,
    likedByMe: false,
    sharedAt,
  };
}

function notification(id: string, overrides: Partial<CommunityNotification> = {}): CommunityNotification {
  return { id, type: 'like', content: '通知', createdAt: '', isRead: false, senderId: 'sender-1', senderName: '发送者', ...overrides };
}

function createHarness(requestApi: CommunityRequestApi, initial = { authToken: 'token-1', screen: 'home' }) {
  const control = { current: null as CommunityDomainResult | null };
  const setStatus = vi.fn();
  const navigate = vi.fn();
  const loadFollowingCount = vi.fn().mockResolvedValue(undefined);
  let renderer!: ReactTestRenderer;

  function Probe({ authToken, screen }: { authToken: string; screen: string }) {
    control.current = useCommunityDomain({
      activeTab: 'discover',
      screen,
      routeAuthorId: '',
      authToken,
      requestApi,
      setStatus,
      requireLogin: vi.fn(),
      navigate,
      loadFollowingCount,
    });
    return null;
  }

  return {
    control,
    get renderer() { return renderer; },
    setStatus,
    navigate,
    loadFollowingCount,
    async mount() {
      await act(async () => { renderer = create(<Probe {...initial} />); });
    },
    async update(next: Partial<typeof initial>) {
      initial = { ...initial, ...next };
      await act(async () => { renderer.update(<Probe {...initial} />); });
    },
    async unmount() {
      await act(async () => { renderer.unmount(); });
    },
  };
}

describe('useCommunityDomain', () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  const renderers: ReactTestRenderer[] = [];

  afterEach(() => {
    for (const renderer of renderers) act(() => renderer.unmount());
    renderers.length = 0;
  });

  it('loads and sorts the first community page', async () => {
    const requestApi = vi.fn().mockResolvedValue({
      posts: [post('low', 2), post('high', 9)],
      tagCounts: [{ tag: '动物', count: 3 }, { tag: '空标签', count: 0 }],
    }) as unknown as CommunityRequestApi;
    const harness = createHarness(requestApi);
    await harness.mount();
    renderers.push(harness.renderer);

    await act(async () => { await harness.control.current!.loadCommunityPosts('hot'); });

    expect(requestApi).toHaveBeenCalledWith('/community/posts?sort=hot&page=1&pageSize=12', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(harness.control.current!.communityPosts.map((item) => item.id)).toEqual(['high', 'low']);
    expect(harness.control.current!.communityAvailableTags).toEqual(['动物']);
    expect(harness.control.current!.communityHasMore).toBe(false);
  });

  it('loads only the URL-selected discovery page instead of accumulating earlier pages', async () => {
    const requestApi = vi.fn().mockResolvedValue({ posts: [post('page-three', 2)] }) as unknown as CommunityRequestApi;
    const harness = createHarness(requestApi);
    await harness.mount();
    renderers.push(harness.renderer);

    await act(async () => { await harness.control.current!.loadCommunityPosts('latest', 'token-1', { page: 3 }); });

    expect(requestApi).toHaveBeenCalledWith('/community/posts?sort=latest&page=3&pageSize=12', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(harness.control.current!.communityPosts.map((item) => item.id)).toEqual(['page-three']);
  });

  it('appends the next page without losing the current list', async () => {
    const requestApiMock = vi.fn();
    requestApiMock
      .mockResolvedValueOnce({ posts: Array.from({ length: 12 }, (_, index) => post(`first-${index}`, 1)) })
      .mockResolvedValueOnce({ posts: [post('second', 2)] });
    const requestApi = requestApiMock as unknown as CommunityRequestApi;
    const harness = createHarness(requestApi);
    await harness.mount();

    act(() => { harness.control.current!.setCommunitySort('latest'); });
    await act(async () => { await harness.control.current!.loadCommunityPosts(); });
    await act(async () => { await harness.control.current!.loadMoreCommunityPosts(); });

    expect(requestApi).toHaveBeenLastCalledWith('/community/posts?sort=latest&page=2&pageSize=12', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(harness.control.current!.communityPosts).toHaveLength(13);
    expect(harness.control.current!.communityPosts.at(-1)?.id).toBe('second');
  });

  it('serializes two immediate hot page-two requests behind one append owner', async () => {
    const pageTwo = deferred<{ posts: CommunityPost[] }>();
    const firstPage = Array.from({ length: 12 }, (_, index) => post(`hot-first-${index}`, 12 - index));
    const requestApiMock = vi.fn()
      .mockResolvedValueOnce({ posts: firstPage })
      .mockReturnValueOnce(pageTwo.promise);
    const harness = createHarness(requestApiMock as unknown as CommunityRequestApi);
    await harness.mount();

    await act(async () => { await harness.control.current!.loadCommunityPosts('hot'); });

    let firstAppend!: Promise<void>;
    let secondAppend!: Promise<void>;
    act(() => {
      firstAppend = harness.control.current!.loadMoreCommunityPosts('hot');
      secondAppend = harness.control.current!.loadMoreCommunityPosts('hot');
    });

    expect(requestApiMock).toHaveBeenCalledTimes(2);
    expect(requestApiMock).toHaveBeenNthCalledWith(2, '/community/posts?sort=hot&page=2&pageSize=12', { headers: { authorization: 'Bearer token-1' } }, 'token-1');

    await act(async () => {
      pageTwo.resolve({ posts: [post('hot-second', 0)] });
      await Promise.all([firstAppend, secondAppend]);
    });

    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual([
      ...firstPage.map(({ id }) => id),
      'hot-second',
    ]);
    expect(harness.control.current!.communityHasMore).toBe(false);
    expect(harness.control.current!.isCommunityLoadingMore).toBe(false);
  });

  it('does not append when the requested sort differs from the committed list', async () => {
    const firstPage = Array.from({ length: 12 }, (_, index) => post(`hot-${index}`, 12 - index));
    const requestApiMock = vi.fn().mockResolvedValue({ posts: firstPage });
    const harness = createHarness(requestApiMock as unknown as CommunityRequestApi);
    await harness.mount();

    await act(async () => { await harness.control.current!.loadCommunityPosts('hot'); });
    await act(async () => { await harness.control.current!.loadMoreCommunityPosts('latest'); });

    expect(requestApiMock).toHaveBeenCalledTimes(1);
    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual(firstPage.map(({ id }) => id));
    expect(harness.control.current!.communityHasMore).toBe(true);
    expect(harness.control.current!.isCommunityLoadingMore).toBe(false);
  });

  it('preserves the committed list and retries the same page after an append failure', async () => {
    const firstPage = Array.from({ length: 12 }, (_, index) => post(`hot-${index}`, 12 - index));
    const requestApiMock = vi.fn()
      .mockResolvedValueOnce({ posts: firstPage })
      .mockRejectedValueOnce(new Error('第二页失败'))
      .mockResolvedValueOnce({ posts: [post('hot-page-two', 0)] });
    const harness = createHarness(requestApiMock as unknown as CommunityRequestApi);
    await harness.mount();

    await act(async () => { await harness.control.current!.loadCommunityPosts('hot'); });
    await act(async () => { await harness.control.current!.loadMoreCommunityPosts('hot'); });

    expect(requestApiMock).toHaveBeenNthCalledWith(2, '/community/posts?sort=hot&page=2&pageSize=12', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual(firstPage.map(({ id }) => id));
    expect(harness.control.current!.communityHasMore).toBe(true);
    expect(harness.control.current!.isCommunityLoadingMore).toBe(false);

    await act(async () => { await harness.control.current!.loadMoreCommunityPosts('hot'); });

    expect(requestApiMock).toHaveBeenNthCalledWith(3, '/community/posts?sort=hot&page=2&pageSize=12', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual([
      ...firstPage.map(({ id }) => id),
      'hot-page-two',
    ]);
    expect(harness.control.current!.communityHasMore).toBe(false);
    expect(harness.control.current!.isCommunityLoadingMore).toBe(false);
  });

  it('lets a newer latest base and append supersede a pending hot append', async () => {
    const hotPageTwo = deferred<{ posts: CommunityPost[] }>();
    const latestBase = deferred<{ posts: CommunityPost[] }>();
    const latestPageTwo = deferred<{ posts: CommunityPost[] }>();
    const hotFirstPage = Array.from({ length: 12 }, (_, index) => post(`hot-${index}`, 12 - index));
    const latestFirstPage = Array.from({ length: 12 }, (_, index) => post(`latest-${index}`, 0));
    const requestApiMock = vi.fn((path: string) => {
      if (path === '/community/posts?sort=hot&page=1&pageSize=12') return Promise.resolve({ posts: hotFirstPage });
      if (path === '/community/posts?sort=hot&page=2&pageSize=12') return hotPageTwo.promise;
      if (path === '/community/posts?sort=latest&page=1&pageSize=12') return latestBase.promise;
      if (path === '/community/posts?sort=latest&page=2&pageSize=12') return latestPageTwo.promise;
      return Promise.reject(new Error(`unexpected request: ${path}`));
    });
    const harness = createHarness(requestApiMock as unknown as CommunityRequestApi);
    await harness.mount();

    await act(async () => { await harness.control.current!.loadCommunityPosts('hot'); });
    let hotAppendOperation!: Promise<void>;
    act(() => { hotAppendOperation = harness.control.current!.loadMoreCommunityPosts('hot'); });
    expect(harness.control.current!.isCommunityLoadingMore).toBe(true);

    let latestBaseOperation!: Promise<void>;
    act(() => { latestBaseOperation = harness.control.current!.loadCommunityPosts('latest'); });
    expect(harness.control.current!.communityHasMore).toBe(false);
    expect(harness.control.current!.isCommunityLoading).toBe(true);
    expect(harness.control.current!.isCommunityLoadingMore).toBe(false);
    await act(async () => {
      latestBase.resolve({ posts: latestFirstPage });
      await latestBaseOperation;
    });

    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual(latestFirstPage.map(({ id }) => id));
    expect(harness.control.current!.communityHasMore).toBe(true);
    let latestAppendOperation!: Promise<void>;
    act(() => { latestAppendOperation = harness.control.current!.loadMoreCommunityPosts('latest'); });
    expect(requestApiMock).toHaveBeenCalledWith('/community/posts?sort=latest&page=2&pageSize=12', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(harness.control.current!.isCommunityLoadingMore).toBe(true);

    await act(async () => {
      latestPageTwo.resolve({ posts: [post('latest-page-two', 0)] });
      await latestAppendOperation;
    });
    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual([
      ...latestFirstPage.map(({ id }) => id),
      'latest-page-two',
    ]);
    expect(harness.control.current!.communityHasMore).toBe(false);

    await act(async () => {
      hotPageTwo.resolve({ posts: [post('stale-hot-page-two', 100)] });
      await hotAppendOperation;
    });
    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual([
      ...latestFirstPage.map(({ id }) => id),
      'latest-page-two',
    ]);
    expect(harness.control.current!.communityHasMore).toBe(false);
    expect(harness.control.current!.isCommunityLoading).toBe(false);
    expect(harness.control.current!.isCommunityLoadingMore).toBe(false);
  });

  it('restores the committed hot page after a preserved refresh failure', async () => {
    const firstPage = Array.from({ length: 12 }, (_, index) => post(`hot-first-${index}`, 24 - index));
    const secondPage = Array.from({ length: 12 }, (_, index) => post(`hot-second-${index}`, 12 - index));
    const requestApiMock = vi.fn()
      .mockResolvedValueOnce({ posts: firstPage })
      .mockResolvedValueOnce({ posts: secondPage })
      .mockRejectedValueOnce(new Error('刷新失败'))
      .mockResolvedValueOnce({ posts: [post('hot-third', 0)] });
    const harness = createHarness(requestApiMock as unknown as CommunityRequestApi);
    await harness.mount();

    await act(async () => { await harness.control.current!.loadCommunityPosts('hot'); });
    await act(async () => { await harness.control.current!.loadMoreCommunityPosts('hot'); });
    await act(async () => {
      await harness.control.current!.loadCommunityPosts('hot', 'token-1', { preserveOnError: true });
    });

    expect(harness.control.current!.communityPosts).toHaveLength(24);
    expect(harness.control.current!.communityHasMore).toBe(true);
    expect(harness.control.current!.isCommunityLoading).toBe(false);

    await act(async () => { await harness.control.current!.loadMoreCommunityPosts('hot'); });

    expect(requestApiMock).toHaveBeenNthCalledWith(4, '/community/posts?sort=hot&page=3&pageSize=12', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(harness.control.current!.communityPosts).toHaveLength(25);
    expect(harness.control.current!.communityPosts.at(-1)?.id).toBe('hot-third');
    expect(harness.control.current!.communityHasMore).toBe(false);
  });

  it('keeps the newest overlapping base owner and restores the last committed context on failure', async () => {
    const olderLatestBase = deferred<{ posts: CommunityPost[] }>();
    const newerHotRefresh = deferred<{ posts: CommunityPost[] }>();
    const committedHotPage = Array.from({ length: 12 }, (_, index) => post(`committed-hot-${index}`, 12 - index));
    const requestApiMock = vi.fn()
      .mockResolvedValueOnce({ posts: committedHotPage })
      .mockReturnValueOnce(olderLatestBase.promise)
      .mockReturnValueOnce(newerHotRefresh.promise)
      .mockResolvedValueOnce({ posts: [post('committed-hot-page-two', 0)] });
    const harness = createHarness(requestApiMock as unknown as CommunityRequestApi);
    await harness.mount();

    await act(async () => { await harness.control.current!.loadCommunityPosts('hot'); });
    let olderOperation!: Promise<void>;
    let newerOperation!: Promise<void>;
    act(() => { olderOperation = harness.control.current!.loadCommunityPosts('latest'); });
    act(() => {
      newerOperation = harness.control.current!.loadCommunityPosts('hot', 'token-1', { preserveOnError: true });
    });

    await act(async () => {
      olderLatestBase.resolve({ posts: Array.from({ length: 12 }, (_, index) => post(`stale-latest-${index}`, 0)) });
      await olderOperation;
    });
    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual(committedHotPage.map(({ id }) => id));
    expect(harness.control.current!.isCommunityLoading).toBe(true);
    expect(harness.control.current!.communityHasMore).toBe(false);

    await act(async () => {
      newerHotRefresh.reject(new Error('较新的刷新失败'));
      await newerOperation;
    });
    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual(committedHotPage.map(({ id }) => id));
    expect(harness.control.current!.communityHasMore).toBe(true);
    expect(harness.control.current!.isCommunityLoading).toBe(false);

    await act(async () => { await harness.control.current!.loadMoreCommunityPosts('hot'); });
    expect(requestApiMock).toHaveBeenNthCalledWith(4, '/community/posts?sort=hot&page=2&pageSize=12', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(harness.control.current!.communityPosts.at(-1)?.id).toBe('committed-hot-page-two');
  });

  it('isolates a new session append owner from an old page-two request settling after logout', async () => {
    const oldHotAppend = deferred<{ posts: CommunityPost[] }>();
    const newLatestAppend = deferred<{ posts: CommunityPost[] }>();
    const oldHotPage = Array.from({ length: 12 }, (_, index) => post(`old-hot-${index}`, 12 - index));
    const newLatestPage = Array.from({ length: 12 }, (_, index) => post(`new-latest-${index}`, 0));
    const requestApiMock = vi.fn((path: string, _options?: RequestInit, token?: string | null) => {
      if (token === 'token-1' && path === '/community/posts?sort=hot&page=1&pageSize=12') return Promise.resolve({ posts: oldHotPage });
      if (token === 'token-1' && path === '/community/posts?sort=hot&page=2&pageSize=12') return oldHotAppend.promise;
      if (token === 'token-2' && path === '/community/posts?sort=latest&page=1&pageSize=12') return Promise.resolve({ posts: newLatestPage });
      if (token === 'token-2' && path === '/community/posts?sort=latest&page=2&pageSize=12') return newLatestAppend.promise;
      return Promise.reject(new Error(`unexpected request: ${token ?? 'none'} ${path}`));
    });
    const harness = createHarness(requestApiMock as unknown as CommunityRequestApi);
    await harness.mount();

    await act(async () => { await harness.control.current!.loadCommunityPosts('hot'); });
    let oldAppendOperation!: Promise<void>;
    act(() => { oldAppendOperation = harness.control.current!.loadMoreCommunityPosts('hot'); });
    await harness.update({ authToken: '' });
    act(() => { harness.control.current!.clearForLogout(); });
    expect(harness.control.current!.communityPosts).toEqual([]);
    expect(harness.control.current!.communityHasMore).toBe(false);
    expect(harness.control.current!.isCommunityLoadingMore).toBe(false);

    await harness.update({ authToken: 'token-2' });
    await act(async () => { await harness.control.current!.loadCommunityPosts('latest', 'token-2'); });
    let newAppendOperation!: Promise<void>;
    act(() => { newAppendOperation = harness.control.current!.loadMoreCommunityPosts('latest'); });
    expect(requestApiMock).toHaveBeenCalledWith('/community/posts?sort=latest&page=2&pageSize=12', { headers: { authorization: 'Bearer token-2' } }, 'token-2');
    expect(harness.control.current!.isCommunityLoadingMore).toBe(true);

    await act(async () => {
      oldHotAppend.resolve({ posts: [post('stale-old-hot', 100)] });
      await oldAppendOperation;
    });
    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual(newLatestPage.map(({ id }) => id));
    expect(harness.control.current!.communityHasMore).toBe(true);
    expect(harness.control.current!.isCommunityLoadingMore).toBe(true);

    await act(async () => {
      newLatestAppend.resolve({ posts: [post('new-latest-page-two', 0)] });
      await newAppendOperation;
    });
    expect(harness.control.current!.communityPosts.map(({ id }) => id)).toEqual([
      ...newLatestPage.map(({ id }) => id),
      'new-latest-page-two',
    ]);
    expect(harness.control.current!.communityHasMore).toBe(false);
    expect(harness.control.current!.isCommunityLoadingMore).toBe(false);
  });

  it('clears the committed context after a non-preserved base failure', async () => {
    const committedHotPage = Array.from({ length: 12 }, (_, index) => post(`hot-${index}`, 12 - index));
    const requestApiMock = vi.fn()
      .mockResolvedValueOnce({ posts: committedHotPage })
      .mockRejectedValueOnce(new Error('切换列表失败'));
    const harness = createHarness(requestApiMock as unknown as CommunityRequestApi);
    await harness.mount();

    await act(async () => { await harness.control.current!.loadCommunityPosts('hot'); });
    await act(async () => { await harness.control.current!.loadCommunityPosts('latest'); });

    expect(harness.control.current!.communityPosts).toEqual([]);
    expect(harness.control.current!.communityHasMore).toBe(false);
    expect(harness.control.current!.isCommunityLoading).toBe(false);
    await act(async () => { await harness.control.current!.loadMoreCommunityPosts('hot'); });
    expect(requestApiMock).toHaveBeenCalledTimes(2);
  });

  it('does not carry a committed pagination context across logout', async () => {
    const committedHotPage = Array.from({ length: 12 }, (_, index) => post(`hot-${index}`, 12 - index));
    const requestApiMock = vi.fn().mockResolvedValue({ posts: committedHotPage });
    const harness = createHarness(requestApiMock as unknown as CommunityRequestApi);
    await harness.mount();

    await act(async () => { await harness.control.current!.loadCommunityPosts('hot'); });
    await harness.update({ authToken: '' });
    act(() => { harness.control.current!.clearForLogout(); });
    await harness.update({ authToken: 'token-2' });
    await act(async () => { await harness.control.current!.loadMoreCommunityPosts('hot'); });

    expect(requestApiMock).toHaveBeenCalledTimes(1);
    expect(harness.control.current!.communityPosts).toEqual([]);
    expect(harness.control.current!.communityHasMore).toBe(false);
    expect(harness.control.current!.isCommunityLoadingMore).toBe(false);
  });

  it('discards a response from an older request', async () => {
    const first = deferred<{ posts: CommunityPost[] }>();
    const second = deferred<{ posts: CommunityPost[] }>();
    const requestApiMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const requestApi = requestApiMock as unknown as CommunityRequestApi;
    const harness = createHarness(requestApi);
    await harness.mount();

    let firstRequest!: Promise<void>;
    let secondRequest!: Promise<void>;
    act(() => { firstRequest = harness.control.current!.loadCommunityPosts('hot'); });
    act(() => { secondRequest = harness.control.current!.loadCommunityPosts('latest'); });
    await act(async () => {
      second.resolve({ posts: [post('new', 4)] });
      await secondRequest;
    });
    await act(async () => {
      first.resolve({ posts: [post('old', 99)] });
      await firstRequest;
    });

    expect(harness.control.current!.communityPosts.map((item) => item.id)).toEqual(['new']);
  });

  it('does not apply a late community list response after leaving its route', async () => {
    const list = deferred<{ posts: CommunityPost[] }>();
    const harness = createHarness(vi.fn().mockReturnValue(list.promise) as unknown as CommunityRequestApi);
    await harness.mount();
    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.loadCommunityPosts('latest'); });
    await harness.update({ screen: 'warehouse' });
    await act(async () => { list.resolve({ posts: [post('stale', 1)] }); await operation; });

    expect(harness.control.current!.communityPosts).toEqual([]);
    expect(harness.control.current!.isCommunityLoading).toBe(true);
  });

  it('does not apply a late author profile failure after leaving its route', async () => {
    const profile = deferred<{ profile: { id: string; name: string; postsCount: number; likesCount: number; followersCount: number; isFollowing: boolean }; posts: CommunityPost[] }>();
    const harness = createHarness(vi.fn().mockReturnValue(profile.promise) as unknown as CommunityRequestApi, { authToken: 'token-1', screen: 'author-profile' });
    await harness.mount();
    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.loadAuthorProfile('author-1'); });
    await harness.update({ screen: 'warehouse' });
    await act(async () => { profile.reject(new Error('过期作者失败')); await operation; });

    expect(harness.control.current!.authorProfile).toBeNull();
    expect(harness.control.current!.authorProfileError).toBe('');
    expect(harness.control.current!.isAuthorProfileLoading).toBe(true);
    expect(harness.setStatus).not.toHaveBeenCalled();
  });

  it('does not apply a late comment list response after leaving the detail route', async () => {
    const comments = deferred<{ comments: []; page: number; pageSize: number; hasMore: boolean; totalTopLevel: number; totalComments: number }>();
    const harness = createHarness(vi.fn().mockReturnValue(comments.promise) as unknown as CommunityRequestApi, { authToken: 'token-1', screen: 'pattern-detail' });
    await harness.mount();
    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.loadCommunityComments('post-1'); });
    await harness.update({ screen: 'warehouse' });
    await act(async () => { comments.resolve({ comments: [], page: 1, pageSize: 20, hasMore: false, totalTopLevel: 0, totalComments: 0 }); await operation; });

    expect(harness.control.current!.communityComments).toEqual([]);
    expect(harness.control.current!.isCommunityCommentsLoading).toBe(true);
  });

  it('does not report a late notification failure after logout', async () => {
    const notifications = deferred<{ notifications: [] }>();
    const harness = createHarness(vi.fn().mockReturnValue(notifications.promise) as unknown as CommunityRequestApi);
    await harness.mount();
    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.loadNotifications(); });
    await harness.update({ authToken: '' });
    act(() => { harness.control.current!.clearForLogout(); });
    await act(async () => { notifications.reject(new Error('过期消息失败')); await operation; });

    expect(harness.control.current!.notifications).toEqual([]);
    expect(harness.setStatus).not.toHaveBeenCalled();
  });

  it('does not apply a late notification response after leaving its route', async () => {
    const notifications = deferred<{ notifications: [CommunityNotification] }>();
    const harness = createHarness(vi.fn().mockReturnValue(notifications.promise) as unknown as CommunityRequestApi);
    await harness.mount();
    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.loadNotifications(); });
    await harness.update({ screen: 'warehouse' });
    await act(async () => { notifications.resolve({ notifications: [notification('stale-notice')] }); await operation; });

    expect(harness.control.current!.notifications).toEqual([]);
    expect(harness.setStatus).not.toHaveBeenCalled();
  });

  it('clears community-owned transient data on logout', async () => {
    const requestApi = vi.fn().mockResolvedValue({ posts: [post('one', 1)] }) as unknown as CommunityRequestApi;
    const harness = createHarness(requestApi);
    await harness.mount();
    renderers.push(harness.renderer);
    await act(async () => { await harness.control.current!.loadCommunityPosts(); });
    act(() => { harness.control.current!.clearForLogout(); });
    expect(harness.control.current!.communityPosts).toEqual([]);
    expect(harness.control.current!.notifications).toEqual([]);
  });

  it('drops a late like result after the authenticated session is cleared', async () => {
    const like = deferred<{ liked: boolean; likesCount: number }>();
    const harness = createHarness(vi.fn().mockReturnValue(like.promise) as unknown as CommunityRequestApi);
    await harness.mount();
    act(() => { harness.control.current!.setCommunityPosts([post('one', 1)]); });

    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.likeCommunityPost('one', false); });
    await harness.update({ authToken: '' });
    act(() => { harness.control.current!.clearForLogout(); });
    await act(async () => { like.resolve({ liked: true, likesCount: 2 }); await operation; });

    expect(harness.control.current!.communityPosts).toEqual([]);
    expect(harness.setStatus).not.toHaveBeenCalled();
  });

  it('drops a late follow failure after navigating away from the community route', async () => {
    const follow = deferred<{ following: boolean }>();
    const harness = createHarness(vi.fn().mockReturnValue(follow.promise) as unknown as CommunityRequestApi);
    await harness.mount();

    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.toggleCommunityFollow('author-1', false); });
    await harness.update({ screen: 'warehouse' });
    await act(async () => { follow.reject(new Error('stale follow failure')); await operation; });

    expect(harness.setStatus).not.toHaveBeenCalled();
    expect(harness.loadFollowingCount).not.toHaveBeenCalled();
  });

  it('does not apply a late comment mutation or clear its pending state after leaving the detail route', async () => {
    const add = deferred<{ comment: { id: string; projectId: string; content: string; authorId: string; author: string; authorAvatar: null; createdAt: string; replies: [] } }>();
    const harness = createHarness(vi.fn().mockReturnValue(add.promise) as unknown as CommunityRequestApi, { authToken: 'token-1', screen: 'pattern-detail' });
    await harness.mount();
    act(() => { harness.control.current!.setCommunityPosts([post('one', 0)]); });

    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.addCommunityComment('one', '新的评论'); });
    expect(harness.control.current!.commentSubmitting).toBe(true);
    await harness.update({ screen: 'warehouse' });
    await act(async () => {
      add.resolve({ comment: { id: 'comment-1', projectId: 'one', content: '新的评论', authorId: 'user-1', author: '我', authorAvatar: null, createdAt: '', replies: [] } });
      await operation;
    });

    expect(harness.control.current!.communityComments).toEqual([]);
    expect(harness.control.current!.communityPosts[0]?.commentsCount).toBe(0);
    expect(harness.control.current!.commentSubmitting).toBe(true);
    expect(harness.setStatus).not.toHaveBeenCalled();
  });

  it('does not apply a late comment delete failure after logout', async () => {
    const remove = deferred<{ deletedCount: number }>();
    const harness = createHarness(vi.fn().mockReturnValue(remove.promise) as unknown as CommunityRequestApi, { authToken: 'token-1', screen: 'pattern-detail' });
    await harness.mount();
    act(() => { harness.control.current!.setCommunityComments([{ id: 'comment-1', projectId: 'one', content: '已有评论', authorId: 'user-1', author: '我', authorAvatar: null, createdAt: '', replies: [] }]); });

    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.deleteCommunityComment('one', 'comment-1'); });
    await harness.update({ authToken: '' });
    act(() => { harness.control.current!.clearForLogout(); });
    await act(async () => { remove.reject(new Error('过期删除失败')); await operation; });

    expect(harness.control.current!.communityComments).toEqual([]);
    expect(harness.control.current!.commentDeletePendingId).toBe('');
    expect(harness.setStatus).not.toHaveBeenCalled();
  });

  it('does not write a late following response after leaving the following route', async () => {
    const following = deferred<{ users: Array<{ id: string; name: string }> }>();
    const harness = createHarness(vi.fn().mockReturnValue(following.promise) as unknown as CommunityRequestApi, { authToken: 'token-1', screen: 'following' });
    await harness.mount();

    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.loadFollowingUsers(); });
    await harness.update({ screen: 'warehouse' });
    await act(async () => { following.resolve({ users: [{ id: 'author-1', name: '作者' }] }); await operation; });

    expect(harness.control.current!.followingUsers).toEqual([]);
    expect(harness.control.current!.isFollowingLoading).toBe(true);
  });

  it('does not write a late followers response after logout', async () => {
    const followers = deferred<{ users: Array<{ id: string; name: string }> }>();
    const harness = createHarness(vi.fn().mockReturnValue(followers.promise) as unknown as CommunityRequestApi, { authToken: 'token-1', screen: 'followers' });
    await harness.mount();

    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.loadFollowersUsers(); });
    await harness.update({ authToken: '' });
    act(() => { harness.control.current!.clearForLogout(); });
    await act(async () => { followers.resolve({ users: [{ id: 'author-1', name: '作者' }] }); await operation; });

    expect(harness.control.current!.followersUsers).toEqual([]);
    expect(harness.control.current!.isFollowersLoading).toBe(false);
  });

  it('does not navigate or mark a notification read when its post lookup finishes after a route change', async () => {
    const lookup = deferred<{ post: CommunityPost }>();
    const requestApi = vi.fn((path: string) => {
      if (path === '/community/posts/post-1') return lookup.promise;
      return Promise.resolve({});
    }) as unknown as CommunityRequestApi;
    const harness = createHarness(requestApi);
    await harness.mount();
    const notice = notification('notice-1', { projectId: 'post-1' });
    act(() => { harness.control.current!.setNotifications([notice]); });

    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.openNotification(notice); });
    await harness.update({ screen: 'warehouse' });
    await act(async () => { lookup.resolve({ post: post('post-1', 0) }); await operation; });

    expect(harness.navigate).not.toHaveBeenCalled();
    expect(requestApi).toHaveBeenCalledTimes(1);
    expect(harness.control.current!.notifications[0]?.isRead).toBe(false);
  });

  it('marks a notification read before navigating to its linked work comments', async () => {
    const requestApi = vi.fn((path: string) => {
      if (path === '/community/posts/post-1') return Promise.resolve({ post: post('post-1', 0) });
      if (path === '/notifications/notice-1/read') return Promise.resolve({});
      return Promise.resolve({});
    }) as unknown as CommunityRequestApi;
    const harness = createHarness(requestApi);
    await harness.mount();
    const notice = notification('notice-1', { projectId: 'post-1' });
    act(() => { harness.control.current!.setNotifications([notice]); });

    await act(async () => { await harness.control.current!.openNotification(notice); });

    expect(requestApi).toHaveBeenCalledWith('/notifications/notice-1/read', { method: 'PATCH' });
    expect(harness.control.current!.notifications[0]).toMatchObject({ isRead: true });
    expect(harness.navigate).toHaveBeenCalledWith('/community/posts/post-1#comments');
  });

  it('applies current like and unlike results and a current deferred follow result', async () => {
    const like = deferred<{ liked: boolean; likesCount: number }>();
    const unlike = deferred<{ liked: boolean; likesCount: number }>();
    const follow = deferred<{ following: boolean; followersCount: number }>();
    const requestApiMock = vi.fn().mockReturnValueOnce(like.promise).mockReturnValueOnce(unlike.promise).mockReturnValueOnce(follow.promise);
    const harness = createHarness(requestApiMock as unknown as CommunityRequestApi);
    await harness.mount();
    act(() => { harness.control.current!.setCommunityPosts([{ ...post('one', 1), authorId: 'author-1' }]); });

    let likeOperation!: Promise<void>;
    act(() => { likeOperation = harness.control.current!.likeCommunityPost('one', false); });
    await act(async () => { like.resolve({ liked: true, likesCount: 2 }); await likeOperation; });
    expect(harness.control.current!.communityPosts[0]).toMatchObject({ likesCount: 2, likedByMe: true });

    let unlikeOperation!: Promise<unknown>;
    act(() => { unlikeOperation = harness.control.current!.likeCommunityPost('one', true); });
    await act(async () => { unlike.resolve({ liked: false, likesCount: 1 }); await unlikeOperation; });
    expect(requestApiMock).toHaveBeenNthCalledWith(2, '/community/posts/one/like', expect.objectContaining({ method: 'DELETE' }), 'token-1');
    expect(harness.control.current!.communityPosts[0]).toMatchObject({ likesCount: 1, likedByMe: false });

    let followOperation!: Promise<void>;
    act(() => { followOperation = harness.control.current!.toggleCommunityFollow('author-1', false); });
    await act(async () => { follow.resolve({ following: true, followersCount: 4 }); await followOperation; });
    expect(harness.control.current!.communityPosts[0]).toMatchObject({ isFollowing: true });
    expect(harness.loadFollowingCount).toHaveBeenCalledWith('token-1');
  });

  it('drops a cancel-like notification read failure after logout clears the operation guard', async () => {
    const markRead = deferred<unknown>();
    const requestApi = vi.fn((path: string) => path.endsWith('/read') ? markRead.promise : Promise.resolve({})) as unknown as CommunityRequestApi;
    const harness = createHarness(requestApi);
    await harness.mount();
    const notice = notification('notice-1');
    act(() => { harness.control.current!.setNotifications([notice]); });

    let operation!: Promise<void>;
    act(() => { operation = harness.control.current!.openNotification(notice); });
    await harness.update({ authToken: '' });
    act(() => { harness.control.current!.clearForLogout(); });
    await act(async () => { markRead.reject(new DOMException('cancelled', 'AbortError')); await operation; });

    expect(harness.setStatus).not.toHaveBeenCalled();
    expect(harness.control.current!.notifications).toEqual([]);
  });
});
