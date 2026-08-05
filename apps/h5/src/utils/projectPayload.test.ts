import { describe, expect, test } from 'vitest';
import { normalizeProjectPayload, parseProjectCells, serializeProjectCells } from './projectPayload';

describe('normalizeProjectPayload', () => {
  test('normalizes valid project metadata before saving', () => {
    expect(normalizeProjectPayload('  我的作品  ', '32', 24)).toEqual({
      name: '我的作品',
      rows: 32,
      cols: 24,
    });
  });

  test('rejects empty names and invalid canvas dimensions', () => {
    expect(normalizeProjectPayload('', 32, 24)).toBeNull();
    expect(normalizeProjectPayload('作品', 0, 24)).toBeNull();
    expect(normalizeProjectPayload('作品', 32, 121)).toEqual({ name: '作品', rows: 32, cols: 121 });
  });
});

describe('project canvas snapshots', () => {
  test('round-trips saved cells', () => {
    const cells = [
      { x: 0, y: 0, color: '#ff0000', transparent: false },
      { x: 1, y: 0, color: '#ffffff', transparent: true },
    ];
    const snapshot = serializeProjectCells(cells);
    expect(parseProjectCells(snapshot, 1, 2)).toEqual(cells);
  });

  test('rejects snapshots with cells outside the saved canvas', () => {
    expect(parseProjectCells(JSON.stringify([{ x: 2, y: 0, color: '#fff', transparent: false }]), 1, 2)).toBeNull();
  });
});
