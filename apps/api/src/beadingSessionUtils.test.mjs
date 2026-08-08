import { describe, expect, it } from 'vitest';
import {
  aggregateBeadRequirements,
  calculateInventoryDiff,
  calculateCompletionProgress,
  isValidMard221Code,
  transitionBeadingSession,
} from './beadingSessionUtils.mjs';

describe('beading session pure rules', () => {
  it('validates MARD 221 color codes', () => {
    expect(isValidMard221Code('A1')).toBe(true);
    expect(isValidMard221Code('A14')).toBe(true);
    expect(isValidMard221Code('Z9')).toBe(true);
    expect(isValidMard221Code('A0')).toBe(false);
    expect(isValidMard221Code('A15')).toBe(false);
    expect(isValidMard221Code('AA1')).toBe(false);
    expect(isValidMard221Code('rgb(1,2,3)')).toBe(false);
  });

  it('aggregates duplicate colors and rejects invalid or empty requirements', () => {
    expect(aggregateBeadRequirements([
      { color: 'A14', count: 2 },
      { color: 'A14', count: 3 },
      { color: 'C5', count: 1 },
    ])).toEqual([
      { colorCode: 'A14', required: 5 },
      { colorCode: 'C5', required: 1 },
    ]);
    expect(() => aggregateBeadRequirements([{ color: 'A14', count: 0 }])).toThrow(/positive/i);
    expect(() => aggregateBeadRequirements([{ color: 'rgb(1,2,3)', count: 1 }])).toThrow(/MARD/i);
  });

  it('calculates available and missing inventory', () => {
    expect(calculateInventoryDiff(
      [{ colorCode: 'A14', required: 5 }, { colorCode: 'C5', required: 2 }],
      { A14: 3, C5: 8 },
    )).toEqual({
      items: [
        { colorCode: 'A14', required: 5, available: 3, missing: 2, sufficient: false },
        { colorCode: 'C5', required: 2, available: 8, missing: 0, sufficient: true },
      ],
      summary: { required: 7, available: 11, missing: 2, sufficient: false },
    });
  });

  it('calculates completion by completed color codes', () => {
    expect(calculateCompletionProgress(['A14', 'C5', 'G6'], ['C5'])).toEqual({ completed: 1, total: 3, percent: 33 });
    expect(calculateCompletionProgress([], [])).toEqual({ completed: 0, total: 0, percent: 0 });
  });

  it('enforces the session state transition table', () => {
    expect(transitionBeadingSession('in_progress', 'pause')).toBe('paused');
    expect(transitionBeadingSession('paused', 'resume')).toBe('in_progress');
    expect(transitionBeadingSession('in_progress', 'prepare_completion')).toBe('pending_completion');
    expect(transitionBeadingSession('pending_completion', 'return_to_progress')).toBe('paused');
    expect(transitionBeadingSession('pending_completion', 'complete_without_deduction')).toBe('completed_without_deduction');
    expect(() => transitionBeadingSession('completed_deducted', 'resume')).toThrow(/transition/i);
    expect(() => transitionBeadingSession('pending_completion', 'pause')).toThrow(/transition/i);
  });
});
