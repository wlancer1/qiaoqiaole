import { describe, expect, it } from 'vitest';
import {
  beadingToolReducer,
  cellIndexFromPoint,
  createBeadingToolState,
  remainingRequirement,
  reviseMarkedCell,
  sortBeadingRequirements,
  toggleMarkedCell,
} from './beadingToolState';

describe('beading tool state', () => {
  it('creates the default tool state', () => {
    expect(createBeadingToolState()).toEqual({
      interactionMode: 'pan',
      activePanel: null,
      highlightEnabled: true,
      locked: false,
      focusMode: false,
      codesVisible: true,
      gridVisible: true,
      sortMode: 'canvas',
      markedCellIndexes: [],
    });
  });

  it.each([
    ['toggle-highlight', 'highlightEnabled', false],
    ['toggle-lock', 'locked', true],
    ['toggle-focus', 'focusMode', true],
    ['toggle-codes', 'codesVisible', false],
    ['toggle-grid', 'gridVisible', false],
  ] as const)('applies %s without changing other state', (type, key, value) => {
    const initial = createBeadingToolState();
    const next = beadingToolReducer(initial, { type });

    expect(next).toEqual({ ...initial, [key]: value });
  });

  it('makes mark and revise mutually exclusive and toggles the current mode back to pan', () => {
    const marked = beadingToolReducer(createBeadingToolState(), { type: 'toggle-mode', mode: 'mark' });
    const revised = beadingToolReducer(marked, { type: 'toggle-mode', mode: 'revise' });

    expect(marked.interactionMode).toBe('mark');
    expect(revised.interactionMode).toBe('revise');
    expect(beadingToolReducer(revised, { type: 'toggle-mode', mode: 'revise' }).interactionMode).toBe('pan');
  });

  it('sets panels, sorting and normalized marks', () => {
    const initial = createBeadingToolState();
    const withPanel = beadingToolReducer(initial, { type: 'set-panel', panel: 'search' });
    const sorted = beadingToolReducer(withPanel, { type: 'set-sort', sortMode: 'remaining' });
    const marked = beadingToolReducer(sorted, { type: 'set-marks', indexes: [3, 1, 3, -1, 4], cellCount: 4 });

    expect(marked.activePanel).toBe('search');
    expect(marked.sortMode).toBe('remaining');
    expect(marked.markedCellIndexes).toEqual([1, 3]);
  });

  it('resets every field to its default', () => {
    const changed = {
      interactionMode: 'revise' as const,
      activePanel: 'more' as const,
      highlightEnabled: false,
      locked: true,
      focusMode: true,
      codesVisible: false,
      gridVisible: false,
      sortMode: 'code' as const,
      markedCellIndexes: [2, 5],
    };

    expect(beadingToolReducer(changed, { type: 'reset' })).toEqual(createBeadingToolState());
  });

  it('hydrates persisted fields atomically while resetting transient state and filtering marks', () => {
    const changed = {
      ...createBeadingToolState(),
      interactionMode: 'revise' as const,
      activePanel: 'more' as const,
      focusMode: true,
    };

    expect(beadingToolReducer(changed, {
      type: 'hydrate-persisted',
      state: {
        markedCellIndexes: [4, 1, 4, -1, 5],
        highlightEnabled: false,
        locked: true,
        codesVisible: false,
        gridVisible: false,
        sortMode: 'remaining',
      },
      cellCount: 5,
    })).toEqual({
      ...createBeadingToolState(),
      markedCellIndexes: [1, 4],
      highlightEnabled: false,
      locked: true,
      codesVisible: false,
      gridVisible: false,
      sortMode: 'remaining',
    });
  });
});

describe('cellIndexFromPoint', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };

  it('maps a client point using the rectangle actual scaled size', () => {
    expect(cellIndexFromPoint(rect, 10, 20, 2, 4)).toBe(0);
    expect(cellIndexFromPoint(rect, 159, 119, 2, 4)).toBe(6);
    expect(cellIndexFromPoint(rect, 209.999, 119.999, 2, 4)).toBe(7);
  });

  it('rejects points outside the rectangle including its right and bottom edges', () => {
    expect(cellIndexFromPoint(rect, 9.999, 20, 2, 4)).toBeNull();
    expect(cellIndexFromPoint(rect, 10, 19.999, 2, 4)).toBeNull();
    expect(cellIndexFromPoint(rect, 210, 20, 2, 4)).toBeNull();
    expect(cellIndexFromPoint(rect, 10, 120, 2, 4)).toBeNull();
  });

  it('rejects zero-sized rectangles and invalid grids', () => {
    expect(cellIndexFromPoint({ ...rect, width: 0 }, 10, 20, 2, 4)).toBeNull();
    expect(cellIndexFromPoint({ ...rect, height: 0 }, 10, 20, 2, 4)).toBeNull();
    expect(cellIndexFromPoint(rect, 10, 20, 0, 4)).toBeNull();
    expect(cellIndexFromPoint(rect, 10, 20, 2, -1)).toBeNull();
    expect(cellIndexFromPoint(rect, 10, 20, 1.5, 4)).toBeNull();
  });

  it('rejects NaN rectangle values and client coordinates', () => {
    for (const key of ['left', 'top', 'width', 'height'] as const) {
      expect(cellIndexFromPoint({ ...rect, [key]: Number.NaN }, 10, 20, 2, 4)).toBeNull();
    }
    expect(cellIndexFromPoint(rect, Number.NaN, 20, 2, 4)).toBeNull();
    expect(cellIndexFromPoint(rect, 10, Number.NaN, 2, 4)).toBeNull();
  });

  it('rejects infinite rectangle values and client coordinates', () => {
    for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const key of ['left', 'top', 'width', 'height'] as const) {
        expect(cellIndexFromPoint({ ...rect, [key]: value }, 10, 20, 2, 4)).toBeNull();
      }
      expect(cellIndexFromPoint(rect, value, 20, 2, 4)).toBeNull();
      expect(cellIndexFromPoint(rect, 10, value, 2, 4)).toBeNull();
    }
  });
});

describe('marked cells', () => {
  it('toggles valid indexes and always returns unique ascending indexes', () => {
    expect(toggleMarkedCell([3, 1, 3], 2, 5)).toEqual([1, 2, 3]);
    expect(toggleMarkedCell([3, 1, 3], 3, 5)).toEqual([1]);
  });

  it('ignores invalid toggle indexes while normalizing existing marks', () => {
    expect(toggleMarkedCell([3, -1, 3, 8], -1, 5)).toEqual([3]);
    expect(toggleMarkedCell([3, 1], 5, 5)).toEqual([1, 3]);
    expect(toggleMarkedCell([3, 1], 1.2, 5)).toEqual([1, 3]);
  });

  it('revises only an existing valid mark', () => {
    expect(reviseMarkedCell([3, 1, 3], 3, 5)).toEqual([1]);
    expect(reviseMarkedCell([3, 1, 3], 2, 5)).toEqual([1, 3]);
    expect(reviseMarkedCell([3, 1, 3], -1, 5)).toEqual([1, 3]);
  });
});

describe('beading requirements', () => {
  const requirements = [
    { colorCode: 'A10', required: 5 },
    { colorCode: 'C1', required: 2 },
    { colorCode: 'A2', required: 5 },
    { colorCode: 'B1', required: 8 },
  ];
  const colors: Record<string, string> = { red: 'A10', green: 'C1', blue: 'A2', yellow: 'B1' };
  const getCode = (color: string) => colors[color] ?? color;

  it('returns zero remaining for a completed requirement', () => {
    expect(remainingRequirement(7, false)).toBe(7);
    expect(remainingRequirement(7, true)).toBe(0);
  });

  it('sorts by first non-transparent canvas appearance and stably appends absent colors', () => {
    const cells = [
      { color: 'red', transparent: true },
      { color: 'blue' },
      { color: 'green', transparent: false },
    ];

    expect(sortBeadingRequirements(requirements, cells, getCode, [], 'canvas').map((item) => item.colorCode))
      .toEqual(['A2', 'C1', 'A10', 'B1']);
  });

  it('sorts by remaining count descending and keeps ties stable', () => {
    expect(sortBeadingRequirements(requirements, [], getCode, ['B1'], 'remaining').map((item) => item.colorCode))
      .toEqual(['A10', 'A2', 'C1', 'B1']);
  });

  it('sorts color codes naturally with numeric comparison in a Chinese locale', () => {
    const input = [
      { colorCode: 'A10', required: 1 },
      { colorCode: '色10', required: 1 },
      { colorCode: 'A2', required: 1 },
      { colorCode: '色2', required: 1 },
    ];

    const sorted = sortBeadingRequirements(input, [], getCode, [], 'code');

    expect(sorted.map((item) => item.colorCode)).toEqual(['色2', '色10', 'A2', 'A10']);
    expect(input.map((item) => item.colorCode)).toEqual(['A10', '色10', 'A2', '色2']);
  });
});
