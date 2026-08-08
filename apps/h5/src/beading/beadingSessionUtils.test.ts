import { describe, expect, it } from 'vitest';
import { beadingDraftKey, canCompleteOffline, clearBeadingDraft, completionProgress, nextIncompleteColor, readBeadingDraft, writeBeadingDraft } from './beadingSessionUtils';

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
});
