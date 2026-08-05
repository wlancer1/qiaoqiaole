import { describe, expect, it } from 'vitest';
import { filterPaletteByQuery, filterPaletteByUsage } from './palette';

const palette = [
  { code: 'A1', hex: '#Aa11Bb' },
  { code: 'A2', hex: '#cc22dd' },
  { code: 'B1', hex: '#33Ee44' },
  { code: 'B2', hex: '#556677' },
];

const cell = (color: string, transparent = false, index = 0) => ({
  color,
  transparent,
  x: index,
  y: 0,
});

describe('filterPaletteByQuery', () => {
  it('filters a prioritized palette without changing its order', () => {
    const prioritized = [palette[2], palette[0], palette[3], palette[1]];

    expect(filterPaletteByQuery(prioritized, '1').map(({ code }) => code))
      .toEqual(['B1', 'A1']);
    expect(filterPaletteByQuery(prioritized, '#AA').map(({ code }) => code))
      .toEqual(['A1']);
    expect(filterPaletteByQuery(prioritized, '').map(({ code }) => code))
      .toEqual(['B1', 'A1', 'B2', 'A2']);
  });
});

describe('filterPaletteByUsage', () => {
  it('preserves canonical order for a blank canvas', () => {
    expect(filterPaletteByUsage(palette, [], '').map(({ code }) => code))
      .toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('sorts used colors by count and uses canonical order for ties', () => {
    const cells = [
      cell('#33ee44', false, 0),
      cell('#CC22DD', false, 1),
      cell('#33EE44', false, 2),
      cell('#aa11bb', false, 3),
      cell('#cc22dd', false, 4),
      cell('#556677', false, 5),
    ];
    expect(filterPaletteByUsage(palette, cells, '').map(({ code }) => code))
      .toEqual(['A2', 'B1', 'A1', 'B2']);
  });

  it('ignores transparent cells when ordering colors by usage', () => {
    const cells = [cell('#556677', true)];
    expect(filterPaletteByUsage(palette, cells, '').map(({ code }) => code))
      .toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('normalizes alphabetic hex case and ignores transparent and noncanonical cells', () => {
    const cells = [
      cell('#AA11BB', false, 0),
      cell('#aa11bb', false, 1),
      cell('#33EE44', false, 2),
      cell('#33ee44', true, 3),
      cell('#CC22DD', true, 4),
      cell('#abcdef', false, 5),
    ];
    expect(filterPaletteByUsage(palette, cells, '').map(({ code }) => code))
      .toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  it('filters the usage-prioritized palette by code or hex', () => {
    const cells = [cell('#CC22DD', false, 0), cell('#cc22dd', false, 1)];
    expect(filterPaletteByUsage(palette, cells, 'a').map(({ code }) => code))
      .toEqual(['A2', 'A1']);
    expect(filterPaletteByUsage(palette, cells, '#AA').map(({ code }) => code))
      .toEqual(['A1']);
  });
});
