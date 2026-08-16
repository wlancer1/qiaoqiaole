import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const asyncControl = vi.hoisted(() => {
  const resolvers: Array<() => void> = [];
  return {
    wait: () => new Promise<void>((resolve) => resolvers.push(resolve)),
    resolveNext: () => resolvers.shift()?.(),
    reset: () => { resolvers.length = 0; },
  };
});

vi.mock('../../utils/h5AppUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/h5AppUtils')>();
  return { ...actual, imageDataToUrl: vi.fn(() => 'data:image/mock'), yieldToBrowser: vi.fn(asyncControl.wait) };
});

import { useSplitWorkflow } from './useSplitWorkflow';

class TestImageData {
  constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
}

function opaqueImage() {
  return new TestImageData(new Uint8ClampedArray([
    255, 255, 255, 255,
    0, 0, 0, 255,
    255, 0, 0, 255,
    0, 255, 0, 255,
  ]), 2, 2) as unknown as ImageData;
}

describe('useSplitWorkflow background operations', () => {
  const renderers: ReactTestRenderer[] = [];
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as typeof globalThis & { ImageData: typeof ImageData }).ImageData = TestImageData as unknown as typeof ImageData;
  });
  afterEach(() => {
    asyncControl.reset();
    for (const renderer of renderers.splice(0)) act(() => renderer.unmount());
    vi.restoreAllMocks();
  });

  function setup(screen = 'split-preview') {
    const status = vi.fn(); const sourceChange = vi.fn();
    const control = { current: null as ReturnType<typeof useSplitWorkflow> | null };
    function Probe({ route }: { route: string }) {
      control.current = useSplitWorkflow({ screen: route, setStatus: status, onImport: () => undefined, onSourceChange: sourceChange });
      return null;
    }
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<Probe route={screen} />); });
    renderers.push(renderer);
    act(() => { control.current!.loadImage('source.png', opaqueImage()); });
    return { control, renderer, status, sourceChange, rerender: (route: string) => act(() => renderer.update(<Probe route={route} />)) };
  }

  it('preserves the current crop geometry while toggling background removal', async () => {
    const view = setup();
    const crop = view.control.current!.uploadedSplitImage!.crop;
    let toggle!: Promise<void>;
    act(() => { toggle = view.control.current!.toggleBackground(); });
    await act(async () => { asyncControl.resolveNext(); await toggle; });
    expect(view.control.current!.uploadedSplitImage).toMatchObject({ backgroundRemoved: true, crop });
    expect(view.control.current!.uploadedSplitImage!.crop).toEqual(crop);
  });

  it('discards a deferred background toggle after the route leaves the split flow', async () => {
    const view = setup();
    let toggle!: Promise<void>;
    act(() => { toggle = view.control.current!.toggleBackground(); });
    view.rerender('other');
    await act(async () => { asyncControl.resolveNext(); await toggle; });
    expect(view.control.current!.uploadedSplitImage!.backgroundRemoved).toBe(false);
    expect(view.status).not.toHaveBeenCalled();
  });

  it('discards a queued sensitivity animation frame after leaving split preview', async () => {
    const view = setup();
    let toggle!: Promise<void>;
    act(() => { toggle = view.control.current!.toggleBackground(); });
    await act(async () => { asyncControl.resolveNext(); await toggle; });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const sourceChangesBefore = view.sourceChange.mock.calls.length;
    act(() => { view.control.current!.updateBackgroundSensitivity(73); });
    view.rerender('other');
    act(() => { frames.shift()?.(0); });
    expect(view.sourceChange).toHaveBeenCalledTimes(sourceChangesBefore);
  });
});
