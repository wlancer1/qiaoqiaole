import { describe, expect, it } from 'vitest';
import { deriveSplitImage, processSplitImageData } from './splitImageProcessing';

describe('split image processing', () => {
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
});
