import type { Cell } from './types';

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const SPLIT_DOMINANT_SAMPLE_GRID_SIZE = 5;

export interface RemoveBackgroundOptions {
  sensitivity: number;
  feather?: number;
  protectCenter?: boolean;
}

export interface RemoveBackgroundResult {
  imageData: ImageData;
  /** 255 marks the edge-connected background; 0 marks preserved pixels. */
  mask: Uint8Array;
}

export interface BackgroundRemovalCluster {
  red: number;
  green: number;
  blue: number;
  weight: number;
}

export interface BackgroundRemovalCache {
  sourceWidth: number;
  sourceHeight: number;
  analysisWidth: number;
  analysisHeight: number;
  clusters: readonly BackgroundRemovalCluster[];
  confidence: number;
  /** @internal The compact working pixels are intentionally opaque to callers. */
  analysisData: Uint8ClampedArray;
}

const BACKGROUND_ANALYSIS_MAX_SIDE = 256;
const MIN_IMAGE_DIMENSION = 3;

/**
 * Samples the four opaque edges of an image into a reusable, bounded-size
 * background model. Callers own cache invalidation when their source pixels
 * change; mismatched dimensions are rejected by removeBackground.
 */
export function prepareBackgroundRemoval(imageData: ImageData): BackgroundRemovalCache {
  const sourceWidth = validDimension(imageData.width);
  const sourceHeight = validDimension(imageData.height);
  const validSource = isValidImageData(imageData, sourceWidth, sourceHeight);
  const scale = validSource ? Math.min(1, BACKGROUND_ANALYSIS_MAX_SIDE / Math.max(sourceWidth, sourceHeight)) : 1;
  const analysisWidth = validSource ? Math.max(1, Math.round(sourceWidth * scale)) : 0;
  const analysisHeight = validSource ? Math.max(1, Math.round(sourceHeight * scale)) : 0;
  const analysisData = validSource
    ? resizeRgba(imageData.data, sourceWidth, sourceHeight, analysisWidth, analysisHeight)
    : new Uint8ClampedArray();
  const samples = validSource && analysisWidth >= MIN_IMAGE_DIMENSION && analysisHeight >= MIN_IMAGE_DIMENSION
    ? sampleEdgePixels(analysisData, analysisWidth, analysisHeight)
    : [];
  const clusters = clusterBackgroundSamples(analysisData, samples);
  const opaqueSamples = samples.length;
  const confidence = opaqueSamples === 0 ? 0 : (clusters[0]?.weight ?? 0) / opaqueSamples;

  return {
    sourceWidth,
    sourceHeight,
    analysisWidth,
    analysisHeight,
    clusters,
    confidence,
    analysisData,
  };
}

/**
 * Removes only background connected to an image edge. The returned image and
 * mask are independent of the input buffer, so it is safe to retain the
 * original image for sensitivity changes.
 */
export function removeBackground(
  imageData: ImageData,
  options: RemoveBackgroundOptions,
  cache?: BackgroundRemovalCache,
): RemoveBackgroundResult {
  const width = validDimension(imageData.width);
  const height = validDimension(imageData.height);
  const cloned = cloneImageDataValue(imageData, width, height);
  const emptyMask = new Uint8Array(Math.max(0, width * height));
  if (!isValidImageData(imageData, width, height) || width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    return { imageData: cloned, mask: emptyMask };
  }

  const prepared = cacheMatches(cache, width, height) ? cache : prepareBackgroundRemoval(imageData);
  if (prepared.analysisWidth < MIN_IMAGE_DIMENSION || prepared.analysisHeight < MIN_IMAGE_DIMENSION || prepared.clusters.length === 0) {
    return { imageData: cloned, mask: emptyMask };
  }

  const sensitivity = clamp(Math.round(options.sensitivity), 0, 100);
  const threshold = sensitivityThreshold(sensitivity, prepared.confidence);
  const backgroundClusters = compatibleBackgroundClusters(prepared.clusters, threshold);
  const analysisMask = floodFillBackground(prepared.analysisData, prepared.analysisWidth, prepared.analysisHeight, backgroundClusters, threshold, options.protectCenter !== false);
  const mask = prepared.analysisWidth === width && prepared.analysisHeight === height
    ? new Uint8Array(analysisMask)
    : upscaleMaskBilinear(analysisMask, prepared.analysisWidth, prepared.analysisHeight, width, height);
  featherMask(mask, width, height, options.feather ?? 1);
  applyMaskToImage(cloned.data, imageData.data, mask, backgroundClusters, threshold);
  return { imageData: cloned, mask };
}

function validDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function isValidImageData(imageData: ImageData, width: number, height: number): boolean {
  return width > 0 && height > 0 && imageData.data.length >= width * height * 4;
}

function cloneImageDataValue(imageData: ImageData, width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  if (width > 0 && height > 0 && typeof globalThis.ImageData === 'function') {
    return new globalThis.ImageData(data, width, height);
  }
  // Core also runs in workers/tests that do not provide ImageData.
  return { data, width, height } as ImageData;
}

function cacheMatches(cache: BackgroundRemovalCache | undefined, width: number, height: number): cache is BackgroundRemovalCache {
  return Boolean(cache && cache.sourceWidth === width && cache.sourceHeight === height);
}

function sampleEdgePixels(data: Uint8ClampedArray, width: number, height: number): number[] {
  const targetPerSide = 32;
  const topBottomStep = Math.max(1, Math.ceil((width - 1) / (targetPerSide - 1)));
  const leftRightStep = Math.max(1, Math.ceil((height - 3) / Math.max(1, targetPerSide - 2)));
  const indices = new Set<number>();
  for (let x = 0; x < width; x += topBottomStep) {
    indices.add(x);
    indices.add((height - 1) * width + x);
  }
  indices.add(width - 1);
  indices.add(width * height - 1);
  for (let y = 1; y < height - 1; y += leftRightStep) {
    indices.add(y * width);
    indices.add(y * width + width - 1);
  }
  const result: number[] = [];
  for (const index of indices) {
    if (data[index * 4 + 3] >= 16) result.push(index);
  }
  return result;
}

function clusterBackgroundSamples(data: Uint8ClampedArray, samples: readonly number[]): BackgroundRemovalCluster[] {
  const buckets = new Map<string, { red: number; green: number; blue: number; weight: number }>();
  for (const index of samples) {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const key = `${red >> 4}:${green >> 4}:${blue >> 4}`;
    const bucket = buckets.get(key) ?? { red: 0, green: 0, blue: 0, weight: 0 };
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    bucket.weight += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 3)
    .map((bucket) => ({
      red: bucket.red / bucket.weight,
      green: bucket.green / bucket.weight,
      blue: bucket.blue / bucket.weight,
      weight: bucket.weight,
    }));
}

function sensitivityThreshold(sensitivity: number, confidence: number): number {
  const base = 12 + sensitivity * 0.68;
  return confidence < 0.35 ? base * 0.62 : base;
}

function compatibleBackgroundClusters(clusters: readonly BackgroundRemovalCluster[], threshold: number): readonly BackgroundRemovalCluster[] {
  // Keep separately-coloured edge regions when they are well represented;
  // filtering by proximity to the dominant colour wrongly loses two-tone
  // backgrounds. Tiny incidental edge colours remain excluded rather than
  // treating every edge-colour sample as a background seed.
  // The sampler collects roughly 20–40 points per edge. A few samples are
  // usually an edge-touching subject, not background; retain the remaining
  // top clusters independently of their distance to the most common colour.
  return clusters.filter((cluster) => cluster.weight >= 3);
}

function floodFillBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  clusters: readonly BackgroundRemovalCluster[],
  threshold: number,
  protectCenter: boolean,
): Uint8Array {
  const size = width * height;
  const mask = new Uint8Array(size);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  const push = (index: number, parent: number) => {
    if (mask[index] || data[index * 4 + 3] < 16) return;
    const x = index % width;
    const y = Math.floor(index / width);
    const centreFactor = protectCenter && x >= width * 0.2 && x < width * 0.8 && y >= height * 0.2 && y < height * 0.8 ? 0.65 : 1;
    const distance = nearestClusterDistance(data, index, clusters);
    const localDistance = parent < 0 ? 0 : pixelDistance(data, index, parent);
    const accepted = distance <= threshold * centreFactor
      || (parent >= 0 && distance <= threshold * 1.45 * centreFactor && localDistance <= threshold * 0.9);
    if (!accepted) return;
    mask[index] = 255;
    queue[tail++] = index;
  };

  for (const index of sampleEdgePixels(data, width, height)) push(index, -1);
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (index >= width) push(index - width, index);
    if (index < size - width) push(index + width, index);
    if (x > 0) push(index - 1, index);
    if (x < width - 1) push(index + 1, index);
  }
  return mask;
}

function nearestClusterDistance(data: Uint8ClampedArray, index: number, clusters: readonly BackgroundRemovalCluster[]): number {
  const offset = index * 4;
  let best = Number.POSITIVE_INFINITY;
  for (const cluster of clusters) {
    const red = data[offset] - cluster.red;
    const green = data[offset + 1] - cluster.green;
    const blue = data[offset + 2] - cluster.blue;
    best = Math.min(best, Math.sqrt(red * red * 0.299 + green * green * 0.587 + blue * blue * 0.114));
  }
  return best;
}

function pixelDistance(data: Uint8ClampedArray, first: number, second: number): number {
  const firstOffset = first * 4;
  const secondOffset = second * 4;
  const red = data[firstOffset] - data[secondOffset];
  const green = data[firstOffset + 1] - data[secondOffset + 1];
  const blue = data[firstOffset + 2] - data[secondOffset + 2];
  return Math.sqrt(red * red * 0.299 + green * green * 0.587 + blue * blue * 0.114);
}

function resizeRgba(source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): Uint8ClampedArray {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) return new Uint8ClampedArray(source);
  const result = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * sourceHeight) / targetHeight - 0.5;
    const top = clamp(Math.floor(sourceY), 0, sourceHeight - 1);
    const bottom = clamp(top + 1, 0, sourceHeight - 1);
    const yWeight = sourceY - Math.floor(sourceY);
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * sourceWidth) / targetWidth - 0.5;
      const left = clamp(Math.floor(sourceX), 0, sourceWidth - 1);
      const right = clamp(left + 1, 0, sourceWidth - 1);
      const xWeight = sourceX - Math.floor(sourceX);
      const targetOffset = (y * targetWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const topValue = source[(top * sourceWidth + left) * 4 + channel] * (1 - xWeight) + source[(top * sourceWidth + right) * 4 + channel] * xWeight;
        const bottomValue = source[(bottom * sourceWidth + left) * 4 + channel] * (1 - xWeight) + source[(bottom * sourceWidth + right) * 4 + channel] * xWeight;
        result[targetOffset + channel] = Math.round(topValue * (1 - yWeight) + bottomValue * yWeight);
      }
    }
  }
  return result;
}

function upscaleMaskBilinear(mask: Uint8Array, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): Uint8Array {
  const result = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * sourceHeight) / targetHeight - 0.5;
    const top = clamp(Math.floor(sourceY), 0, sourceHeight - 1);
    const bottom = clamp(top + 1, 0, sourceHeight - 1);
    const yWeight = sourceY - Math.floor(sourceY);
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * sourceWidth) / targetWidth - 0.5;
      const left = clamp(Math.floor(sourceX), 0, sourceWidth - 1);
      const right = clamp(left + 1, 0, sourceWidth - 1);
      const xWeight = sourceX - Math.floor(sourceX);
      const topValue = mask[top * sourceWidth + left] * (1 - xWeight) + mask[top * sourceWidth + right] * xWeight;
      const bottomValue = mask[bottom * sourceWidth + left] * (1 - xWeight) + mask[bottom * sourceWidth + right] * xWeight;
      result[y * targetWidth + x] = Math.round(topValue * (1 - yWeight) + bottomValue * yWeight);
    }
  }
  return result;
}

function featherMask(mask: Uint8Array, width: number, height: number, feather: number): void {
  if (clamp(Math.round(feather), 0, 1) === 0) return;
  const original = new Uint8Array(mask);
  for (let index = 0; index < mask.length; index += 1) {
    if (original[index] !== 255 && original[index] !== 0) continue;
    if (original[index] === 255 && hasSubjectNeighbour(original, index, width, height)) mask[index] = 192;
  }
}

function applyMaskToImage(
  output: Uint8ClampedArray,
  source: Uint8ClampedArray,
  mask: Uint8Array,
  clusters: readonly BackgroundRemovalCluster[],
  threshold: number,
): void {
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    if (source[offset + 3] < 16 || mask[index] === 0) continue;
    let opacityRemoved = mask[index];
    // Semi-transparent near-background edge pixels receive the same alpha
    // treatment, which removes the pale halo without changing source colours.
    if (source[offset + 3] < 255 && nearestClusterDistance(source, index, clusters) <= threshold * 1.5) opacityRemoved = Math.max(opacityRemoved, 224);
    mask[index] = opacityRemoved;
    output[offset + 3] = Math.round(source[offset + 3] * (1 - opacityRemoved / 255));
  }
}

function hasSubjectNeighbour(mask: Uint8Array, index: number, width: number, height: number): boolean {
  const x = index % width;
  return (index >= width && mask[index - width] === 0)
    || (index < width * (height - 1) && mask[index + width] === 0)
    || (x > 0 && mask[index - 1] === 0)
    || (x < width - 1 && mask[index + 1] === 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function removeFlatBackground(rgba: ArrayLike<number>, width: number, height: number, threshold = 42): Uint8ClampedArray<ArrayBuffer> {
  const result = new Uint8ClampedArray(rgba.length);
  for (let index = 0; index < rgba.length; index += 1) result[index] = Number(rgba[index] ?? 0);
  if (width <= 0 || height <= 0 || result.length < width * height * 4) return result;
  if (width === 1 && height === 1) {
    result[3] = 0;
    return result;
  }
  if (width < 3 || height < 3) return result;

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
  if (opaqueBorderCount === 0 || dominantPixels.length / opaqueBorderCount < 0.45) return result;

  const background = dominantPixels.reduce<[number, number, number]>((sum, pixelIndex) => {
    const offset = pixelIndex * 4;
    return [sum[0] + result[offset], sum[1] + result[offset + 1], sum[2] + result[offset + 2]];
  }, [0, 0, 0]).map((value) => value / dominantPixels.length);
  const solidThresholdSquared = threshold * threshold;
  const featherThreshold = threshold * 2;
  const featherThresholdSquared = featherThreshold * featherThreshold;
  const backgroundDistanceSquared = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    const red = result[offset] - background[0];
    const green = result[offset + 1] - background[1];
    const blue = result[offset + 2] - background[2];
    return red * red + green * green + blue * blue;
  };
  const matchesBackground = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    return result[offset + 3] < 16 || backgroundDistanceSquared(pixelIndex) < featherThresholdSquared;
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
  const visitNeighbor = (neighbor: number) => {
    if (visited[neighbor] || !matchesBackground(neighbor)) return;
    visited[neighbor] = 1;
    queue[tail++] = neighbor;
  };
  while (head < tail) {
    const pixelIndex = queue[head++];
    const offset = pixelIndex * 4;
    const distanceSquared = backgroundDistanceSquared(pixelIndex);
    if (distanceSquared <= solidThresholdSquared) {
      result[offset + 3] = 0;
    } else {
      const feather = (distanceSquared - solidThresholdSquared) / (featherThresholdSquared - solidThresholdSquared);
      result[offset + 3] = Math.round(result[offset + 3] * feather);
    }
    const x = pixelIndex % width;
    if (pixelIndex >= width) visitNeighbor(pixelIndex - width);
    if (pixelIndex < width * (height - 1)) visitNeighbor(pixelIndex + width);
    if (x > 0) visitNeighbor(pixelIndex - 1);
    if (x < width - 1) visitNeighbor(pixelIndex + 1);
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
