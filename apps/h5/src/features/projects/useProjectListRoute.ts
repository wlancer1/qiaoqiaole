import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseProjectListRoute, projectListPath, type ProjectListRoute } from './projectRoute';

export type ProjectListRouteResult = {
  route: ProjectListRoute;
  selectFolder: (folderId: string | null | 'all') => void;
  selectTab: (tab: ProjectListRoute['tab']) => void;
  loadMore: () => void;
  loadPrevious: () => void;
};

export function useProjectListRoute({
  token,
  enabled,
  hasMore,
  loading,
  loadPage,
}: {
  token: string;
  enabled: boolean;
  hasMore: boolean;
  loading: boolean;
  loadPage: (token: string, route: ProjectListRoute, options: { preserveOnError: boolean }) => Promise<unknown>;
}): ProjectListRouteResult {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseProjectListRoute(location.search);
  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;

  useEffect(() => {
    if (!enabled || route.tab !== 'works' || !token) return;
    void loadPageRef.current(token, route, { preserveOnError: true });
  }, [enabled, route.folderId, route.page, route.tab, token]);

  useEffect(() => {
    if (!enabled || route.tab !== 'works' || !token || typeof window === 'undefined') return undefined;
    const refreshRestoredPage = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      void loadPageRef.current(token, route, { preserveOnError: true });
    };
    window.addEventListener('pageshow', refreshRestoredPage);
    return () => window.removeEventListener('pageshow', refreshRestoredPage);
  }, [enabled, route.folderId, route.page, route.tab, token]);

  const selectFolder = (folderId: string | null | 'all') => {
    navigate(projectListPath({ folderId: folderId || 'all', page: 1, tab: 'works' }));
  };
  const selectTab = (tab: ProjectListRoute['tab']) => {
    navigate(projectListPath({ folderId: tab === 'likes' ? 'all' : route.folderId, page: 1, tab }));
  };
  const loadMore = () => {
    if (!hasMore || loading) return;
    navigate(projectListPath({ folderId: route.folderId, page: route.page + 1, tab: 'works' }));
  };
  const loadPrevious = () => {
    if (route.page > 1) navigate(projectListPath({ folderId: route.folderId, page: route.page - 1, tab: 'works' }));
  };

  return { route, selectFolder, selectTab, loadMore, loadPrevious };
}
