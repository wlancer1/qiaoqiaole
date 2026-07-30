import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CanvasHTMLAttributes,
} from 'react';
import type { Cell } from '@qiaoqiaole/core';
import {
  canvasRenderMetrics,
  configureCanvas,
  drawCodeLayer,
  drawColorLayer,
  drawGridLayer,
  type CanvasRenderMetrics,
} from './H5CanvasRenderer';

type H5CanvasLayersProps = {
  cells: readonly Cell[];
  rows: number;
  cols: number;
  canvasScale: number;
  codesVisible: boolean;
  getCode: (color: string) => string;
  getTextColor: (color: string) => string;
  gridCanvasProps?: Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'className' | 'children'>;
};

type LogicalSize = { width: number; height: number };

export type CanvasLayerSnapshot = {
  cells: readonly Cell[];
  rows: number;
  cols: number;
  canvasScale: number;
  codesVisible: boolean;
  getCode: (color: string) => string;
  getTextColor: (color: string) => string;
  logicalWidth: number;
  logicalHeight: number;
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

  const configure = previous.logicalWidth !== next.logicalWidth
    || previous.logicalHeight !== next.logicalHeight
    || previous.dpr !== next.dpr
    || previous.canvasScale !== next.canvasScale;
  if (configure) return { ...ALL_LAYERS_DIRTY };

  const dimensionsChanged = previous.rows !== next.rows || previous.cols !== next.cols;
  if (dimensionsChanged) {
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

function mergeInvalidation(
  target: CanvasLayerInvalidation,
  next: CanvasLayerInvalidation,
): void {
  target.configure ||= next.configure;
  target.color ||= next.color;
  target.code ||= next.code;
  target.grid ||= next.grid;
}

export function H5CanvasLayers({
  cells,
  rows,
  cols,
  canvasScale,
  codesVisible,
  getCode,
  getTextColor,
  gridCanvasProps,
}: H5CanvasLayersProps) {
  const stackRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLCanvasElement>(null);
  const codeRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<LogicalSize>({ width: 0, height: 0 });
  const fontRevisionRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const metricsRef = useRef<CanvasRenderMetrics | null>(null);
  const colorContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const codeContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const gridContextRef = useRef<CanvasRenderingContext2D | null>(null);
  const snapshotRef = useRef<CanvasLayerSnapshot | null>(null);
  const dirtyRef = useRef<CanvasLayerInvalidation>({ ...ALL_LAYERS_DIRTY });
  const latestRef = useRef({ cells, rows, cols, canvasScale, codesVisible, getCode, getTextColor });
  latestRef.current = { cells, rows, cols, canvasScale, codesVisible, getCode, getTextColor };

  const currentSnapshot = (): CanvasLayerSnapshot => ({
    ...latestRef.current,
    logicalWidth: sizeRef.current.width,
    logicalHeight: sizeRef.current.height,
    dpr: window.devicePixelRatio || 1,
    fontRevision: fontRevisionRef.current,
  });

  const invalidate = () => {
    const next = currentSnapshot();
    mergeInvalidation(dirtyRef.current, canvasLayerInvalidation(snapshotRef.current, next));
    snapshotRef.current = next;
    scheduleDrawRef.current();
  };

  const scheduleDrawRef = useRef<() => void>(() => undefined);
  scheduleDrawRef.current = () => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const colorCanvas = colorRef.current;
      const codeCanvas = codeRef.current;
      const gridCanvas = gridRef.current;
      if (!colorCanvas || !codeCanvas || !gridCanvas) return;

      const current = latestRef.current;
      const dirty = { ...dirtyRef.current };
      dirtyRef.current = { configure: false, color: false, code: false, grid: false };

      if (dirty.configure || !metricsRef.current) {
        const { width, height } = sizeRef.current;
        const metrics = canvasRenderMetrics(width, height, window.devicePixelRatio || 1, current.canvasScale);
        metricsRef.current = metrics;
        colorContextRef.current = configureCanvas(colorCanvas, metrics);
        codeContextRef.current = configureCanvas(codeCanvas, metrics);
        gridContextRef.current = configureCanvas(gridCanvas, metrics);
        const stack = stackRef.current;
        if (stack) {
          stack.dataset.rasterWidth = String(metrics.backingWidth);
          stack.dataset.rasterHeight = String(metrics.backingHeight);
          stack.dataset.renderScale = String(metrics.renderScale);
        }
      }

      const metrics = metricsRef.current;
      const colorContext = colorContextRef.current;
      const codeContext = codeContextRef.current;
      const gridContext = gridContextRef.current;
      if (!colorContext || !codeContext || !gridContext) return;

      const geometry = {
        width: metrics.logicalWidth,
        height: metrics.logicalHeight,
        rows: current.rows,
        cols: current.cols,
        renderScale: metrics.renderScale,
      };
      if (dirty.color) drawColorLayer(colorContext, { ...geometry, cells: current.cells });
      if (dirty.code) {
        drawCodeLayer(codeContext, {
          ...geometry,
          cells: current.cells,
          visible: current.codesVisible,
          getCode: current.getCode,
          getTextColor: current.getTextColor,
        });
      }
      if (dirty.grid) drawGridLayer(gridContext, { ...geometry, zoom: current.canvasScale });
    });
  };

  useLayoutEffect(() => {
    invalidate();
  }, [cells, rows, cols, canvasScale, codesVisible, getCode, getTextColor]);

  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const measure = (entry?: ResizeObserverEntry) => {
      const width = entry?.contentRect.width ?? stack.clientWidth;
      const height = entry?.contentRect.height ?? stack.clientHeight;
      sizeRef.current = { width, height };
      invalidate();
    };
    measure();
    const observer = new ResizeObserver((entries) => measure(entries[0]));
    const handleWindowResize = () => measure();
    observer.observe(stack);
    window.addEventListener('resize', handleWindowResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) {
        fontRevisionRef.current += 1;
        invalidate();
      }
    });
    return () => { active = false; };
  }, []);

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
      <canvas
        {...gridCanvasProps}
        ref={gridRef}
        className="h5-grid-canvas canvas-artwork"
        role="img"
        aria-label="拼豆编辑画布"
      />
    </div>
  );
}
