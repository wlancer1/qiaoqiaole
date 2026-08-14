import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PageLoadBoundary, PageSkeleton, RouteLoadingFallback } from './H5LoadingStates';

describe('H5 loading states', () => {
  it('renders a centered nine-pixel route status', () => {
    const markup = renderToStaticMarkup(createElement(RouteLoadingFallback));
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('正在准备页面');
    expect(markup.match(/class="route-loading-pixel"/g)).toHaveLength(9);
    expect(markup).toContain('route-loading-content');
  });

  it.each(['home', 'pattern-list', 'pattern-detail', 'profile-list', 'warehouse', 'editor'] as const)(
    'renders the %s skeleton with hidden decorative shapes',
    (kind) => {
      const markup = renderToStaticMarkup(createElement(PageSkeleton, { kind, label: '正在加载' }));
      expect(markup).toContain(`page-skeleton--${kind}`);
      expect(markup).toContain('role="status"');
      expect(markup).toContain('aria-hidden="true"');
    },
  );

  it('shows loading, error retry, and ready content exclusively', () => {
    const retry = vi.fn();
    const loading = renderToStaticMarkup(createElement(PageLoadBoundary, { loading: true, skeleton: 'editor', loadingLabel: '正在读取作品' }, '作品'));
    expect(loading).toContain('page-skeleton--editor');
    expect(loading).not.toContain('>作品<');

    const error = renderToStaticMarkup(createElement(PageLoadBoundary, { loading: false, error: '读取失败', skeleton: 'editor', loadingLabel: '正在读取作品', onRetry: retry }, '作品'));
    expect(error).toContain('读取失败');
    expect(error).toContain('重新加载');

    const ready = renderToStaticMarkup(createElement(PageLoadBoundary, { loading: false, skeleton: 'editor', loadingLabel: '正在读取作品' }, createElement('p', null, '作品')));
    expect(ready).toContain('page-content-enter');
    expect(ready).toContain('>作品<');
  });
});
