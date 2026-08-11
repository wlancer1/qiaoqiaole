import type { Cell } from './types';

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const SPLIT_DOMINANT_SAMPLE_GRID_SIZE = 5;

export function removeFlatBackground(rgba: ArrayLike<number>, width: number, height: number, threshold = 42): Uint8ClampedArray {
  const result = new Uint8ClampedArray(rgba.length);
  for (let index = 0; index < rgba.length; index += 1) result[index] = Number(rgba[index] ?? 0);
  if (width <= 0 || height <= 0 || result.length < width * height * 4) return result;
  if (width === 1 && height === 1) {
    result[3] = 0;
    return result;
  }

  const borderPixels: number[] = [];
  for (let x = 0; x < width; x += 1) {
    borderPixels.push(x, (height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    borderPixels.push(y * width);
    if (width > 1) borderPixels.push(y * width + width - 1);
  }

  const buckets = new Map<string, number[]>();
  for (const pixelIndex of borderPixels) {
    const offset = pixelIndex * 4;
    if (result[offset + 3] < 16) continue;
    const key = `${result[offset] >> 6},${result[offset + 1] >> 6},${result[offset + 2] >> 6}`;
    const pixels = buckets.get(key) ?? [];
    pixels.push(pixelIndex);
    buckets.set(key, pixels);
  }
  const opaqueBorderCount = [...buckets.values()].reduce((count, pixels) => count + pixels.length, 0);
  const dominantPixels = [...buckets.values()].reduce<number[]>((best, pixels) => pixels.length > best.length ? pixels : best, []);
  if (opaqueBorderCount === 0 || dominantPixels.length / opaqueBorderCount < 0.75) return result;

  const background = dominantPixels.reduce<[number, number, number]>((sum, pixelIndex) => {
    const offset = pixelIndex * 4;
    return [sum[0] + result[offset], sum[1] + result[offset + 1], sum[2] + result[offset + 2]];
  }, [0, 0, 0]).map((value) => value / dominantPixels.length);
  const matchesBackground = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    return result[offset + 3] < 16 || Math.hypot(result[offset] - background[0], result[offset + 1] - background[1], result[offset + 2] - background[2]) < threshold;
  };

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  for (const pixelIndex of borderPixels) {
    if (visited[pixelIndex] || !matchesBackground(pixelIndex)) continue;
    visited[pixelIndex] = 1;
    queue[tail++] = pixelIndex;
  }
  while (head < tail) {
    const pixelIndex = queue[head++];
    result[pixelIndex * 4 + 3] = 0;
    const x = pixelIndex % width;
    const neighbors = [pixelIndex - width, pixelIndex + width, pixelIndex - 1, pixelIndex + 1];
    for (let direction = 0; direction < neighbors.length; direction += 1) {
      if ((direction === 0 && pixelIndex < width)
        || (direction === 1 && pixelIndex >= width * (height - 1))
        || (direction === 2 && x === 0)
        || (direction === 3 && x === width - 1)) continue;
      const neighbor = neighbors[direction];
      if (visited[neighbor] || !matchesBackground(neighbor)) continue;
      visited[neighbor] = 1;
      queue[tail++] = neighbor;
    }
  }
  return result;
}

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

/**
 * Replaces low-usage opaque cell colours with the nearest sufficiently-used
 * colour. The threshold is a bead count: colours used no more than this many
 * times are considered noise. Transparent cells are always preserved.
 */
export function mergeSimilarCells(cells: Cell[], threshold: number): Cell[] {
  const maxUsage = Math.max(0, Number.isFinite(threshold) ? Math.floor(threshold) : 0);
  if (maxUsage === 0) {
    return cells.map((cell) => ({ ...cell, color: normalizeHex(cell.color) }));
  }

  const counts = new Map<string, { count: number; firstIndex: number }>();
  for (const [index, cell] of cells.entries()) {
    if (cell.transparent) continue;
    const color = normalizeHex(cell.color);
    const current = counts.get(color);
    counts.set(color, {
      count: (current?.count ?? 0) + 1,
      firstIndex: current?.firstIndex ?? index,
    });
  }

  const stableColors = [...counts.entries()].sort(
    ([, left], [, right]) => right.count - left.count || left.firstIndex - right.firstIndex,
  );
  const candidates = stableColors.filter(([, details]) => details.count > maxUsage);
  const mapping = new Map<string, string>();

  for (const [color, details] of stableColors) {
    if (details.count > maxUsage || candidates.length === 0) {
      mapping.set(color, color);
      continue;
    }

    const [red, green, blue] = hexToRgb(color);
    const nearest = candidates.reduce((best, [candidateColor, candidateDetails]) => {
      const [candidateRed, candidateGreen, candidateBlue] = hexToRgb(candidateColor);
      const distance =
        (red - candidateRed) ** 2 +
        (green - candidateGreen) ** 2 +
        (blue - candidateBlue) ** 2;
      if (!best || distance < best.distance || (distance === best.distance && candidateDetails.count > best.count)) {
        return { color: candidateColor, count: candidateDetails.count, distance };
      }
      return best;
    }, null as { color: string; count: number; distance: number } | null);
    mapping.set(color, nearest?.color ?? color);
  }

  return cells.map((cell) => {
    if (cell.transparent) return { ...cell, color: normalizeHex(cell.color) };
    const color = normalizeHex(cell.color);
    return { ...cell, color: mapping.get(color) ?? color };
  });
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
