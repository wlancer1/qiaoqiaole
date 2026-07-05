import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './types';
import { buildModelParts, serializeAsciiStl } from './stl';

describe('stl domain', () => {
  it('creates square peg parts without base, frame, or grid walls', () => {
    const parts = buildModelParts(
      [
        { x: 0, y: 0, color: '#ff0000' },
        { x: 1, y: 0, color: '#00ff00' },
      ],
      1,
      2,
      DEFAULT_SETTINGS,
    );

    expect(parts.some((part) => part.name.startsWith('base-'))).toBe(false);
    expect(parts.some((part) => part.name.startsWith('frame-'))).toBe(false);
    expect(parts.some((part) => part.name.startsWith('wall-'))).toBe(false);
    expect(parts.filter((part) => part.name.startsWith('peg-'))).toHaveLength(2);
  });

  it('leaves transparent cells hollow', () => {
    const parts = buildModelParts(
      [
        { x: 0, y: 0, color: '#ff0000' },
        { x: 1, y: 0, color: '#ffffff', transparent: true },
      ],
      1,
      2,
      DEFAULT_SETTINGS,
    );

    expect(parts.some((part) => part.name === 'peg-0-0')).toBe(true);
    expect(parts.some((part) => part.name === 'base-0-0')).toBe(false);
    expect(parts.some((part) => part.name === 'peg-1-0')).toBe(false);
    expect(parts.some((part) => part.name === 'base-1-0')).toBe(false);
  });

  it('uses hollow square rings for raised color pieces', () => {
    const parts = buildModelParts([{ x: 0, y: 0, color: '#ff0000' }], 1, 1, DEFAULT_SETTINGS);
    const peg = parts.find((part) => part.name === 'peg-0-0');

    expect(peg?.triangles).toHaveLength(48);
    const vertices = peg?.triangles.flat() ?? [];
    const centerVertices = vertices.filter(([x, y]) => x > 3.8 && x < 6.2 && y > 3.8 && y < 6.2);
    expect(centerVertices).toHaveLength(0);
  });

  it('connects adjacent 3d cells without gaps', () => {
    const parts = buildModelParts(
      [
        { x: 0, y: 0, color: '#ff0000' },
        { x: 1, y: 0, color: '#00ff00' },
      ],
      1,
      2,
      DEFAULT_SETTINGS,
    );
    const leftVertices = parts.find((part) => part.name === 'peg-0-0')?.triangles.flat() ?? [];
    const rightVertices = parts.find((part) => part.name === 'peg-1-0')?.triangles.flat() ?? [];

    const leftMaxX = Math.max(...leftVertices.map(([x]) => x));
    const rightMinX = Math.min(...rightVertices.map(([x]) => x));
    expect(leftMaxX).toBeCloseTo(rightMinX, 5);
  });

  it('serializes model parts as ASCII STL facets', () => {
    const parts = buildModelParts([{ x: 0, y: 0, color: '#ff0000' }], 1, 1, DEFAULT_SETTINGS);
    const stl = serializeAsciiStl('peg_board', parts);

    expect(stl.startsWith('solid peg_board')).toBe(true);
    expect(stl).toContain('facet normal');
    expect(stl).toContain('endsolid peg_board');
  });
});
