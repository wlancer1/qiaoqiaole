import { describe, expect, it } from 'vitest';
import { prepareBackgroundRemoval, removeBackground } from '@qiaoqiaole/core';
import { DEFAULT_BACKGROUND_SENSITIVITY, deriveSplitImage, processSplitImageData } from './splitImageProcessing';

describe('split image processing', () => {
  it('uses a conservative default background sensitivity', () => {
    expect(DEFAULT_BACKGROUND_SENSITIVITY).toBe(0);
  });

  it('derives transparent and restored versions from the same immutable original', () => {
    class TestImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) { this.data = data; this.width = width; this.height = height; }
    }
    (globalThis as typeof globalThis & { ImageData: typeof TestImageData }).ImageData = TestImageData as unknown as typeof ImageData;
    const data = new Uint8ClampedArray(36).fill(255);
    /*
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 0, 0, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ])); */
    data[16] = 0;
    data[17] = 0;
    data[18] = 255;
    const original = new TestImageData(data, 3, 3) as unknown as ImageData;
    const removed = processSplitImageData(original, true);
    const restored = processSplitImageData(original, false);
    expect(removed.data[3]).toBe(0);
    expect(removed.data[19]).toBe(255);
    expect(restored.data[3]).toBe(255);
    expect(original.data[3]).toBe(255);
  });

  it('derives the current preview URL and crop from the same image version', () => {
    const data = new Uint8ClampedArray(36).fill(255);
    const original = new ImageData(data, 3, 3);
    const derived = deriveSplitImage(original, true, {
      toUrl: (imageData) => `url:${imageData.data[3]}`,
      getCrop: (imageData) => ({ x: 0, y: 0, width: imageData.width, height: imageData.height }),
    });

    expect(derived.url).toBe('url:0');
    expect(derived.crop.width).toBe(3);
    expect(derived.imageData.data[3]).toBe(0);
    expect(original.data[3]).toBe(255);
  });

  it('passes the configured sensitivity and reusable preparation cache to the background algorithm', () => {
    const data = new Uint8ClampedArray(5 * 5 * 4).fill(255);
    for (let y = 1; y < 4; y += 1) {
      for (let x = 1; x < 4; x += 1) {
        const offset = (y * 5 + x) * 4;
        data[offset] = 198;
        data[offset + 1] = 24;
        data[offset + 2] = 24;
      }
    }
    const original = new ImageData(data, 5, 5);
    const cache = prepareBackgroundRemoval(original);

    const actual = processSplitImageData(original, true, { sensitivity: 72, backgroundCache: cache });
    const expected = removeBackground(original, { sensitivity: 72 }, cache).imageData;

    expect(Array.from(actual.data)).toEqual(Array.from(expected.data));
    expect(cache.analysisData.length).toBeGreaterThan(0);
  });

  it('returns a distinct immutable original clone when background removal is disabled', () => {
    const original = new ImageData(new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 255,
      70, 80, 90, 255,
      100, 110, 120, 255,
    ]), 2, 2);
    const cache = prepareBackgroundRemoval(original);

    const restored = processSplitImageData(original, false, { sensitivity: 100, backgroundCache: cache });

    expect(restored).not.toBe(original);
    expect(restored.data).not.toBe(original.data);
    expect(Array.from(restored.data)).toEqual(Array.from(original.data));
  });
});
