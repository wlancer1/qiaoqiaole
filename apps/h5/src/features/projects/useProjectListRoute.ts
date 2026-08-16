import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseProjectListRoute, projectListPath, type ProjectListRoute } from './projectRoute';

export type ProjectListRouteResult = {
  route: ProjectListRoute;
  selectFolder: (folderId: string | null | 'all') => void;
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
    if (!enabled || !token) return;
    void loadPageRef.current(token, route, { preserveOnError: true });
  }, [enabled, route.folderId, route.page, token]);

  const selectFolder = (folderId: string | null | 'all') => {
    navigate(projectListPath({ folderId: folderId || 'all', page: 1 }));
  };
  const loadMore = () => {
    if (!hasMore || loading) return;
    navigate(projectListPath({ folderId: route.folderId, page: route.page + 1 }));
  };
  const loadPrevious = () => {
    if (route.page > 1) navigate(projectListPath({ folderId: route.folderId, page: route.page - 1 }));
  };

  return { route, selectFolder, loadMore, loadPrevious };
}
