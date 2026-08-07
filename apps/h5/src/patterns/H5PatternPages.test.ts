import { createElement } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { limitCommentContent, MyWorksPage, PatternDetailPage, PatternDiscoverPage } from './H5PatternPages';

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
    expect(markup).not.toContain('>推荐</button>');
    expect(markup).not.toContain('>全部</button>');
    expect(markup).not.toContain('>动物</button>');
    expect(markup).not.toContain('>人物</button>');
    expect(markup).not.toContain('>植物</button>');
  });
});

describe('PatternDetailPage layout contract', () => {
  it('clips the preview image to its fixed hero area', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const heroRule = styles.match(/\.detail-hero-art\s*\{([^}]*)\}/)?.[1] ?? '';
    const imageRule = styles.match(/\.detail-hero-art img\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(heroRule).toContain('overflow: hidden');
    expect(heroRule).toContain('height: auto');
    expect(imageRule).toContain('max-width: 100%');
    expect(imageRule).toContain('max-height: none');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
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

describe('PatternDetailPage', () => {
  it('renders the shared bead list and uses the full detail image', () => {
    const markup = renderToStaticMarkup(createElement(PatternDetailPage, {
      pattern: {
        id: 'project-1', title: '我的猫', author: '小明', size: '24 × 18', meta: '刚刚',
        likes: '2', comments: '1', downloads: '0', tone: 'recent-flower', beads: [],
        image: '/uploads/thumb.webp', detailImage: '/uploads/thumb.webp', imageAspectRatio: '24 / 18', physicalSize: '6.24 × 4.68 cm', likesCount: 2, commentsCount: 1, likedByMe: false,
        beadList: [{ color: '#ff0000', count: 3 }],
      },
      onBack: vi.fn(), isLoggedIn: false, comments: [], isLoadingComments: false,
      onLoadComments: vi.fn(), onLike: vi.fn(), onComment: vi.fn(), onLogin: vi.fn(),
    }));

    expect(markup).toContain('src="/uploads/thumb.webp"');
    expect(markup).toContain('#FF0000');
    expect(markup).toContain('3 颗');
    expect(markup).toContain('图纸尺寸');
    expect(markup).toContain('格数');
    expect(markup).toContain('发布日期');
    expect(markup).toContain('浏览次数');
    expect(markup).not.toContain('难度');
    expect(markup).not.toContain('耗时');
    expect(markup).not.toContain('作品信息');
    expect(markup).not.toContain('detail-stat-cards');
    expect(markup).not.toContain('待生成');
  });
});

describe('limitCommentContent', () => {
  it('counts emoji as Unicode characters instead of UTF-16 code units', () => {
    const content = '🙂'.repeat(300);
    expect(limitCommentContent(content)).toBe(content);
    expect(limitCommentContent(`${content}🙂`)).toBe(content);
  });
});
