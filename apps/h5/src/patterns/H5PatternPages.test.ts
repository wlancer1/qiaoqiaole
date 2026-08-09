import { createElement } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { limitCommentContent, MyWorksPage, PatternDetailPage, PatternDiscoverPage, PatternMessagesPage } from './H5PatternPages';

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

  it('clips comment avatars and covers the fixed avatar area with images', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const avatarRule = styles.match(/\.detail-comment-avatar\s*\{([^}]*)\}/)?.[1] ?? '';
    const imageRule = styles.match(/\.detail-comment-avatar-image\s*\{([^}]*)\}/)?.[1] ?? '';
    const fallbackRule = styles.match(/\.detail-comment-avatar\s*>\s*svg\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(avatarRule).toContain('width: 0.635rem');
    expect(avatarRule).toContain('height: 0.635rem');
    expect(avatarRule).toContain('overflow: hidden');
    expect(avatarRule).toContain('border-radius: 50%');
    expect(avatarRule).toContain('background: #eef2f7');
    expect(avatarRule).toContain('color: #64748b');
    expect(imageRule).toContain('display: block');
    expect(imageRule).toContain('width: 100%');
    expect(imageRule).toContain('height: 100%');
    expect(imageRule).toContain('object-fit: cover');
    expect(fallbackRule).toContain('width: 0.349rem');
    expect(fallbackRule).toContain('height: 0.349rem');
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
    expect(markup).not.toContain('#FF0000');
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

  it('renders real and fallback avatars independently for comments', () => {
    const markup = renderToStaticMarkup(createElement(PatternDetailPage, {
      pattern: {
        id: 'project-1', title: '头像测试', author: '小明', size: '1 × 1', meta: '刚刚',
        likes: '0', comments: '2', downloads: '0', tone: 'recent-flower', beads: [],
        image: '', detailImage: '', imageAspectRatio: '1 / 1', physicalSize: '0.26 × 0.26 cm', likesCount: 0, commentsCount: 2, likedByMe: false,
      },
      onBack: vi.fn(),
      isLoggedIn: false,
      comments: [
        {
          id: 'comment-with-avatar', projectId: 'project-1', author: '有头像用户',
          authorAvatar: 'https://example.com/avatar.png', content: '有头像', createdAt: '2026-08-09T12:00:00.000Z',
        },
        {
          id: 'comment-without-avatar', projectId: 'project-1', author: '无头像用户',
          authorAvatar: null, content: '无头像', createdAt: '2026-08-09T12:01:00.000Z',
        },
      ],
      isLoadingComments: false,
      onLoadComments: vi.fn(), onLike: vi.fn(), onComment: vi.fn(), onLogin: vi.fn(),
    }));

    expect(markup.match(/class="detail-comment-avatar-image"/g)).toHaveLength(1);
    expect(markup.match(/data-comment-avatar-fallback="true"/g)).toHaveLength(1);
  });
});

describe('PatternMessagesPage', () => {
  it('renders comment notifications and keeps the unread state visible', () => {
    const markup = renderToStaticMarkup(createElement(PatternMessagesPage, {
      isLoggedIn: true,
      notifications: [{
        id: 'notification-1', type: 'comment', projectId: 'project-1', commentId: 'comment-1',
        content: '晴 评论了你的作品「小猫」', createdAt: '2026-08-09T12:00:00.000Z', isRead: false,
        senderId: 'user-2', senderName: '晴',
      }],
      onHome: vi.fn(), onDiscover: vi.fn(), onUpload: vi.fn(), onProfile: vi.fn(), onLogin: vi.fn(), onOpenNotification: vi.fn(),
    }));

    expect(markup).toContain('晴 评论了你的作品');
    expect(markup).toContain('未读');
    expect(markup).toContain('消息');
  });
});

describe('limitCommentContent', () => {
  it('counts emoji as Unicode characters instead of UTF-16 code units', () => {
    const content = '🙂'.repeat(300);
    expect(limitCommentContent(content)).toBe(content);
    expect(limitCommentContent(`${content}🙂`)).toBe(content);
  });
});
