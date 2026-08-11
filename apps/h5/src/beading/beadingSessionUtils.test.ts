import { describe, expect, it, vi } from 'vitest';
import {
  beadingDraftKey,
  canCompleteOffline,
  clearBeadingDraft,
  completionProgress,
  nextIncompleteColor,
  normalizeBeadingDraft,
  readBeadingDraft,
  writeBeadingDraft,
} from './beadingSessionUtils';
import { createBeadingToolState } from './beadingToolState';

describe('beading session client utilities', () => {
  const requirements = [{ colorCode: 'A14', required: 3 }, { colorCode: 'C5', required: 2 }, { colorCode: 'G6', required: 1 }];
  it('calculates progress and next color by color code', () => {
    expect(completionProgress(requirements, ['C5'])).toEqual({ completed: 1, total: 3, percent: 33 });
    expect(nextIncompleteColor(requirements, ['A14'], 'A14')).toBe('C5');
    expect(nextIncompleteColor(requirements, ['A14', 'C5', 'G6'])).toBeNull();
  });
  it('isolates drafts by account and session', () => {
    expect(beadingDraftKey('u1', 's1')).not.toBe(beadingDraftKey('u2', 's1'));
    expect(beadingDraftKey('u1', 's1')).not.toBe(beadingDraftKey('u1', 's2'));
  });
  it('blocks final completion while offline', () => {
    expect(canCompleteOffline(false)).toBe(false);
    expect(canCompleteOffline(true)).toBe(true);
  });
  it('writes, reads and clears account/session drafts', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
    writeBeadingDraft(storage, 'u1', 's1', { completedColorCodes: ['A14'], elapsedSeconds: 12, updatedAt: 'now' });
    expect(readBeadingDraft(storage, 'u1', 's1')?.completedColorCodes).toEqual(['A14']);
    expect(readBeadingDraft(storage, 'u2', 's1')).toBeNull();
    clearBeadingDraft(storage, 'u1', 's1');
    expect(readBeadingDraft(storage, 'u1', 's1')).toBeNull();
  });

  it('migrates an old draft to the default persisted tool state', () => {
    const defaults = createBeadingToolState();

    expect(normalizeBeadingDraft({
      completedColorCodes: ['A14'],
      elapsedSeconds: 12,
      updatedAt: 'old',
    }, 10)).toEqual({
      markedCellIndexes: [],
      highlightEnabled: defaults.highlightEnabled,
      locked: defaults.locked,
      codesVisible: defaults.codesVisible,
      gridVisible: defaults.gridVisible,
      sortMode: defaults.sortMode,
    });
  });

  it('normalizes marks and replaces invalid persisted fields with defaults', () => {
    expect(normalizeBeadingDraft({
      markedCellIndexes: [4, 1, 4, -1, 5, 2.5, '2'],
      highlightEnabled: 'yes',
      locked: 1,
      codesVisible: null,
      gridVisible: false,
      sortMode: 'alphabetical',
    }, 5)).toEqual({
      markedCellIndexes: [1, 4],
      highlightEnabled: true,
      locked: false,
      codesVisible: true,
      gridVisible: false,
      sortMode: 'remaining',
    });
  });

  it('round-trips the extended draft fields on the existing key', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    };
    const draft = {
      completedColorCodes: [],
      elapsedSeconds: 0,
      updatedAt: 'now',
      markedCellIndexes: [3, 1],
      highlightEnabled: false,
      locked: true,
      codesVisible: false,
      gridVisible: false,
      sortMode: 'remaining' as const,
    };

    writeBeadingDraft(storage, 'u1', 's1', draft);

    expect(readBeadingDraft(storage, 'u1', 's1')).toEqual(draft);
    expect(normalizeBeadingDraft(readBeadingDraft(storage, 'u1', 's1'), 4)).toEqual({
      markedCellIndexes: [1, 3],
      highlightEnabled: false,
      locked: true,
      codesVisible: false,
      gridVisible: false,
      sortMode: 'remaining',
    });
    expect([...data.keys()]).toEqual(['qiaoqiaole.beading-draft:u1:s1']);
  });

  it('accepts new drafts without legacy progress fields and supplies safe defaults', () => {
    const storage = {
      getItem: () => JSON.stringify({ locked: true, markedCellIndexes: [2] }),
    };

    expect(readBeadingDraft(storage, 'u1', 's1')).toEqual({
      completedColorCodes: [],
      elapsedSeconds: 0,
      updatedAt: '',
      locked: true,
      markedCellIndexes: [2],
    });
  });

  it.each([
    { completedColorCodes: [1], elapsedSeconds: 0, updatedAt: '' },
    { completedColorCodes: [], elapsedSeconds: Number.NaN, updatedAt: '' },
    { completedColorCodes: [], elapsedSeconds: -1, updatedAt: '' },
    { completedColorCodes: [], elapsedSeconds: 0, updatedAt: 42 },
  ])('rejects malformed legacy fields: %j', (draft) => {
    const onError = vi.fn();
    const storage = { getItem: () => JSON.stringify(draft) };

    expect(readBeadingDraft(storage, 'u1', 's1', onError)).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('contains an onError callback that throws', () => {
    const storage = { getItem: () => '{broken' };

    expect(() => readBeadingDraft(storage, 'u1', 's1', () => { throw new Error('warning failed'); })).not.toThrow();
  });
});
