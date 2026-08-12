import { describe, expect, it } from 'vitest';
import type { Cell } from '@qiaoqiaole/core';
import { removeGridEdgeBackground } from './gridBackground';

describe('grid background removal', () => {
  it('removes the dominant edge-connected background but preserves enclosed pixels', () => {
    const cells: Cell[] = Array.from({ length: 25 }, (_, index) => ({
      x: index % 5,
      y: Math.floor(index / 5),
      color: index % 5 === 0 || index % 5 === 4 || index < 5 || index >= 20 ? '#ffffff' : '#ff0000',
    }));
    cells[12] = { x: 2, y: 2, color: '#ffffff' };

    const result = removeGridEdgeBackground(cells, 5, 5);

    expect(result[12].transparent).not.toBe(true);
    expect(result.filter((cell) => cell.transparent).length).toBe(16);
  });

  it('does not remove an edge color when the opaque border is evenly split', () => {
    const cells: Cell[] = Array.from({ length: 4 }, (_, index) => ({
      x: index % 2,
      y: Math.floor(index / 2),
      color: index % 2 === 0 ? '#ffffff' : '#ff0000',
    }));

    const result = removeGridEdgeBackground(cells, 2, 2);

    expect(result.every((cell) => !cell.transparent)).toBe(true);
  });
});
