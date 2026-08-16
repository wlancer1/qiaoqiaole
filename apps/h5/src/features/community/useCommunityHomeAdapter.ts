import { useCallback, useMemo } from 'react';
import type { PatternListCard } from '../../shared/h5Types';
import type { CommunityDomainResult } from './useCommunityDomain';
import type { CommunityDiscoveryRoute } from './communityRoute';

type DiscoveryRouteController = {
  value: CommunityDiscoveryRoute;
  setSort: (sort: 'hot' | 'latest') => void;
  setTags: (tags: string[]) => void;
  setQuery: (query: string) => void;
  setPage: (page: number) => void;
};

export function useCommunityHomeAdapter({ domain, navigate, pathname, search, route }: {
  domain: CommunityDomainResult;
  navigate: (to: string) => void;
  pathname: string;
  search: string;
  route: DiscoveryRouteController;
}) {
  const openCommunityPost = useCallback((pattern: PatternListCard) => {
    navigate(`/community/posts/${encodeURIComponent(pattern.id)}?from=${encodeURIComponent(`${pathname}${search}`)}`);
  }, [navigate, pathname, search]);
  const openAuthorProfile = useCallback((pattern: PatternListCard, from: 'discover' | 'detail' | 'following' | 'followers' = 'discover') => {
    if (!pattern.authorId) return;
    const returnTo = from === 'detail' ? `/community/posts/${encodeURIComponent(pattern.id)}` : from === 'following' ? '/following' : from === 'followers' ? '/followers' : `${pathname}${search}`;
    navigate(`/community/users/${encodeURIComponent(pattern.authorId)}?from=${encodeURIComponent(returnTo)}`);
  }, [navigate, pathname, search]);
  const loadMoreCommunityPosts = useCallback(() => {
    if (domain.communityHasMore && !domain.isCommunityLoadingMore) route.setPage(route.value.page + 1);
  }, [domain.communityHasMore, domain.isCommunityLoadingMore, route]);
  return useMemo(() => ({
    patternListCards: domain.communityCards,
    homeTemplateCards: domain.homeTemplateCards,
    openCommunityPost,
    openAuthorProfile,
    communityHasMore: domain.communityHasMore,
    isCommunityLoadingMore: domain.isCommunityLoadingMore,
    loadMoreCommunityPosts,
    notifications: domain.notifications,
    loadNotifications: domain.loadNotifications,
    openNotification: domain.openNotification,
    communitySort: route.value.sort,
    setCommunitySort: route.setSort,
    communityQuery: route.value.query,
    setCommunityQuery: route.setQuery,
    communitySelectedTags: route.value.tags,
    setCommunitySelectedTags: route.setTags,
    communityAvailableTags: domain.communityAvailableTags,
  }), [domain, loadMoreCommunityPosts, openAuthorProfile, openCommunityPost, route]);
}
