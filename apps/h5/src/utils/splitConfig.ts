export const MIN_SPLIT_LONG_SIDE = 8;
export const MAX_SPLIT_LONG_SIDE = 144;
export const DEFAULT_SPLIT_LONG_SIDE = 8;

export function clampSplitLongSide(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SPLIT_LONG_SIDE;
  return Math.min(MAX_SPLIT_LONG_SIDE, Math.max(MIN_SPLIT_LONG_SIDE, Math.round(value)));
}

export function defaultSplitLongSideFromBounds(width: number, height: number): number {
  return clampSplitLongSide(Math.max(width, height));
}

export function maxSplitLongSideFromBounds(width: number, height: number): number {
  return Math.min(MAX_SPLIT_LONG_SIDE, Math.max(MIN_SPLIT_LONG_SIDE, Math.round(Math.max(width, height))));
}

export function gridSizeFromSplitBounds(
  width: number,
  height: number,
  longSide: number,
): { rows: number; cols: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeLongSide = clampSplitLongSide(longSide);
  const scale = safeLongSide / Math.max(safeWidth, safeHeight);
  return {
    cols: Math.max(1, Math.round(safeWidth * scale)),
    rows: Math.max(1, Math.round(safeHeight * scale)),
  };
}
