import { Provider } from 'react-redux';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../../store/store';
import { AppOverlayHost } from '../../app/overlays/AppOverlayHost';
import { AppOverlayProvider } from '../../app/overlays/AppOverlayContext';
import { useProjectActionOverlay, type ProjectActionOverlayController } from './useProjectActionOverlay';

const project = { id: 'project-1', name: '小熊', rows: 2, cols: 2, tone: 'recent', createdAt: '', updatedAt: '' };

describe('useProjectActionOverlay', () => {
  beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  const renderers: ReactTestRenderer[] = [];
  afterEach(() => { for (const renderer of renderers) act(() => renderer.unmount()); renderers.length = 0; });

  it('mounts the project action sheet under the durable host and clears it on close', async () => {
    const store = createH5Store({ storage: undefined });
    const control = { current: null as ProjectActionOverlayController | null };
    function Probe() {
      control.current = useProjectActionOverlay({
        actions: { shareProject: null, shareTags: [], sharingProjectId: '', openShare: vi.fn(), closeShare: vi.fn(), setShareTags: vi.fn(), confirmShare: vi.fn(), requestDelete: vi.fn() },
        hasSession: () => false, onStart: vi.fn(), onEdit: vi.fn(), onMove: vi.fn(), onShareCommitted: vi.fn(),
      });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Provider store={store}><MemoryRouter><AppOverlayProvider><Probe /><AppOverlayHost /></AppOverlayProvider></MemoryRouter></Provider>); });
    renderers.push(renderer);
    act(() => control.current!.open(project));
    expect(renderer.root.findByProps({ 'data-overlay-slot': 'projectAction' }).findByProps({ 'aria-label': '作品操作' })).toBeTruthy();
    act(() => renderer.root.findByProps({ 'aria-label': '关闭作品操作' }).props.onClick());
    expect(renderer.root.findAllByProps({ 'data-overlay-slot': 'projectAction' })).toHaveLength(0);
  });
});
