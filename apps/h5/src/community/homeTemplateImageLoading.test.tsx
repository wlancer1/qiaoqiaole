import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CommunityPatternCard } from './CommunityPatternCard';
import { ImageWithSkeleton } from '../shared/ImageWithSkeleton';

function collectElements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [
    element,
    ...Children.toArray(element.props.children).flatMap(collectElements),
  ];
}

describe('home template image loading', () => {
  it('forwards the home template image loading policy to ImageWithSkeleton', () => {
    const card = CommunityPatternCard({
      pattern: {
        id: 'template-1', title: '热门图纸', author: '作者', authorId: 'author-1', authorAvatar: null,
        image: '/template.webp', detailImage: '/template.webp', tone: 'pattern-flower',
        tags: [], likes: '0', comments: '0', downloads: '0', size: '1×1', meta: '今天', beads: [],
        likesCount: 0, commentsCount: 0, likedByMe: false,
      },
      loading: 'lazy',
      fetchPriority: 'low',
      deferUntilVisible: true,
      loadTimeoutMs: 2_500,
      maxRetries: 0,
      onOpen: vi.fn(),
      onOpenAuthor: vi.fn(),
    });

    const image = collectElements(card).find((element) => element.type === ImageWithSkeleton);

    expect(image).toBeDefined();
    expect(image?.props).toMatchObject({
      loading: 'lazy',
      fetchPriority: 'low',
      deferUntilVisible: true,
      loadTimeoutMs: 2_500,
      maxRetries: 0,
    });
  });
});
