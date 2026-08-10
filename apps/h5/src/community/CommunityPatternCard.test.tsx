import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CommunityPatternCard } from './CommunityPatternCard';
import type { PatternListCard } from '../shared/h5Types';

const pattern: PatternListCard = {
  id: 'community-1',
  title: '小熊咖啡',
  author: '晴天',
  authorId: 'author-1',
  authorAvatar: 'data:image/png;base64,avatar',
  size: '12 × 16',
  meta: '2026-08-10 10:00',
  likes: '128',
  comments: '9',
  downloads: '0',
  tone: 'recent-bear',
  beads: [],
  beadList: [],
  image: 'https://example.com/thumb.png',
  detailImage: 'https://example.com/detail.png',
  imageAspectRatio: '12 / 16',
  physicalSize: '3.12 × 4.16 cm',
  likesCount: 128,
  commentsCount: 9,
  likedByMe: false,
};

describe('CommunityPatternCard', () => {
  it('renders the shared community content and author affordance', () => {
    const markup = renderToStaticMarkup(createElement(CommunityPatternCard, {
      pattern,
      onOpen: vi.fn(),
      onOpenAuthor: vi.fn(),
    }));

    expect(markup).toContain('小熊咖啡');
    expect(markup).toContain('晴天');
    expect(markup).toContain('https://example.com/thumb.png');
    expect(markup).toContain('99+');
    expect(markup).toContain('9');
    expect(markup).toContain('查看晴天的作者主页');
  });
});
