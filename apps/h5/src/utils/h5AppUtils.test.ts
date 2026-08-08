import { describe, expect, it } from 'vitest';
import { parseGridSizeInput } from './h5AppUtils';

describe('parseGridSizeInput', () => {
  it('keeps an empty draft empty so a number input can be edited', () => {
    expect(parseGridSizeInput('')).toBe('');
  });

  it('keeps a typed multi-digit value intact until it is normalized on commit', () => {
    expect(parseGridSizeInput('104')).toBe(104);
  });
});
