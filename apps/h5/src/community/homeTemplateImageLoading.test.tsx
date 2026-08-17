import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CommunityPatternCard } from './CommunityPatternCard';

describe('home template image loading', () => {
  it('allows the home template cards to opt into eager image loading', () => {
    const markup = renderToStaticMarkup(createElement(CommunityPatternCard, {
      pattern: {
        id: 'template-1', title: '热门图纸', author: '作者', authorId: 'author-1', authorAvatar: null,
        image: '/template.webp', detailImage: '/template.webp', tone: 'pattern-flower',
        tags: [], likes: '0', comments: '0', downloads: '0', size: '1×1', meta: '今天', beads: [],
        likesCount: 0, commentsCount: 0, likedByMe: false,
      },
      loading: 'eager',
      onOpen: vi.fn(),
      onOpenAuthor: vi.fn(),
    }));

    expect(markup).toContain('loading="eager"');
  });
});
