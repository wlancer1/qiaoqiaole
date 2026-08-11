import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { FollowersPage, FollowingPage } from './H5PatternPages';

describe('following list page', () => {
  it('renders followed users with the shared profile page language', () => {
    const markup = renderToStaticMarkup(createElement(FollowingPage, {
      users: [{ id: 'u-1', name: '小鹿', avatarUrl: null }],
      loading: false,
      error: '',
      onBack: vi.fn(),
      onRetry: vi.fn(),
      onOpenUser: vi.fn(),
    }));
    expect(markup).toContain('关注列表');
    expect(markup).toContain('小鹿');
    expect(markup).toContain('following-list-page');
    expect(markup).toContain('查看小鹿的主页');
  });

  it('renders the followers list with the same interaction language', () => {
    const markup = renderToStaticMarkup(createElement(FollowersPage, {
      users: [{ id: 'u-2', name: '小鹿的粉丝', avatarUrl: null }],
      loading: false,
      error: '',
      onBack: vi.fn(),
      onRetry: vi.fn(),
      onOpenUser: vi.fn(),
    }));
    expect(markup).toContain('粉丝列表');
    expect(markup).toContain('小鹿的粉丝');
    expect(markup).toContain('粉丝');
  });

  it('renders a consistent empty state', () => {
    const markup = renderToStaticMarkup(createElement(FollowingPage, {
      users: [], loading: false, error: '', onBack: vi.fn(), onRetry: vi.fn(),
    }));
    expect(markup).toContain('还没有关注任何人');
  });

  it('resets the shared user item button to a neutral list row', () => {
    const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    const itemRule = styles.match(/\.following-user-row\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(itemRule).toContain('appearance: none');
    expect(itemRule).toContain('background: #fff');
    expect(itemRule).toContain('box-sizing: border-box');
    expect(itemRule).toContain('margin: 0');
  });
});
