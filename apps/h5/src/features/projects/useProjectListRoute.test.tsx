import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useProjectListRoute, type ProjectListRouteResult } from './useProjectListRoute';

describe('useProjectListRoute', () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  const renderers: ReactTestRenderer[] = [];
  afterEach(() => {
    for (const renderer of renderers) act(() => renderer.unmount());
    renderers.length = 0;
    vi.unstubAllGlobals();
  });

  it('loads its validated deep-link page and changes folders through router navigation', async () => {
    const loadPage = vi.fn().mockResolvedValue(undefined);
    const control = { current: null as ProjectListRouteResult | null };
    function Probe() {
      control.current = useProjectListRoute({ token: 'token', enabled: true, hasMore: true, loading: false, loadPage });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<MemoryRouter initialEntries={['/projects?folder=folder-1&page=2']}><Probe /></MemoryRouter>);
    });
    renderers.push(renderer);

    expect(loadPage).toHaveBeenCalledWith('token', { folderId: 'folder-1', page: 2 }, { preserveOnError: true });
    act(() => { control.current!.selectFolder('folder-2'); });
    expect(control.current!.route).toEqual({ folderId: 'folder-2', page: 1 });
  });

  it('moves to the next URL page instead of accumulating an unbounded client list', async () => {
    const loadPage = vi.fn().mockResolvedValue(undefined);
    const control = { current: null as ProjectListRouteResult | null };
    function Probe() {
      control.current = useProjectListRoute({ token: 'token', enabled: true, hasMore: true, loading: false, loadPage });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<MemoryRouter initialEntries={['/projects?page=2']}><Probe /></MemoryRouter>); });
    renderers.push(renderer);

    act(() => { control.current!.loadMore(); });
    expect(control.current!.route).toEqual({ folderId: 'all', page: 3 });
  });

  it('refreshes the current page after mobile Safari restores it from the page cache', async () => {
    const listeners = new Map<string, (event: { persisted?: boolean }) => void>();
    vi.stubGlobal('window', {
      addEventListener: (name: string, listener: (event: { persisted?: boolean }) => void) => listeners.set(name, listener),
      removeEventListener: (name: string) => listeners.delete(name),
    });
    const loadPage = vi.fn().mockResolvedValue(undefined);
    function Probe() {
      useProjectListRoute({ token: 'token', enabled: true, hasMore: false, loading: false, loadPage });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<MemoryRouter initialEntries={['/projects?page=2']}><Probe /></MemoryRouter>); });
    renderers.push(renderer);
    loadPage.mockClear();

    await act(async () => { listeners.get('pageshow')?.({ persisted: true }); });

    expect(loadPage).toHaveBeenCalledWith('token', { folderId: 'all', page: 2 }, { preserveOnError: true });
  });
});
