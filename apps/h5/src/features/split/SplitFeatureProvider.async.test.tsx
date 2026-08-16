import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SplitFeatureProvider, useSplitFeature } from './SplitFeatureProvider';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

describe('SplitFeatureProvider async ownership', () => {
  it('drops a late Xiaohongshu extract result after the owning route changes', async () => {
    const response = deferred<{ imageDataUrl: string; title: string }>();
    const requestApi = vi.fn(() => response.promise);
    const setStatus = vi.fn();
    let split!: ReturnType<typeof useSplitFeature>;
    let navigate!: ReturnType<typeof useNavigate>;
    function Probe() { split = useSplitFeature(); navigate = useNavigate(); return null; }
    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(<MemoryRouter initialEntries={['/']}><SplitFeatureProvider setStatus={setStatus} requestApi={requestApi as never} isLoggedIn token="token-a" onImport={() => undefined}><Probe /></SplitFeatureProvider></MemoryRouter>);
    });
    await act(async () => { split.openUpload(); split.setShowXhsInput(true); split.setXhsLink('https://www.xiaohongshu.com/explore/a'); });
    void split.extractXiaohongshuImage();
    await act(async () => { navigate('/projects'); });
    await act(async () => { response.resolve({ imageDataUrl: 'data:image/png;base64,a', title: 'late' }); });
    expect(split.showXhsImagePicker).toBe(false);
    expect(split.xhsExtractedImages).toEqual([]);
    expect(setStatus).not.toHaveBeenCalled();
    view.unmount();
  });

  it('drops a late Xiaohongshu image import fetch after the owning route changes', async () => {
    const response = deferred<{ imageDataUrl: string }>();
    const requestApi = vi.fn(() => response.promise);
    const setStatus = vi.fn();
    let split!: ReturnType<typeof useSplitFeature>;
    let navigate!: ReturnType<typeof useNavigate>;
    function Probe() { split = useSplitFeature(); navigate = useNavigate(); return null; }
    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(<MemoryRouter initialEntries={['/']}><SplitFeatureProvider setStatus={setStatus} requestApi={requestApi as never} isLoggedIn token="token-a" onImport={() => undefined}><Probe /></SplitFeatureProvider></MemoryRouter>);
    });
    await act(async () => { split.openUpload(); });
    void split.importXhsImage({ imageUrl: 'https://image.example/a.png' });
    await act(async () => { navigate('/canvas'); });
    await act(async () => { response.resolve({ imageDataUrl: 'data:image/png;base64,a' }); });
    expect(split.showXhsImagePicker).toBe(false);
    expect(setStatus).not.toHaveBeenCalled();
    view.unmount();
  });

  it('drops a late Xiaohongshu extract result after the login token changes', async () => {
    const response = deferred<{ imageDataUrl: string }>();
    const requestApi = vi.fn(() => response.promise);
    const setStatus = vi.fn();
    let split!: ReturnType<typeof useSplitFeature>;
    function Probe() { split = useSplitFeature(); return null; }
    const tree = (token: string) => <MemoryRouter initialEntries={['/']}><SplitFeatureProvider setStatus={setStatus} requestApi={requestApi as never} isLoggedIn token={token} onImport={() => undefined}><Probe /></SplitFeatureProvider></MemoryRouter>;
    let view!: ReactTestRenderer;
    await act(async () => { view = create(tree('token-a')); });
    await act(async () => { split.openUpload(); split.setShowXhsInput(true); split.setXhsLink('https://www.xiaohongshu.com/explore/a'); });
    void split.extractXiaohongshuImage();
    await act(async () => { view.update(tree('token-b')); });
    await act(async () => { response.resolve({ imageDataUrl: 'data:image/png;base64,a' }); });
    expect(setStatus).not.toHaveBeenCalled();
    expect(split.showXhsImagePicker).toBe(false);
    view.unmount();
  });
});
