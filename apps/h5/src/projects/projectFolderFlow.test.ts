import { describe, expect, it } from 'vitest';
import { applyCreatedProjectFolder, applyMovedProjectFolder, beginProjectFolderMove, type ProjectFolderFlowState } from './projectFolderFlow';

const folder = { id: 'folder-new', name: '新文件夹', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' };
const project = { id: 'project-1', name: '小熊', folderId: null, updatedAt: 'old' };

describe('project folder flow', () => {
  it('selects a newly created folder according to its origin', () => {
    const base: ProjectFolderFlowState = { folders: [], activeFolderId: 'all', saveFolderId: 'folder-old', move: null };

    expect(applyCreatedProjectFolder(base, folder, 'my-works')).toMatchObject({ activeFolderId: 'folder-new', saveFolderId: 'folder-old', move: null });
    expect(applyCreatedProjectFolder(base, folder, 'save')).toMatchObject({ activeFolderId: 'all', saveFolderId: 'folder-new', move: null });
    expect(applyCreatedProjectFolder(beginProjectFolderMove(base, project), folder, 'move')).toMatchObject({ move: { projectId: 'project-1', selectedFolderId: 'folder-new' } });
  });

  it('opens a move flow without changing the project and applies the server result only on success', () => {
    const base: ProjectFolderFlowState = { folders: [], activeFolderId: 'all', saveFolderId: null, move: null };
    const moving = beginProjectFolderMove(base, project);
    expect(moving.move).toEqual({ projectId: 'project-1', selectedFolderId: null });
    expect(applyMovedProjectFolder([project], { id: 'project-1', folderId: 'folder-new', updatedAt: 'new' })).toEqual([{ ...project, folderId: 'folder-new', updatedAt: 'new' }]);
  });
});
