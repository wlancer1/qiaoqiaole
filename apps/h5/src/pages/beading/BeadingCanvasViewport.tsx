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

  const naturalScale = Math.min(availableWidth / artboardWidth, availableHeight / artboardHeight);
  const scale = Math.min(MAX_VIEWPORT_SCALE, Math.max(MIN_VIEWPORT_SCALE, naturalScale));
  return {
    scale,
    x: (viewportWidth - artboardWidth * scale) / 2,
    y: (viewportHeight - artboardHeight * scale) / 2,
  };
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
  const onFitReadyRef = useRef(onFitReady);
  const dimensions = { width: cols * CELL_SIZE, height: rows * CELL_SIZE };
  const sizeRef = useRef({
    viewportWidth: 0,
    viewportHeight: 0,
    artboardWidth: dimensions.width,
    artboardHeight: dimensions.height,
  });
  onFitReadyRef.current = onFitReady;
  sizeRef.current.artboardWidth = dimensions.width;
  sizeRef.current.artboardHeight = dimensions.height;

  const fit = useCallback(() => {
    const { viewportWidth, viewportHeight, artboardWidth, artboardHeight } = sizeRef.current;
    const next = calculateViewportFit(viewportWidth, viewportHeight, artboardWidth, artboardHeight);
    if (next && transformRef.current) {
      transformRef.current.setTransform(next.x, next.y, next.scale, 180);
    }
  }, []);

  useEffect(() => {
    onFitReadyRef.current?.(fit);
  }, [fit]);

  useEffect(() => {
    fit();
  }, [rows, cols, focusMode, fit]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;

    const updateSize = ({ width, height }: { width: number; height: number }) => {
      sizeRef.current.viewportWidth = width;
      sizeRef.current.viewportHeight = height;
      fit();
    };
    const rect = stage.getBoundingClientRect();
    updateSize({ width: rect.width, height: rect.height });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) updateSize(sizeFromEntry(entry));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [fit]);

  const content = typeof children === 'function' ? children(dimensions) : children;
  const stageClassName = focusMode ? 'beading-canvas-stage is-focus-mode' : 'beading-canvas-stage';

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
        panning={{ disabled: interactionMode !== 'pan' }}
        pinch={{ disabled: false }}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent wrapperClass="beading-canvas-viewport">
          <div
            {...artboardProps}
            ref={artboardRef}
            className="beading-canvas-artboard"
            style={{ width: dimensions.width, height: dimensions.height }}
          >
            {content}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </section>
  );
}
