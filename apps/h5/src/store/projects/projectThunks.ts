import { createAsyncThunk } from '@reduxjs/toolkit';
import type { ProjectFolder } from '../../projects/projectFolders';

async function request<T>(path: string, token: string, init: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || '请求失败');
  return payload as T;
}

export const createProjectFolderThunk = createAsyncThunk<
  ProjectFolder,
  { name: string; token: string },
  { rejectValue: string }
>('projects/createFolder', async ({ name, token }, api) => {
  try {
    const payload = await request<{ folder: ProjectFolder }>('/project-folders', token, { method: 'POST', body: JSON.stringify({ name }) });
    return payload.folder;
  } catch (error) {
    return api.rejectWithValue(error instanceof Error ? error.message : '新建文件夹失败');
  }
});

export const moveProjectToFolderThunk = createAsyncThunk<
  { id: string; folderId: string | null; updatedAt: string },
  { projectId: string; folderId: string | null; token: string },
  { rejectValue: string }
>('projects/moveToFolder', async ({ projectId, folderId, token }, api) => {
  try {
    const payload = await request<{ project: { id: string; folderId: string | null; updatedAt: string } }>(`/projects/${encodeURIComponent(projectId)}/folder`, token, { method: 'PATCH', body: JSON.stringify({ folderId }) });
    return payload.project;
  } catch (error) {
    return api.rejectWithValue(error instanceof Error ? error.message : '移动作品失败');
  }
});

export const deleteProjectFolderThunk = createAsyncThunk<
  { folderId: string },
  { folderId: string; token: string },
  { rejectValue: string }
>('projects/deleteFolder', async ({ folderId, token }, api) => {
  try {
    await request(`/project-folders/${encodeURIComponent(folderId)}`, token, { method: 'DELETE' });
    return { folderId };
  } catch (error) {
    return api.rejectWithValue(error instanceof Error ? error.message : '删除文件夹失败');
  }
});
