import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { communityDiscoveryRoute, communityDiscoverySearch, type CommunityDiscoveryRoute } from './communityRoute';

export function useCommunityDiscoveryRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const value = useMemo(() => communityDiscoveryRoute(location.search), [location.search]);
  const update = useCallback((next: CommunityDiscoveryRoute) => {
    navigate({ pathname: '/discover', search: communityDiscoverySearch(next) });
  }, [navigate]);
  const setSort = useCallback((sort: CommunityDiscoveryRoute['sort']) => update({ ...value, sort, page: 1 }), [update, value]);
  const setTags = useCallback((tags: string[]) => update({ ...value, tags, page: 1 }), [update, value]);
  const setQuery = useCallback((query: string) => update({ ...value, query, page: 1 }), [update, value]);
  const setPage = useCallback((page: number) => update({ ...value, page: Math.max(1, Math.floor(page) || 1) }), [update, value]);
  return { value, setSort, setTags, setQuery, setPage };
}
