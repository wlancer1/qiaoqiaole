import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, Touch as ReactTouch } from 'react';
import { useTransformEffect } from 'react-zoom-pan-pinch';
import {
  buildCellsFromSamples,
  cropTransparentBounds,
  MARD_221_HEX,
  sampleDominantColor,
  SPLIT_DOMINANT_SAMPLE_GRID_SIZE,
  type Cell,
} from '@qiaoqiaole/core';
import type { AlignedGrid, GridHandle, GridHandlePosition } from '../shared/h5Types';

const EMPTY_COLOR = '#ffffff';
const GRID_CONTROL_CELLS = 3;

export function GridOverlay({ rows, cols, className = '' }: { rows: number; cols: number; className?: string }) {
  const verticalLines = Array.from({ length: Math.max(0, cols - 1) }, (_, index) => index + 1);
  const horizontalLines = Array.from({ length: Math.max(0, rows - 1) }, (_, index) => index + 1);
  return (
    <div className={`split-grid-overlay ${className}`.trim()} aria-hidden="true">
      {verticalLines.map((line) => (
        <span key={`v-${line}`} className="split-grid-line vertical" style={{ left: `${(line / cols) * 100}%` }} />
      ))}
      {horizontalLines.map((line) => (
        <span key={`h-${line}`} className="split-grid-line horizontal" style={{ top: `${(line / rows) * 100}%` }} />
      ))}
    </div>
  );
}

export function CanvasRulers({ rows, cols }: { rows: number; cols: number }) {
  const columnTicks = rulerTicks(cols);
  const rowTicks = rulerTicks(rows);
  return (
    <div className="h5-canvas-rulers" aria-hidden={false}>
      <div className="h5-column-ruler" aria-label="画布列标尺">
        {columnTicks.map((tick) => (
          <span
            key={`col-${tick}`}
            className="h5-ruler-label"
            aria-label={`画布列标 ${tick}`}
            style={{ left: `${((tick - 0.5) / cols) * 100}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
      <div className="h5-row-ruler" aria-label="画布行标尺">
        {rowTicks.map((tick) => (
          <span
            key={`row-${tick}`}
            className="h5-ruler-label"
            aria-label={`画布行标 ${tick}`}
            style={{ top: `${((tick - 0.5) / rows) * 100}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}

export function rulerTicks(size: number): number[] {
  const safeSize = Math.max(1, size);
  const ticks: number[] = [];
  for (let tick = 1; tick <= safeSize; tick += 5) {
    ticks.push(tick);
  }
  return ticks;
}

export type CanvasRulerRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ViewportRulerTick = {
  tick: number;
  offset: number;
};

export type ViewportRulerGeometry = {
  sticky: boolean;
  columns: ViewportRulerTick[];
  rows: ViewportRulerTick[];
};

const RULER_OVERFLOW_TOLERANCE = 1;

export function isCanvasRulerOverflowing(
  stageRect: CanvasRulerRect,
  artboardRect: CanvasRulerRect,
  scale = 1,
  tolerance = RULER_OVERFLOW_TOLERANCE,
): boolean {
  if (scale <= 1) return false;
  const stageRight = stageRect.left + stageRect.width;
  const stageBottom = stageRect.top + stageRect.height;
  const artboardRight = artboardRect.left + artboardRect.width;
  const artboardBottom = artboardRect.top + artboardRect.height;
  return artboardRect.left < stageRect.left + tolerance
    || artboardRect.top < stageRect.top + tolerance
    || artboardRight > stageRight - tolerance
    || artboardBottom > stageBottom - tolerance;
}

function visibleRulerTicks(
  size: number,
  cellSize: number,
  artboardOffset: number,
  viewportSize: number,
): ViewportRulerTick[] {
  return rulerTicks(size)
    .map((tick) => ({ tick, offset: artboardOffset + (tick - 0.5) * cellSize }))
    .filter(({ offset }) => offset >= 0 && offset <= viewportSize);
}

export function getViewportRulerGeometry(
  stageRect: CanvasRulerRect,
  artboardRect: CanvasRulerRect,
  rows: number,
  cols: number,
  scale = 1,
): ViewportRulerGeometry {
  const safeRows = Math.max(1, rows);
  const safeCols = Math.max(1, cols);
  const cellWidth = artboardRect.width / safeCols;
  const cellHeight = artboardRect.height / safeRows;
  const artboardLeft = artboardRect.left - stageRect.left;
  const artboardTop = artboardRect.top - stageRect.top;

  return {
    sticky: isCanvasRulerOverflowing(stageRect, artboardRect, scale),
    columns: visibleRulerTicks(safeCols, cellWidth, artboardLeft, stageRect.width),
    rows: visibleRulerTicks(safeRows, cellHeight, artboardTop, stageRect.height),
  };
}

export function CanvasViewportRulers({
  stageRef,
  artboardRef,
  rows,
  cols,
  scale,
  onStickyChange,
}: {
  stageRef: { current: HTMLElement | null };
  artboardRef: { current: HTMLDivElement | null };
  rows: number;
  cols: number;
  scale: number;
  onStickyChange?: (sticky: boolean) => void;
}) {
  const [geometry, setGeometry] = useState<ViewportRulerGeometry>({ sticky: false, columns: [], rows: [] });
  const frameRef = useRef<number | null>(null);
  const measure = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const stage = stageRef.current;
      const artboard = artboardRef.current;
      if (!stage || !artboard) return;
      const stageBounds = stage.getBoundingClientRect();
      const artboardBounds = artboard.getBoundingClientRect();
      setGeometry(getViewportRulerGeometry(
        {
          left: stageBounds.left,
          top: stageBounds.top,
          width: stageBounds.width,
          height: stageBounds.height,
        },
        {
          left: artboardBounds.left,
          top: artboardBounds.top,
          width: artboardBounds.width,
          height: artboardBounds.height,
        },
        rows,
        cols,
        scale,
      ));
    });
  }, [artboardRef, cols, rows, scale, stageRef]);

  useLayoutEffect(() => {
    measure();
    const stage = stageRef.current;
    const artboard = artboardRef.current;
    if (!stage || !artboard) return undefined;
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(stage);
    resizeObserver.observe(artboard);
    const browserWindow = typeof window === 'undefined' ? null : window;
    browserWindow?.addEventListener('resize', measure);
    return () => {
      resizeObserver.disconnect();
      browserWindow?.removeEventListener('resize', measure);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [artboardRef, measure, stageRef]);

  useTransformEffect(() => {
    measure();
  });

  useEffect(() => {
    onStickyChange?.(geometry.sticky);
  }, [geometry.sticky, onStickyChange]);

  return (
    <div className={geometry.sticky ? 'h5-viewport-rulers is-visible' : 'h5-viewport-rulers'} aria-hidden={!geometry.sticky}>
      <div className="h5-viewport-column-ruler" aria-label="当前可视列标尺">
        {geometry.columns.map(({ tick, offset }) => (
          <span key={`viewport-col-${tick}`} className="h5-viewport-ruler-label" style={{ left: `${offset}px` }}>
            {tick}
          </span>
        ))}
      </div>
      <div className="h5-viewport-row-ruler" aria-label="当前可视行标尺">
        {geometry.rows.map(({ tick, offset }) => (
          <span key={`viewport-row-${tick}`} className="h5-viewport-ruler-label" style={{ top: `${offset}px` }}>
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CanvasScaleObserver({ onScaleChange }: { onScaleChange: (scale: number) => void }) {
  useTransformEffect(({ state }) => {
    onScaleChange(state.scale);
  });
  return null;
}

export function touchDistance(first: ReactTouch, second: ReactTouch): number {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

export function clampSplitImageScale(scale: number): number {
  return Math.max(0.5, Math.min(8, scale));
}

export function GridAlignmentHandles({
  grid,
  origin,
  imageScale = 1,
  imageOffset = { x: 0, y: 0 },
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: {
  grid: AlignedGrid;
  origin: GridHandlePosition;
  imageScale?: number;
  imageOffset?: { x: number; y: number };
  onPointerDown: (handle: GridHandle, event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const update = () => {
      const rect = layer.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  const baseRect = viewport.width > 0 && viewport.height > 0
    ? fitSplitImageRect(viewport, { width: grid.cropWidth, height: grid.cropHeight })
    : { x: 0, y: 0, width: viewport.width, height: viewport.height };
  const scaledImageRect = scaleRectFromCenter(baseRect, imageScale);
  const imageRect = {
    ...scaledImageRect,
    x: scaledImageRect.x + imageOffset.x,
    y: scaledImageRect.y + imageOffset.y,
  };
  const frameWidth = (grid.cellSize * GRID_CONTROL_CELLS / Math.max(1, grid.cropWidth)) * imageRect.width;
  const frameHeight = (grid.cellSize * GRID_CONTROL_CELLS / Math.max(1, grid.cropHeight)) * imageRect.height;
  const movePosition = {
    x: imageRect.x + (origin.x / 100) * imageRect.width,
    y: imageRect.y + (origin.y / 100) * imageRect.height,
  };
  const scalePosition = {
    x: movePosition.x + frameWidth,
    y: movePosition.y + frameHeight,
  };
  const handles: Array<{ id: GridHandle; label: string; text: string; className: string }> = [
    { id: 'move', label: '按住移动网格', text: '移动', className: 'move' },
    { id: 'scale', label: '按住缩放网格', text: '缩放', className: 'scale' },
  ];

  return (
    <div ref={layerRef} className="split-grid-handle-layer" aria-hidden={false}>
      <div
        className="split-grid-control-frame"
        data-grid-span={GRID_CONTROL_CELLS}
        style={{
          left: `${movePosition.x}px`,
          top: `${movePosition.y}px`,
          width: `${frameWidth}px`,
          height: `${frameHeight}px`,
        }}
        onPointerDown={(event) => onPointerDown('move', event)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />
      {handles.map((handle) => (
        <button
          key={handle.id}
          type="button"
          aria-label={handle.label}
          className={`split-grid-handle ${handle.className}`}
          style={{
            left: `${(handle.id === 'scale' ? scalePosition : movePosition).x}px`,
            top: `${(handle.id === 'scale' ? scalePosition : movePosition).y}px`,
          }}
          onPointerDown={(event) => onPointerDown(handle.id, event)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <span className="split-grid-handle-ring" aria-hidden="true" />
          <span className="split-grid-handle-label">{handle.text}</span>
        </button>
      ))}
    </div>
  );
}

export function drawAlignedGridLines(
  context: CanvasRenderingContext2D,
  rect: { width: number; height: number },
  startX: number,
  startY: number,
  stepX: number,
  stepY: number,
  majorEvery = 1,
) {
  if (stepX <= 0 || stepY <= 0) return;
  let firstColumn = Math.floor(-startX / stepX);
  while (startX + firstColumn * stepX > 0) firstColumn -= 1;
  for (let column = firstColumn; startX + column * stepX <= rect.width; column += 1) {
    if (column % majorEvery !== 0) continue;
    const px = startX + column * stepX;
    context.moveTo(px, 0);
    context.lineTo(px, rect.height);
  }

  let firstRow = Math.floor(-startY / stepY);
  while (startY + firstRow * stepY > 0) firstRow -= 1;
  for (let row = firstRow; startY + row * stepY <= rect.height; row += 1) {
    if (row % majorEvery !== 0) continue;
    const py = startY + row * stepY;
    context.moveTo(0, py);
    context.lineTo(rect.width, py);
  }
}

export function SplitPreviewCanvas({
  imageData,
  crop,
  rows,
  cols,
  alignment,
  imageScale = 1,
  imageOffset = { x: 0, y: 0 },
  fitScale = 0.82,
}: {
  imageData: ImageData;
  crop: { x: number; y: number; width: number; height: number };
  rows: number;
  cols: number;
  alignment?: AlignedGrid;
  imageScale?: number;
  imageOffset?: { x: number; y: number };
  fitScale?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvas = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.putImageData(imageData, 0, 0);
    return canvas;
  }, [imageData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceCanvas) return;

    let frameId = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * pixelRatio));
      const height = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      drawCanvasCheckerboard(context, rect);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const baseImageRect = fitSplitImageRect(rect, crop, fitScale);
      const safeImageScale = clampSplitImageScale(imageScale);
      const scaledImageRect = scaleRectFromCenter(baseImageRect, safeImageScale);
      const imageRect = {
        ...scaledImageRect,
        x: scaledImageRect.x + imageOffset.x,
        y: scaledImageRect.y + imageOffset.y,
      };
      context.save();
      context.beginPath();
      context.rect(0, 0, rect.width, rect.height);
      context.clip();
      context.drawImage(
        sourceCanvas,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        imageRect.x,
        imageRect.y,
        imageRect.width,
        imageRect.height,
      );
      drawAttachedSplitGrid(context, imageRect, crop, rows, cols, alignment);
      context.restore();
    };

    const scheduleDraw = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(draw);
    };

    scheduleDraw();
    const resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(canvas);
    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [alignment, cols, crop.height, crop.width, crop.x, crop.y, fitScale, imageOffset.x, imageOffset.y, imageScale, rows, sourceCanvas]);

  return <canvas ref={canvasRef} className="split-preview-canvas" aria-label="切割画布预览" />;
}

export function drawCanvasCheckerboard(context: CanvasRenderingContext2D, rect: { width: number; height: number }) {
  const tileSize = 16;
  context.fillStyle = '#1a1b1d';
  context.fillRect(0, 0, rect.width, rect.height);
  context.fillStyle = '#222426';
  for (let y = 0; y < rect.height; y += tileSize) {
    for (let x = 0; x < rect.width; x += tileSize) {
      if ((x / tileSize + y / tileSize) % 2 === 0) context.fillRect(x, y, tileSize, tileSize);
    }
  }
}

export function fitSplitImageRect(rect: { width: number; height: number }, crop: { width: number; height: number }, fitScale = 0.82) {
  const scale = Math.min(rect.width / Math.max(1, crop.width), rect.height / Math.max(1, crop.height)) * Math.max(0.1, fitScale);
  const width = Math.max(1, crop.width * scale);
  const height = Math.max(1, crop.height * scale);
  return { x: (rect.width - width) / 2, y: (rect.height - height) / 2, width, height };
}

export function scaleRectFromCenter(rect: { x: number; y: number; width: number; height: number }, scale: number) {
  const width = rect.width * scale;
  const height = rect.height * scale;
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}

export function drawAttachedGridLines(
  context: CanvasRenderingContext2D,
  imageRect: { x: number; y: number; width: number; height: number },
  startX: number,
  startY: number,
  stepX: number,
  stepY: number,
  majorEvery = 1,
) {
  if (stepX <= 0 || stepY <= 0) return;
  let column = Math.ceil((imageRect.x - startX) / stepX);
  for (let x = startX + column * stepX; x <= imageRect.x + imageRect.width; x += stepX, column += 1) {
    if (column % majorEvery !== 0) continue;
    context.moveTo(x, imageRect.y);
    context.lineTo(x, imageRect.y + imageRect.height);
  }
  let row = Math.ceil((imageRect.y - startY) / stepY);
  for (let y = startY + row * stepY; y <= imageRect.y + imageRect.height; y += stepY, row += 1) {
    if (row % majorEvery !== 0) continue;
    context.moveTo(imageRect.x, y);
    context.lineTo(imageRect.x + imageRect.width, y);
  }
}

export function drawAttachedSplitGrid(
  context: CanvasRenderingContext2D,
  imageRect: { x: number; y: number; width: number; height: number },
  crop: { width: number; height: number },
  rows: number,
  cols: number,
  alignment?: AlignedGrid,
) {
  const drawLines = (majorEvery: number) => {
    if (alignment) {
      const startX = imageRect.x + (alignment.offsetX / crop.width) * imageRect.width;
      const startY = imageRect.y + (alignment.offsetY / crop.height) * imageRect.height;
      const stepX = (alignment.cellSize / crop.width) * imageRect.width;
      const stepY = (alignment.cellSize / crop.height) * imageRect.height;
      drawAttachedGridLines(context, imageRect, startX, startY, stepX, stepY, majorEvery);
      return;
    }
    for (let x = majorEvery; x < cols; x += majorEvery) {
      const px = imageRect.x + (x / cols) * imageRect.width;
      context.moveTo(px, imageRect.y);
      context.lineTo(px, imageRect.y + imageRect.height);
    }
    for (let y = majorEvery; y < rows; y += majorEvery) {
      const py = imageRect.y + (y / rows) * imageRect.height;
      context.moveTo(imageRect.x, py);
      context.lineTo(imageRect.x + imageRect.width, py);
    }
  };

  context.lineWidth = 1;
  context.strokeStyle = 'rgba(32, 142, 220, 0.46)';
  context.beginPath();
  drawLines(1);
  context.stroke();
  context.lineWidth = 1.5;
  context.strokeStyle = 'rgba(20, 105, 180, 0.72)';
  context.beginPath();
  drawLines(5);
  context.stroke();
}

export function createBlankCells(rows: number, cols: number): Cell[] {
  return buildCellsFromSamples(rows, cols, () => EMPTY_COLOR).map((cell) => ({ ...cell, transparent: true }));
}

export function getImageCrop(imageData: ImageData) {
  const alpha = Array.from({ length: imageData.data.length / 4 }, (_, index) => imageData.data[index * 4 + 3] ?? 0);
  return cropTransparentBounds(alpha, imageData.width, imageData.height);
}

export function initialAlignCellSize(crop: { width: number; height: number }, cols: number, rows: number): number {
  const requestedSize = Math.max(crop.width / Math.max(1, cols), crop.height / Math.max(1, rows));
  return Math.max(1, Math.min(
    requestedSize,
    crop.width / GRID_CONTROL_CELLS,
    crop.height / GRID_CONTROL_CELLS,
  ));
}

export function centeredAlignmentOffset(crop: { width: number; height: number }, cellSize: number) {
  const safeCellSize = Math.max(1, cellSize);
  const cols = Math.max(1, Math.floor(crop.width / safeCellSize));
  const rows = Math.max(1, Math.floor(crop.height / safeCellSize));
  return {
    x: Math.max(0, (crop.width - cols * safeCellSize) / 2),
    y: Math.max(0, (crop.height - rows * safeCellSize) / 2),
  };
}

export function centeredGridControlOrigin(
  crop: { width: number; height: number },
  cellSize: number,
  offset: { x: number; y: number },
): GridHandlePosition {
  const frameSize = cellSize * GRID_CONTROL_CELLS;
  const centeredGridLine = (size: number, gridOffset: number) => {
    const maxStart = Math.max(0, size - frameSize);
    const minIndex = Math.ceil(-gridOffset / cellSize);
    const maxIndex = Math.floor((maxStart - gridOffset) / cellSize);
    if (maxIndex < minIndex) return maxStart / 2;
    const target = maxStart / 2;
    const targetIndex = Math.round((target - gridOffset) / cellSize);
    const index = Math.max(minIndex, Math.min(maxIndex, targetIndex));
    return gridOffset + index * cellSize;
  };
  return {
    x: (centeredGridLine(crop.width, offset.x) / Math.max(1, crop.width)) * 100,
    y: (centeredGridLine(crop.height, offset.y) / Math.max(1, crop.height)) * 100,
  };
}

export function normalizeGridOffset(offset: number, cellSize: number): number {
  const safeCellSize = Math.max(1, cellSize);
  return ((offset % safeCellSize) + safeCellSize) % safeCellSize;
}

export function gridSizeFromAlignment(
  crop: { width: number; height: number },
  cellSize: number,
  offsetX: number,
  offsetY: number,
): AlignedGrid {
  const safeCellSize = Math.max(1, cellSize);
  const normalizedOffsetX = normalizeGridOffset(offsetX, safeCellSize);
  const normalizedOffsetY = normalizeGridOffset(offsetY, safeCellSize);
  const safeOffsetX = Math.min(normalizedOffsetX, Math.max(0, crop.width - safeCellSize));
  const safeOffsetY = Math.min(normalizedOffsetY, Math.max(0, crop.height - safeCellSize));
  return {
    cols: Math.max(1, Math.floor((crop.width - safeOffsetX) / safeCellSize)),
    rows: Math.max(1, Math.floor((crop.height - safeOffsetY) / safeCellSize)),
    cellSize: safeCellSize,
    offsetX: safeOffsetX,
    offsetY: safeOffsetY,
    cropWidth: crop.width,
    cropHeight: crop.height,
  };
}

function cellFromImageSamples(x: number, y: number, pixels: number[]): Cell {
  const sampleCount = pixels.length / 4;
  let transparentSamples = 0;
  const opaquePixels: number[] = [];
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if ((pixels[offset + 3] ?? 0) < 128) {
      transparentSamples += 1;
      continue;
    }
    opaquePixels.push(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]);
  }
  const transparent = transparentSamples > sampleCount / 2;
  return {
    x,
    y,
    color: transparent ? EMPTY_COLOR : sampleDominantColor(opaquePixels, MARD_221_HEX),
    transparent,
  };
}

export function cellsFromImage(
  imageData: ImageData,
  rows: number,
  cols: number,
  crop = getImageCrop(imageData),
): Cell[] {
  // Use the authorized palette-vote grid so isolated noisy pixels do not decide a cell color.
  const samplesPerCell = SPLIT_DOMINANT_SAMPLE_GRID_SIZE;

  const cells: Cell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
    const pixels: number[] = [];
    for (let sy = 0; sy < samplesPerCell; sy += 1) {
      for (let sx = 0; sx < samplesPerCell; sx += 1) {
        const px = Math.min(
          imageData.width - 1,
          Math.floor(crop.x + ((x + (sx + 0.5) / samplesPerCell) / cols) * crop.width),
        );
        const py = Math.min(
          imageData.height - 1,
          Math.floor(crop.y + ((y + (sy + 0.5) / samplesPerCell) / rows) * crop.height),
        );
        const offset = (py * imageData.width + px) * 4;
        pixels.push(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2], imageData.data[offset + 3]);
      }
    }
      cells.push(cellFromImageSamples(x, y, pixels));
    }
  }
  return cells;
}

export async function cellsFromImageAsync(
  imageData: ImageData,
  rows: number,
  cols: number,
  crop = getImageCrop(imageData),
  onProgress?: (progress: number) => void,
): Promise<Cell[]> {
  const samplesPerCell = SPLIT_DOMINANT_SAMPLE_GRID_SIZE;
  const cells: Cell[] = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const pixels: number[] = [];
      for (let sy = 0; sy < samplesPerCell; sy += 1) {
        for (let sx = 0; sx < samplesPerCell; sx += 1) {
          const px = Math.min(
            imageData.width - 1,
            Math.floor(crop.x + ((x + (sx + 0.5) / samplesPerCell) / cols) * crop.width),
          );
          const py = Math.min(
            imageData.height - 1,
            Math.floor(crop.y + ((y + (sy + 0.5) / samplesPerCell) / rows) * crop.height),
          );
          const offset = (py * imageData.width + px) * 4;
          pixels.push(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2], imageData.data[offset + 3]);
        }
      }
      cells.push(cellFromImageSamples(x, y, pixels));
    }
    onProgress?.((y + 1) / Math.max(1, rows));
    if (y % 3 === 2) await yieldToBrowser();
  }
  return cells;
}

export function cellsFromAlignedGrid(
  imageData: ImageData,
  grid: AlignedGrid,
  crop = getImageCrop(imageData),
): Cell[] {
  // Keep aligned sampling consistent with quick split noise removal.
  const samplesPerCell = SPLIT_DOMINANT_SAMPLE_GRID_SIZE;

  const cells: Cell[] = [];
  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.cols; x += 1) {
    const pixels: number[] = [];
    for (let sy = 0; sy < samplesPerCell; sy += 1) {
      for (let sx = 0; sx < samplesPerCell; sx += 1) {
        const px = Math.min(
          imageData.width - 1,
          Math.floor(crop.x + grid.offsetX + (x + (sx + 0.5) / samplesPerCell) * grid.cellSize),
        );
        const py = Math.min(
          imageData.height - 1,
          Math.floor(crop.y + grid.offsetY + (y + (sy + 0.5) / samplesPerCell) * grid.cellSize),
        );
        const offset = (py * imageData.width + px) * 4;
        pixels.push(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2], imageData.data[offset + 3]);
      }
    }
      cells.push(cellFromImageSamples(x, y, pixels));
    }
  }
  return cells;
}

export async function cellsFromAlignedGridAsync(
  imageData: ImageData,
  grid: AlignedGrid,
  crop = getImageCrop(imageData),
  onProgress?: (progress: number) => void,
): Promise<Cell[]> {
  const samplesPerCell = SPLIT_DOMINANT_SAMPLE_GRID_SIZE;
  const cells: Cell[] = [];

  for (let y = 0; y < grid.rows; y += 1) {
    for (let x = 0; x < grid.cols; x += 1) {
      const pixels: number[] = [];
      for (let sy = 0; sy < samplesPerCell; sy += 1) {
        for (let sx = 0; sx < samplesPerCell; sx += 1) {
          const px = Math.min(
            imageData.width - 1,
            Math.floor(crop.x + grid.offsetX + (x + (sx + 0.5) / samplesPerCell) * grid.cellSize),
          );
          const py = Math.min(
            imageData.height - 1,
            Math.floor(crop.y + grid.offsetY + (y + (sy + 0.5) / samplesPerCell) * grid.cellSize),
          );
          const offset = (py * imageData.width + px) * 4;
          pixels.push(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2], imageData.data[offset + 3]);
        }
      }
      cells.push(cellFromImageSamples(x, y, pixels));
    }
    onProgress?.((y + 1) / Math.max(1, grid.rows));
    if (y % 3 === 2) await yieldToBrowser();
  }
  return cells;
}

export function yieldToBrowser(delay = 0): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}
