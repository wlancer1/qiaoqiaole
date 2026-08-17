import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MyWorksPage } from './H5PatternPages';

const project = { id: 'one', name: '作品', rows: 1, cols: 1, tone: 'recent-flower', createdAt: '2026-08-01', updatedAt: '2026-08-01' };

describe('project list pagination UI', () => {
  it('renders an accessible load-more sentinel when another server page exists', () => {
    const markup = renderToStaticMarkup(createElement(MyWorksPage, {
      projects: [project],
      onBack: vi.fn(),
      onOpen: vi.fn(),
      hasMore: true,
      loadingMore: false,
      onLoadMore: vi.fn(),
    }));

    expect(markup).toContain('community-load-more');
    expect(markup).toContain('加载更多作品');
    expect(markup).not.toContain('上一页作品');
  });
});
