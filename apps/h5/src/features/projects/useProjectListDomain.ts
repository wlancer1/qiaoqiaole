import { useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RecentProject } from '../../shared/h5Types';
import { getProjectFolders, getRecentProjects } from '../../projects/projectApi';
import type { ProjectFolder } from '../../projects/projectFolders';
import type { ProjectListRoute } from './projectRoute';
import { foldersLoaded, projectsLoaded, selectProjectFolders, selectProjects } from '../../store/projects/projectSlice';

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
  loading: boolean;
  loadPage: (token: string, route: ProjectListRoute, options?: { preserveOnError?: boolean }) => Promise<void>;
  loadFolders: (token: string) => Promise<void>;
  loadLiked: (token: string) => Promise<void>;
};

const defaultPageSize = 20;

export function useProjectListDomain({ requestApi, setStatus, pageSize = defaultPageSize }: ProjectListDomainOptions): ProjectListDomainResult {
  const dispatch = useDispatch();
  const allProjects = useSelector(selectProjects as (state: { projects: { projects: RecentProject[]; folders: ProjectFolder[] } }) => RecentProject[]);
  const folders = useSelector(selectProjectFolders as (state: { projects: { projects: RecentProject[]; folders: ProjectFolder[] } }) => ProjectFolder[]);
  const [page, setPage] = useState(1);
  const [folderId, setFolderId] = useState<ProjectListRoute['folderId']>('all');
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [likedProjects, setLikedProjects] = useState<RecentProject[]>([]);
  const [likedLoading, setLikedLoading] = useState(false);
  const requestSequence = useRef(0);

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
      dispatch(projectsLoaded(Array.isArray(payload.projects) ? payload.projects : []));
      setPage(payload.page || route.page);
      setFolderId(route.folderId);
      setHasMore(Boolean(payload.hasMore));
      setTotal(Number(payload.total) || 0);
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

  return { projects, allProjects, folders, likedProjects, likedLoading, page, hasMore, total, loading, loadPage, loadFolders, loadLiked };
}
