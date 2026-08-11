import { describe, expect, it } from 'vitest';
import { defaultSplitGeometryFromCrop, scaleCropBoundsToGrid } from './splitImageState';

describe('split image state', () => {
  it('derives default grid and alignment from the current crop', () => {
    const geometry = defaultSplitGeometryFromCrop({ x: 0, y: 0, width: 40, height: 80 });

    expect(geometry.longSide).toBe(80);
    expect(geometry.rows).toBe(80);
    expect(geometry.cols).toBe(40);
    expect(geometry.alignCellSize).toBe(1);
    expect(geometry.alignOffset).toEqual({ x: 0, y: 0 });
    expect(geometry.gridFrameOrigin.x).toBeGreaterThan(0);
    expect(geometry.gridFrameOrigin.y).toBeGreaterThan(0);
  });

  it('preserves the active crop ratio when the background toggle changes grid size', () => {
    expect(scaleCropBoundsToGrid(
      { top: 10, right: 30, bottom: 70, left: 5 },
      { cols: 40, rows: 80 },
      { cols: 20, rows: 40 },
    )).toEqual({ top: 5, right: 15, bottom: 35, left: 2 });
  });
});
