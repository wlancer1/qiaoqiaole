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
  const frameRef = useRef<number | null>(null);
  const latestRef = useRef({ cells, rows, cols, canvasScale, codesVisible, getCode, getTextColor });
  latestRef.current = { cells, rows, cols, canvasScale, codesVisible, getCode, getTextColor };

  const scheduleDrawRef = useRef<() => void>(() => undefined);
  scheduleDrawRef.current = () => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const colorCanvas = colorRef.current;
      const codeCanvas = codeRef.current;
      const gridCanvas = gridRef.current;
      if (!colorCanvas || !codeCanvas || !gridCanvas) return;

      const { width, height } = sizeRef.current;
      const current = latestRef.current;
      const metrics = canvasRenderMetrics(width, height, window.devicePixelRatio || 1, current.canvasScale);
      const colorContext = configureCanvas(colorCanvas, metrics);
      const codeContext = configureCanvas(codeCanvas, metrics);
      const gridContext = configureCanvas(gridCanvas, metrics);
      const stack = stackRef.current;
      if (stack) {
        stack.dataset.rasterWidth = String(metrics.backingWidth);
        stack.dataset.rasterHeight = String(metrics.backingHeight);
        stack.dataset.renderScale = String(metrics.renderScale);
      }
      if (!colorContext || !codeContext || !gridContext) return;

      const geometry = {
        width: metrics.logicalWidth,
        height: metrics.logicalHeight,
        rows: current.rows,
        cols: current.cols,
        renderScale: metrics.renderScale,
      };
      drawColorLayer(colorContext, { ...geometry, cells: current.cells });
      drawCodeLayer(codeContext, {
        ...geometry,
        cells: current.cells,
        visible: current.codesVisible,
        getCode: current.getCode,
        getTextColor: current.getTextColor,
      });
      drawGridLayer(gridContext, { ...geometry, zoom: current.canvasScale });
    });
  };

  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const measure = (entry?: ResizeObserverEntry) => {
      const width = entry?.contentRect.width ?? stack.clientWidth;
      const height = entry?.contentRect.height ?? stack.clientHeight;
      sizeRef.current = { width, height };
      scheduleDrawRef.current();
    };
    measure();
    const observer = new ResizeObserver((entries) => measure(entries[0]));
    observer.observe(stack);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    scheduleDrawRef.current();
  }, [cells, rows, cols, canvasScale, codesVisible, getCode, getTextColor]);

  useEffect(() => {
    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) scheduleDrawRef.current();
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
