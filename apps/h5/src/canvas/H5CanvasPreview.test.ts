import { describe, expect, it } from 'vitest';
import {
  cellsFromAlignedGrid,
  cellsFromAlignedGridAsync,
  cellsFromImage,
  cellsFromImageAsync,
  drawAttachedGridLines,
  fitSplitImageRect,
  getViewportRulerGeometry,
  isCanvasRulerOverflowing,
} from './H5CanvasPreview';

describe('split image transparency sampling', () => {
  it('keeps majority-transparent samples transparent in every preview sampling path', async () => {
    const data = new Uint8ClampedArray(5 * 5 * 4);
    for (let index = 0; index < 25; index += 1) {
      data.set([220, 20, 20, index < 13 ? 0 : 255], index * 4);
    }
    const imageData = { data, width: 5, height: 5 } as ImageData;
    const crop = { x: 0, y: 0, width: 5, height: 5 };
    const grid = { rows: 1, cols: 1, cellSize: 5, offsetX: 0, offsetY: 0, cropWidth: 5, cropHeight: 5 };

    expect(cellsFromImage(imageData, 1, 1, crop)[0].transparent).toBe(true);
    expect((await cellsFromImageAsync(imageData, 1, 1, crop))[0].transparent).toBe(true);
    expect(cellsFromAlignedGrid(imageData, grid, crop)[0].transparent).toBe(true);
    expect((await cellsFromAlignedGridAsync(imageData, grid, crop))[0].transparent).toBe(true);
  });
});

describe('fitSplitImageRect', () => {
  it('allows the crop page to fit the source image without an extra outer ring', () => {
    expect(fitSplitImageRect({ width: 300, height: 400 }, { width: 300, height: 400 }, 1)).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 400,
    });
  });
});

describe('drawAttachedGridLines', () => {
  it('does not draw the preceding alignment line outside the image bounds', () => {
    const moves: Array<[number, number]> = [];
    const lines: Array<[number, number]> = [];
    const context = {
      moveTo: (x: number, y: number) => moves.push([x, y]),
      lineTo: (x: number, y: number) => lines.push([x, y]),
    } as unknown as CanvasRenderingContext2D;

    drawAttachedGridLines(context, { x: 20, y: 30, width: 100, height: 80 }, 24, 34, 20, 20);

    expect(moves).toEqual(expect.arrayContaining([[24, 30], [20, 34]]));
    expect(moves.every(([x, y]) => x >= 20 && y >= 30)).toBe(true);
    expect(lines.every(([x, y]) => x <= 120 && y <= 110)).toBe(true);
  });
});

describe('viewport ruler geometry', () => {
  const stage = { left: 0, top: 0, width: 390, height: 620 };

  it('does not switch to sticky rulers while the artboard is fully visible', () => {
    expect(isCanvasRulerOverflowing(stage, { left: 32, top: 80, width: 326, height: 480 })).toBe(false);
  });

  it('switches to sticky rulers when a zoomed artboard clips the workbench', () => {
    expect(isCanvasRulerOverflowing(stage, { left: -240, top: -120, width: 900, height: 900 }, 2)).toBe(true);
  });

  it('does not switch to sticky rulers for an unzoomed oversized artboard', () => {
    expect(isCanvasRulerOverflowing(stage, { left: -240, top: -120, width: 900, height: 900 }, 1)).toBe(false);
  });

  it('places visible labels at the exact centers of their transformed cells', () => {
    expect(getViewportRulerGeometry(
      stage,
      { left: -120, top: -80, width: 800, height: 640 },
      32,
      40,
      2,
    )).toEqual({
      sticky: true,
      columns: [
        { tick: 11, offset: 90 },
        { tick: 16, offset: 190 },
        { tick: 21, offset: 290 },
        { tick: 26, offset: 390 },
      ],
      rows: [
        { tick: 6, offset: 30 },
        { tick: 11, offset: 130 },
        { tick: 16, offset: 230 },
        { tick: 21, offset: 330 },
        { tick: 26, offset: 430 },
        { tick: 31, offset: 530 },
      ],
    });
  });
});
