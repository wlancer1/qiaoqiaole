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

describe('MyWorksPage thumbnails', () => {
  it('renders received likes and the connected liked works tab', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(createElement(MyWorksPage, {
      projects: [],
      likedProjects: [{ id: 'liked-1', name: '喜欢的作品', rows: 1, cols: 1, tone: 'recent-flower', createdAt: '', updatedAt: '' }],
      receivedLikesCount: 7,
      onBack: vi.fn(),
      onOpen: vi.fn(),
    })); });

    expect(renderer.root.findAllByType('strong').some((node) => node.children.join('') === '7')).toBe(true);
    const likesTab = renderer.root.findAllByType('button').find((node) => node.children.join('') === '喜欢');
    act(() => likesTab?.props.onClick());
    expect(renderer.root.findAllByType('strong').some((node) => node.children.join('') === '喜欢的作品')).toBe(true);
  });

  it('eagerly loads only the first six thumbnails and defers the rest to avoid mobile request queue congestion', () => {
    const projects = Array.from({ length: 7 }, (_, index) => ({
      id: `project-${index + 1}`,
      name: `作品${index + 1}`,
      rows: 16,
      cols: 16,
      tone: 'recent-flower',
      thumbnailImage: `/api/projects/project-${index + 1}/thumbnail`,
      createdAt: '',
      updatedAt: '',
    }));
    const markup = renderToStaticMarkup(createElement(MyWorksPage, {
      projects,
      onBack: vi.fn(),
      onOpen: vi.fn(),
    }));

    expect(markup.match(/loading="eager"/g)).toHaveLength(6);
    expect(markup.match(/loading="lazy"/g)).toHaveLength(1);
    expect(markup).toContain('src="/api/projects/project-7/thumbnail"');
  });

  it('uses a neutral placeholder instead of generated artwork when a project has no image', () => {
    const markup = renderToStaticMarkup(createElement(MyWorksPage, {
      projects: [{ id: 'project-without-image', name: '无图作品', rows: 16, cols: 16, tone: 'recent-flower', createdAt: '', updatedAt: '' }],
      onBack: vi.fn(),
      onOpen: vi.fn(),
    }));

    expect(markup).toContain('my-work-thumb-placeholder');
    expect(markup).not.toContain('my-work-thumb-grid');
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
  it('shows a loading state instead of the empty works state while the first page is pending', () => {
    vi.useFakeTimers();
    let renderer!: ReturnType<typeof create>;
    try {
      act(() => { renderer = create(createElement(MyWorksPage, { projects: [], onBack: vi.fn(), onOpen: vi.fn(), loading: true })); });
      act(() => { vi.advanceTimersByTime(300); });
      expect(renderer.root.findByProps({ 'aria-label': '正在加载作品' }).props.role).toBe('status');
      expect(renderer.root.findAllByProps({ 'aria-label': '暂无作品' })).toHaveLength(0);
    } finally {
      if (renderer!) act(() => renderer.unmount());
      vi.useRealTimers();
    }
  });

  it('shows the established page skeleton while another works page is pending', () => {
    vi.useFakeTimers();
    let renderer!: ReturnType<typeof create>;
    try {
      act(() => { renderer = create(createElement(MyWorksPage, { projects: [{ id: 'loaded-work', name: '已加载作品', rows: 1, cols: 1, tone: 'recent', createdAt: '', updatedAt: '' }], onBack: vi.fn(), onOpen: vi.fn(), loading: true })); });
      act(() => { vi.advanceTimersByTime(300); });
      expect(renderer.root.findByProps({ 'aria-label': '正在加载作品' }).props.role).toBe('status');
      expect(renderer.root.findAllByProps({ 'data-project-card-id': 'loaded-work' })).toHaveLength(0);
    } finally {
      if (renderer!) act(() => renderer.unmount());
      vi.useRealTimers();
    }
  });

  it('uses the server total for the profile counts instead of the current page size', () => {
    const markup = renderToStaticMarkup(createElement(MyWorksPage, {
      projects: [{ id: 'page-one-project', name: '当前页作品', rows: 1, cols: 1, tone: 'recent', createdAt: '', updatedAt: '' }],
      total: 40,
      onBack: vi.fn(),
      onOpen: vi.fn(),
    }));

    expect(markup).toContain('<span class="my-works-count">40 件</span>');
    expect(markup).toContain('<section class="author-profile-stats my-works-stats" aria-label="作品统计"><div><strong>40</strong><span>作品</span>');
    expect(markup).toContain('<button type="button" class="active">全部 <span>40</span></button>');
    expect(markup).not.toContain('my-works-count">1 件');
  });

  it('separates the folder heading from its independently scrolling chip rail', () => {
    const folders = Array.from({ length: 6 }, (_, index) => ({
      id: `folder-${index + 1}`,
      name: `文件夹 ${index + 1}`,
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    }));
    const markup = renderToStaticMarkup(createElement(MyWorksPage, {
      projects: [],
      onBack: vi.fn(),
      onOpen: vi.fn(),
      folders,
      activeFolderId: 'all',
      onFolderChange: vi.fn(),
      onCreateFolder: vi.fn(),
      onDeleteFolder: vi.fn(),
    }));
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const headerRule = styles.match(/\.my-works-folder-header\s*\{([^}]*)\}/)?.[1] ?? '';
    const scrollRule = styles.match(/\.my-works-folder-scroll\s*\{([^}]*)\}/)?.[1] ?? '';
    const createRule = styles.match(/\.my-works-folder-header \.my-works-create-folder\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(markup).toMatch(/class="my-works-folder-header"[\s\S]*文件夹[\s\S]*新建[\s\S]*<\/div><div class="my-works-folder-scroll">[\s\S]*文件夹 6/);
    expect(markup).toContain('<div class="my-works-folder-title"><strong>文件夹</strong><span>6</span></div>');
    expect(markup).not.toContain('>未分类<');
    expect(markup).not.toContain('删除文件夹 文件夹 1');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(headerRule).toContain('justify-content: space-between');
    expect(scrollRule).toContain('min-width: 0');
    expect(scrollRule).toContain('overflow-x: auto');
    expect(createRule).toContain('border: .0317rem solid rgba(20, 108, 255, .38)');
  });

  it('keeps folder, tag, and publishing controls on the editor compact scale', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const folderPicker = styles.match(/\.save-project-folder-picker select\s*\{([^}]*)\}/)?.[1] ?? '';
    const publishPanel = styles.match(/\.share-community-panel\s*\{([^}]*)\}/)?.[1] ?? '';
    const tagButton = styles.match(/\.community-tag-selector button, \.pattern-tag-filter button\s*\{([^}]*)\}/)?.[1] ?? '';
    const folderScroll = styles.match(/\.my-works-folder-scroll\s*\{([^}]*)\}/)?.[1] ?? '';
    const folderChip = styles.match(/\.my-works-folder-scroll > button\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(folderPicker).toContain('min-height: 1.65rem');
    expect(folderPicker).toContain('border-radius: .4444rem');
    expect(publishPanel).toContain('border-radius: .9524rem');
    expect(tagButton).toContain('min-height: 1.016rem');
    expect(tagButton).toContain('font-size: .381rem');
    expect(folderScroll).toContain('scroll-padding-inline: .6349rem');
    expect(folderChip).toContain('min-height: 1.2063rem');
    expect(folderChip).toContain('font-size: .4444rem');
  });

  it('keeps card actions inside the clicked-work dialog and restores the likes tab', () => {
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
      folders: [{ id: 'animals', name: '动物', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
      activeFolderId: 'all',
      onFolderChange: vi.fn(),
      onCreateFolder: vi.fn(),
      onDeleteFolder: vi.fn(),
    }));

    expect(markup).toContain('>作品</button>');
    expect(markup).toContain('>喜欢</button>');
    expect(markup).toContain('全部');
    expect(markup).toContain('动物');
    expect(markup).toContain('>新建</button>');
    expect(markup).toContain('aria-label="打开文件夹 动物 操作"');
    expect(markup).not.toContain('删除文件夹 动物');
    expect(markup).not.toContain('分享到社区');
    expect(markup).not.toContain('编辑标签');
    expect(markup).not.toContain('移动到：未分类');
    expect(markup).not.toContain('收藏');
  });

  it('opens deletion from a custom folder context menu instead of a persistent control', () => {
    const onDeleteFolder = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(MyWorksPage, {
        projects: [], onBack: vi.fn(), onOpen: vi.fn(),
        folders: [{ id: 'animals', name: '动物', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
        activeFolderId: 'all', onFolderChange: vi.fn(), onCreateFolder: vi.fn(), onDeleteFolder,
      }));
    });
    const chip = renderer.root.findByProps({ 'aria-label': '打开文件夹 动物 操作' });
    const preventDefault = vi.fn();

    act(() => chip.props.onContextMenu({ preventDefault }));

    expect(preventDefault).toHaveBeenCalledOnce();
    const deleteButton = renderer.root.findByProps({ 'aria-label': '删除文件夹 动物' });
    act(() => deleteButton.props.onClick());
    expect(onDeleteFolder).toHaveBeenCalledWith(expect.objectContaining({ id: 'animals' }));
    renderer.unmount();
  });

  it('keeps the folder menu open after the click synthesized by a touch long press', () => {
    vi.useFakeTimers();
    const onFolderChange = vi.fn();
    let renderer!: ReturnType<typeof create>;
    try {
      act(() => {
        renderer = create(createElement(MyWorksPage, {
          projects: [], onBack: vi.fn(), onOpen: vi.fn(),
          folders: [{ id: 'animals', name: '动物', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
          activeFolderId: 'all', onFolderChange, onCreateFolder: vi.fn(), onDeleteFolder: vi.fn(),
        }));
      });
      const chip = renderer.root.findByProps({ 'aria-label': '打开文件夹 动物 操作' });

      act(() => {
        chip.props.onPointerDown({ pointerType: 'touch' });
        vi.advanceTimersByTime(500);
        chip.props.onPointerUp();
        chip.props.onClick();
      });

      expect(renderer.root.findByProps({ 'aria-label': '删除文件夹 动物' })).toBeTruthy();
      expect(onFolderChange).not.toHaveBeenCalled();
    } finally {
      act(() => renderer?.unmount());
      vi.useRealTimers();
    }
  });

  it('opens folder actions from the keyboard and clears stale menus from header actions', () => {
    const onFolderChange = vi.fn();
    const onCreateFolder = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(createElement(MyWorksPage, {
        projects: [], onBack: vi.fn(), onOpen: vi.fn(),
        folders: [{ id: 'animals', name: '动物', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
        activeFolderId: 'all', onFolderChange, onCreateFolder, onDeleteFolder: vi.fn(),
      }));
    });
    const chip = renderer.root.findByProps({ 'aria-label': '打开文件夹 动物 操作' });
    const preventDefault = vi.fn();

    act(() => chip.props.onKeyDown({ key: 'Enter', preventDefault }));
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(renderer.root.findByProps({ 'aria-label': '删除文件夹 动物' })).toBeTruthy();
    expect(onFolderChange).not.toHaveBeenCalled();

    const allButton = renderer.root.findByProps({ className: 'my-works-folder-scroll' }).findAllByType('button')[0];
    act(() => allButton.props.onClick());
    expect(renderer.root.findAllByProps({ 'aria-label': '删除文件夹 动物' })).toHaveLength(0);

    act(() => chip.props.onContextMenu({ preventDefault: vi.fn() }));
    const createButton = renderer.root.findByProps({ className: 'my-works-create-folder' });
    act(() => createButton.props.onClick());
    expect(renderer.root.findAllByProps({ 'aria-label': '删除文件夹 动物' })).toHaveLength(0);
    expect(onCreateFolder).toHaveBeenCalledOnce();
    act(() => renderer.unmount());
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
      onLogin: vi.fn(), onOpenNotification: vi.fn(),
    }));

    expect(markup).toContain('晴 评论了你的作品');
    expect(markup).toContain('未读');
    expect(markup).toContain('aria-label="1 条未读"');
    expect(markup).toContain('消息');
  });
});

describe('PatternDetailPage comment anchors', () => {
  it('provides the comments anchor used by message notifications', () => {
    const markup = renderToStaticMarkup(createElement(PatternDetailPage, {
      pattern: {
        id: 'project-1', title: '评论定位', author: '作者', size: '1 × 1', meta: '刚刚',
        likes: '0', comments: '0', downloads: '0', tone: 'recent-flower', beads: [], image: '',
        likesCount: 0, commentsCount: 0, likedByMe: false,
      },
      onBack: vi.fn(), isLoggedIn: true, comments: [], isLoadingComments: false,
      onLoadComments: vi.fn(), onLike: vi.fn(), onComment: vi.fn(), onLogin: vi.fn(),
    }));

    expect(markup).toContain('id="comments"');
  });
});

describe('limitCommentContent', () => {
  it('counts emoji as Unicode characters instead of UTF-16 code units', () => {
    const content = '🙂'.repeat(300);
    expect(limitCommentContent(content)).toBe(content);
    expect(limitCommentContent(`${content}🙂`)).toBe(content);
  });
});
