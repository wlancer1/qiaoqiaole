import { useCallback, useEffect, useRef, type PointerEventHandler, type RefObject } from 'react';
import { cellIndexFromPoint, type InteractionMode } from '../../beading/beadingToolState';

type BeadingPointerOptions = {
  artboardRef: RefObject<HTMLElement | null>;
  rows: number;
  cols: number;
  locked: boolean;
  interactionMode: InteractionMode;
  onCell: (index: number) => void;
};

type PointerGesture = {
  activePointerIds: Set<number>;
  primaryPointerId: number | null;
  startX: number;
  startY: number;
  moved: boolean;
  hadMultiTouch: boolean;
};

export type BeadingPointerHandlers<T extends HTMLElement = HTMLDivElement> = {
  onPointerDown: PointerEventHandler<T>;
  onPointerMove: PointerEventHandler<T>;
  onPointerUp: PointerEventHandler<T>;
  onPointerCancel: PointerEventHandler<T>;
};

function createGesture(): PointerGesture {
  return {
    activePointerIds: new Set(),
    primaryPointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
    hadMultiTouch: false,
  };
}

function safelyCapture(element: HTMLElement, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Pointer capture can be unavailable or already lost during teardown.
  }
}

function safelyRelease(element: HTMLElement, pointerId: number) {
  try {
    element.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture can be unavailable or already lost during teardown.
  }
}

export function useBeadingPointer<T extends HTMLElement = HTMLDivElement>(
  options: BeadingPointerOptions,
): BeadingPointerHandlers<T> {
  const optionsRef = useRef(options);
  const gestureRef = useRef<PointerGesture>(createGesture());
  optionsRef.current = options;

  const reset = useCallback((element?: HTMLElement) => {
    if (element) {
      gestureRef.current.activePointerIds.forEach((pointerId) => safelyRelease(element, pointerId));
    }
    gestureRef.current = createGesture();
  }, []);

  useEffect(() => () => reset(), [reset]);

  const onPointerDown = useCallback<PointerEventHandler<T>>((event) => {
    const { interactionMode } = optionsRef.current;
    if (interactionMode !== 'mark' && interactionMode !== 'revise') return;

    const gesture = gestureRef.current;
    gesture.activePointerIds.add(event.pointerId);
    safelyCapture(event.currentTarget, event.pointerId);
    if (gesture.primaryPointerId === null) {
      gesture.primaryPointerId = event.pointerId;
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
    } else if (gesture.activePointerIds.size > 1) {
      gesture.hadMultiTouch = true;
    }
  }, []);

  const onPointerMove = useCallback<PointerEventHandler<T>>((event) => {
    const gesture = gestureRef.current;
    if (event.pointerId !== gesture.primaryPointerId || gesture.moved) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4) {
      gesture.moved = true;
    }
  }, []);

  const onPointerUp = useCallback<PointerEventHandler<T>>((event) => {
    const gesture = gestureRef.current;
    const { artboardRef, rows, cols, locked, interactionMode, onCell } = optionsRef.current;
    const isPrimary = event.pointerId === gesture.primaryPointerId;

    if (
      isPrimary
      && !gesture.hadMultiTouch
      && !gesture.moved
      && !locked
      && (interactionMode === 'mark' || interactionMode === 'revise')
    ) {
      const artboard = artboardRef.current;
      if (artboard) {
        const index = cellIndexFromPoint(artboard.getBoundingClientRect(), event.clientX, event.clientY, rows, cols);
        if (index !== null) onCell(index);
      }
    }

    gesture.activePointerIds.delete(event.pointerId);
    safelyRelease(event.currentTarget, event.pointerId);
    if (isPrimary || gesture.hadMultiTouch && gesture.activePointerIds.size < 2) {
      reset(event.currentTarget);
    }
  }, [reset]);

  const onPointerCancel = useCallback<PointerEventHandler<T>>((event) => {
    safelyRelease(event.currentTarget, event.pointerId);
    reset(event.currentTarget);
  }, [reset]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
