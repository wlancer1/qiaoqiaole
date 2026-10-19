import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeShellPage } from './HomeShellPage';
import { CommunityPatternCard } from '../../community/CommunityPatternCard';
import type { PatternListCard } from '../../shared/h5Types';

const basePattern: PatternListCard = {
  id: 'popular-bead', title: '热门拼豆', author: '测试', size: '32 × 32', meta: '',
  likes: '0', comments: '0', downloads: '0', tone: 'recent', beads: [], image: '/bead.webp',
  likesCount: 0, commentsCount: 0, likedByMe: false,
};

describe('首页缩略图作品类型标签', () => {
  it('最近项目和热门图纸分别显示拼豆/拼布，缺失 kind 的旧项目仍显示拼豆', () => {
    const markup = renderToStaticMarkup(createElement(HomeShellPage, {
      activeTab: 'home', isLoggedIn: true, status: '', fileInputRef: { current: null },
      recentProjects: [
        { id: 'quilt', name: '拼布作品', kind: 'patchwork', rows: 400, cols: 400, tone: 'recent' },
        { id: 'bead', name: '拼豆作品', kind: 'bead', rows: 32, cols: 32, tone: 'recent' },
        { id: 'legacy', name: '旧项目', rows: 32, cols: 32, tone: 'recent' },
      ],
      homeTemplateCards: [basePattern, { ...basePattern, id: 'popular-quilt', kind: 'patchwork', title: '热门拼布', image: '/quilt.webp' }],
      notifications: [], onOpenRecentProject: vi.fn(), openCommunityPost: vi.fn(), setActiveTab: vi.fn(),
      openUpload: vi.fn(), openPatchwork: vi.fn(), openMyWorks: vi.fn(),
    }));
    const recentSection = markup.split('aria-label="最近项目列表"')[1].split('</section>')[0];
    const hotSection = markup.split('aria-label="热门图纸预览"')[1].split('</section>')[0];
    expect(recentSection.match(/my-work-kind-badge--bead/g)).toHaveLength(2);
    expect(recentSection.match(/my-work-kind-badge--patchwork/g)).toHaveLength(1);
    expect(hotSection.match(/my-work-kind-badge--bead/g)).toHaveLength(1);
    expect(hotSection.match(/my-work-kind-badge--patchwork/g)).toHaveLength(1);
    expect(markup).toContain('home-recent-thumb');
    expect(markup).toContain('pattern-art');
  });

  it('社区卡片仅在热门图纸入口展示缩略图类型标签', () => {
    const normal = renderToStaticMarkup(createElement(CommunityPatternCard, { pattern: basePattern, onOpen: vi.fn() }));
    const featured = renderToStaticMarkup(createElement(CommunityPatternCard, { pattern: { ...basePattern, kind: 'patchwork' }, showKindBadge: true, onOpen: vi.fn() }));
    expect(normal).not.toContain('my-work-kind-badge');
    expect(featured).toContain('my-work-kind-badge--patchwork');
    expect(featured).toContain('拼布');
  });
});
