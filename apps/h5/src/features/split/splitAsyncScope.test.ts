import { describe, expect, it } from 'vitest';
import { createSplitAsyncScope } from './splitAsyncScope';

describe('createSplitAsyncScope', () => {
  it('rejects a preview completion after the user leaves the split route', () => {
    const scope = createSplitAsyncScope();
    const job = scope.begin('image-a', '/split/preview');
    scope.leave('/canvas');

    expect(scope.isCurrent(job, 'image-a', '/split/preview')).toBe(false);
  });

  it('rejects an earlier job after a newer image replaces the source', () => {
    const scope = createSplitAsyncScope();
    const first = scope.begin('image-a', '/split/preview');
    const second = scope.begin('image-b', '/split/preview');

    expect(scope.isCurrent(first, 'image-a', '/split/preview')).toBe(false);
    expect(scope.isCurrent(second, 'image-b', '/split/preview')).toBe(true);
  });
});
