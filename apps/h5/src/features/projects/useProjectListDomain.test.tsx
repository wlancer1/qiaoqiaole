import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecentProject } from '../../shared/h5Types';
import { useProjectListDomain, type ProjectListDomainResult, type ProjectRequestApi } from './useProjectListDomain';
import { projectReducer } from '../../store/projects/projectSlice';

function project(id: string, updatedAt: string, folderId: string | null = null): RecentProject {
  return { id, name: id, rows: 10, cols: 10, tone: 'recent-flower', createdAt: updatedAt, updatedAt, folderId };
}

describe('useProjectListDomain', () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  const renderers: ReactTestRenderer[] = [];
  afterEach(() => {
    for (const renderer of renderers) act(() => renderer.unmount());
    renderers.length = 0;
  });

  it('loads only the requested page and filters its current-page summaries by folder', async () => {
    const requestApi = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/projects?folder=folder-1&page=2&pageSize=20') {
        return { projects: [project('chosen', '2026-08-02', 'folder-1')], page: 2, pageSize: 20, hasMore: true };
      }
      return { folders: [{ id: 'folder-1', name: '收藏' }] };
    }) as unknown as ProjectRequestApi;
    const control = { current: null as ProjectListDomainResult | null };
    const store = configureStore({ reducer: { projects: projectReducer } });
    function Probe() {
      control.current = useProjectListDomain({ requestApi, setStatus: vi.fn() });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Provider store={store}><Probe /></Provider>); });
    renderers.push(renderer);

    await act(async () => { await control.current!.loadPage('token', { page: 2, folderId: 'folder-1' }); });

    expect(requestApi).toHaveBeenCalledWith('/projects?folder=folder-1&page=2&pageSize=20', {}, 'token');
    expect(requestApi).toHaveBeenCalledWith('/project-folders', {}, 'token');
    expect(control.current!.projects.map((item) => item.id)).toEqual(['chosen']);
    expect(control.current!.page).toBe(2);
    expect(control.current!.hasMore).toBe(true);
    expect(store.getState().projects.projects.map((item) => item.id)).toEqual(['chosen']);
  });

  it('rejects a stale response after a newer route page is requested', async () => {
    let resolveOld!: (value: unknown) => void;
    let resolveNew!: (value: unknown) => void;
    const requestApi = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; })) as unknown as ProjectRequestApi;
    const control = { current: null as ProjectListDomainResult | null };
    const store = configureStore({ reducer: { projects: projectReducer } });
    function Probe() {
      control.current = useProjectListDomain({ requestApi, setStatus: vi.fn() });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Provider store={store}><Probe /></Provider>); });
    renderers.push(renderer);

    let oldLoad!: Promise<void>;
    let newLoad!: Promise<void>;
    act(() => { oldLoad = control.current!.loadPage('token', { page: 1, folderId: 'all' }); });
    act(() => { newLoad = control.current!.loadPage('token', { page: 2, folderId: 'all' }); });
    await act(async () => { resolveNew({ projects: [project('new', '2026-08-02')], page: 2, pageSize: 20, hasMore: false }); await newLoad; });
    await act(async () => { resolveOld({ projects: [project('old', '2026-08-01')], page: 1, pageSize: 20, hasMore: true }); await oldLoad; });

    expect(control.current!.projects.map((item) => item.id)).toEqual(['new']);
    expect(control.current!.page).toBe(2);
    expect(store.getState().projects.projects.map((item) => item.id)).toEqual(['new']);
  });
});
