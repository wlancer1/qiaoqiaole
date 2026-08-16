import { describe, expect, it } from 'vitest';
import { communityDiscoveryRoute, communityRouteBackTarget } from './communityRoute';

describe('community route state', () => {
  it('normalizes the shareable discovery URL and retains page-local search', () => {
    expect(communityDiscoveryRoute('?sort=latest&tags=%E5%8A%A8%E7%89%A9%2C%E4%BA%BA%E7%89%A9&page=3&q=%E6%98%9F%E7%A9%BA')).toEqual({
      sort: 'latest', tags: ['动物', '人物'], page: 3, query: '星空',
    });
  });

  it('rejects malformed discovery values with deterministic defaults', () => {
    expect(communityDiscoveryRoute('?sort=old&tags=%E5%8A%A8%E7%89%A9%2Cbad%2C%E5%8A%A8%E7%89%A9&page=-8&q=' + 'x'.repeat(101))).toEqual({
      sort: 'hot', tags: ['动物'], page: 1, query: 'x'.repeat(100),
    });
  });

  it('permits only internal community back targets and has a direct-link fallback', () => {
    expect(communityRouteBackTarget('/community/users/u-1?from=%2Fcommunity%2Fposts%2Fp-1', '/discover')).toBe('/community/posts/p-1');
    expect(communityRouteBackTarget('/community/posts/p-1?from=https%3A%2F%2Fevil.example', '/discover')).toBe('/discover');
    expect(communityRouteBackTarget('/community/posts/p-1?from=%2Fprojects%2Fsecret%2Fedit', '/discover')).toBe('/discover');
    expect(communityRouteBackTarget('/community/posts/p-1', '/discover')).toBe('/discover');
  });
});
