import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { myWorksBackTarget, nextAuthorBackTarget, nextDetailBackTarget } from './communityNavigation';

describe('community navigation state', () => {
  it('keeps detail and author return targets explicit', () => {
    expect(nextDetailBackTarget('discover')).toBe('home');
    expect(nextDetailBackTarget('author-profile')).toBe('author-profile');
    expect(nextAuthorBackTarget('pattern-detail')).toBe('detail');
    expect(nextAuthorBackTarget('discover')).toBe('discover');
    expect(nextAuthorBackTarget('following')).toBe('following');
    expect(nextAuthorBackTarget('followers')).toBe('followers');
  });

  it('returns from my works to the profile tab', () => {
    expect(myWorksBackTarget()).toBe('profile');
  });

  it('keeps the author profile origin when returning from an author work detail', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/features/community/CommunityFeatureProvider.tsx'), 'utf8');
    const detailBackBranch = source.match(/if \(patternDetailBackTargetRef\.current === 'author-profile'\) \{([\s\S]*?)setScreen\('author-profile'\);/)?.[1] ?? '';

    expect(detailBackBranch).not.toContain("authorProfileBackTargetRef.current = 'discover'");
    expect(detailBackBranch).not.toContain('authorProfileReturnPatternRef.current = null');
  });
});
