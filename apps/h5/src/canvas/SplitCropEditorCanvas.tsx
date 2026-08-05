import { useEffect, useRef } from 'react';
import type { AlignedGrid } from '../shared/h5Types';
import type { CropBounds } from '../utils/splitCrop';
import { alignedCropBoundary, clampCropBounds, moveCropBounds } from '../utils/splitCrop';
import { drawAttachedSplitGrid, drawCanvasCheckerboard } from './H5CanvasPreview';

export type CropHandle = 'top-left' | 'top' | 'top-right' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left';
type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

export function cropSelectionRect(
  imageRect: Rect,
  bounds: CropBounds,
  rows: number,
  cols: number,
  alignment?: Pick<AlignedGrid, 'offsetX' | 'offsetY' | 'cellSize' | 'cropWidth' | 'cropHeight'>,
): Rect {
  if (alignment) {
    const scaleX = imageRect.width / Math.max(1, alignment.cropWidth);
    const scaleY = imageRect.height / Math.max(1, alignment.cropHeight);
    const left = alignedCropBoundary(bounds.left, cols, alignment.offsetX, alignment.cellSize, alignment.cropWidth);
    const right = alignedCropBoundary(bounds.right, cols, alignment.offsetX, alignment.cellSize, alignment.cropWidth);
    const top = alignedCropBoundary(bounds.top, rows, alignment.offsetY, alignment.cellSize, alignment.cropHeight);
    const bottom = alignedCropBoundary(bounds.bottom, rows, alignment.offsetY, alignment.cellSize, alignment.cropHeight);
    return {
      x: imageRect.x + left * scaleX,
      y: imageRect.y + top * scaleY,
      width: (right - left) * scaleX,
      height: (bottom - top) * scaleY,
    };
  }
  return {
    x: imageRect.x + (bounds.left / Math.max(1, cols)) * imageRect.width,
    y: imageRect.y + (bounds.top / Math.max(1, rows)) * imageRect.height,
    width: ((bounds.right - bounds.left) / Math.max(1, cols)) * imageRect.width,
    height: ((bounds.bottom - bounds.top) / Math.max(1, rows)) * imageRect.height,
  };
}

export function cropHandleCenters(rect: Rect): Record<CropHandle, Point> {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return {
    'top-left': { x: rect.x, y: rect.y },
    top: { x: centerX, y: rect.y },
    'top-right': { x: rect.x + rect.width, y: rect.y },
    right: { x: rect.x + rect.width, y: centerY },
    'bottom-right': { x: rect.x + rect.width, y: rect.y + rect.height },
    bottom: { x: centerX, y: rect.y + rect.height },
    'bottom-left': { x: rect.x, y: rect.y + rect.height },
    left: { x: rect.x, y: centerY },
  };
}

export function hitCropHandle(point: Point, selection: Rect, radius: number): CropHandle | null {
  const centers = cropHandleCenters(selection);
  let best: { handle: CropHandle; distance: number } | null = null;
  for (const [handle, center] of Object.entries(centers) as Array<[CropHandle, Point]>) {
    const distance = Math.hypot(point.x - center.x, point.y - center.y);
    if (distance <= radius && (!best || distance < best.distance)) best = { handle, distance };
  }
  return best?.handle ?? null;
}

function fitImageRect(viewport: { width: number; height: number }, crop: { width: number; height: number }, zoom: number): Rect {
  const padding = 0;
  const fit = Math.min(
    Math.max(1, viewport.width - padding * 2) / Math.max(1, crop.width),
    Math.max(1, viewport.height - padding * 2) / Math.max(1, crop.height),
  );
  const width = crop.width * fit * zoom;
  const height = crop.height * fit * zoom;
  return { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height };
}

function pointerDistance(points: Point[]): number {
  return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function updateBoundsFromHandle(
  bounds: CropBounds,
  handle: CropHandle,
  col: number,
  row: number,
  rows: number,
  cols: number,
): CropBounds {
  const next = { ...bounds };
  if (handle.includes('left')) next.left = Math.min(Math.max(0, col), bounds.right - 1);
  if (handle.includes('right')) next.right = Math.max(Math.min(cols, col), bounds.left + 1);
  if (handle.includes('top')) next.top = Math.min(Math.max(0, row), bounds.bottom - 1);
  if (handle.includes('bottom')) next.bottom = Math.max(Math.min(rows, row), bounds.top + 1);
  return clampCropBounds(next, cols, rows);
}

export function SplitCropEditorCanvas({
  imageUrl,
  sourceCrop,
  rows,
  cols,
  alignment,
  bounds,
  zoom,
  onBoundsChange,
  onZoomChange,
}: {
  imageUrl: string;
  sourceCrop: { x: number; y: number; width: number; height: number };
  rows: number;
  cols: number;
  alignment?: AlignedGrid;
  bounds: CropBounds;
  zoom: number;
  onBoundsChange: (bounds: CropBounds) => void;
  onZoomChange: (zoom: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const boundsRef = useRef(bounds);
  const zoomRef = useRef(zoom);
  const layoutRef = useRef<{ imageRect: Rect; selection: Rect } | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const dragRef = useRef<CropHandle | 'move' | null>(null);
  const dragStartGridRef = useRef<{ col: number; row: number } | null>(null);
  const dragStartBoundsRef = useRef<CropBounds | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const frameRef = useRef(0);
  const drawRef = useRef<() => void>(() => undefined);

  const scheduleDraw = () => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      drawRef.current();
    });
  };

  drawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const backingWidth = Math.max(1, Math.round(rect.width * pixelRatio));
    const backingHeight = Math.max(1, Math.round(rect.height * pixelRatio));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    drawCanvasCheckerboard(context, rect);

    const imageRect = fitImageRect(rect, sourceCrop, zoomRef.current);
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        image,
        sourceCrop.x,
        sourceCrop.y,
        sourceCrop.width,
        sourceCrop.height,
        imageRect.x,
        imageRect.y,
        imageRect.width,
        imageRect.height,
      );
    }
    drawAttachedSplitGrid(context, imageRect, sourceCrop, rows, cols, alignment);

    const selection = cropSelectionRect(imageRect, boundsRef.current, rows, cols, alignment);
    layoutRef.current = { imageRect, selection };
    context.fillStyle = 'rgba(4, 8, 14, 0.58)';
    context.fillRect(0, 0, rect.width, Math.max(0, selection.y));
    context.fillRect(0, selection.y + selection.height, rect.width, Math.max(0, rect.height - selection.y - selection.height));
    context.fillRect(0, selection.y, Math.max(0, selection.x), selection.height);
    context.fillRect(selection.x + selection.width, selection.y, Math.max(0, rect.width - selection.x - selection.width), selection.height);

    context.strokeStyle = '#0a84ff';
    context.lineWidth = 2;
    context.strokeRect(selection.x, selection.y, selection.width, selection.height);
    for (const center of Object.values(cropHandleCenters(selection))) {
      context.fillStyle = '#ffffff';
      context.strokeStyle = '#0a84ff';
      context.lineWidth = 3;
      context.beginPath();
      context.roundRect(center.x - 8, center.y - 8, 16, 16, 4);
      context.fill();
      context.stroke();
    }

    const width = boundsRef.current.right - boundsRef.current.left;
    const height = boundsRef.current.bottom - boundsRef.current.top;
    const label = `${width}列 × ${height}行`;
    context.font = '800 14px system-ui, sans-serif';
    const labelWidth = context.measureText(label).width + 14;
    const labelX = Math.max(selection.x, selection.x + selection.width - labelWidth - 6);
    const labelY = Math.max(selection.y + 20, selection.y + selection.height - 6);
    context.fillStyle = 'rgba(7, 18, 30, 0.76)';
    context.beginPath();
    context.roundRect(labelX, labelY - 19, labelWidth, 22, 5);
    context.fill();
    context.fillStyle = '#22c7ff';
    context.textBaseline = 'middle';
    context.fillText(label, labelX + 7, labelY - 8);

    const zoomLabel = `${Math.round(zoomRef.current * 100)}%`;
    context.font = '800 14px system-ui, sans-serif';
    const zoomWidth = context.measureText(zoomLabel).width + 24;
    context.fillStyle = 'rgba(0, 0, 0, 0.68)';
    context.beginPath();
    context.roundRect(rect.width - zoomWidth - 18, rect.height - 48, zoomWidth, 32, 16);
    context.fill();
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(zoomLabel, rect.width - zoomWidth / 2 - 18, rect.height - 32);
    context.textAlign = 'start';
  };

  useEffect(() => {
    boundsRef.current = bounds;
    scheduleDraw();
  }, [bounds]);

  useEffect(() => {
    zoomRef.current = zoom;
    scheduleDraw();
  }, [zoom]);

  useEffect(() => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      imageRef.current = image;
      scheduleDraw();
    };
    image.src = imageUrl;
    return () => {
      image.onload = null;
      if (imageRef.current === image) imageRef.current = null;
    };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(canvas);
    scheduleDraw();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, []);

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const pointToGrid = (point: Point): { col: number; row: number } => {
    const imageRect = layoutRef.current?.imageRect;
    if (!imageRect) return { col: 0, row: 0 };
    const relativeX = ((point.x - imageRect.x) / Math.max(1, imageRect.width)) * sourceCrop.width;
    const relativeY = ((point.y - imageRect.y) / Math.max(1, imageRect.height)) * sourceCrop.height;
    if (alignment) {
      return {
        col: Math.round((relativeX - alignment.offsetX) / alignment.cellSize),
        row: Math.round((relativeY - alignment.offsetY) / alignment.cellSize),
      };
    }
    return {
      col: Math.round((relativeX / sourceCrop.width) * cols),
      row: Math.round((relativeY / sourceCrop.height) * rows),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const point = canvasPoint(event);
    pointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()].slice(0, 2);
      pinchRef.current = { distance: Math.max(1, pointerDistance(points)), zoom: zoomRef.current };
      dragRef.current = null;
      return;
    }
    const selection = layoutRef.current?.selection;
    if (selection) {
      dragRef.current = hitCropHandle(point, selection, 24);
      if (!dragRef.current && point.x >= selection.x && point.x <= selection.x + selection.width && point.y >= selection.y && point.y <= selection.y + selection.height) {
        dragRef.current = 'move';
        dragStartGridRef.current = pointToGrid(point);
        dragStartBoundsRef.current = { ...boundsRef.current };
      }
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    const point = canvasPoint(event);
    pointersRef.current.set(event.pointerId, point);
    if (pinchRef.current && pointersRef.current.size >= 2) {
      const distance = pointerDistance([...pointersRef.current.values()].slice(0, 2));
      zoomRef.current = Math.max(0.5, Math.min(4, pinchRef.current.zoom * (distance / pinchRef.current.distance)));
      scheduleDraw();
      return;
    }
    if (!dragRef.current) return;
    const grid = pointToGrid(point);
    if (dragRef.current === 'move' && dragStartGridRef.current && dragStartBoundsRef.current) {
      boundsRef.current = moveCropBounds(
        dragStartBoundsRef.current,
        grid.col - dragStartGridRef.current.col,
        grid.row - dragStartGridRef.current.row,
        cols,
        rows,
      );
    } else if (dragRef.current && dragRef.current !== 'move') {
      boundsRef.current = updateBoundsFromHandle(boundsRef.current, dragRef.current, grid.col, grid.row, rows, cols);
    }
    scheduleDraw();
  };

  const finishPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pinchRef.current && pointersRef.current.size < 2) {
      pinchRef.current = null;
      onZoomChange(zoomRef.current);
    }
    if (dragRef.current) {
      dragRef.current = null;
      dragStartGridRef.current = null;
      dragStartBoundsRef.current = null;
      onBoundsChange(boundsRef.current);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="split-crop-editor-canvas"
      aria-label={`单画布裁剪编辑器 ${cols}列 × ${rows}行`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
    />
  );
}
