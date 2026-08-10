import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
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
    activeTab: 'profile', isLoggedIn: true, loginName: '测试用户', recentProjects: [], followingCount: 3,
    mardColors: [], stockedColorCount: 0, totalWarehouseStock: 0, activeWarehouse: null,
    notifications: [], patternListCards: [], homeTemplateCards: [], communitySort: 'latest',
    setScreen: vi.fn(), setActiveTab: vi.fn(), openWarehouse: vi.fn(), setShowLoginModal: vi.fn(), requireLogin: vi.fn((next: (token: string) => void) => next('test-token')),
    openProfileEdit: vi.fn(), showProfileEditModal: false, profileAvatarUrl: '', showLoginModal: false,
    showLogoutConfirm: false, setShowLogoutConfirm: vi.fn(), requestConfirm: vi.fn(), logoutPhone: vi.fn(),
    ...overrides,
  } as Record<string, unknown>;
}

describe('my profile navigation', () => {
  it('opens my works when the works statistic is selected', () => {
    const setScreen = vi.fn();
    const tree = HomeShellPage(profileProps({ setScreen }));
    const works = collectElements(tree).find((element) => element.props['aria-label'] === '查看我的作品');
    expect(works).toBeDefined();
    works?.props.onClick?.();
    expect(setScreen).toHaveBeenCalledWith('my-works');
  });

  it('opens the following list when the following statistic is selected', () => {
    const setScreen = vi.fn();
    const tree = HomeShellPage(profileProps({ setScreen }));
    const following = collectElements(tree).find((element) => element.props['aria-label'] === '查看关注列表');
    expect(following).toBeDefined();
    following?.props.onClick?.();
    expect(setScreen).toHaveBeenCalledWith('following');
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
