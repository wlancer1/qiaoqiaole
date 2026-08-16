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
});
