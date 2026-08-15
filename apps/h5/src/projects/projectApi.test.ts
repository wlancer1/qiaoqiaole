import { describe, expect, it, vi } from 'vitest';
import { createProjectFolder, deleteProjectFolder, getProjectFolders, getRecentProjects, moveProjectToFolder, type ProjectApiRequest } from './projectApi';

describe('projectApi', () => {
  it('uses the project list and folder endpoints with the current token', async () => {
    const request = vi.fn().mockResolvedValue({}) as unknown as ProjectApiRequest;
    await getRecentProjects(request, 'token');
    await getProjectFolders(request, 'token');
    expect(request).toHaveBeenNthCalledWith(1, '/projects', {}, 'token');
    expect(request).toHaveBeenNthCalledWith(2, '/project-folders', {}, 'token');
  });

  it('keeps folder mutation payloads explicit and URL-encodes identifiers', async () => {
    const request = vi.fn().mockResolvedValue({}) as unknown as ProjectApiRequest;
    await createProjectFolder(request, '我的收藏', 'token');
    await moveProjectToFolder(request, 'project/1', null, 'token');
    await deleteProjectFolder(request, 'folder/1', 'token');
    expect(request).toHaveBeenNthCalledWith(1, '/project-folders', { method: 'POST', body: JSON.stringify({ name: '我的收藏' }) }, 'token');
    expect(request).toHaveBeenNthCalledWith(2, '/projects/project%2F1/folder', { method: 'PATCH', body: JSON.stringify({ folderId: null }) }, 'token');
    expect(request).toHaveBeenNthCalledWith(3, '/project-folders/folder%2F1', { method: 'DELETE' }, 'token');
  });
});
