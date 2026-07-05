import type { Cell } from './types';

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function normalizeHex(hex: string): string {
  const cleaned = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(cleaned)) {
    return cleaned;
  }
  return '#000000';
}

export function cropTransparentBounds(alpha: number[], width: number, height: number): Bounds {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = alpha[y * width + x] ?? 0;
      if (value > 12) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function buildCellsFromSamples(
  rows: number,
  cols: number,
  sample: (x: number, y: number) => string,
): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      cells.push({ x, y, color: normalizeHex(sample(x, y)) });
    }
  }
  return cells;
}

export function sampleDominantColor(rgba: ArrayLike<number>, palette?: readonly string[]): string {
  const counts = new Map<string, number>();

  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] ?? 255;
    if (alpha < 16) {
      continue;
    }

    const rawR = rgba[i] ?? 0;
    const rawG = rgba[i + 1] ?? 0;
    const rawB = rgba[i + 2] ?? 0;
    const key = palette
      ? nearestPaletteColor(rawR, rawG, rawB, palette)
      : rgbToHex(quantizeColor(rawR), quantizeColor(rawG), quantizeColor(rawB));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let bestColor = '#ffffff';
  let bestCount = -1;
  for (const [color, count] of counts) {
    if (count > bestCount) {
      bestColor = color;
      bestCount = count;
    }
  }

  return bestColor;
}

export function nearestPaletteColor(r: number, g: number, b: number, palette: readonly string[]): string {
  let bestColor = palette[0] ? normalizeHex(palette[0]) : '#000000';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const color of palette) {
    const [paletteR, paletteG, paletteB] = hexToRgb(normalizeHex(color));
    const distance =
      (r - paletteR) ** 2 +
      (g - paletteG) ** 2 +
      (b - paletteB) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestColor = normalizeHex(color);
    }
  }

  return bestColor;
}

export function bucketFill(
  cells: Cell[],
  rows: number,
  cols: number,
  startX: number,
  startY: number,
  nextColor: string,
): Cell[] {
  const target = getCell(cells, startX, startY)?.color;
  const normalizedNext = normalizeHex(nextColor);
  if (!target || target === normalizedNext) {
    return cells;
  }

  const byKey = new Map(cells.map((cell) => [cellKey(cell.x, cell.y), cell]));
  const visited = new Set<string>();
  const queue: Array<[number, number]> = [[startX, startY]];
  const filledKeys = new Set<string>();

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const key = cellKey(x, y);
    if (visited.has(key) || x < 0 || y < 0 || x >= cols || y >= rows) {
      continue;
    }
    visited.add(key);

    const cell = byKey.get(key);
    if (!cell || cell.color !== target) {
      continue;
    }

    filledKeys.add(key);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return cells.map((cell) =>
    filledKeys.has(cellKey(cell.x, cell.y)) ? { ...cell, color: normalizedNext, transparent: false } : cell,
  );
}

export function replaceCell(cells: Cell[], x: number, y: number, color: string): Cell[] {
  const normalizedColor = normalizeHex(color);
  return cells.map((cell) => (cell.x === x && cell.y === y ? { ...cell, color: normalizedColor, transparent: false } : cell));
}

export function replaceColor(cells: Cell[], oldColor: string, nextColor: string): Cell[] {
  const normalizedOld = normalizeHex(oldColor);
  const normalizedNext = normalizeHex(nextColor);
  return cells.map((cell) =>
    normalizeHex(cell.color) === normalizedOld ? { ...cell, color: normalizedNext, transparent: false } : cell,
  );
}

export function getCell(cells: Cell[], x: number, y: number): Cell | undefined {
  return cells.find((cell) => cell.x === x && cell.y === y);
}

export function uniquePalette(cells: Cell[], fallback: string[]): string[] {
  const colors = new Set<string>(fallback.map(normalizeHex));
  cells.forEach((cell) => colors.add(normalizeHex(cell.color)));
  return Array.from(colors);
}

function quantizeColor(value: number): number {
  return Math.max(0, Math.min(248, Math.round(value / 8) * 8));
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}
