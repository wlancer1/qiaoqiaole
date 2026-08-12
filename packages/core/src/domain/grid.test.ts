import { describe, expect, it } from 'vitest';
import {
  SPLIT_DOMINANT_SAMPLE_GRID_SIZE,
  bucketFill,
  buildCellsFromSamples,
  cropTransparentBounds,
  nearestPaletteColor,
  replaceColor,
  sampleDominantColor,
  mergeSimilarCells,
} from './grid';
import { MARD_221_COLORS, MARD_221_HEX } from './mard221';

describe('grid domain', () => {
  it('removes connected white background through the prepared ImageData API without mutating its source', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const width = 9;
    const height = 9;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 3; x <= 5; x += 1) data.set([24, 72, 196, 255], (y * width + x) * 4);
    }
    const source = { data, width, height } as ImageData;
    const before = new Uint8ClampedArray(data);

    const cache = prepareBackgroundRemoval(source);
    const result = removeBackground(source, { sensitivity: 30 }, cache);

    expect(result.imageData).not.toBe(source);
    expect(result.mask).toHaveLength(width * height);
    expect(result.imageData.data[3]).toBe(0);
    expect(result.mask[0]).toBe(255);
    expect(result.imageData.data[(4 * width + 4) * 4 + 3]).toBe(255);
    expect(data).toEqual(before);
  });

  it('returns a real ImageData instance whenever that constructor is available', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    class TestImageData {
      constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
    }
    const globalWithImageData = globalThis as typeof globalThis & { ImageData?: typeof ImageData };
    const originalImageData = globalWithImageData.ImageData;
    globalWithImageData.ImageData = TestImageData as unknown as typeof ImageData;
    try {
      const source = { data: new Uint8ClampedArray(3 * 3 * 4).fill(255), width: 3, height: 3 } as ImageData;
      const result = removeBackground(source, { sensitivity: 30 }, prepareBackgroundRemoval(source));

      expect(result.imageData).toBeInstanceOf(TestImageData);
      expect(result.imageData.data).not.toBe(source.data);
    } finally {
      globalWithImageData.ImageData = originalImageData;
    }
  });

  it('seeds and removes distinct, well-supported edge background colour clusters', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const width = 13;
    const height = 13;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        data.set(x < 6 ? [248, 248, 246, 255] : [128, 205, 120, 255], (y * width + x) * 4);
      }
    }
    for (let y = 0; y < height; y += 1) data.set([30, 70, 190, 255], (y * width + 6) * 4);
    const source = { data, width, height } as ImageData;

    const result = removeBackground(source, { sensitivity: 35 }, prepareBackgroundRemoval(source));

    expect(result.imageData.data[(5 * width + 2) * 4 + 3]).toBe(0);
    expect(result.imageData.data[(5 * width + 10) * 4 + 3]).toBe(0);
    expect(result.imageData.data[(5 * width + 6) * 4 + 3]).toBe(255);
  });

  it('removes a supported saturated-blue second background cluster', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const width = 15;
    const height = 15;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        data.set(x < 8 ? [248, 248, 246, 255] : [28, 110, 214, 255], (y * width + x) * 4);
      }
    }
    for (let y = 0; y < height; y += 1) data.set([210, 40, 20, 255], (y * width + 7) * 4);
    const source = { data, width, height } as ImageData;

    const result = removeBackground(source, { sensitivity: 35 }, prepareBackgroundRemoval(source));

    expect(result.imageData.data[(7 * width + 3) * 4 + 3]).toBe(0);
    expect(result.imageData.data[(7 * width + 11) * 4 + 3]).toBe(0);
    expect(result.imageData.data[(7 * width + 7) * 4 + 3]).toBe(255);
  });

  it('retains an imbalanced 70/30 edge background pair without accepting a low-support edge-touching subject', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const width = 21;
    const height = 21;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        data.set(x < 14 ? [248, 248, 246, 255] : [128, 205, 120, 255], (y * width + x) * 4);
      }
      data.set([30, 70, 190, 255], (y * width + 13) * 4);
    }
    const source = { data, width, height } as ImageData;
    const result = removeBackground(source, { sensitivity: 35 }, prepareBackgroundRemoval(source));

    expect(result.imageData.data[(10 * width + 4) * 4 + 3]).toBe(0);
    expect(result.imageData.data[(10 * width + 17) * 4 + 3]).toBe(0);
    expect(result.imageData.data[(10 * width + 13) * 4 + 3]).toBe(255);
  });

  it('returns the feathered removal opacity in its mask and applies matching output alpha', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const width = 9;
    const height = 9;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 3; y <= 5; y += 1) {
      for (let x = 3; x <= 5; x += 1) data.set([24, 72, 196, 255], (y * width + x) * 4);
    }
    const source = { data, width, height } as ImageData;

    const result = removeBackground(source, { sensitivity: 30, feather: 1 }, prepareBackgroundRemoval(source));
    const softIndex = result.mask.findIndex((value) => value > 0 && value < 255);

    expect(softIndex).toBeGreaterThanOrEqual(0);
    expect(result.imageData.data[softIndex * 4 + 3]).toBe(255 - result.mask[softIndex]);
  });

  it('removes a gradual edge-connected background while preserving an enclosed background-coloured detail', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const width = 11;
    const height = 11;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const shade = 232 + Math.round((x + y) * 1.1);
        data.set([shade, shade - 2, shade - 5, 255], (y * width + x) * 4);
      }
    }
    for (let y = 3; y <= 7; y += 1) {
      for (let x = 3; x <= 7; x += 1) {
        if (x === 3 || x === 7 || y === 3 || y === 7) data.set([20, 64, 184, 255], (y * width + x) * 4);
      }
    }
    const source = { data, width, height } as ImageData;

    const result = removeBackground(source, { sensitivity: 45 }, prepareBackgroundRemoval(source));

    expect(result.imageData.data[((height - 1) * width + (width - 1)) * 4 + 3]).toBe(0);
    expect(result.imageData.data[(5 * width + 5) * 4 + 3]).toBe(255);
  });

  it('preserves a low-support subject touching an edge while removing edge-connected background', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const width = 11;
    const height = 11;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    data.set([36, 76, 188, 255], 0);
    data.set([36, 76, 188, 255], 4);
    const source = { data, width, height } as ImageData;
    const result = removeBackground(source, { sensitivity: 35 }, prepareBackgroundRemoval(source));

    expect(result.imageData.data[3]).toBe(255);
    expect(result.imageData.data[7]).toBe(255);
    expect(result.imageData.data[(5 * width + 9) * 4 + 3]).toBe(0);
  });

  it('preserves transparent and tiny inputs as cloned data with an empty removal mask', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const transparent = {
      data: new Uint8ClampedArray([255, 255, 255, 0, 255, 255, 255, 255]),
      width: 2,
      height: 1,
    } as ImageData;
    const tiny = { data: new Uint8ClampedArray([12, 34, 56, 255]), width: 1, height: 1 } as ImageData;

    const transparentResult = removeBackground(transparent, { sensitivity: 30 }, prepareBackgroundRemoval(transparent));
    const tinyResult = removeBackground(tiny, { sensitivity: 30 }, prepareBackgroundRemoval(tiny));

    expect(transparentResult.imageData).not.toBe(transparent);
    expect(transparentResult.imageData.data).toEqual(transparent.data);
    expect(transparentResult.mask).toEqual(new Uint8Array(2));
    expect(tinyResult.imageData.data).toEqual(tiny.data);
    expect(tinyResult.mask).toEqual(new Uint8Array(1));
  });

  it('removes at least as much background at higher sensitivity', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const width = 9;
    const height = 9;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    data.set([216, 216, 216, 255], (4 * width + 8) * 4);
    const source = { data, width, height } as ImageData;
    const cache = prepareBackgroundRemoval(source);

    const low = removeBackground(source, { sensitivity: 0 }, cache);
    const high = removeBackground(source, { sensitivity: 100 }, cache);

    expect(high.imageData.data[(4 * width + 8) * 4 + 3]).toBeLessThanOrEqual(low.imageData.data[(4 * width + 8) * 4 + 3]);
  });

  it('limits prepared analysis to 256px and processes a 256px image within a mobile-safe budget', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const width = 256;
    const height = 256;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 80; y < 176; y += 1) {
      for (let x = 80; x < 176; x += 1) data.set([36, 76, 188, 255], (y * width + x) * 4);
    }
    const source = { data, width, height } as ImageData;
    const startedAt = performance.now();
    const cache = prepareBackgroundRemoval(source);
    const result = removeBackground(source, { sensitivity: 30 }, cache);

    expect(cache.analysisWidth).toBeLessThanOrEqual(256);
    expect(cache.analysisHeight).toBeLessThanOrEqual(256);
    expect(result.imageData.data[3]).toBe(0);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it('upscales a bounded analysis mask to a source-sized soft mask for images above 256px', async () => {
    const { prepareBackgroundRemoval, removeBackground } = await import('./grid');
    const width = 512;
    const height = 512;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 180; y < 332; y += 1) {
      for (let x = 180; x < 332; x += 1) data.set([36, 76, 188, 255], (y * width + x) * 4);
    }
    const source = { data, width, height } as ImageData;
    const cache = prepareBackgroundRemoval(source);
    const result = removeBackground(source, { sensitivity: 30, feather: 1 }, cache);
    const softIndex = result.mask.findIndex((value) => value > 0 && value < 255);

    expect(cache.analysisWidth).toBeLessThanOrEqual(256);
    expect(cache.analysisHeight).toBeLessThanOrEqual(256);
    expect(result.mask).toHaveLength(width * height);
    expect(result.imageData.width).toBe(width);
    expect(result.imageData.height).toBe(height);
    expect(softIndex).toBeGreaterThanOrEqual(0);
    expect(result.imageData.data[softIndex * 4 + 3]).toBe(255 - result.mask[softIndex]);
  });

  it('locks split dominant-colour sampling to a five-by-five vote grid', () => {
    expect(SPLIT_DOMINANT_SAMPLE_GRID_SIZE).toBe(5);
  });

  it('removes a flat four-corner background without mutating the source buffer', async () => {
    const { removeFlatBackground } = await import('./grid');
    const source = new Uint8ClampedArray(36).fill(255);
    /*
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 0, 0, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ]); */
    source[16] = 0;
    source[17] = 0;
    source[18] = 255;
    const result = removeFlatBackground(source, 3, 3);
    expect([3, 7, 11, 15, 23, 27, 31, 35].map((index) => result[index])).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result[19]).toBe(255);
    /*
      255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 0,
      255, 255, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0,
      255, 255, 255, 255, 0, 255, 255, 0, 255, 255, 255, 0,
    ]); */
    expect(source[19]).toBe(255);
    expect(source).not.toBe(result);
  });

  it('preserves existing transparency, keeps different corner colours, and handles tiny or invalid images', async () => {
    const { removeFlatBackground } = await import('./grid');
    const source = new Uint8ClampedArray([
      255, 255, 255, 0,
      250, 250, 250, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]);
    const result = removeFlatBackground(source, 2, 2);
    expect(result[3]).toBe(0);
    expect(result[7]).toBe(255);
    expect(result[11]).toBe(255);
    expect(result[15]).toBe(255);
    expect(removeFlatBackground(new Uint8ClampedArray([1, 2, 3, 255]), 1, 1)[3]).toBe(0);
    expect(Array.from(removeFlatBackground(new Uint8ClampedArray([1, 2]), 0, 2))).toEqual([1, 2]);
  });

  it('uses the dominant border colour when one corner is covered by the subject', async () => {
    const { removeFlatBackground } = await import('./grid');
    const source = new Uint8ClampedArray(5 * 5 * 4).fill(255);
    source.set([220, 20, 20, 255], 0);
    source.set([20, 40, 220, 255], (2 * 5 + 2) * 4);

    const result = removeFlatBackground(source, 5, 5);

    expect(result[(4 * 5 + 4) * 4 + 3]).toBe(0);
    expect(result[3]).toBe(255);
    expect(result[(2 * 5 + 2) * 4 + 3]).toBe(255);
  });

  it('keeps background-coloured subject pixels that are enclosed away from the image edge', async () => {
    const { removeFlatBackground } = await import('./grid');
    const source = new Uint8ClampedArray(5 * 5 * 4).fill(255);
    for (let y = 1; y <= 3; y += 1) {
      for (let x = 1; x <= 3; x += 1) {
        if (x === 1 || x === 3 || y === 1 || y === 3) source.set([20, 40, 220, 255], (y * 5 + x) * 4);
      }
    }

    const result = removeFlatBackground(source, 5, 5);

    expect(result[3]).toBe(0);
    expect(result[(2 * 5 + 2) * 4 + 3]).toBe(255);
  });

  it('removes a mostly white background when the subject occupies part of the image border', async () => {
    const { removeFlatBackground } = await import('./grid');
    const width = 7;
    const height = 7;
    const source = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      source.set([246, 244, 240, 255], pixel * 4);
    }
    for (let x = 0; x <= 3; x += 1) {
      source.set([40, 80, 180, 255], x * 4);
      source.set([40, 80, 180, 255], ((height - 1) * width + x) * 4);
    }
    source.set([40, 80, 180, 255], (2 * width) * 4);
    source.set([40, 80, 180, 255], (3 * width) * 4);
    for (let y = 1; y < height - 1; y += 1) {
      source.set([40, 80, 180, 255], (y * width + 3) * 4);
    }

    const result = removeFlatBackground(source, width, height);

    expect(result[(width - 1) * 4 + 3]).toBe(0);
    expect(result[(3 * width + 3) * 4 + 3]).toBe(255);
  });

  it('softens connected off-white shadows without erasing an enclosed light subject area', async () => {
    const { removeFlatBackground } = await import('./grid');
    const width = 7;
    const height = 7;
    const source = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      source.set([250, 250, 248, 255], pixel * 4);
    }
    for (let y = 2; y <= 4; y += 1) {
      for (let x = 2; x <= 4; x += 1) source.set([30, 80, 180, 255], (y * width + x) * 4);
    }
    source.set([218, 216, 212, 255], (3 * width + 1) * 4);
    source.set([246, 245, 241, 255], (3 * width + 3) * 4);

    const result = removeFlatBackground(source, width, height);

    expect(result[(3 * width + 1) * 4 + 3]).toBeLessThan(255);
    expect(result[(3 * width + 3) * 4 + 3]).toBe(255);
  });

  it('crops to the non-transparent pattern bounds', () => {
    const alpha = [
      0, 0, 0, 0,
      0, 255, 255, 0,
      0, 255, 255, 0,
      0, 0, 0, 0,
    ];

    expect(cropTransparentBounds(alpha, 4, 4)).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 2,
    });
  });

  it('generates cells by sampling each grid region', () => {
    const cells = buildCellsFromSamples(2, 2, (x, y) => (x === y ? '#ff0000' : '#00ff00'));

    expect(cells).toEqual([
      { x: 0, y: 0, color: '#ff0000' },
      { x: 1, y: 0, color: '#00ff00' },
      { x: 0, y: 1, color: '#00ff00' },
      { x: 1, y: 1, color: '#ff0000' },
    ]);
  });

  it('chooses the most frequent quantized color in a sample', () => {
    const pixels = [
      250, 2, 0, 255,
      246, 8, 2, 255,
      0, 3, 255, 255,
    ];

    expect(sampleDominantColor(pixels)).toBe('#f80000');
  });

  it('uses the 221-colour MARD palette for bead matching', () => {
    expect(MARD_221_COLORS).toHaveLength(221);
    expect(MARD_221_COLORS[0]).toEqual({ code: 'A1', hex: '#faf4c8' });
    expect(MARD_221_COLORS[MARD_221_COLORS.length - 1]).toEqual({ code: 'M15', hex: '#757d78' });
    expect(nearestPaletteColor(250, 2, 0, MARD_221_HEX)).toBe('#e7002f');
  });

  it('maps sampled image colours to the provided palette', () => {
    const pixels = [
      250, 2, 0, 255,
      246, 8, 2, 255,
      0, 3, 255, 255,
    ];

    expect(sampleDominantColor(pixels, MARD_221_HEX)).toBe('#e7002f');
  });

  it('bucket fills only connected cells with the target color', () => {
    const cells = [
      { x: 0, y: 0, color: '#111111' },
      { x: 1, y: 0, color: '#111111' },
      { x: 0, y: 1, color: '#222222' },
      { x: 1, y: 1, color: '#111111' },
    ];

    expect(bucketFill(cells, 2, 2, 0, 0, '#ff0000')).toEqual([
      { x: 0, y: 0, color: '#ff0000', transparent: false },
      { x: 1, y: 0, color: '#ff0000', transparent: false },
      { x: 0, y: 1, color: '#222222' },
      { x: 1, y: 1, color: '#ff0000', transparent: false },
    ]);
  });

  it('replaces every matching color in the grid', () => {
    const cells = [
      { x: 0, y: 0, color: '#111111' },
      { x: 1, y: 0, color: '#222222' },
    ];

    expect(replaceColor(cells, '#111111', '#ffffff')).toEqual([
      { x: 0, y: 0, color: '#ffffff', transparent: false },
      { x: 1, y: 0, color: '#222222' },
    ]);
  });

  it('replaces low-usage cell colors with the nearest sufficiently-used color', () => {
    const cells = [
      { x: 0, y: 0, color: '#ff0000' },
      { x: 1, y: 0, color: '#ff0000' },
      { x: 0, y: 1, color: '#fe0800' },
      { x: 1, y: 1, color: '#0000ff' },
    ];

    expect(mergeSimilarCells(cells, 1)).toEqual([
      { x: 0, y: 0, color: '#ff0000' },
      { x: 1, y: 0, color: '#ff0000' },
      { x: 0, y: 1, color: '#ff0000' },
      { x: 1, y: 1, color: '#ff0000' },
    ]);
  });

  it('preserves colors when every color is below the usage threshold', () => {
    const cells = [
      { x: 0, y: 0, color: '#ff0000' },
      { x: 1, y: 0, color: '#00ff00' },
      { x: 0, y: 1, color: '#0000ff' },
    ];

    expect(mergeSimilarCells(cells, 5)).toEqual(cells);
  });
});
