import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { limitCommentContent, MyWorksPage, PatternDiscoverPage } from './H5PatternPages';

describe('PatternDiscoverPage', () => {
  it('marks the selected community sort tab as active', () => {
    const markup = renderToStaticMarkup(createElement(PatternDiscoverPage, {
      patterns: [],
      activeSort: 'latest',
      onSortChange: vi.fn(),
      onOpen: vi.fn(),
      onOpenAuthor: vi.fn(),
    }));

    expect(markup).toContain('aria-selected="true">最新</button>');
    expect(markup).toContain('aria-selected="false">热门</button>');
  });
});

describe('MyWorksPage', () => {
  it('renders share states for unshared, failed, sharing, and shared projects', () => {
    const projects = [
      { id: 'unshared', name: '未分享', rows: 2, cols: 2, tone: 'recent-flower', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'failed', name: '失败', rows: 2, cols: 2, tone: 'recent-flower', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'sharing', name: '分享中', rows: 2, cols: 2, tone: 'recent-flower', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'shared', name: '已分享', rows: 2, cols: 2, tone: 'recent-flower', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', sharedToCommunity: true },
    ];
    const markup = renderToStaticMarkup(createElement(MyWorksPage, {
      projects,
      onBack: vi.fn(),
      onOpen: vi.fn(),
      onShare: vi.fn(),
      sharingProjectId: 'sharing',
      shareFailedProjectIds: new Set(['failed']),
    }));

    expect(markup).toContain('分享到社区');
    expect(markup).toContain('重试分享');
    expect(markup).toContain('分享中...');
    expect(markup).toContain('已分享到社区');
  });
});

describe('limitCommentContent', () => {
  it('counts emoji as Unicode characters instead of UTF-16 code units', () => {
    const content = '🙂'.repeat(300);
    expect(limitCommentContent(content)).toBe(content);
    expect(limitCommentContent(`${content}🙂`)).toBe(content);
  });
});
