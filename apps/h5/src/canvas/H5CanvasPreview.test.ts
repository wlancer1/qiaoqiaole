import { describe, expect, it } from 'vitest';
import { fitSplitImageRect } from './H5CanvasPreview';

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
