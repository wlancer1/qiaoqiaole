import { describe, expect, it } from 'vitest';
import { cropSelectionRect, hitCropHandle } from './SplitCropEditorCanvas';

describe('single canvas crop geometry', () => {
  it('maps quick split bounds into the displayed image rectangle', () => {
    expect(cropSelectionRect(
      { x: 20, y: 40, width: 300, height: 200 },
      { top: 10, right: 30, bottom: 40, left: 5 },
      60,
      40,
    )).toEqual({ x: 57.5, y: 73.33333333333333, width: 187.5, height: 100 });
  });

  it('maps aligned bounds using grid offset and cell size', () => {
    expect(cropSelectionRect(
      { x: 0, y: 0, width: 300, height: 200 },
      { top: 2, right: 7, bottom: 8, left: 3 },
      10,
      12,
      { offsetX: 15, offsetY: 12, cellSize: 4, cropWidth: 300, cropHeight: 200 },
    )).toEqual({ x: 27, y: 20, width: 16, height: 24 });
  });

  it('covers the whole image when every aligned row and column is selected', () => {
    expect(cropSelectionRect(
      { x: 20, y: 30, width: 300, height: 200 },
      { top: 0, right: 10, bottom: 12, left: 0 },
      12,
      10,
      { offsetX: 15, offsetY: 12, cellSize: 4, cropWidth: 300, cropHeight: 200 },
    )).toEqual({ x: 20, y: 30, width: 300, height: 200 });
  });

  it('hits the nearest canvas crop handle within its touch radius', () => {
    const selection = { x: 20, y: 30, width: 100, height: 80 };
    expect(hitCropHandle({ x: 121, y: 111 }, selection, 22)).toBe('bottom-right');
    expect(hitCropHandle({ x: 70, y: 70 }, selection, 12)).toBeNull();
  });

  it('does not treat a point inside the selection as a crop handle', () => {
    const selection = { x: 20, y: 30, width: 100, height: 80 };
    expect(hitCropHandle({ x: 70, y: 70 }, selection, 12)).toBeNull();
  });
});
