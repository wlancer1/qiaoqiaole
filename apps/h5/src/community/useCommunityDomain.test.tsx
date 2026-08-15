import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useCommunityDomain, type CommunityDomainResult, type CommunityRequestApi } from './useCommunityDomain';
import type { CommunityPost } from './communityData';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
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

function createHarness(requestApi: CommunityRequestApi) {
  const control = { current: null as CommunityDomainResult | null };
  let renderer!: ReactTestRenderer;

  function Probe() {
    control.current = useCommunityDomain({
      activeTab: 'discover',
      screen: 'home',
      routeAuthorId: '',
      authToken: 'token-1',
      requestApi,
      setStatus: vi.fn(),
      requireLogin: vi.fn(),
      navigate: vi.fn(),
      setActivePattern: vi.fn(),
      loadFollowingCount: vi.fn().mockResolvedValue(undefined),
    });
    return null;
  }

  return {
    control,
    get renderer() { return renderer; },
    async mount() {
      await act(async () => { renderer = create(<Probe />); });
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

    expect(requestApi).toHaveBeenCalledWith('/community/posts?sort=hot&page=1&pageSize=50', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(harness.control.current!.communityPosts.map((item) => item.id)).toEqual(['high', 'low']);
    expect(harness.control.current!.communityAvailableTags).toEqual(['动物']);
    expect(harness.control.current!.communityHasMore).toBe(false);
  });

  it('appends the next page without losing the current list', async () => {
    const requestApiMock = vi.fn();
    requestApiMock
      .mockResolvedValueOnce({ posts: Array.from({ length: 50 }, (_, index) => post(`first-${index}`, 1)) })
      .mockResolvedValueOnce({ posts: [post('second', 2)] });
    const requestApi = requestApiMock as unknown as CommunityRequestApi;
    const harness = createHarness(requestApi);
    await harness.mount();

    act(() => { harness.control.current!.setCommunitySort('latest'); });
    await act(async () => { await harness.control.current!.loadCommunityPosts(); });
    await act(async () => { await harness.control.current!.loadMoreCommunityPosts(); });

    expect(requestApi).toHaveBeenLastCalledWith('/community/posts?sort=latest&page=2&pageSize=50', { headers: { authorization: 'Bearer token-1' } }, 'token-1');
    expect(harness.control.current!.communityPosts).toHaveLength(51);
    expect(harness.control.current!.communityPosts.at(-1)?.id).toBe('second');
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
});
