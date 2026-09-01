import { useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RecentProject } from '../../shared/h5Types';
import { getProjectFolders, getRecentProjects } from '../../projects/projectApi';
import type { ProjectFolder } from '../../projects/projectFolders';
import type { ProjectListRoute } from './projectRoute';
import { foldersLoaded, projectsAppended, projectsLoaded, selectProjectFolders, selectProjects } from '../../store/projects/projectSlice';

export type ProjectRequestApi = <T>(path: string, options?: RequestInit, token?: string | null) => Promise<T>;

export type ProjectListDomainOptions = {
  requestApi: ProjectRequestApi;
  setStatus: (message: string) => void;
  pageSize?: number;
};

export type ProjectListDomainResult = {
  projects: RecentProject[];
  allProjects: RecentProject[];
  folders: ProjectFolder[];
  likedProjects: RecentProject[];
  likedLoading: boolean;
  page: number;
  hasMore: boolean;
  total: number;
  overallTotal: number;
  loading: boolean;
  loadPage: (token: string, route: ProjectListRoute, options?: { preserveOnError?: boolean }) => Promise<void>;
  loadFolders: (token: string) => Promise<void>;
  loadLiked: (token: string) => Promise<void>;
};

const defaultPageSize = 12;

export function useProjectListDomain({ requestApi, setStatus, pageSize = defaultPageSize }: ProjectListDomainOptions): ProjectListDomainResult {
  const dispatch = useDispatch();
  const allProjects = useSelector(selectProjects as (state: { projects: { projects: RecentProject[]; folders: ProjectFolder[] } }) => RecentProject[]);
  const folders = useSelector(selectProjectFolders as (state: { projects: { projects: RecentProject[]; folders: ProjectFolder[] } }) => ProjectFolder[]);
  const [page, setPage] = useState(1);
  const [folderId, setFolderId] = useState<ProjectListRoute['folderId']>('all');
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [overallTotal, setOverallTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [likedProjects, setLikedProjects] = useState<RecentProject[]>([]);
  const [likedLoading, setLikedLoading] = useState(false);
  const requestSequence = useRef(0);
  const overallTotalToken = useRef('');

  const projects = useMemo(() => {
    const sorted = [...allProjects].sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
    return sorted;
  }, [allProjects, folderId]);

  const loadFolders = async (token: string) => {
    try {
      const payload = await getProjectFolders(requestApi, token);
      dispatch(foldersLoaded(Array.isArray(payload.folders) ? payload.folders : []));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '文件夹读取失败');
    }
  };

  const loadPage = async (token: string, route: ProjectListRoute, { preserveOnError = false } = {}) => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setLoading(true);
    try {
      const payload = await getRecentProjects(requestApi, token, { page: route.page, pageSize, folderId: route.folderId });
      if (requestSequence.current !== sequence) return;
      const nextProjects = Array.isArray(payload.projects) ? payload.projects : [];
      const appendPage = route.page > page && route.folderId === folderId && allProjects.length > 0;
      dispatch(appendPage ? projectsAppended(nextProjects) : projectsLoaded(nextProjects));
      setPage(payload.page || route.page);
      setFolderId(route.folderId);
      setHasMore(Boolean(payload.hasMore));
      const nextTotal = Number(payload.total) || 0;
      setTotal(nextTotal);
      if (route.folderId === 'all') {
        overallTotalToken.current = token;
        setOverallTotal(nextTotal);
      } else if (overallTotalToken.current !== token) {
        // Never show another account's cached total while bootstrapping a
        // direct folder route for the newly authenticated account.
        setOverallTotal(0);
        // The folder list endpoint reports the selected folder total. The H5
        // "我的创作" summary is an account-wide statistic and must not change
        // when the user switches folders, so bootstrap the all-project count
        // once when entering a folder route directly.
        try {
          const allPayload = await getRecentProjects(requestApi, token, { page: 1, pageSize: 1, folderId: 'all' });
          if (requestSequence.current === sequence) {
            overallTotalToken.current = token;
            setOverallTotal(Number(allPayload.total) || 0);
          }
        } catch {
          // Keep the last known account total; folder filtering itself still
          // succeeded and should remain usable.
        }
      }
      void loadFolders(token);
    } catch (error) {
      if (requestSequence.current !== sequence) return;
      if (!preserveOnError) {
        dispatch(projectsLoaded([]));
        setHasMore(false);
        setTotal(0);
      }
      setStatus(error instanceof Error ? error.message : '最近项目读取失败');
    } finally {
      if (requestSequence.current === sequence) setLoading(false);
    }
  };

  const loadLiked = async (token: string) => {
    setLikedLoading(true);
    try {
      const payload = await requestApi<{ projects?: RecentProject[] }>('/projects/liked?page=1&pageSize=50', {}, token);
      setLikedProjects(Array.isArray(payload.projects) ? payload.projects : []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '喜欢的作品读取失败');
      setLikedProjects([]);
    } finally {
      setLikedLoading(false);
    }
  };

  return { projects, allProjects, folders, likedProjects, likedLoading, page, hasMore, total, overallTotal, loading, loadPage, loadFolders, loadLiked };
}
