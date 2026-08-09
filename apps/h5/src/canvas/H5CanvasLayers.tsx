import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import { useTransformEffect } from 'react-zoom-pan-pinch';
import type { Cell } from '@qiaoqiaole/core';
import {
  drawViewportBeadingOverlay,
  type H5CanvasOverlay,
} from './H5BeadingOverlay';
import {
  canvasRenderMetrics,
  configureCanvas,
  drawViewportCodeLayer,
  drawViewportColorLayer,
  drawViewportGridLayer,
  type CanvasRenderMetrics,
  type ViewportArtboard,
} from './H5CanvasRenderer';

type H5CanvasLayersProps = {
  artboardRef: RefObject<HTMLElement | null>;
  cells: readonly Cell[];
  rows: number;
  cols: number;
  codesVisible: boolean;
  getCode: (color: string) => string;
  getTextColor: (color: string) => string;
  overlay?: H5CanvasOverlay;
  gridVisible?: boolean;
};

export type CanvasLayerSnapshot = {
  cells: readonly Cell[];
  rows: number;
  cols: number;
  codesVisible: boolean;
  getCode: (color: string) => string;
  getTextColor: (color: string) => string;
  overlay: H5CanvasOverlay;
  gridVisible: boolean;
  viewportWidth: number;
  viewportHeight: number;
  artboard: ViewportArtboard;
  dpr: number;
  fontRevision: number;
};

export type CanvasLayerInvalidation = {
  configure: boolean;
  color: boolean;
  code: boolean;
  grid: boolean;
  overlay: boolean;
};

const ALL_LAYERS_DIRTY: CanvasLayerInvalidation = {
  configure: true,
  color: true,
  code: true,
  grid: true,
  overlay: true,
};

const EMPTY_OVERLAY: H5CanvasOverlay = {
  currentColorCode: null,
  highlightEnabled: false,
  markedCellIndexes: [],
  completedColorCodes: [],
};

export function canvasLayerInvalidation(
  previous: CanvasLayerSnapshot | null,
  next: CanvasLayerSnapshot,
): CanvasLayerInvalidation {
  if (!previous) return { ...ALL_LAYERS_DIRTY };

  const configure = previous.viewportWidth !== next.viewportWidth
    || previous.viewportHeight !== next.viewportHeight
    || previous.dpr !== next.dpr;
  if (configure) return { ...ALL_LAYERS_DIRTY };

  const dimensionsChanged = previous.rows !== next.rows || previous.cols !== next.cols;
  if (dimensionsChanged) {
    return { configure: false, color: true, code: true, grid: true, overlay: true };
  }

  const cameraChanged = previous.artboard.left !== next.artboard.left
    || previous.artboard.top !== next.artboard.top
    || previous.artboard.width !== next.artboard.width
    || previous.artboard.height !== next.artboard.height;
  if (cameraChanged) {
    return { configure: false, color: true, code: true, grid: true, overlay: true };
  }

  const cellsChanged = previous.cells !== next.cells;
  const getCodeChanged = previous.getCode !== next.getCode;
  const codeChanged = cellsChanged
    || getCodeChanged
    || previous.getTextColor !== next.getTextColor
    || previous.codesVisible !== next.codesVisible
    || previous.fontRevision !== next.fontRevision;
  return {
    configure: false,
    color: cellsChanged,
    code: codeChanged,
    grid: previous.gridVisible !== next.gridVisible,
    overlay: cellsChanged || getCodeChanged || previous.overlay !== next.overlay,
  };
}

export function H5CanvasLayers({
  artboardRef,
  cells,
  rows,
  cols,
  codesVisible,
  getCode,
  getTextColor,
  overlay = EMPTY_OVERLAY,
  gridVisible = true,
}: H5CanvasLayersProps) {
  const stackRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLCanvasElement>(null);
  const codeRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const metricsRef = useRef<CanvasRenderMetrics | null>(null);
  const colorContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const codeContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const gridContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const overlayContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const snapshotRef = useRef<CanvasLayerSnapshot | null>(null);
  const fontRevisionRef = useRef(0);
  const latestRef = useRef({
    cells, rows, cols, codesVisible, getCode, getTextColor, overlay, gridVisible,
  });
  const drawFrameRef = useRef<() => void>(() => undefined);
  latestRef.current = {
    cells, rows, cols, codesVisible, getCode, getTextColor, overlay, gridVisible,
  };

  const scheduleDraw = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      drawFrameRef.current();
    });
  }, []);

  drawFrameRef.current = () => {
    const stack = stackRef.current;
    const artboardElement = artboardRef.current;
    const colorCanvas = colorRef.current;
    const codeCanvas = codeRef.current;
    const gridCanvas = gridRef.current;
    const overlayCanvas = overlayRef.current;
    if (!stack || !artboardElement || !colorCanvas || !codeCanvas || !gridCanvas || !overlayCanvas) return;

    const viewportRect = stack.getBoundingClientRect();
    const artboardRect = artboardElement.getBoundingClientRect();
    const viewportWidth = viewportRect.width;
    const viewportHeight = viewportRect.height;
    const dpr = window.devicePixelRatio || 1;
    const artboard = {
      left: artboardRect.left - viewportRect.left,
      top: artboardRect.top - viewportRect.top,
      width: artboardRect.width,
      height: artboardRect.height,
    };
    const current = latestRef.current;
    const nextSnapshot: CanvasLayerSnapshot = {
      ...current,
      viewportWidth,
      viewportHeight,
      artboard,
      dpr,
      fontRevision: fontRevisionRef.current,
    };
    const dirty = canvasLayerInvalidation(snapshotRef.current, nextSnapshot);
    snapshotRef.current = nextSnapshot;

    if (dirty.configure || !metricsRef.current) {
      const baseMetrics = canvasRenderMetrics(viewportWidth, viewportHeight, dpr, 1);
      const metrics = {
        ...baseMetrics,
        backingWidth: baseMetrics.logicalWidth > 0
          ? Math.max(1, Math.round(baseMetrics.logicalWidth * baseMetrics.renderScale))
          : 0,
        backingHeight: baseMetrics.logicalHeight > 0
          ? Math.max(1, Math.round(baseMetrics.logicalHeight * baseMetrics.renderScale))
          : 0,
      };
      metricsRef.current = metrics;
      colorContextRef.current = configureCanvas(colorCanvas, metrics);
      codeContextRef.current = configureCanvas(codeCanvas, metrics);
      gridContextRef.current = configureCanvas(gridCanvas, metrics);
      overlayContextRef.current = configureCanvas(overlayCanvas, metrics);
      stack.dataset.rasterWidth = String(metrics.backingWidth);
      stack.dataset.rasterHeight = String(metrics.backingHeight);
      stack.dataset.renderScale = String(metrics.renderScale);
    }

    const metrics = metricsRef.current;
    const colorContext = colorContextRef.current;
    const codeContext = codeContextRef.current;
    const gridContext = gridContextRef.current;
    const overlayContext = overlayContextRef.current;
    if (!metrics || !colorContext || !codeContext || !gridContext || !overlayContext) return;

    const geometry = {
      viewportWidth: metrics.logicalWidth,
      viewportHeight: metrics.logicalHeight,
      artboard,
      rows: current.rows,
      cols: current.cols,
      renderScale: metrics.renderScale,
    };
    if (dirty.color) {
      drawViewportColorLayer(colorContext, { ...geometry, cells: current.cells });
    }
    if (dirty.code) {
      drawViewportCodeLayer(codeContext, {
        ...geometry,
        cells: current.cells,
        visible: current.codesVisible,
        getCode: current.getCode,
        getTextColor: current.getTextColor,
      });
    }
    if (dirty.grid) {
      drawViewportGridLayer(gridContext, { ...geometry, visible: current.gridVisible });
    }
    if (dirty.overlay) {
      drawViewportBeadingOverlay(overlayContext, {
        ...geometry,
        cells: current.cells,
        getCode: current.getCode,
        ...current.overlay,
      });
    }
  };

  const handleTransform = useCallback(() => {
    // react-zoom-pan-pinch has already applied the transform before invoking
    // useTransformEffect. Draw immediately so the fixed viewport layers do
    // not trail the transformed interaction layer by one animation frame.
    drawFrameRef.current();
  }, []);
  useTransformEffect(handleTransform);

  useLayoutEffect(() => {
    scheduleDraw();
  }, [cells, rows, cols, codesVisible, getCode, getTextColor, overlay, gridVisible, scheduleDraw]);

  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const observer = new ResizeObserver(() => scheduleDraw());
    const handleWindowResize = () => scheduleDraw();
    observer.observe(stack);
    window.addEventListener('resize', handleWindowResize);
    scheduleDraw();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [scheduleDraw]);

  useEffect(() => {
    let dprQuery: MediaQueryList | null = null;
    function removeDprListener() {
      if (!dprQuery) return;
      if (typeof dprQuery.removeEventListener === 'function') {
        dprQuery.removeEventListener('change', handleDprChange);
      } else {
        (dprQuery as MediaQueryList & { removeListener?: (listener: () => void) => void })
          .removeListener?.(handleDprChange);
      }
    }
    function refreshDprQuery() {
      removeDprListener();
      const dpr = window.devicePixelRatio || 1;
      dprQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
      if (typeof dprQuery.addEventListener === 'function') {
        dprQuery.addEventListener('change', handleDprChange);
      } else {
        (dprQuery as MediaQueryList & { addListener?: (listener: () => void) => void })
          .addListener?.(handleDprChange);
      }
      scheduleDraw();
    }
    function handleDprChange() {
      refreshDprQuery();
    }
    refreshDprQuery();
    return removeDprListener;
  }, [scheduleDraw]);

  useEffect(() => {
    let active = true;
    void document.fonts?.ready.then(() => {
      if (!active) return;
      fontRevisionRef.current += 1;
      scheduleDraw();
    });
    return () => { active = false; };
  }, [scheduleDraw]);

  useEffect(() => () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  return (
    <div
      ref={stackRef}
      className="h5-canvas-layers"
      data-grid-cols={cols}
      data-grid-rows={rows}
      data-codes-visible={codesVisible}
      data-raster-width="0"
      data-raster-height="0"
      data-render-scale="1"
    >
      <canvas ref={colorRef} className="h5-color-canvas" aria-hidden="true" />
      <canvas ref={codeRef} className="h5-code-canvas" aria-hidden="true" />
      <canvas ref={gridRef} className="h5-grid-canvas" aria-hidden="true" />
      <canvas
        ref={overlayRef}
        className="h5-overlay-canvas"
        style={{ zIndex: 4 }}
        aria-hidden="true"
      />
    </div>
  );
}
