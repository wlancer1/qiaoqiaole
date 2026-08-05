import type { Cell } from '@qiaoqiaole/core';

export type CropBounds = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export function shouldRebuildSplitPreview(input: {
  isCropStep: boolean;
  isCropped: boolean;
  hasUploadedImage: boolean;
}): boolean {
  return input.isCropStep && !input.isCropped && input.hasUploadedImage;
}

export function splitPreviewBackTarget(): 'split-crop' {
  return 'split-crop';
}

export function alignedCropBoundary(index: number, count: number, offset: number, cellSize: number, sourceSize: number): number {
  if (index <= 0) return 0;
  if (index >= count) return sourceSize;
  return Math.max(0, Math.min(sourceSize, offset + index * cellSize));
}

export function splitCropRegion(
  sourceCrop: { x: number; y: number; width: number; height: number },
  bounds: CropBounds,
  cols: number,
  rows: number,
  alignment?: { offsetX: number; offsetY: number; cellSize: number },
): { x: number; y: number; width: number; height: number } {
  const safeBounds = clampCropBounds(bounds, cols, rows);
  if (alignment) {
    const left = alignedCropBoundary(safeBounds.left, cols, alignment.offsetX, alignment.cellSize, sourceCrop.width);
    const right = alignedCropBoundary(safeBounds.right, cols, alignment.offsetX, alignment.cellSize, sourceCrop.width);
    const top = alignedCropBoundary(safeBounds.top, rows, alignment.offsetY, alignment.cellSize, sourceCrop.height);
    const bottom = alignedCropBoundary(safeBounds.bottom, rows, alignment.offsetY, alignment.cellSize, sourceCrop.height);
    return {
      x: sourceCrop.x + left,
      y: sourceCrop.y + top,
      width: right - left,
      height: bottom - top,
    };
  }
  return {
    x: sourceCrop.x + (safeBounds.left / cols) * sourceCrop.width,
    y: sourceCrop.y + (safeBounds.top / rows) * sourceCrop.height,
    width: ((safeBounds.right - safeBounds.left) / cols) * sourceCrop.width,
    height: ((safeBounds.bottom - safeBounds.top) / rows) * sourceCrop.height,
  };
}

export function getAutoCropBounds(cells: readonly Cell[], cols: number, rows: number): CropBounds {
  const visible = cells.filter((cell) => !cell.transparent);
  if (visible.length === 0) return { top: 0, right: cols, bottom: rows, left: 0 };
  const left = Math.min(...visible.map((cell) => cell.x));
  const right = Math.max(...visible.map((cell) => cell.x)) + 1;
  const top = Math.min(...visible.map((cell) => cell.y));
  const bottom = Math.max(...visible.map((cell) => cell.y)) + 1;
  return { top, right, bottom, left };
}

export function clampCropBounds(bounds: CropBounds, cols: number, rows: number): CropBounds {
  const left = Math.max(0, Math.min(cols - 1, Math.floor(bounds.left)));
  const top = Math.max(0, Math.min(rows - 1, Math.floor(bounds.top)));
  const right = Math.max(left + 1, Math.min(cols, Math.floor(bounds.right)));
  const bottom = Math.max(top + 1, Math.min(rows, Math.floor(bounds.bottom)));
  return { top, right, bottom, left };
}

export function moveCropBounds(bounds: CropBounds, deltaCol: number, deltaRow: number, cols: number, rows: number): CropBounds {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const left = Math.max(0, Math.min(cols - width, Math.floor(bounds.left + deltaCol)));
  const top = Math.max(0, Math.min(rows - height, Math.floor(bounds.top + deltaRow)));
  return { top, right: left + width, bottom: top + height, left };
}

export function cropCells(cells: readonly Cell[], cols: number, rows: number, inputBounds: CropBounds): Cell[] {
  const bounds = clampCropBounds(inputBounds, cols, rows);
  return cells
    .filter((cell) => cell.x >= bounds.left && cell.x < bounds.right && cell.y >= bounds.top && cell.y < bounds.bottom)
    .map((cell) => ({ ...cell, x: cell.x - bounds.left, y: cell.y - bounds.top }));
}

export function cropSize(bounds: CropBounds): { cols: number; rows: number } {
  return { cols: bounds.right - bounds.left, rows: bounds.bottom - bounds.top };
}
