import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const zoomMocks = vi.hoisted(() => ({
  setTransform: vi.fn(),
  wrapperProps: undefined as Record<string, unknown> | undefined,
}));

vi.mock('react-zoom-pan-pinch', async () => {
  const React = await import('react');
  return {
    TransformWrapper: React.forwardRef(function MockTransformWrapper(
      props: { children?: ReactNode } & Record<string, unknown>,
      ref,
    ) {
      React.useImperativeHandle(ref, () => ({ setTransform: zoomMocks.setTransform }));
      const { children, ...rest } = props;
      zoomMocks.wrapperProps = rest;
      return <>{children}</>;
    }),
    TransformComponent: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
      <div data-transform-component="true" {...props}>{children}</div>
    ),
  };
});

import {
  BeadingCanvasViewport,
  CELL_SIZE,
  RULER_LEFT_GUTTER,
  RULER_TOP_GUTTER,
  calculateViewportFit,
} from './BeadingCanvasViewport';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

type ResizeCallback = ResizeObserverCallback;
let resizeCallback: ResizeCallback | undefined;
const observe = vi.fn();
const disconnect = vi.fn();
const requestAnimationFrameMock = vi.fn<(callback: FrameRequestCallback) => number>();
const cancelAnimationFrameMock = vi.fn<(handle: number) => void>();
let animationFrameId = 0;
let animationFrames = new Map<number, FrameRequestCallback>();

class ResizeObserverMock {
  constructor(callback: ResizeCallback) {
    resizeCallback = callback;
  }
  observe = observe;
  disconnect = disconnect;
  unobserve = vi.fn();
}

const stageNode = {
  getBoundingClientRect: vi.fn(() => ({ width: 400, height: 300 })),
};

function renderViewport(
  props: Partial<React.ComponentProps<typeof BeadingCanvasViewport>> = {},
) {
  const defaults: React.ComponentProps<typeof BeadingCanvasViewport> = {
    rows: 5,
    cols: 10,
    locked: false,
    focusMode: false,
    interactionMode: 'mark',
    children: <span>cells</span>,
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<BeadingCanvasViewport {...defaults} {...props} />, {
      createNodeMock: (element) => element.type === 'section' ? stageNode : {},
    });
  });
  flushAnimationFrames();
  return renderer;
}

function flushAnimationFrames() {
  act(() => {
    const pending = animationFrames;
    animationFrames = new Map();
    pending.forEach((callback) => callback(0));
  });
}

function expectedFitTransform(
  viewportWidth: number,
  viewportHeight: number,
  artboardWidth: number,
  artboardHeight: number,
) {
  const availableWidth = viewportWidth - 32;
  const availableHeight = viewportHeight - 32;
  const contentWidth = artboardWidth + RULER_LEFT_GUTTER;
  const contentHeight = artboardHeight + RULER_TOP_GUTTER;
  const scale = Math.min(8, Math.max(0.25, Math.min(
    availableWidth / contentWidth,
    availableHeight / contentHeight,
  )));
  return [
    16 + (availableWidth - contentWidth * scale) / 2 + RULER_LEFT_GUTTER * scale,
    16 + (availableHeight - contentHeight * scale) / 2 + RULER_TOP_GUTTER * scale,
    scale,
  ] as const;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  resizeCallback = undefined;
  animationFrameId = 0;
  animationFrames = new Map();
  requestAnimationFrameMock.mockImplementation((callback) => {
    animationFrameId += 1;
    animationFrames.set(animationFrameId, callback);
    return animationFrameId;
  });
  cancelAnimationFrameMock.mockImplementation((handle) => {
    animationFrames.delete(handle);
  });
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
});

describe('calculateViewportFit', () => {
  it('fits and centers the scaled artboard together with its top and left ruler gutters', () => {
    expect(RULER_LEFT_GUTTER).toBe(22);
    expect(RULER_TOP_GUTTER).toBe(20);
    const scale = 368 / (180 + RULER_LEFT_GUTTER);
    expect(calculateViewportFit(400, 300, 180, 90)).toEqual({
      scale,
      x: 16 + RULER_LEFT_GUTTER * scale,
      y: 16 + (268 - (90 + RULER_TOP_GUTTER) * scale) / 2 + RULER_TOP_GUTTER * scale,
    });
  });

  it('allows small artboards to scale up', () => {
    expect(calculateViewportFit(212, 212, 18, 18)).toEqual({ scale: 4.5, x: 115, y: 110.5 });
  });

  it('clamps large artboards to the minimum scale', () => {
    expect(calculateViewportFit(100, 100, 1000, 1000)).toEqual({ scale: 0.25, x: -72.25, y: -72.5 });
  });

  it.each([
    [0, 100, 10, 10],
    [100, 31, 10, 10],
    [100, 100, 0, 10],
    [100, 100, 10, Number.NaN],
    [Number.POSITIVE_INFINITY, 100, 10, 10],
  ])('returns null for invalid dimensions: %o', (width, height, artboardWidth, artboardHeight) => {
    expect(calculateViewportFit(width, height, artboardWidth, artboardHeight)).toBeNull();
  });
});

describe('BeadingCanvasViewport', () => {
  it('sizes the artboard from rows/cols and fits it with setTransform', () => {
    const onPointerDown = vi.fn();
    const renderer = renderViewport({
      artboardProps: {
        onPointerDown,
        className: 'pointer-surface',
        style: { opacity: 0.5, maxWidth: 12 },
      },
    });
    const artboard = renderer.root.find(
      (node) => node.type === 'div' && String(node.props.className).includes('beading-canvas-artboard'),
    );

    expect(CELL_SIZE).toBe(18);
    expect(artboard.props.className).toBe('beading-canvas-artboard pointer-surface');
    expect(artboard.props.style).toMatchObject({
      width: 180,
      height: 90,
      maxWidth: 'none',
      maxHeight: 'none',
      flex: 'none',
      opacity: 0.5,
    });
    expect(artboard.props.onPointerDown).toBe(onPointerDown);
    expect(zoomMocks.setTransform).toHaveBeenLastCalledWith(...expectedFitTransform(400, 300, 180, 90), 180);
  });

  it('uses ResizeObserver content-box dimensions and disconnects on unmount', () => {
    const renderer = renderViewport();
    zoomMocks.setTransform.mockClear();

    act(() => {
      resizeCallback?.([{
        contentBoxSize: [{ inlineSize: 500, blockSize: 400 }],
        contentRect: { width: 1, height: 1 },
      } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    });

    expect(observe).toHaveBeenCalledWith(stageNode);
    expect(zoomMocks.setTransform).not.toHaveBeenCalled();
    flushAnimationFrames();
    expect(zoomMocks.setTransform).toHaveBeenLastCalledWith(...expectedFitTransform(500, 400, 180, 90), 180);
    act(() => renderer.unmount());
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('refits when rows, columns, or focus mode changes', () => {
    const renderer = renderViewport();
    zoomMocks.setTransform.mockClear();

    act(() => {
      renderer.update(
        <BeadingCanvasViewport rows={10} cols={20} locked={false} focusMode={false} interactionMode="mark">
          cells
        </BeadingCanvasViewport>,
      );
    });
    expect(zoomMocks.setTransform).toHaveBeenLastCalledWith(...expectedFitTransform(400, 300, 360, 180), 180);

    zoomMocks.setTransform.mockClear();
    act(() => {
      renderer.update(
        <BeadingCanvasViewport rows={10} cols={20} locked={false} focusMode interactionMode="mark">
          cells
        </BeadingCanvasViewport>,
      );
    });
    expect(zoomMocks.setTransform).toHaveBeenCalledTimes(1);
  });

  it('notifies replacement fit callbacks without triggering a fit animation', () => {
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const renderer = renderViewport();
    zoomMocks.setTransform.mockClear();

    act(() => {
      renderer.update(
        <BeadingCanvasViewport
          rows={5}
          cols={10}
          locked={false}
          focusMode={false}
          interactionMode="mark"
          onFitReady={firstReady}
        >
          cells
        </BeadingCanvasViewport>,
      );
    });
    const fit = firstReady.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(fit).toBeTypeOf('function');
    expect(zoomMocks.setTransform).not.toHaveBeenCalled();

    act(() => {
      renderer.update(
        <BeadingCanvasViewport
          rows={5}
          cols={10}
          locked={false}
          focusMode={false}
          interactionMode="mark"
          onFitReady={secondReady}
        >
          cells
        </BeadingCanvasViewport>,
      );
    });
    expect(secondReady).toHaveBeenCalledTimes(1);
    expect(secondReady).toHaveBeenCalledWith(fit);
    expect(zoomMocks.setTransform).not.toHaveBeenCalled();

    act(() => fit?.());
    expect(zoomMocks.setTransform).toHaveBeenCalledWith(...expectedFitTransform(400, 300, 180, 90), 180);
  });

  it('defers automatic and manual fit while locked, then fits immediately on unlock', () => {
    const onFitReady = vi.fn();
    const renderer = renderViewport({ locked: true, onFitReady });
    const fit = onFitReady.mock.calls[0]?.[0] as () => void;
    expect(zoomMocks.wrapperProps).toMatchObject({
      disabled: true,
      minScale: 0.25,
      maxScale: 8,
    });
    expect(zoomMocks.setTransform).not.toHaveBeenCalled();
    act(() => fit());
    expect(zoomMocks.setTransform).not.toHaveBeenCalled();
    act(() => {
      resizeCallback?.([{
        contentBoxSize: [{ inlineSize: 500, blockSize: 400 }],
      } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    });
    flushAnimationFrames();
    expect(zoomMocks.setTransform).not.toHaveBeenCalled();

    act(() => {
      renderer.update(
        <BeadingCanvasViewport rows={10} cols={20} locked={false} focusMode={false} interactionMode="mark">
          cells
        </BeadingCanvasViewport>,
      );
    });
    expect(zoomMocks.setTransform).toHaveBeenCalledTimes(1);
    expect(zoomMocks.setTransform).toHaveBeenCalledWith(...expectedFitTransform(500, 400, 360, 180), 180);
  });

  it('excludes artboard single-pointer panning in mark mode while preserving pinch panning', () => {
    const renderer = renderViewport({ interactionMode: 'mark' });
    expect(zoomMocks.wrapperProps).toMatchObject({
      disabled: false,
      panning: { excluded: ['beading-canvas-artboard'] },
      pinch: { disabled: false, allowPanning: true },
    });
    expect(zoomMocks.wrapperProps?.panning).not.toMatchObject({ disabled: true });

    act(() => {
      renderer.update(
        <BeadingCanvasViewport rows={5} cols={10} locked={false} focusMode={false} interactionMode="pan">
          cells
        </BeadingCanvasViewport>,
      );
    });
    expect(zoomMocks.wrapperProps).toMatchObject({ panning: { excluded: [] } });
  });

  it('deduplicates unchanged observations and coalesces resize bursts into one frame', () => {
    renderViewport();
    zoomMocks.setTransform.mockClear();
    requestAnimationFrameMock.mockClear();

    act(() => {
      resizeCallback?.([{
        contentBoxSize: [{ inlineSize: 400, blockSize: 300 }],
      } as unknown as ResizeObserverEntry], {} as ResizeObserver);
      resizeCallback?.([{
        contentBoxSize: [{ inlineSize: 500, blockSize: 400 }],
      } as unknown as ResizeObserverEntry], {} as ResizeObserver);
      resizeCallback?.([{
        contentBoxSize: [{ inlineSize: 520, blockSize: 400 }],
      } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    });

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
    expect(zoomMocks.setTransform).not.toHaveBeenCalled();
    flushAnimationFrames();
    expect(zoomMocks.setTransform).toHaveBeenCalledTimes(1);
    expect(zoomMocks.setTransform).toHaveBeenCalledWith(...expectedFitTransform(520, 400, 180, 90), 180);
  });

  it('uses an immediate fit transform when reduced motion is requested', () => {
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: true })),
    });

    renderViewport();

    expect(zoomMocks.setTransform).toHaveBeenLastCalledWith(...expectedFitTransform(400, 300, 180, 90), 0);
  });

  it('cancels a pending resize frame on unmount', () => {
    const renderer = renderViewport();
    zoomMocks.setTransform.mockClear();
    act(() => {
      resizeCallback?.([{
        contentBoxSize: [{ inlineSize: 500, blockSize: 400 }],
      } as unknown as ResizeObserverEntry], {} as ResizeObserver);
      renderer.unmount();
    });

    expect(cancelAnimationFrameMock).toHaveBeenCalledTimes(1);
    flushAnimationFrames();
    expect(zoomMocks.setTransform).not.toHaveBeenCalled();
  });

  it('supports render children with natural artboard dimensions', () => {
    const render = vi.fn(({ width, height }: { width: number; height: number }) => <span>{width}x{height}</span>);
    const renderer = renderViewport({ rows: 3, cols: 7, children: render });
    expect(render).toHaveBeenCalledWith({ width: 7 * CELL_SIZE, height: 3 * CELL_SIZE });
    expect(renderer.root.findByType('span').children.join('')).toBe('126x54');
  });
});
