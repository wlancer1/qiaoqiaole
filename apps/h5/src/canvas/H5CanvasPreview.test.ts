import { describe, expect, it } from 'vitest';
import {
  fitSplitImageRect,
  getViewportRulerGeometry,
  isCanvasRulerOverflowing,
} from './H5CanvasPreview';

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
