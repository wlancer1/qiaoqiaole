import { describe, expect, it } from 'vitest';
import { formatCommunityTime, formatPatternSizeCm, sortCommunityPosts, toPatternListCard } from './communityData';

describe('formatCommunityTime', () => {
  it('formats ISO timestamps for community cards and detail metadata', () => {
    expect(formatCommunityTime('2026-08-06T12:07:31.429Z')).toBe('2026-08-06 20:07');
  });
});

describe('formatPatternSizeCm', () => {
  it('converts grid counts from 2.6mm cells to centimeters', () => {
    expect(formatPatternSizeCm(47, 61)).toBe('12.22 × 15.86 cm');
  });
});

describe('community data helpers', () => {
  it('maps a real community post to a discover card without fabricated content', () => {
    const card = toPatternListCard({
      id: 'project-1',
      name: '我的猫',
      author: '小明',
      rows: 18,
      cols: 24,
      tone: 'recent-flower',
      thumbnailImage: '/uploads/cat.webp',
      sourceImage: '/uploads/cat-source.webp',
      beadList: [{ color: '#ff0000', count: 3 }],
      likesCount: 12,
      commentsCount: 3,
      likedByMe: true,
      sharedAt: '2026-08-04T00:00:00.000Z',
    });

    expect(card).toMatchObject({
      id: 'project-1',
      title: '我的猫',
      author: '小明',
      size: '24 × 18',
      likesCount: 12,
      commentsCount: 3,
      likedByMe: true,
      image: '/uploads/cat.webp',
      detailImage: '/uploads/cat.webp',
      physicalSize: '6.24 × 4.68 cm',
    });
    expect(card.beads).toEqual([]);
    expect(card.beadList).toEqual([{ color: '#ff0000', count: 3 }]);
  });

  it('sorts hot posts by likes and uses share time as the tie-breaker', () => {
    const posts = [
      { id: 'old', likesCount: 4, sharedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'new', likesCount: 4, sharedAt: '2026-08-04T00:00:00.000Z' },
      { id: 'top', likesCount: 9, sharedAt: '2026-08-02T00:00:00.000Z' },
    ];

    expect(sortCommunityPosts(posts).map((post) => post.id)).toEqual(['top', 'new', 'old']);
  });
});
