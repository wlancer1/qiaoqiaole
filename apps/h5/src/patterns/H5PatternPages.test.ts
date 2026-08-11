import { createElement } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { AuthorProfilePage, limitCommentContent, MyWorksPage, PatternDetailPage, PatternDiscoverPage, PatternMessagesPage } from './H5PatternPages';

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
    expect(markup).toContain('>全部</button>');
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

    expect(avatarRule).toContain('width: 1.1rem');
    expect(avatarRule).toContain('height: 1.1rem');
    expect(avatarRule).toContain('overflow: hidden');
    expect(avatarRule).toContain('border-radius: 50%');
    expect(avatarRule).toContain('background: linear-gradient(145deg, #146cff, #071c48)');
    expect(avatarRule).toContain('color: #fff');
    expect(imageRule).toContain('display: block');
    expect(imageRule).toContain('width: 100%');
    expect(imageRule).toContain('height: 100%');
    expect(imageRule).toContain('object-fit: cover');
    expect(fallbackRule).toContain('width: 0.58rem');
    expect(fallbackRule).toContain('height: 0.58rem');
  });
});

describe('MyWorksPage', () => {
  it('keeps folder, tag, and publishing controls on the editor compact scale', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const folderPicker = styles.match(/\.save-project-folder-picker select\s*\{([^}]*)\}/)?.[1] ?? '';
    const publishPanel = styles.match(/\.share-community-panel\s*\{([^}]*)\}/)?.[1] ?? '';
    const tagButton = styles.match(/\.community-tag-selector button, \.pattern-tag-filter button\s*\{([^}]*)\}/)?.[1] ?? '';
    const folderFilter = styles.match(/\.my-works-folder-filter button\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(folderPicker).toContain('min-height: 1.65rem');
    expect(folderPicker).toContain('border-radius: .4444rem');
    expect(publishPanel).toContain('border-radius: .9524rem');
    expect(tagButton).toContain('min-height: 1.016rem');
    expect(tagButton).toContain('font-size: .381rem');
    expect(folderFilter).toContain('min-height: 1.016rem');
    expect(folderFilter).toContain('font-size: .381rem');
  });

  it('renders share states, folder filters, and moving controls', () => {
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
      folders: [{ id: 'animals', name: '动物', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
      activeFolderId: 'all',
      onFolderChange: vi.fn(),
      onCreateFolder: vi.fn(),
      onMoveProject: vi.fn(),
      onDeleteFolder: vi.fn(),
      sharingProjectId: 'sharing',
      shareFailedProjectIds: new Set(['failed']),
    }));

    expect(markup).toContain('分享到社区');
    expect(markup).toContain('重试分享');
    expect(markup).toContain('分享中...');
    expect(markup).toContain('编辑标签');
    expect(markup).toContain('全部作品');
    expect(markup).toContain('未分类');
    expect(markup).toContain('动物');
    expect(markup).toContain('移动到');
    expect(markup).toContain('新建文件夹');
    expect(markup).toContain('删除文件夹 动物');
    expect(markup).not.toContain('收藏');
  });
});

describe('AuthorProfilePage', () => {
  it('renders only shared works and the real author statistics', () => {
    const markup = renderToStaticMarkup(createElement(AuthorProfilePage, {
      patterns: [{ id: 'shared-1', title: '已分享作品', author: '小鹿', authorId: 'user-2', authorAvatar: null, size: '2 × 2', meta: '刚刚', likes: '4', comments: '1', downloads: '0', tone: 'recent-flower', beads: ['#fff'], image: '', likesCount: 4, commentsCount: 1, likedByMe: false }],
      authorProfile: { id: 'user-2', name: '小鹿', avatarUrl: null, postsCount: 1, likesCount: 4, followersCount: 8, isFollowing: false },
      currentUserId: 'user-1', onBack: vi.fn(), onOpen: vi.fn(), onFollow: vi.fn(),
    }));
    expect(markup).toContain('小鹿');
    expect(markup).toContain('已分享作品');
    expect(markup).toContain('>1</strong><span>作品</span>');
    expect(markup).toContain('>8</strong><span>粉丝</span>');
    expect(markup).toContain('>关注</button>');
    expect(markup).not.toContain('收藏');
    expect(markup).not.toContain('喜欢');
  });
});

describe('PatternDetailPage', () => {
  it('hides follow for the current author and renders the database avatar for other authors', () => {
    const ownMarkup = renderToStaticMarkup(createElement(PatternDetailPage, {
      pattern: {
        id: 'own-project', title: '自己的稿件', author: '我', authorId: 'user-1', authorAvatar: 'https://example.com/me.png', size: '1 × 1', meta: '刚刚',
        likes: '0', comments: '0', downloads: '0', tone: 'recent-flower', beads: [], image: '', likesCount: 0, commentsCount: 0, likedByMe: false,
      },
      currentUserId: 'user-1', onBack: vi.fn(), isLoggedIn: true, comments: [], isLoadingComments: false,
      onLoadComments: vi.fn(), onLike: vi.fn(), onFollow: vi.fn(), onComment: vi.fn(), onLogin: vi.fn(),
    }));
    const otherMarkup = renderToStaticMarkup(createElement(PatternDetailPage, {
      pattern: {
        id: 'other-project', title: '别人的稿件', author: '别人', authorId: 'user-2', authorAvatar: 'https://example.com/other.png', size: '1 × 1', meta: '刚刚',
        likes: '0', comments: '0', downloads: '0', tone: 'recent-flower', beads: [], image: '', likesCount: 0, commentsCount: 0, likedByMe: false,
      },
      currentUserId: 'user-1', onBack: vi.fn(), isLoggedIn: true, comments: [], isLoadingComments: false,
      onLoadComments: vi.fn(), onLike: vi.fn(), onFollow: vi.fn(), onComment: vi.fn(), onLogin: vi.fn(),
    }));

    expect(ownMarkup).not.toContain('class="detail-follow-btn"');
    expect(otherMarkup).toContain('class="detail-follow-btn"');
    expect(otherMarkup).toContain('src="https://example.com/other.png"');
  });

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
    expect(markup).toContain('复制到仓库');
    expect(markup).not.toContain('下载图纸');
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

  it('collapses replies after the first two and shows an expand control', () => {
    const replies = Array.from({ length: 4 }, (_, index) => ({
      id: `reply-${index + 1}`, projectId: 'project-1', author: `回复用户${index + 1}`, authorId: `user-${index + 2}`,
      authorAvatar: null, content: `回复内容${index + 1}`, createdAt: '2026-08-09T12:00:00.000Z', parentId: 'parent-1',
    }));
    const markup = renderToStaticMarkup(createElement(PatternDetailPage, {
      pattern: { id: 'project-1', title: '回复收起', author: '作者', size: '1 × 1', meta: '刚刚', likes: '0', comments: '5', downloads: '0', tone: 'recent-flower', beads: [], image: '', likesCount: 0, commentsCount: 5, likedByMe: false },
      onBack: vi.fn(), isLoggedIn: true,
      comments: [{ id: 'parent-1', projectId: 'project-1', author: '主评论用户', authorId: 'user-1', authorAvatar: null, content: '主评论内容', createdAt: '2026-08-09T12:00:00.000Z', replies }],
      isLoadingComments: false, onLoadComments: vi.fn(), onLike: vi.fn(), onComment: vi.fn(), onReply: vi.fn(), onLogin: vi.fn(),
    }));

    expect(markup).toContain('回复内容1');
    expect(markup).toContain('回复内容2');
    expect(markup).not.toContain('回复内容3');
    expect(markup).toContain('展开 2 条回复');
    expect(markup).toContain('aria-expanded="false"');
  });

  it('expands and collapses a reply thread on demand', () => {
    const replies = Array.from({ length: 3 }, (_, index) => ({
      id: `toggle-reply-${index + 1}`, projectId: 'project-1', author: `回复用户${index + 1}`, authorId: `user-${index + 2}`,
      authorAvatar: null, content: `可切换回复${index + 1}`, createdAt: '2026-08-09T12:00:00.000Z', parentId: 'toggle-parent',
    }));
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(PatternDetailPage, {
        pattern: { id: 'project-1', title: '回复展开', author: '作者', size: '1 × 1', meta: '刚刚', likes: '0', comments: '4', downloads: '0', tone: 'recent-flower', beads: [], image: '', likesCount: 0, commentsCount: 4, likedByMe: false },
        onBack: vi.fn(), isLoggedIn: true,
        comments: [{ id: 'toggle-parent', projectId: 'project-1', author: '主评论用户', authorId: 'user-1', authorAvatar: null, content: '主评论内容', createdAt: '2026-08-09T12:00:00.000Z', replies }],
        isLoadingComments: false, onLoadComments: vi.fn(), onLike: vi.fn(), onComment: vi.fn(), onReply: vi.fn(), onLogin: vi.fn(),
      }));
    });
    const hasReply = (content: string) => renderer.root.findAllByType('p').some((node) => node.children.join('') === content);

    expect(hasReply('可切换回复3')).toBe(false);
    act(() => renderer.root.findByProps({ className: 'detail-comment-toggle-replies' }).props.onClick());
    expect(hasReply('可切换回复3')).toBe(true);
    expect(renderer.root.findByProps({ className: 'detail-comment-toggle-replies' }).children).toEqual(['收起回复']);
    act(() => renderer.root.findByProps({ className: 'detail-comment-toggle-replies' }).props.onClick());
    expect(hasReply('可切换回复3')).toBe(false);
    renderer.unmount();
  });

  it('only renders delete for the logged-in comment author', () => {
    const markup = renderToStaticMarkup(createElement(PatternDetailPage, {
      pattern: {
        id: 'project-1', title: '评论权限', author: '作者', size: '1 × 1', meta: '刚刚',
        likes: '0', comments: '2', downloads: '0', tone: 'recent-flower', beads: [], image: '',
        likesCount: 0, commentsCount: 2, likedByMe: false,
      },
      currentUserId: 'user-1', onBack: vi.fn(), isLoggedIn: true, comments: [
        { id: 'mine', projectId: 'project-1', author: '我', authorId: 'user-1', authorAvatar: null, content: '我的评论', createdAt: '2026-08-09T12:00:00.000Z' },
        { id: 'other', projectId: 'project-1', author: '别人', authorId: 'user-2', authorAvatar: null, content: '别人的评论', createdAt: '2026-08-09T12:01:00.000Z' },
      ],
      isLoadingComments: false, onLoadComments: vi.fn(), onLike: vi.fn(), onComment: vi.fn(), onDeleteComment: vi.fn(), onLogin: vi.fn(),
    }));

    expect(markup.match(/aria-label="删除评论：/g)).toHaveLength(1);
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
    expect(markup).toContain('aria-label="1 条未读"');
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
