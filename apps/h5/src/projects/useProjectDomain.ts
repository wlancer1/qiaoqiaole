import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { RecentProject } from '../shared/h5Types';
import type { ProjectFolder } from './projectFolders';
import { getProjectFolders, getRecentProjects } from './projectApi';

export type ProjectRequestApi = <T>(path: string, options?: RequestInit, token?: string | null) => Promise<T>;

export type ProjectDomainOptions = {
  activeProjectId: string;
  authToken: string;
  requestApi: ProjectRequestApi;
  setStatus: (message: string) => void;
};

export type ProjectDomainResult = {
  recentProjects: RecentProject[];
  setRecentProjects: Dispatch<SetStateAction<RecentProject[]>>;
  projectFolders: ProjectFolder[];
  setProjectFolders: Dispatch<SetStateAction<ProjectFolder[]>>;
  sortedRecentProjects: RecentProject[];
  activeSavedProject: RecentProject | null;
  loadProjectFolders: (token: string) => Promise<void>;
  loadRecentProjects: (token: string, options?: { preserveOnError?: boolean }) => Promise<void>;
};

export function useProjectDomain({ activeProjectId, authToken, requestApi, setStatus }: ProjectDomainOptions): ProjectDomainResult {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>([]);
  const recentProjectsRequestSeqRef = useRef(0);

  const sortedRecentProjects = useMemo(
    () => [...recentProjects].sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)),
    [recentProjects],
  );
  const activeSavedProject = useMemo(
    () => recentProjects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, recentProjects],
  );

  const loadProjectFolders = async (token: string) => {
    try {
      const payload = await getProjectFolders(requestApi, token);
      setProjectFolders(payload.folders || []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '文件夹读取失败');
    }
  };

  const loadRecentProjects = async (token: string, { preserveOnError = false } = {}) => {
    const requestSeq = recentProjectsRequestSeqRef.current + 1;
    recentProjectsRequestSeqRef.current = requestSeq;
    try {
      const payload = await getRecentProjects(requestApi, token);
      if (recentProjectsRequestSeqRef.current !== requestSeq) return;
      setRecentProjects(Array.isArray(payload.projects) ? payload.projects : []);
      await loadProjectFolders(token);
    } catch (error) {
      if (recentProjectsRequestSeqRef.current !== requestSeq) return;
      if (!preserveOnError) setRecentProjects([]);
      setStatus(error instanceof Error ? error.message : '最近项目读取失败');
    }
  };

  return {
    recentProjects,
    setRecentProjects,
    projectFolders,
    setProjectFolders,
    sortedRecentProjects,
    activeSavedProject,
    loadProjectFolders,
    loadRecentProjects,
  };
}
