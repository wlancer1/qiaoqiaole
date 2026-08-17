import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { folderRemoved, foldersLoaded, projectFolderUpdated, projectReducer, projectsLoaded, selectProjectById, selectSortedProjects } from './projectSlice';
import { moveProjectToFolderThunk } from './projectThunks';

const project = (id: string, updatedAt: string, folderId: string | null = null) => ({ id, name: id, rows: 1, cols: 1, tone: 'recent', createdAt: updatedAt, updatedAt, canvasData: '', beadList: [], folderId });

describe('projectSlice', () => {
  it('keeps projects sorted through selectors without mutating server order', () => {
    const store = configureStore({ reducer: { projects: projectReducer } });
    store.dispatch(projectsLoaded([project('old', '2026-08-01'), project('new', '2026-08-04')]));
    expect(selectSortedProjects(store.getState()).map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('updates project folders and uncategorizes projects when a folder is removed', () => {
    const store = configureStore({ reducer: { projects: projectReducer } });
    store.dispatch(projectsLoaded([project('one', '2026-08-01', 'folder-1')]));
    store.dispatch(foldersLoaded([{ id: 'folder-1', name: '收藏', createdAt: '2026-08-01', updatedAt: '2026-08-01' }]));
    store.dispatch(projectFolderUpdated({ id: 'one', folderId: 'folder-1', updatedAt: '2026-08-02' }));
    store.dispatch(folderRemoved({ folderId: 'folder-1' }));
    expect(selectProjectById('one')(store.getState())?.folderId).toBeNull();
    expect(store.getState().projects.folders).toEqual([]);
  });

  it('updates source and destination folder counts after moving a project', () => {
    const store = configureStore({ reducer: { projects: projectReducer } });
    store.dispatch(projectsLoaded([project('one', '2026-08-01', 'source')]));
    store.dispatch(foldersLoaded([
      { id: 'source', name: '来源', createdAt: '2026-08-01', updatedAt: '2026-08-01', projectCount: 1 },
      { id: 'destination', name: '目标', createdAt: '2026-08-01', updatedAt: '2026-08-01', projectCount: 0 },
    ]));

    store.dispatch(moveProjectToFolderThunk.fulfilled(
      { id: 'one', folderId: 'destination', updatedAt: '2026-08-02' },
      'request',
      { projectId: 'one', folderId: 'destination', token: 'token' },
    ));

    expect(store.getState().projects.folders.map((folder) => [folder.id, folder.projectCount])).toEqual([
      ['source', 0],
      ['destination', 1],
    ]);
  });
});
