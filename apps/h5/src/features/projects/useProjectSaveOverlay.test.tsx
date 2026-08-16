import { Provider } from 'react-redux';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../../store/store';
import { AppOverlayHost } from '../../app/overlays/AppOverlayHost';
import { AppOverlayProvider } from '../../app/overlays/AppOverlayContext';
import { useProjectSaveOverlay, type ProjectSaveOverlayController } from './useProjectSaveOverlay';

describe('useProjectSaveOverlay', () => {
  beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  const renderers: ReactTestRenderer[] = [];
  afterEach(() => { for (const renderer of renderers) act(() => renderer.unmount()); renderers.length = 0; });

  it('mounts save and login-prompt dialogs under the application host and deduplicates pending save', async () => {
    let resolveSave!: () => void;
    const persist = vi.fn(() => new Promise<boolean>((resolve) => { resolveSave = () => resolve(true); }));
    const store = createH5Store({ storage: undefined });
    const control = { current: null as ProjectSaveOverlayController | null };
    function Probe() {
      control.current = useProjectSaveOverlay({
        token: 'token', initialName: () => '作品', initialShared: () => false, folders: [], folderId: null, onFolderChange: vi.fn(), onCreateFolder: vi.fn(),
        requireLogin: (next) => next('token'), persist,
      });
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Provider store={store}><MemoryRouter><AppOverlayProvider><Probe /><AppOverlayHost /></AppOverlayProvider></MemoryRouter></Provider>); });
    renderers.push(renderer);
    act(() => control.current!.open());
    const host = renderer.root.findByProps({ 'data-testid': 'h5-app-overlay-host' });
    expect(host.findByProps({ 'data-overlay-slot': 'save' }).findByProps({ role: 'dialog' })).toBeTruthy();
    const confirm = renderer.root.findByProps({ 'aria-label': '保存到作品' });
    act(() => { confirm.props.onClick(); confirm.props.onClick(); });
    expect(persist).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSave(); await Promise.resolve(); });
    expect(renderer.root.findAllByProps({ 'data-overlay-slot': 'save' })).toHaveLength(0);
  });
});
