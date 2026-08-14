import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PageSkeleton, RouteLoadErrorBoundary, RouteLoadingFallback } from './H5LoadingStates';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function RejectedRoute(): ReactNode {
  throw new Error('chunk failed');
}

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

  it('offers one accessible page reload after a route chunk fails', async () => {
    const reload = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let renderer!: ReactTestRenderer;

    try {
      await act(async () => {
        renderer = create(
          <RouteLoadErrorBoundary resetKey="/broken" onReload={reload}>
            <RejectedRoute />
          </RouteLoadErrorBoundary>,
        );
      });

      const alert = renderer.root.findByProps({ role: 'alert' });
      expect(alert.props['aria-label']).toBe('页面加载失败');
      const button = renderer.root.findByType('button');
      expect(button.props['aria-label']).toBe('重新加载页面');

      act(() => button.props.onClick());

      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      if (renderer) act(() => renderer.unmount());
      consoleError.mockRestore();
    }
  });
});
