import { describe, expect, it, vi } from 'vitest';
import type { RecentProject } from '../shared/h5Types';
import { getRecentProjects, type ProjectApiRequest } from './projectApi';
import { projectReducer, projectsAppended } from '../store/projects/projectSlice';

const project = (id: string): RecentProject => ({
  id,
  name: id,
  rows: 1,
  cols: 1,
  tone: 'recent-flower',
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
  canvasData: '',
});

describe('project pagination', () => {
  it('requests a bounded project page and exposes pagination metadata', async () => {
    const request = vi.fn().mockResolvedValue({ projects: [project('one')], page: 2, pageSize: 20, hasMore: true }) as unknown as ProjectApiRequest;

    const response = await getRecentProjects(request, 'token', { page: 2, pageSize: 20 });

    expect(request).toHaveBeenCalledWith('/projects?page=2&pageSize=20', {}, 'token');
    expect(response.hasMore).toBe(true);
  });

  it('appends the next page without duplicating an existing project', () => {
    const state = projectReducer({ projects: [project('one')], folders: [] }, projectsAppended([project('one'), project('two')]));

    expect(state.projects.map((item) => item.id)).toEqual(['one', 'two']);
  });
});
