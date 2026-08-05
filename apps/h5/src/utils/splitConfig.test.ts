import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPLIT_LONG_SIDE,
  MAX_SPLIT_LONG_SIDE,
  MIN_SPLIT_LONG_SIDE,
  clampSplitLongSide,
  defaultSplitLongSideFromBounds,
  gridSizeFromSplitBounds,
} from './splitConfig';

describe('split configuration', () => {
  it('uses long-side limits and a small fallback default', () => {
    expect(MIN_SPLIT_LONG_SIDE).toBe(8);
    expect(MAX_SPLIT_LONG_SIDE).toBe(144);
    expect(DEFAULT_SPLIT_LONG_SIDE).toBe(8);
  });

  it('clamps and rounds the requested long side', () => {
    expect(clampSplitLongSide(4)).toBe(8);
    expect(clampSplitLongSide(200)).toBe(144);
    expect(clampSplitLongSide(71.6)).toBe(72);
    expect(clampSplitLongSide(96)).toBe(96);
  });

  it('falls back to the default for non-finite values', () => {
    expect(clampSplitLongSide(Number.NaN)).toBe(DEFAULT_SPLIT_LONG_SIDE);
    expect(clampSplitLongSide(Number.POSITIVE_INFINITY)).toBe(DEFAULT_SPLIT_LONG_SIDE);
    expect(clampSplitLongSide(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_SPLIT_LONG_SIDE);
  });

  it('defaults uploaded images from their cropped pixel long side', () => {
    expect(defaultSplitLongSideFromBounds(32, 16)).toBe(32);
    expect(defaultSplitLongSideFromBounds(16, 32)).toBe(32);
    expect(defaultSplitLongSideFromBounds(4, 6)).toBe(8);
    expect(defaultSplitLongSideFromBounds(320, 160)).toBe(144);
  });

  it('preserves an actual long side of 144 for either image orientation', () => {
    const landscape = gridSizeFromSplitBounds(800, 400, 144);
    const portrait = gridSizeFromSplitBounds(400, 800, 144);

    expect(Math.max(landscape.cols, landscape.rows)).toBe(144);
    expect(Math.max(portrait.cols, portrait.rows)).toBe(144);
  });

  it('preserves image proportions instead of forcing square grids', () => {
    expect(gridSizeFromSplitBounds(80, 40, 80)).toEqual({ cols: 80, rows: 40 });
    expect(gridSizeFromSplitBounds(40, 80, 80)).toEqual({ cols: 40, rows: 80 });
  });
});
