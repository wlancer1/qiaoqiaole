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
};

export type CanvasLayerSnapshot = {
  cells: readonly Cell[];
  rows: number;
  cols: number;
  codesVisible: boolean;
  getCode: (color: string) => string;
  getTextColor: (color: string) => string;
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
};

const ALL_LAYERS_DIRTY: CanvasLayerInvalidation = {
  configure: true,
  color: true,
  code: true,
  grid: true,
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
    return { configure: false, color: true, code: true, grid: true };
  }

  const cameraChanged = previous.artboard.left !== next.artboard.left
    || previous.artboard.top !== next.artboard.top
    || previous.artboard.width !== next.artboard.width
    || previous.artboard.height !== next.artboard.height;
  if (cameraChanged) {
    return { configure: false, color: true, code: true, grid: true };
  }

  const contentChanged = previous.cells !== next.cells
    || previous.getCode !== next.getCode
    || previous.getTextColor !== next.getTextColor;
  const codeChanged = contentChanged
    || previous.codesVisible !== next.codesVisible
    || previous.fontRevision !== next.fontRevision;
  return {
    configure: false,
    color: contentChanged,
    code: codeChanged,
    grid: false,
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
}: H5CanvasLayersProps) {
  const stackRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLCanvasElement>(null);
  const codeRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const metricsRef = useRef<CanvasRenderMetrics | null>(null);
  const colorContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const codeContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const gridContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const snapshotRef = useRef<CanvasLayerSnapshot | null>(null);
  const fontRevisionRef = useRef(0);
  const latestRef = useRef({ cells, rows, cols, codesVisible, getCode, getTextColor });
  const drawFrameRef = useRef<() => void>(() => undefined);
  latestRef.current = { cells, rows, cols, codesVisible, getCode, getTextColor };

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
    if (!stack || !artboardElement || !colorCanvas || !codeCanvas || !gridCanvas) return;

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
      stack.dataset.rasterWidth = String(metrics.backingWidth);
      stack.dataset.rasterHeight = String(metrics.backingHeight);
      stack.dataset.renderScale = String(metrics.renderScale);
    }

    const metrics = metricsRef.current;
    const colorContext = colorContextRef.current;
    const codeContext = codeContextRef.current;
    const gridContext = gridContextRef.current;
    if (!metrics || !colorContext || !codeContext || !gridContext) return;

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
    if (dirty.grid) drawViewportGridLayer(gridContext, geometry);
  };

  const handleTransform = useCallback(() => {
    scheduleDraw();
  }, [scheduleDraw]);
  useTransformEffect(handleTransform);

  useLayoutEffect(() => {
    scheduleDraw();
  }, [cells, rows, cols, codesVisible, getCode, getTextColor, scheduleDraw]);

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
    </div>
  );
}
