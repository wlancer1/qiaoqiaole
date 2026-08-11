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
