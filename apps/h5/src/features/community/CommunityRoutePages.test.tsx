import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CommunityRoutePages } from './CommunityRoutePages';

describe('CommunityRoutePages', () => {
  it('renders a direct detail route from route-loaded data without a parent active pattern', () => {
    const markup = renderToStaticMarkup(createElement(CommunityRoutePages, {
      screen: 'pattern-detail',
      detailPost: { id: 'route-post', name: '路由稿件', author: '作者', rows: 2, cols: 2, tone: 'recent-flower', likesCount: 0, commentsCount: 0, likedByMe: false, sharedAt: '' },
      detailLoading: false,
      domain: { communityComments: [], isCommunityCommentsLoading: false, commentSubmitting: false, commentReplyPendingId: '', commentDeletePendingId: '', loadCommunityComments: vi.fn(), likeCommunityPost: vi.fn(), toggleCommunityFollow: vi.fn(), addCommunityComment: vi.fn(), deleteCommunityComment: vi.fn() } as never,
      currentUserId: '', isLoggedIn: false, onLogin: vi.fn(), onShare: vi.fn(), onCopy: vi.fn(), copyingProjectId: '',
      navigate: vi.fn(), locationSearch: '', locationPath: '/community/posts/route-post',
    }));
    expect(markup).toContain('路由稿件');
  });

  it('renders an author route and its posts from feature-owned route data', () => {
    const markup = renderToStaticMarkup(createElement(CommunityRoutePages, {
      screen: 'author-profile', detailPost: null, detailLoading: false,
      domain: {
        authorProfile: { id: 'author-1', name: '作者甲', avatarUrl: '', postsCount: 1, likesCount: 0, followersCount: 0, isFollowing: false },
        authorProfilePosts: [], isAuthorProfileLoading: false, isAuthorProfileLoadingMore: false, authorProfileHasMore: false, authorProfileError: '',
        loadMoreAuthorProfile: vi.fn(), loadAuthorProfile: vi.fn(), toggleCommunityFollow: vi.fn(),
      } as never,
      currentUserId: '', isLoggedIn: false, onLogin: vi.fn(), onShare: vi.fn(), onCopy: vi.fn(), copyingProjectId: '', navigate: vi.fn(), locationSearch: '', locationPath: '/community/users/author-1',
    }));
    expect(markup).toContain('作者甲');
  });
});
