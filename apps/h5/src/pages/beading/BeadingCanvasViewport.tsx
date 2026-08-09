import {
  useCallback,
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch';
import type { InteractionMode } from '../../beading/beadingToolState';

export const CELL_SIZE = 18;
export const MIN_VIEWPORT_SCALE = 0.25;
export const MAX_VIEWPORT_SCALE = 8;
const VIEWPORT_PADDING = 16;
export const RULER_LEFT_GUTTER = 22;
export const RULER_TOP_GUTTER = 20;

export type ViewportFit = { x: number; y: number; scale: number };

export function calculateViewportFit(
  viewportWidth: number,
  viewportHeight: number,
  artboardWidth: number,
  artboardHeight: number,
): ViewportFit | null {
  if (![viewportWidth, viewportHeight, artboardWidth, artboardHeight].every(Number.isFinite)) return null;
  const availableWidth = viewportWidth - VIEWPORT_PADDING * 2;
  const availableHeight = viewportHeight - VIEWPORT_PADDING * 2;
  if (availableWidth <= 0 || availableHeight <= 0 || artboardWidth <= 0 || artboardHeight <= 0) return null;

  const contentWidth = artboardWidth + RULER_LEFT_GUTTER;
  const contentHeight = artboardHeight + RULER_TOP_GUTTER;
  const naturalScale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
  const scale = Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, naturalScale));
  return {
    scale,
    x: VIEWPORT_PADDING + (availableWidth - contentWidth * scale) / 2 + RULER_LEFT_GUTTER * scale,
    y: VIEWPORT_PADDING + (availableHeight - contentHeight * scale) / 2 + RULER_TOP_GUTTER * scale,
  };
}

function fitTransitionDuration(): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 180;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;
}

type ArtboardDimensions = { width: number; height: number };

export type BeadingCanvasViewportProps = {
  rows: number;
  cols: number;
  locked: boolean;
  focusMode: boolean;
  interactionMode: InteractionMode;
  children?: ReactNode | ((dimensions: ArtboardDimensions) => ReactNode);
  artboardRef?: Ref<HTMLDivElement>;
  artboardProps?: HTMLAttributes<HTMLDivElement>;
  onFitReady?: (fit: () => void) => void;
};

function sizeFromEntry(entry: ResizeObserverEntry): { width: number; height: number } {
  const contentBox = Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize;
  if (contentBox) return { width: contentBox.inlineSize, height: contentBox.blockSize };
  return { width: entry.contentRect.width, height: entry.contentRect.height };
}

export function BeadingCanvasViewport({
  rows,
  cols,
  locked,
  focusMode,
  interactionMode,
  children,
  artboardRef,
  artboardProps,
  onFitReady,
}: BeadingCanvasViewportProps) {
  const stageRef = useRef<HTMLElement | null>(null);
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const lockedRef = useRef(locked);
  const pendingFitRef = useRef(false);
  const resizeFrameRef = useRef<number | null>(null);
  const lastObservedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const dimensions = { width: cols * CELL_SIZE, height: rows * CELL_SIZE };
  const sizeRef = useRef({
    viewportWidth: 0,
    viewportHeight: 0,
    artboardWidth: dimensions.width,
    artboardHeight: dimensions.height,
  });
  lockedRef.current = locked;
  sizeRef.current.artboardWidth = dimensions.width;
  sizeRef.current.artboardHeight = dimensions.height;

  const fit = useCallback(() => {
    if (lockedRef.current) {
      pendingFitRef.current = true;
      return;
    }
    const { viewportWidth, viewportHeight, artboardWidth, artboardHeight } = sizeRef.current;
    const next = calculateViewportFit(viewportWidth, viewportHeight, artboardWidth, artboardHeight);
    if (next && transformRef.current) {
      pendingFitRef.current = false;
      transformRef.current.setTransform(next.x, next.y, next.scale, fitTransitionDuration());
    }
  }, []);

  useEffect(() => {
    onFitReady?.(fit);
  }, [onFitReady, fit]);

  useEffect(() => {
    fit();
  }, [rows, cols, focusMode, locked, fit]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const scheduleSize = ({ width, height }: { width: number; height: number }) => {
      const previous = lastObservedSizeRef.current;
      if (previous?.width === width && previous.height === height) return;
      lastObservedSizeRef.current = { width, height };
      sizeRef.current.viewportWidth = width;
      sizeRef.current.viewportHeight = height;
      if (resizeFrameRef.current !== null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        fit();
      });
    };
    const rect = stage.getBoundingClientRect();
    scheduleSize({ width: rect.width, height: rect.height });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) scheduleSize(sizeFromEntry(entry));
    });
    observer.observe(stage);
    return () => {
      observer.disconnect();
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [fit]);

  const content = typeof children === 'function' ? children(dimensions) : children;
  const stageClassName = focusMode ? 'beading-canvas-stage is-focus-mode' : 'beading-canvas-stage';
  const {
    className: artboardClassName,
    style: artboardStyle,
    ...restArtboardProps
  } = artboardProps ?? {};
  const mergedArtboardClassName = [
    'beading-canvas-artboard',
    artboardClassName,
  ].filter(Boolean).join(' ');

  return (
    <section ref={stageRef} className={stageClassName}>
      <TransformWrapper
        ref={transformRef}
        disabled={locked}
        minScale={MIN_VIEWPORT_SCALE}
        maxScale={MAX_VIEWPORT_SCALE}
        initialScale={1}
        limitToBounds={false}
        centerOnInit={false}
        panning={{ excluded: interactionMode === 'pan' ? [] : ['beading-canvas-artboard'] }}
        pinch={{ disabled: false, allowPanning: true }}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent wrapperClass="beading-canvas-viewport">
          <div
            {...restArtboardProps}
            ref={artboardRef}
            className={mergedArtboardClassName}
            style={{
              ...artboardStyle,
              width: dimensions.width,
              height: dimensions.height,
              maxWidth: 'none',
              maxHeight: 'none',
              flex: 'none',
            }}
          >
            {content}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </section>
  );
}
