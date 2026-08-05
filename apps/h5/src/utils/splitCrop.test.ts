import { describe, expect, it } from 'vitest';
import type { Cell } from '@qiaoqiaole/core';
import { cropCells, getAutoCropBounds, moveCropBounds, splitCropRegion, shouldRebuildSplitPreview, splitPreviewBackTarget, type CropBounds } from './splitCrop';

const cells: Cell[] = [
  { x: 0, y: 0, color: '#000', transparent: true },
  { x: 1, y: 0, color: '#000', transparent: true },
  { x: 2, y: 0, color: '#000', transparent: true },
  { x: 0, y: 1, color: '#000', transparent: true },
  { x: 1, y: 1, color: '#f00' },
  { x: 2, y: 1, color: '#0f0' },
  { x: 0, y: 2, color: '#000', transparent: true },
  { x: 1, y: 2, color: '#00f' },
  { x: 2, y: 2, color: '#000', transparent: true },
];

describe('split crop helpers', () => {
  it('maps a quick split crop from grid coordinates to source pixels', () => {
    expect(splitCropRegion(
      { x: 10, y: 20, width: 300, height: 200 },
      { top: 10, right: 30, bottom: 40, left: 5 },
      60,
      40,
    )).toEqual({ x: 35, y: 70, width: 125, height: 150 });
  });

  it('maps an aligned split crop using grid offset and cell size', () => {
    expect(splitCropRegion(
      { x: 10, y: 20, width: 300, height: 200 },
      { top: 2, right: 7, bottom: 8, left: 3 },
      10,
      12,
      { offsetX: 15, offsetY: 12, cellSize: 4 },
    )).toEqual({ x: 37, y: 40, width: 16, height: 24 });
  });

  it('keeps the full source region when all aligned cells are selected', () => {
    expect(splitCropRegion(
      { x: 10, y: 20, width: 300, height: 200 },
      { top: 0, right: 10, bottom: 12, left: 0 },
      10,
      12,
      { offsetX: 15, offsetY: 12, cellSize: 4 },
    )).toEqual({ x: 10, y: 20, width: 300, height: 200 });
  });

  it('moves the whole crop selection by grid cells without leaving the grid', () => {
    expect(moveCropBounds(
      { top: 2, right: 7, bottom: 8, left: 3 },
      2,
      -1,
      10,
      12,
    )).toEqual({ top: 1, right: 9, bottom: 7, left: 5 });
    expect(moveCropBounds(
      { top: 0, right: 10, bottom: 12, left: 0 },
      2,
      2,
      10,
      12,
    )).toEqual({ top: 0, right: 10, bottom: 12, left: 0 });
  });

  it('does not rebuild a confirmed crop when the flow changes pages', () => {
    expect(shouldRebuildSplitPreview({ isCropStep: false, isCropped: true, hasUploadedImage: true })).toBe(false);
    expect(shouldRebuildSplitPreview({ isCropStep: true, isCropped: true, hasUploadedImage: true })).toBe(false);
    expect(shouldRebuildSplitPreview({ isCropStep: true, isCropped: false, hasUploadedImage: true })).toBe(true);
  });

  it('returns to the crop step from split preview', () => {
    expect(splitPreviewBackTarget()).toBe('split-crop');
  });

  it('finds the smallest grid bounds around visible cells', () => {
    expect(getAutoCropBounds(cells, 3, 3)).toEqual({ top: 1, right: 3, bottom: 3, left: 1 });
  });

  it('falls back to the full grid when every cell is transparent', () => {
    expect(getAutoCropBounds(cells.map((cell) => ({ ...cell, transparent: true })), 3, 3)).toEqual({ top: 0, right: 3, bottom: 3, left: 0 });
  });

  it('crops and reindexes the selected cells', () => {
    const bounds: CropBounds = { top: 1, right: 3, bottom: 3, left: 1 };
    expect(cropCells(cells, 3, 3, bounds)).toEqual([
      { x: 0, y: 0, color: '#f00' },
      { x: 1, y: 0, color: '#0f0' },
      { x: 0, y: 1, color: '#00f' },
      { x: 1, y: 1, color: '#000', transparent: true },
    ]);
  });
});
