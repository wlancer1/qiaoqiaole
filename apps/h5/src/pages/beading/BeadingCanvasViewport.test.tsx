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
  calculateViewportFit,
} from './BeadingCanvasViewport';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

type ResizeCallback = ResizeObserverCallback;
let resizeCallback: ResizeCallback | undefined;
const observe = vi.fn();
const disconnect = vi.fn();

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
  return renderer;
}

beforeEach(() => {
  vi.clearAllMocks();
  resizeCallback = undefined;
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

describe('calculateViewportFit', () => {
  it('subtracts 16px padding on each side and centers the scaled artboard', () => {
    expect(calculateViewportFit(400, 300, 180, 90)).toEqual({
      scale: 368 / 180,
      x: 16,
      y: 58,
    });
  });

  it('allows small artboards to scale up', () => {
    expect(calculateViewportFit(212, 212, 18, 18)).toEqual({ scale: 8, x: 34, y: 34 });
  });

  it('clamps large artboards to the minimum scale', () => {
    expect(calculateViewportFit(100, 100, 1000, 1000)).toEqual({ scale: 0.25, x: -75, y: -75 });
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
    const renderer = renderViewport({ artboardProps: { onPointerDown } });
    const artboard = renderer.root.findByProps({ className: 'beading-canvas-artboard' });

    expect(CELL_SIZE).toBe(18);
    expect(artboard.props.style).toMatchObject({ width: 180, height: 90 });
    expect(artboard.props.onPointerDown).toBe(onPointerDown);
    expect(zoomMocks.setTransform).toHaveBeenLastCalledWith(16, 58, 368 / 180, 180);
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
    expect(zoomMocks.setTransform).toHaveBeenLastCalledWith(16, 83, 468 / 180, 180);
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
    expect(zoomMocks.setTransform).toHaveBeenLastCalledWith(16, 58, 368 / 360, 180);

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

  it('exposes one stable fit callback without repeating for callback identity changes', () => {
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const renderer = renderViewport({ onFitReady: firstReady });
    const fit = firstReady.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(fit).toBeTypeOf('function');

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
    expect(secondReady).not.toHaveBeenCalled();

    zoomMocks.setTransform.mockClear();
    act(() => fit?.());
    expect(zoomMocks.setTransform).toHaveBeenCalledWith(16, 58, 368 / 180, 180);
  });

  it('disables transforms when locked and disables one-pointer panning in mark mode', () => {
    const renderer = renderViewport({ locked: true });
    expect(zoomMocks.wrapperProps).toMatchObject({
      disabled: true,
      minScale: 0.25,
      maxScale: 8,
      panning: { disabled: true },
      pinch: { disabled: false },
    });

    act(() => {
      renderer.update(
        <BeadingCanvasViewport rows={5} cols={10} locked={false} focusMode={false} interactionMode="pan">
          cells
        </BeadingCanvasViewport>,
      );
    });
    expect(zoomMocks.wrapperProps).toMatchObject({ disabled: false, panning: { disabled: false } });
  });

  it('supports render children with natural artboard dimensions', () => {
    const render = vi.fn(({ width, height }: { width: number; height: number }) => <span>{width}x{height}</span>);
    const renderer = renderViewport({ rows: 3, cols: 7, children: render });
    expect(render).toHaveBeenCalledWith({ width: 7 * CELL_SIZE, height: 3 * CELL_SIZE });
    expect(renderer.root.findByType('span').children.join('')).toBe('126x54');
  });
});
