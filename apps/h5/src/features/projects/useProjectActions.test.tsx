import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecentProject } from '../../shared/h5Types';
import { useProjectActions, type ProjectActionResult } from './useProjectActions';

const savedProject = (id = 'project-1'): RecentProject => ({ id, name: '作品', rows: 2, cols: 2, tone: 'recent', createdAt: '2026-08-01', updatedAt: '2026-08-01' });

describe('useProjectActions', () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  const renderers: ReactTestRenderer[] = [];
  afterEach(() => {
    for (const renderer of renderers) act(() => renderer.unmount());
    renderers.length = 0;
  });

  it('deduplicates a pending save and upserts its result once', async () => {
    let resolveSave!: (value: unknown) => void;
    const requestApi = vi.fn().mockReturnValue(new Promise((resolve) => { resolveSave = resolve; }));
    const onProjectSaved = vi.fn();
    const control = { current: null as ProjectActionResult | null };
    function Probe() {
      control.current = useProjectActions({ requestApi, token: 'token', onProjectSaved, setStatus: vi.fn() });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Probe />); });
    renderers.push(renderer);

    let first!: Promise<RecentProject | null>;
    let second!: Promise<RecentProject | null>;
    act(() => {
      first = control.current!.save({ name: '作品', rows: 2, cols: 2, canvasData: '[]', beadList: [] });
      second = control.current!.save({ name: '作品', rows: 2, cols: 2, canvasData: '[]', beadList: [] });
    });
    expect(requestApi).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSave({ project: savedProject() }); await first; await second; });

    expect(onProjectSaved).toHaveBeenCalledTimes(1);
    expect(onProjectSaved).toHaveBeenCalledWith(savedProject());
  });

  it('retains a share dialog after a failed share and reports the scoped error', async () => {
    const error = new Error('分享服务不可用');
    const requestApi = vi.fn().mockRejectedValue(error);
    const setStatus = vi.fn();
    const control = { current: null as ProjectActionResult | null };
    function Probe() {
      control.current = useProjectActions({ requestApi, token: 'token', onProjectSaved: vi.fn(), setStatus });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Probe />); });
    renderers.push(renderer);

    act(() => { control.current!.openShare(savedProject()); });
    await act(async () => { await control.current!.confirmShare(['动物']); });

    expect(control.current!.shareProject?.id).toBe('project-1');
    expect(setStatus).toHaveBeenCalledWith('分享服务不可用');
  });

  it('requests destructive deletion confirmation before calling the project endpoint', async () => {
    const requestApi = vi.fn().mockResolvedValue({});
    const requestConfirm = vi.fn();
    const control = { current: null as ProjectActionResult | null };
    function Probe() {
      control.current = useProjectActions({ requestApi, token: 'token', onProjectSaved: vi.fn(), onProjectDeleted: vi.fn(), requestConfirm, setStatus: vi.fn() });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Probe />); });
    renderers.push(renderer);

    act(() => { control.current!.requestDelete(savedProject('project/1')); });
    expect(requestApi).not.toHaveBeenCalled();
    expect(requestConfirm).toHaveBeenCalledWith(expect.objectContaining({ title: '删除作品？', danger: true }));
    const confirm = requestConfirm.mock.calls[0][0].onConfirm as () => Promise<void>;
    await act(async () => { await confirm(); });
    expect(requestApi).toHaveBeenCalledWith('/projects/project%2F1', { method: 'DELETE' }, 'token');
  });
});
