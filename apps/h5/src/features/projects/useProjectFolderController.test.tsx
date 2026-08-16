import { Provider } from 'react-redux';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { createH5Store } from '../../store/store';
import { AppOverlayHost } from '../../app/overlays/AppOverlayHost';
import { AppOverlayProvider } from '../../app/overlays/AppOverlayContext';
import { useProjectFolderController, type ProjectFolderController } from './useProjectFolderController';

describe('useProjectFolderController', () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  const renderers: ReactTestRenderer[] = [];
  afterEach(() => {
    for (const renderer of renderers) act(() => renderer.unmount());
    renderers.length = 0;
  });

  it('mounts the create sheet in the durable overlay and restores its command state on cancel', async () => {
    const store = createH5Store({ storage: undefined });
    const control = { current: null as ProjectFolderController | null };
    function Probe() {
      control.current = useProjectFolderController({
        token: 'token', activeFolderId: 'all', onActiveFolderChange: vi.fn(), requireLogin: (action) => action('token'), setStatus: vi.fn(),
      });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<Provider store={store}><MemoryRouter><AppOverlayProvider><Probe /><AppOverlayHost /></AppOverlayProvider></MemoryRouter></Provider>);
    });
    renderers.push(renderer);

    act(() => control.current!.openCreate('my-works'));
    expect(renderer.root.findByProps({ 'data-overlay-slot': 'folder' }).findByProps({ role: 'dialog' }).props['aria-modal']).toBe('true');
    act(() => renderer.root.findByProps({ 'aria-label': '取消新建文件夹' }).props.onClick());
    expect(renderer.root.findAllByProps({ 'data-overlay-slot': 'folder' })).toHaveLength(0);
  });
});
