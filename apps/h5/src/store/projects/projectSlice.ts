import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RecentProject } from '../../shared/h5Types';
import type { ProjectFolder } from '../../projects/projectFolders';
import { createProjectFolderThunk, deleteProjectFolderThunk, moveProjectToFolderThunk } from './projectThunks';

export type ProjectState = {
  projects: RecentProject[];
  folders: ProjectFolder[];
};

type ProjectRootState = { projects: ProjectState };

const initialState: ProjectState = { projects: [], folders: [] };

const projectSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    projectsLoaded: (state, action: PayloadAction<RecentProject[]>) => {
      state.projects = action.payload;
    },
    projectsAppended: (state, action: PayloadAction<RecentProject[]>) => {
      const existingIds = new Set(state.projects.map((project) => project.id));
      for (const project of action.payload) {
        if (existingIds.has(project.id)) {
          state.projects = state.projects.map((current) => current.id === project.id ? project : current);
        } else {
          state.projects.push(project);
          existingIds.add(project.id);
        }
      }
    },
    projectsCleared: (state) => {
      state.projects = [];
      state.folders = [];
    },
    foldersLoaded: (state, action: PayloadAction<ProjectFolder[]>) => {
      state.folders = action.payload;
    },
    projectUpserted: (state, action: PayloadAction<RecentProject>) => {
      state.projects = [action.payload, ...state.projects.filter((item) => item.id !== action.payload.id)];
    },
    projectFolderUpdated: (state, action: PayloadAction<{ id: string; folderId: string | null; updatedAt: string }>) => {
      const project = state.projects.find((item) => item.id === action.payload.id);
      if (project) Object.assign(project, action.payload);
    },
    folderRemoved: (state, action: PayloadAction<{ folderId: string }>) => {
      state.folders = state.folders.filter((folder) => folder.id !== action.payload.folderId);
      state.projects.forEach((project) => {
        if (project.folderId === action.payload.folderId) project.folderId = null;
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createProjectFolderThunk.fulfilled, (state, action) => {
        state.folders.push(action.payload);
      })
      .addCase(moveProjectToFolderThunk.fulfilled, (state, action) => {
        const project = state.projects.find((item) => item.id === action.payload.id);
        if (project) Object.assign(project, action.payload);
      })
      .addCase(deleteProjectFolderThunk.fulfilled, (state, action) => {
        state.folders = state.folders.filter((folder) => folder.id !== action.payload.folderId);
        state.projects.forEach((project) => {
          if (project.folderId === action.payload.folderId) project.folderId = null;
        });
      });
  },
});

export const {
  foldersLoaded,
  folderRemoved,
  projectFolderUpdated,
  projectsCleared,
  projectsAppended,
  projectsLoaded,
  projectUpserted,
} = projectSlice.actions;

export const projectReducer = projectSlice.reducer;
export const selectProjects = (state: ProjectRootState): RecentProject[] => state.projects.projects;
export const selectProjectFolders = (state: ProjectRootState): ProjectFolder[] => state.projects.folders;
export const selectSortedProjects = createSelector([selectProjects], (projects) => (
  [...projects].sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt))
));
export const selectProjectById = (projectId: string) => createSelector([selectProjects], (projects) => (
  projects.find((project) => project.id === projectId) ?? null
));
