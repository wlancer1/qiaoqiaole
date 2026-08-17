import { act, create } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { useCommunityHomeAdapter } from './useCommunityHomeAdapter';

describe('useCommunityHomeAdapter', () => {
  beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  it('opens a discovery card by route id and preserves the current URL as validated return context', async () => {
    const navigate = vi.fn();
    let adapter!: ReturnType<typeof useCommunityHomeAdapter>;
    function Probe() { adapter = useCommunityHomeAdapter({ domain: { communityCards: [], homeTemplateCards: [], communityHasMore: false, isCommunityLoadingMore: false, notifications: [] } as never, navigate, pathname: '/discover', search: '?sort=latest', route: { value: { sort: 'latest', tags: [], page: 1, query: '' }, setSort: vi.fn(), setTags: vi.fn(), setQuery: vi.fn(), setPage: vi.fn() } }); return null; }
    await act(async () => { create(<Probe />); });
    act(() => { adapter.openCommunityPost({ id: 'post 1' } as never); });
    expect(navigate).toHaveBeenCalledWith('/community/posts/post%201?from=%2Fdiscover%3Fsort%3Dlatest');
  });

  it('loads more home templates without navigating away from the home route', async () => {
    const navigate = vi.fn();
    const loadMoreCommunityPosts = vi.fn().mockResolvedValue(undefined);
    let adapter!: ReturnType<typeof useCommunityHomeAdapter>;
    function Probe() {
      adapter = useCommunityHomeAdapter({ domain: { communityCards: [], homeTemplateCards: [], communityHasMore: true, isCommunityLoadingMore: false, loadMoreCommunityPosts, notifications: [] } as never, navigate, pathname: '/', search: '', route: { value: { sort: 'hot', tags: [], page: 1, query: '' }, setSort: vi.fn(), setTags: vi.fn(), setQuery: vi.fn(), setPage: vi.fn() } });
      return null;
    }
    await act(async () => { create(<Probe />); });

    await act(async () => { await adapter.loadMoreHomeTemplates(); });

    expect(loadMoreCommunityPosts).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens my works when the discovery author is the signed-in user', async () => {
    const navigate = vi.fn();
    let adapter!: ReturnType<typeof useCommunityHomeAdapter>;
    function Probe() {
      adapter = useCommunityHomeAdapter({ currentUserId: 'me', domain: { communityCards: [], homeTemplateCards: [], communityHasMore: false, isCommunityLoadingMore: false, notifications: [] } as never, navigate, pathname: '/discover', search: '', route: { value: { sort: 'hot', tags: [], page: 1, query: '' }, setSort: vi.fn(), setTags: vi.fn(), setQuery: vi.fn(), setPage: vi.fn() } });
      return null;
    }
    await act(async () => { create(<Probe />); });

    act(() => { adapter.openAuthorProfile({ id: 'post-1', authorId: 'me' } as never); });

    expect(navigate).toHaveBeenCalledWith('/projects');
  });
});
