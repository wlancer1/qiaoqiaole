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
  captureTarget: HTMLElement | null;
};

export type BeadingPointerHandlers<T extends HTMLElement = HTMLDivElement> = {
  onPointerDown: PointerEventHandler<T>;
  onPointerMove: PointerEventHandler<T>;
  onPointerUp: PointerEventHandler<T>;
  onPointerCancel: PointerEventHandler<T>;
  onLostPointerCapture: PointerEventHandler<T>;
};

function createGesture(): PointerGesture {
  return {
    activePointerIds: new Set(),
    primaryPointerId: null,
    startX: 0,
    startY: 0,
    moved: false,
    hadMultiTouch: false,
    captureTarget: null,
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

  const reset = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = createGesture();
    const captureTarget = gesture.captureTarget;
    if (captureTarget) {
      gesture.activePointerIds.forEach((pointerId) => safelyRelease(captureTarget, pointerId));
    }
  }, []);

  useEffect(() => () => reset(), [reset]);
  useEffect(() => {
    if (options.locked || options.interactionMode === 'pan') reset();
  }, [options.locked, options.interactionMode, reset]);

  const onPointerDown = useCallback<PointerEventHandler<T>>((event) => {
    const { interactionMode } = optionsRef.current;
    if (interactionMode !== 'mark' && interactionMode !== 'revise') return;

    const gesture = gestureRef.current;
    gesture.activePointerIds.add(event.pointerId);
    gesture.captureTarget ??= event.currentTarget;
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
    safelyRelease(gesture.captureTarget ?? event.currentTarget, event.pointerId);
    if (isPrimary || gesture.hadMultiTouch && gesture.activePointerIds.size < 2) {
      reset();
    }
  }, [reset]);

  const onPointerCancel = useCallback<PointerEventHandler<T>>(() => {
    reset();
  }, [reset]);

  const onLostPointerCapture = useCallback<PointerEventHandler<T>>(() => {
    reset();
  }, [reset]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture };
}
