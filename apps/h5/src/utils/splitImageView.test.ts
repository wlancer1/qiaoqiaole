import { describe, expect, it } from 'vitest';
import { defaultSplitImageView } from './splitImageView';

describe('split image view', () => {
  it('starts the next split step at the default image scale and position', () => {
    expect(defaultSplitImageView()).toEqual({ scale: 1, offset: { x: 0, y: 0 } });
  });
});
