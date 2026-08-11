import { describe, expect, it } from 'vitest';
import { formatCommunityTime, formatPatternSizeCm, insertCommentReply, removeCommentTree, sortCommunityPosts, toPatternListCard, type CommunityCommentThread } from './communityData';

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

  it('inserts reply-to-reply comments into the visible top-level thread', () => {
    const threads: CommunityCommentThread[] = [{
      id: 'top', projectId: 'project-1', author: '作者', authorAvatar: null, content: '顶层', createdAt: '2026-08-11T00:00:00.000Z',
      replies: [{ id: 'reply-1', projectId: 'project-1', author: '回复者', authorAvatar: null, content: '回复', createdAt: '2026-08-11T00:01:00.000Z', parentId: 'top' }],
    }];

    const next = insertCommentReply(threads, {
      id: 'reply-2', projectId: 'project-1', author: '二级回复者', authorAvatar: null, content: '回复回复', createdAt: '2026-08-11T00:02:00.000Z', parentId: 'reply-1',
    });

    expect(next[0]?.replies.map((reply) => reply.id)).toEqual(['reply-1', 'reply-2']);
    expect(next[0]?.replies[1]?.parentId).toBe('reply-1');
  });

  it('removes nested reply descendants from the visible thread', () => {
    const threads: CommunityCommentThread[] = [{
      id: 'top', projectId: 'project-1', author: '作者', authorAvatar: null, content: '顶层', createdAt: '2026-08-11T00:00:00.000Z',
      replies: [
        { id: 'reply-1', projectId: 'project-1', author: '回复者', authorAvatar: null, content: '回复', createdAt: '2026-08-11T00:01:00.000Z', parentId: 'top' },
        { id: 'reply-2', projectId: 'project-1', author: '二级回复者', authorAvatar: null, content: '回复回复', createdAt: '2026-08-11T00:02:00.000Z', parentId: 'reply-1' },
        { id: 'reply-3', projectId: 'project-1', author: '另一位', authorAvatar: null, content: '其他回复', createdAt: '2026-08-11T00:03:00.000Z', parentId: 'top' },
      ],
    }];

    const next = removeCommentTree(threads, 'reply-1');

    expect(next[0]?.replies.map((reply) => reply.id)).toEqual(['reply-3']);
  });
});
