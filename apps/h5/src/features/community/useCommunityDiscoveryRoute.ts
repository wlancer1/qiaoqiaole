import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { communityDiscoveryRoute, communityDiscoverySearch, type CommunityDiscoveryRoute } from './communityRoute';

export function useCommunityDiscoveryRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const value = useMemo(() => communityDiscoveryRoute(location.search), [location.search]);
  const valueRef = useRef(value);
  valueRef.current = value;
  const update = useCallback((next: CommunityDiscoveryRoute) => {
    navigate({ pathname: '/discover', search: communityDiscoverySearch(next) });
  }, [navigate]);
  // Load-more can be invoked by an IntersectionObserver created on an earlier
  // render. Read the latest route from a ref so a stale callback can never
  // restore an older sort (for example switching 热门 back to 最新).
  const setSort = useCallback((sort: CommunityDiscoveryRoute['sort']) => update({ ...valueRef.current, sort, page: 1 }), [update]);
  const setTags = useCallback((tags: string[]) => update({ ...valueRef.current, tags, page: 1 }), [update]);
  const setQuery = useCallback((query: string) => update({ ...valueRef.current, query, page: 1 }), [update]);
  const setPage = useCallback((page: number) => update({ ...valueRef.current, page: Math.max(1, Math.floor(page) || 1) }), [update]);
  return { value, setSort, setTags, setQuery, setPage };
}
