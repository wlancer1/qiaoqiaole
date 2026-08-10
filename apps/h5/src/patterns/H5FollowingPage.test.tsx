import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FollowingPage } from './H5PatternPages';

describe('following list page', () => {
  it('renders followed users with the shared profile page language', () => {
    const markup = renderToStaticMarkup(createElement(FollowingPage, {
      users: [{ id: 'u-1', name: '小鹿', avatarUrl: null }],
      loading: false,
      error: '',
      onBack: vi.fn(),
      onRetry: vi.fn(),
    }));
    expect(markup).toContain('关注列表');
    expect(markup).toContain('小鹿');
    expect(markup).toContain('following-list-page');
  });

  it('renders a consistent empty state', () => {
    const markup = renderToStaticMarkup(createElement(FollowingPage, {
      users: [], loading: false, error: '', onBack: vi.fn(), onRetry: vi.fn(),
    }));
    expect(markup).toContain('还没有关注任何人');
  });
});
