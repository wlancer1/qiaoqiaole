import { describe, expect, it } from 'vitest';
import {
  bucketFill,
  buildCellsFromSamples,
  cropTransparentBounds,
  nearestPaletteColor,
  replaceColor,
  sampleDominantColor,
} from './grid';
import { MARD_221_COLORS, MARD_221_HEX } from './mard221';

describe('grid domain', () => {
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
});
