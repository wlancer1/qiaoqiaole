import type { RecentProject } from '../shared/h5Types';
import type { ProjectFolder } from './projectFolders';

export type ProjectFolderCreateOrigin = 'my-works' | 'save' | 'move';

export type ProjectFolderFlowState = {
  folders: ProjectFolder[];
  activeFolderId: string | null | 'all';
  saveFolderId: string | null;
  move: { projectId: string; selectedFolderId: string | null } | null;
};

export function beginProjectFolderMove(state: ProjectFolderFlowState, project: Pick<RecentProject, 'id' | 'folderId'>): ProjectFolderFlowState {
  return { ...state, move: { projectId: project.id, selectedFolderId: project.folderId ?? null } };
}

export function applyCreatedProjectFolder(state: ProjectFolderFlowState, folder: ProjectFolder, origin: ProjectFolderCreateOrigin): ProjectFolderFlowState {
  const folders = [...state.folders, folder];
  if (origin === 'my-works') return { ...state, folders, activeFolderId: folder.id };
  if (origin === 'save') return { ...state, folders, saveFolderId: folder.id };
  return { ...state, folders, move: state.move ? { ...state.move, selectedFolderId: folder.id } : state.move };
}

export function applyMovedProjectFolder<T extends Pick<RecentProject, 'id' | 'folderId' | 'updatedAt'>>(projects: T[], moved: Pick<RecentProject, 'id' | 'folderId' | 'updatedAt'>): T[] {
  return projects.map((project) => project.id === moved.id ? { ...project, folderId: moved.folderId, updatedAt: moved.updatedAt } : project);
}
