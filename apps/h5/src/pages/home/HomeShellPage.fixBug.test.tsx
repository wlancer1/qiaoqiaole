import fs from 'node:fs';
import path from 'node:path';
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeShellPage, PhoneLoginModal } from './HomeShellPage';

const props = {
  phoneNumber: '', setPhoneNumber: vi.fn(), phonePassword: '1234567', setPhonePassword: vi.fn(), phoneConfirmPassword: '', setPhoneConfirmPassword: vi.fn(), phoneCode: '', setPhoneCode: vi.fn(), phoneAuthMode: 'login', setPhoneAuthMode: vi.fn(), phoneAgreement: true, setPhoneAgreement: vi.fn(), phoneAuthError: '', phoneSending: false, phoneVerifying: false, phoneCountdown: 0, sendPhoneCode: vi.fn(), submitPhoneLogin: vi.fn(), submitPhoneRegister: vi.fn(), closeLoginModal: vi.fn(), logoutPhone: vi.fn(),
};

describe('phone login bug fixes', () => {
  it('shows the short-password error and keeps the primary button branded', () => {
    const markup = renderToStaticMarkup(createElement(PhoneLoginModal, props));
    expect(markup).toContain('密码至少需要 8 位');
    expect(markup).toContain('phone-login-submit');
    expect(markup).toContain('home-create-submit');
  });
});

type TestElement = ReactElement<{ children?: ReactNode; className?: string; onClick?: () => void }>;

function childElements(node: ReactNode): TestElement[] {
  return Children.toArray(node).filter(isValidElement) as TestElement[];
}

function collectElements(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  return [element, ...childElements(element.props.children).flatMap(collectElements)];
}

describe('home recent project actions', () => {
  it('opens the supplied action sheet when a recent project card is selected', () => {
    const project = {
      id: 'recent-1',
      name: '最近的小熊',
      rows: 32,
      cols: 32,
      tone: 'recent-bear',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const onOpenRecentProject = vi.fn();
    const actionSheet = createElement('div', { 'data-testid': 'recent-project-action-sheet' }, '作品操作');
    const shell = HomeShellPage({
      fileInputRef: { current: null },
      handleUpload: vi.fn(),
      status: '',
      activeTab: 'home',
      recentProjects: [project],
      onOpenRecentProject,
      openUpload: vi.fn(),
      isLoggedIn: true,
      loginName: '测试用户',
      setLoginName: vi.fn(),
      loginPassword: '',
      setLoginPassword: vi.fn(),
      submitLogin: vi.fn(),
      isAuthenticating: false,
      showLoginModal: false,
      setShowLoginModal: vi.fn(),
      showUploadModal: false,
      showBlankCanvasOption: false,
      closeUploadModal: vi.fn(),
      showXhsInput: false,
      setShowXhsInput: vi.fn(),
      xhsLink: '',
      setXhsLink: vi.fn(),
      xhsExtractedImages: [],
      isExtractingXhs: false,
      chooseLocalDrawing: vi.fn(),
      extractXiaohongshuImage: vi.fn(),
      importXhsImage: vi.fn(),
      xhsPreviewSrc: vi.fn(),
      usedColors: [],
      colorCodeOf: vi.fn(),
      quickTools: [],
      showCreateCanvasModal: false,
      setShowCreateCanvasModal: vi.fn(),
      openCreateCanvasModal: vi.fn(),
      openBlankCanvasCreation: vi.fn(),
      cfgCols: 32,
      setCfgCols: vi.fn(),
      cfgRows: 32,
      setCfgRows: vi.fn(),
      normalizeGridSize: vi.fn((size: number) => size),
      parseGridSizeInput: vi.fn((value: string) => Number(value)),
      createBlankCanvas: vi.fn(),
      requireLogin: vi.fn(),
      setStatus: vi.fn(),
      patternListCards: [],
      homeTemplateCards: [],
      setActivePattern: vi.fn(),
      setScreen: vi.fn(),
      warehouses: [],
      stockedColorCount: 0,
      totalWarehouseStock: 0,
      activeWarehouse: null,
      mardColors: [],
      openWarehouse: vi.fn(),
      setActiveTab: vi.fn(),
      communitySort: 'latest',
      setCommunitySort: vi.fn(),
      authRequestSeqRef: { current: 0 },
      pendingAuthActionRef: { current: null },
      setIsAuthenticating: vi.fn(),
      logoutPhone: vi.fn(),
      showLogoutConfirm: false,
      setShowLogoutConfirm: vi.fn(),
      notifications: [],
      loadNotifications: vi.fn(),
      openNotification: vi.fn(),
      actionSheet,
    });

    const markup = renderToStaticMarkup(shell);
    expect(markup).toContain('data-testid="recent-project-action-sheet"');

    const recentCard = collectElements(shell).find((element) => element.props.className?.includes('home-recent-card'));
    expect(recentCard).toBeDefined();
    recentCard?.props.onClick?.();
    expect(onOpenRecentProject).toHaveBeenCalledWith(project);
  });
});

describe('recent project stale action handling', () => {
  it('preserves API status and closes only for invalid or stale project deletion', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');

    expect(source).toContain('error.status = response.status;');
    expect(source).toContain('error.code = payload.error || payload.code;');
    expect(source).toContain("const invalidProjectError = requestError.status === 401 || requestError.status === 404 || requestError.code === 'NOT_FOUND';");
    expect(source).toContain('if (invalidProjectError) setProjectActionTarget((current) => current?.id === target.id ? null : current);');
    expect(source.match(/setProjectActionTarget\(\(current\) => current\?\.id === target\.id \? null : current\)/g) ?? []).toHaveLength(2);
  });
});
