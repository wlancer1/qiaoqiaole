import { describe, expect, it } from 'vitest';
import { parseBeadingRoute } from './beadingRoute';

describe('parseBeadingRoute', () => {
  it('accepts an encoded project beading deep link', () => {
    expect(parseBeadingRoute('/projects/project%201/beading')).toEqual({ projectId: 'project 1' });
  });

  it('rejects malformed or unrelated paths', () => {
    expect(parseBeadingRoute('/projects//beading')).toBeNull();
    expect(parseBeadingRoute('/projects/p1/edit')).toBeNull();
    expect(parseBeadingRoute('/beading')).toBeNull();
  });
});
