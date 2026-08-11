import { describe, expect, it } from 'vitest';
import { myWorksBackTarget, nextAuthorBackTarget, nextDetailBackTarget } from './communityNavigation';

describe('community navigation state', () => {
  it('keeps detail and author return targets explicit', () => {
    expect(nextDetailBackTarget('discover')).toBe('home');
    expect(nextDetailBackTarget('author-profile')).toBe('author-profile');
    expect(nextAuthorBackTarget('pattern-detail')).toBe('detail');
    expect(nextAuthorBackTarget('discover')).toBe('discover');
  });

  it('returns from my works to the profile tab', () => {
    expect(myWorksBackTarget()).toBe('profile');
  });
});
