import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./CommunityFeatureProvider', () => ({
  useCommunityFeature: () => ({
    domain: {
      communityComments: [], isCommunityCommentsLoading: false, commentSubmitting: false,
      commentReplyPendingId: '', commentDeletePendingId: '', loadCommunityComments: vi.fn(),
      likeCommunityPost: vi.fn(), toggleCommunityFollow: vi.fn(), addCommunityComment: vi.fn(), deleteCommunityComment: vi.fn(),
    },
    discovery: { value: { sort: 'hot', query: '', tags: [], page: 1 }, setSort: vi.fn(), setQuery: vi.fn(), setTags: vi.fn(), setPage: vi.fn() },
    detail: { post: { id: 'deep-link', name: '深链接作品', author: '作者', rows: 2, cols: 2, tone: 'recent-flower', likesCount: 0, commentsCount: 0, likedByMe: false, sharedAt: '' }, loading: false, setLikeState: vi.fn() },
    actions: { requestLogin: vi.fn(), sharePost: vi.fn(), copyPost: vi.fn(), copyingPostId: '' },
  }),
}));

vi.mock('../../store/hooks', () => ({ useAppSelector: () => '' }));

import { CommunityFeatureContent } from './CommunityFeatureContent';

describe('CommunityFeatureContent', () => {
  it('mounts a direct post route from feature-owned detail data instead of a legacy page callback', () => {
    const markup = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community/posts/deep-link'] }, createElement(CommunityFeatureContent, {
      fallback: createElement('div', null, 'legacy fallback'),
    })));

    expect(markup).toContain('深链接作品');
    expect(markup).not.toContain('legacy fallback');
  });
});
