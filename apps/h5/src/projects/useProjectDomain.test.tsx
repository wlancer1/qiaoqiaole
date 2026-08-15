import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useProjectDomain, type ProjectDomainResult, type ProjectRequestApi } from './useProjectDomain';
import type { RecentProject } from '../shared/h5Types';

function project(id: string, updatedAt: string): RecentProject {
  return { id, name: id, rows: 10, cols: 10, tone: 'recent-flower', createdAt: updatedAt, updatedAt, canvasData: '', beadList: [] } as RecentProject;
}

describe('useProjectDomain', () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  const renderers: ReactTestRenderer[] = [];

  afterEach(() => {
    for (const renderer of renderers) act(() => renderer.unmount());
    renderers.length = 0;
  });

  it('loads projects and folders, keeping projects sorted newest first', async () => {
    const requestApi = vi.fn().mockImplementation(async (path: string) => {
      if (path === '/projects') return { projects: [project('old', '2026-08-01'), project('new', '2026-08-04')] };
      return { folders: [{ id: 'folder-1', name: '收藏' }] };
    }) as unknown as ProjectRequestApi;
    const control = { current: null as ProjectDomainResult | null };
    function Probe() {
      control.current = useProjectDomain({ activeProjectId: '', authToken: 'token-1', requestApi, setStatus: vi.fn() });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Probe />); });
    renderers.push(renderer);

    await act(async () => { await control.current!.loadRecentProjects('token-1'); });

    expect(control.current!.sortedRecentProjects.map((item) => item.id)).toEqual(['new', 'old']);
    expect(control.current!.projectFolders).toEqual([{ id: 'folder-1', name: '收藏' }]);
    expect(requestApi).toHaveBeenCalledWith('/projects', {}, 'token-1');
    expect(requestApi).toHaveBeenCalledWith('/project-folders', {}, 'token-1');
  });

  it('ignores an older project response after a newer load starts', async () => {
    let resolveOld!: (value: unknown) => void;
    let resolveNew!: (value: unknown) => void;
    const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
    const newResponse = new Promise((resolve) => { resolveNew = resolve; });
    const requestApiMock = vi.fn()
      .mockReturnValueOnce(oldResponse)
      .mockReturnValueOnce(newResponse);
    const requestApi = requestApiMock as unknown as ProjectRequestApi;
    const control = { current: null as ProjectDomainResult | null };
    function Probe() {
      control.current = useProjectDomain({ activeProjectId: '', authToken: 'token-1', requestApi, setStatus: vi.fn() });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Probe />); });
    renderers.push(renderer);

    let oldLoad!: Promise<void>;
    let newLoad!: Promise<void>;
    act(() => { oldLoad = control.current!.loadRecentProjects('token-1'); });
    act(() => { newLoad = control.current!.loadRecentProjects('token-1'); });
    await act(async () => { resolveNew({ projects: [project('new', '2026-08-04')] }); await newLoad; });
    await act(async () => { resolveOld({ projects: [project('old', '2026-08-01')] }); await oldLoad; });

    expect(control.current!.recentProjects.map((item) => item.id)).toEqual(['new']);
  });
});
