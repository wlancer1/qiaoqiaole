import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeShellPage } from './HomeShellPage';

type ElementWithProps = ReactElement<{ children?: ReactNode; className?: string; onClick?: () => void; 'aria-label'?: string }>;

function collectElements(node: ReactNode): ElementWithProps[] {
  if (!isValidElement(node)) return [];
  const element = node as ElementWithProps;
  return [element, ...Children.toArray(element.props.children).flatMap(collectElements)];
}

function profileProps(overrides: Record<string, unknown> = {}) {
  return {
    activeTab: 'profile', isLoggedIn: true, loginName: '测试用户', recentProjects: [], followingCount: 3, followersCount: 5,
    mardColors: [], stockedColorCount: 0, totalWarehouseStock: 0, activeWarehouse: null,
    notifications: [], patternListCards: [], homeTemplateCards: [], communitySort: 'latest',
    openMyWorks: vi.fn(), openFollowing: vi.fn(), openFollowers: vi.fn(), setActiveTab: vi.fn(), openWarehouse: vi.fn(), setShowLoginModal: vi.fn(), requireLogin: vi.fn((next: (token: string) => void) => next('test-token')),
    openProfileEdit: vi.fn(), showProfileEditModal: false, profileAvatarUrl: '', showLoginModal: false,
    showLogoutConfirm: false, setShowLogoutConfirm: vi.fn(), requestConfirm: vi.fn(), logoutPhone: vi.fn(),
    ...overrides,
  } as Record<string, unknown>;
}

describe('my profile navigation', () => {
  it('opens the message list route without requiring login first', () => {
    const setActiveTab = vi.fn();
    const requireLogin = vi.fn();
    const tree = HomeShellPage(profileProps({ activeTab: 'home', isLoggedIn: false, setActiveTab, requireLogin }));
    const message = collectElements(tree).find((element) => element.props['aria-label'] === '消息');

    expect(message).toBeDefined();
    message?.props.onClick?.();

    expect(setActiveTab).toHaveBeenCalledWith('messages');
    expect(requireLogin).not.toHaveBeenCalled();
  });

  it('renders the refreshed received-like total instead of a fixed placeholder', () => {
    const markup = renderToStaticMarkup(createElement(HomeShellPage, profileProps({ receivedLikesCount: 12 })));

    expect(markup).toContain('>12</strong><span>获赞</span>');
  });

  it('opens my works when the works statistic is selected', () => {
    const openMyWorks = vi.fn();
    const tree = HomeShellPage(profileProps({ openMyWorks }));
    const works = collectElements(tree).find((element) => element.props['aria-label'] === '查看我的作品');
    expect(works).toBeDefined();
    works?.props.onClick?.();
    expect(openMyWorks).toHaveBeenCalledWith('profile');
  });

  it('opens the following list when the following statistic is selected', () => {
    const openFollowing = vi.fn();
    const tree = HomeShellPage(profileProps({ openFollowing }));
    const following = collectElements(tree).find((element) => element.props['aria-label'] === '查看关注列表');
    expect(following).toBeDefined();
    following?.props.onClick?.();
    expect(openFollowing).toHaveBeenCalledTimes(1);
  });

  it('opens the followers list when the followers statistic is selected', () => {
    const openFollowers = vi.fn();
    const tree = HomeShellPage(profileProps({ openFollowers }));
    const followers = collectElements(tree).find((element) => element.props['aria-label'] === '查看粉丝列表');
    expect(followers).toBeDefined();
    followers?.props.onClick?.();
    expect(openFollowers).toHaveBeenCalledTimes(1);
  });

  it('hides account statistics while logged out and keeps settings login-gated', () => {
    const requireLogin = vi.fn();
    const tree = HomeShellPage(profileProps({ isLoggedIn: false, requireLogin }));
    const elements = collectElements(tree);

    for (const label of ['查看我的作品', '查看关注列表', '查看获赞列表', '查看粉丝列表']) {
      expect(elements.find((element) => element.props['aria-label'] === label)).toBeUndefined();
    }

    const settings = elements.find((element) => element.props['aria-label'] === '打开设置');
    expect(settings).toBeDefined();
    settings?.props.onClick?.();
    expect(requireLogin).toHaveBeenCalledTimes(1);
  });
});
