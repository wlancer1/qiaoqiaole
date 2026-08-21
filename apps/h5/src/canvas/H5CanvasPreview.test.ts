import { describe, expect, it } from 'vitest';
import {
  cellsFromAlignedGrid,
  cellsFromAlignedGridAsync,
  cellsFromImage,
  cellsFromImageAsync,
  drawAttachedGridLines,
  getRulerTickInterval,
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

  it('raises ruler label density as transformed cells grow without allowing labels to overlap', () => {
    expect(getRulerTickInterval(6)).toBe(4);
    expect(getRulerTickInterval(12)).toBe(2);
    expect(getRulerTickInterval(24)).toBe(1);
    expect(getRulerTickInterval(48)).toBe(1);
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
        { tick: 7, offset: 10 },
        { tick: 9, offset: 50 },
        { tick: 11, offset: 90 },
        { tick: 13, offset: 130 },
        { tick: 15, offset: 170 },
        { tick: 17, offset: 210 },
        { tick: 19, offset: 250 },
        { tick: 21, offset: 290 },
        { tick: 23, offset: 330 },
        { tick: 25, offset: 370 },
      ],
      rows: [
        { tick: 5, offset: 10 },
        { tick: 7, offset: 50 },
        { tick: 9, offset: 90 },
        { tick: 11, offset: 130 },
        { tick: 13, offset: 170 },
        { tick: 15, offset: 210 },
        { tick: 17, offset: 250 },
        { tick: 19, offset: 290 },
        { tick: 21, offset: 330 },
        { tick: 23, offset: 370 },
        { tick: 25, offset: 410 },
        { tick: 27, offset: 450 },
        { tick: 29, offset: 490 },
        { tick: 31, offset: 530 },
      ],
    });
  });

  it('chooses row and column intervals independently while preserving transformed cell centers', () => {
    const geometry = getViewportRulerGeometry(
      stage,
      { left: -160, top: -75, width: 960, height: 400 },
      40,
      30,
      2,
    );

    expect(geometry.columns).toEqual([
      { tick: 6, offset: 16 },
      { tick: 7, offset: 48 },
      { tick: 8, offset: 80 },
      { tick: 9, offset: 112 },
      { tick: 10, offset: 144 },
      { tick: 11, offset: 176 },
      { tick: 12, offset: 208 },
      { tick: 13, offset: 240 },
      { tick: 14, offset: 272 },
      { tick: 15, offset: 304 },
      { tick: 16, offset: 336 },
      { tick: 17, offset: 368 },
    ]);
    expect(geometry.rows).toEqual([
      { tick: 10, offset: 20 },
      { tick: 13, offset: 50 },
      { tick: 16, offset: 80 },
      { tick: 19, offset: 110 },
      { tick: 22, offset: 140 },
      { tick: 25, offset: 170 },
      { tick: 28, offset: 200 },
      { tick: 31, offset: 230 },
      { tick: 34, offset: 260 },
      { tick: 37, offset: 290 },
      { tick: 40, offset: 320 },
    ]);
  });
});
