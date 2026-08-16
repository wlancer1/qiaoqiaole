import type { RecentProject } from '../shared/h5Types';
import type { ProjectFolder } from './projectFolders';

export type ProjectApiRequest = <T>(path: string, options?: RequestInit, token?: string | null) => Promise<T>;

export type ProjectPage = {
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number;
};

export function getProjectFolders(request: ProjectApiRequest, token: string): Promise<{ folders: ProjectFolder[] }> {
  return request('/project-folders', {}, token);
}

export function getRecentProjects(request: ProjectApiRequest, token: string, pagination?: { page: number; pageSize: number; folderId?: string | 'all' }): Promise<{ projects: RecentProject[] } & ProjectPage> {
  const params = new URLSearchParams();
  if (pagination?.folderId && pagination.folderId !== 'all') params.set('folder', pagination.folderId);
  if (pagination) {
    params.set('page', String(pagination.page));
    params.set('pageSize', String(pagination.pageSize));
  }
  const search = params.toString();
  const query = search ? `?${search}` : '';
  return request(`/projects${query}`, {}, token);
}

export function createProjectFolder(request: ProjectApiRequest, name: string, token: string): Promise<{ folder: ProjectFolder }> {
  return request('/project-folders', { method: 'POST', body: JSON.stringify({ name }) }, token);
}

export function moveProjectToFolder(request: ProjectApiRequest, projectId: string, folderId: string | null, token: string): Promise<{ project: { id: string; folderId: string | null; updatedAt: string } }> {
  return request(`/projects/${encodeURIComponent(projectId)}/folder`, { method: 'PATCH', body: JSON.stringify({ folderId }) }, token);
}

export function deleteProjectFolder(request: ProjectApiRequest, folderId: string, token: string): Promise<void> {
  return request(`/project-folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' }, token);
}
