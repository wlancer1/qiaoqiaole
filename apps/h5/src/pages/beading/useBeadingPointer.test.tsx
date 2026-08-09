import { createRef, type PointerEventHandler } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { InteractionMode } from '../../beading/beadingToolState';
import { useBeadingPointer } from './useBeadingPointer';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

type HarnessProps = {
  artboard: HTMLDivElement;
  rows?: number;
  cols?: number;
  locked?: boolean;
  interactionMode?: InteractionMode;
  onCell: (index: number) => void;
};

function Harness({
  artboard,
  rows = 2,
  cols = 4,
  locked = false,
  interactionMode = 'mark',
  onCell,
}: HarnessProps) {
  const artboardRef = createRef<HTMLDivElement>();
  artboardRef.current = artboard;
  return <div {...useBeadingPointer({ artboardRef, rows, cols, locked, interactionMode, onCell })} />;
}

function pointer(pointerId: number, clientX: number, clientY: number, currentTarget: HTMLDivElement) {
  return { pointerId, clientX, clientY, currentTarget } as unknown as React.PointerEvent<HTMLDivElement>;
}

function makeArtboard(rect = { left: 10, top: 20, width: 200, height: 100 }) {
  return {
    getBoundingClientRect: vi.fn(() => rect),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  } as unknown as HTMLDivElement;
}

function handlers(renderer: ReactTestRenderer) {
  const props = renderer.root.findByType('div').props as {
    onPointerDown: PointerEventHandler<HTMLDivElement>;
    onPointerMove: PointerEventHandler<HTMLDivElement>;
    onPointerUp: PointerEventHandler<HTMLDivElement>;
    onPointerCancel: PointerEventHandler<HTMLDivElement>;
  };
  return props;
}

function renderHarness(props: HarnessProps) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Harness {...props} />);
  });
  return renderer;
}

describe('useBeadingPointer', () => {
  it('captures a mark-mode pointer and maps a stationary tap using the latest rect', () => {
    const onCell = vi.fn();
    const artboard = makeArtboard();
    const renderer = renderHarness({ artboard, onCell });
    const events = handlers(renderer);

    events.onPointerDown(pointer(1, 20, 30, artboard));
    vi.mocked(artboard.getBoundingClientRect).mockReturnValue({
      left: 100,
      top: 100,
      width: 200,
      height: 100,
      right: 300,
      bottom: 200,
      x: 100,
      y: 100,
      toJSON: () => undefined,
    });
    events.onPointerUp(pointer(1, 175, 125, artboard));

    expect(artboard.setPointerCapture).toHaveBeenCalledWith(1);
    expect(artboard.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(onCell).toHaveBeenCalledWith(1);
  });

  it('treats movement over four pixels as a drag but allows exactly four pixels', () => {
    const onCell = vi.fn();
    const artboard = makeArtboard();
    const renderer = renderHarness({ artboard, onCell });
    const events = handlers(renderer);

    events.onPointerDown(pointer(1, 20, 30, artboard));
    events.onPointerMove(pointer(1, 24, 30, artboard));
    events.onPointerUp(pointer(1, 20, 30, artboard));
    events.onPointerDown(pointer(2, 20, 30, artboard));
    events.onPointerMove(pointer(2, 25, 30, artboard));
    events.onPointerUp(pointer(2, 20, 30, artboard));

    expect(onCell).toHaveBeenCalledTimes(1);
  });

  it('never marks after a second pointer joins, including when primary lifts first', () => {
    const onCell = vi.fn();
    const artboard = makeArtboard();
    const renderer = renderHarness({ artboard, onCell });
    const events = handlers(renderer);

    events.onPointerDown(pointer(1, 20, 30, artboard));
    events.onPointerDown(pointer(2, 25, 35, artboard));
    events.onPointerUp(pointer(1, 20, 30, artboard));
    events.onPointerUp(pointer(2, 25, 35, artboard));

    expect(onCell).not.toHaveBeenCalled();
    expect(artboard.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(artboard.releasePointerCapture).toHaveBeenCalledWith(2);
  });

  it('resets the whole gesture after any pointer cancel', () => {
    const onCell = vi.fn();
    const artboard = makeArtboard();
    const renderer = renderHarness({ artboard, onCell });
    const events = handlers(renderer);

    events.onPointerDown(pointer(1, 20, 30, artboard));
    events.onPointerDown(pointer(2, 25, 35, artboard));
    events.onPointerCancel(pointer(2, 25, 35, artboard));
    events.onPointerUp(pointer(1, 20, 30, artboard));

    expect(onCell).not.toHaveBeenCalled();
  });

  it.each([
    { locked: true, interactionMode: 'mark' as const },
    { locked: false, interactionMode: 'pan' as const },
  ])('does not mark when locked/panning: %o', ({ locked, interactionMode }) => {
    const onCell = vi.fn();
    const artboard = makeArtboard();
    const renderer = renderHarness({ artboard, onCell, locked, interactionMode });
    const events = handlers(renderer);

    events.onPointerDown(pointer(1, 20, 30, artboard));
    events.onPointerUp(pointer(1, 20, 30, artboard));

    expect(onCell).not.toHaveBeenCalled();
    expect(artboard.setPointerCapture).toHaveBeenCalledTimes(interactionMode === 'pan' ? 0 : 1);
  });

  it.each([
    { rect: { left: 10, top: 20, width: 0, height: 100 }, x: 10, y: 20 },
    { rect: { left: 10, top: 20, width: 200, height: 100 }, x: 210, y: 20 },
  ])('ignores invalid or out-of-bounds taps: %o', ({ rect, x, y }) => {
    const onCell = vi.fn();
    const artboard = makeArtboard(rect);
    const renderer = renderHarness({ artboard, onCell });
    const events = handlers(renderer);

    events.onPointerDown(pointer(1, x, y, artboard));
    events.onPointerUp(pointer(1, x, y, artboard));

    expect(onCell).not.toHaveBeenCalled();
  });

  it('keeps handler identities stable while using the latest callback and mode', () => {
    const firstOnCell = vi.fn();
    const nextOnCell = vi.fn();
    const artboard = makeArtboard();
    const renderer = renderHarness({ artboard, onCell: firstOnCell });
    const firstHandlers = handlers(renderer);

    act(() => {
      renderer.update(<Harness artboard={artboard} onCell={nextOnCell} interactionMode="revise" />);
    });
    const nextHandlers = handlers(renderer);
    expect(nextHandlers).toEqual(firstHandlers);

    nextHandlers.onPointerDown(pointer(1, 20, 30, artboard));
    nextHandlers.onPointerUp(pointer(1, 20, 30, artboard));
    expect(firstOnCell).not.toHaveBeenCalled();
    expect(nextOnCell).toHaveBeenCalledWith(0);
  });

  it('safely clears refs on unmount and tolerates pointer-capture errors', () => {
    const artboard = makeArtboard();
    vi.mocked(artboard.setPointerCapture).mockImplementation(() => { throw new Error('unsupported'); });
    vi.mocked(artboard.releasePointerCapture).mockImplementation(() => { throw new Error('lost'); });
    const renderer = renderHarness({ artboard, onCell: vi.fn() });
    const events = handlers(renderer);

    expect(() => events.onPointerDown(pointer(1, 20, 30, artboard))).not.toThrow();
    expect(() => events.onPointerCancel(pointer(1, 20, 30, artboard))).not.toThrow();
    expect(() => act(() => renderer.unmount())).not.toThrow();
  });
});
