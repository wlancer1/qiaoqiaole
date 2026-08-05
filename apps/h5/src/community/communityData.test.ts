import { describe, expect, it } from 'vitest';
import { sortCommunityPosts, toPatternListCard } from './communityData';

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
      sourceImage: '',
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
    });
    expect(card.beads).toEqual([]);
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
