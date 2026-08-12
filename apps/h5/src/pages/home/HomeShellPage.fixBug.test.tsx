import fs from 'node:fs';
import path from 'node:path';
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HomeShellPage, PhoneLoginModal, ProfileEditModal, XhsImagePickerModal } from './HomeShellPage';

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

describe('profile editing', () => {
  it('renders the avatar and username editing controls', () => {
    const markup = renderToStaticMarkup(createElement(ProfileEditModal, {
      profileEditName: '测试用户',
      profileEditAvatar: 'data:image/png;base64,AA==',
      profileEditError: '',
      profileEditSaving: false,
      profileAvatarInputRef: { current: null },
      setProfileEditName: vi.fn(),
      chooseProfileAvatar: vi.fn(),
      saveProfile: vi.fn(),
      closeProfileEdit: vi.fn(),
    }));
    expect(markup).toContain('编辑资料');
    expect(markup).toContain('更换头像');
    expect(markup).toContain('用户名');
    expect(markup).toContain('测试用户');
  });
});

type TestElement = ReactElement<{
  children?: ReactNode;
  className?: string;
  role?: string;
  'aria-modal'?: string | boolean;
  onClick?: (event?: { stopPropagation: () => void }) => void;
  'aria-label'?: string;
  placeholder?: string;
}>;

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
    const openBlankCanvasCreation = vi.fn();
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
      showUploadModal: true,
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
      openBlankCanvasCreation,
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

    const blankCanvasOption = collectElements(shell).find((element) => element.props.className?.includes('blank-canvas-source-option'));
    expect(blankCanvasOption).toBeDefined();
    blankCanvasOption?.props.onClick?.();
    expect(openBlankCanvasCreation).toHaveBeenCalledTimes(1);
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

describe('Xiaohongshu link input guidance', () => {
  it('accepts links and share text without listing stale domains', () => {
    const shell = HomeShellPage({
      fileInputRef: { current: null },
      handleUpload: vi.fn(),
      status: '',
      activeTab: 'home',
      recentProjects: [],
      openUpload: vi.fn(),
      isLoggedIn: false,
      showLoginModal: false,
      showUploadModal: true,
      closeUploadModal: vi.fn(),
      showXhsInput: true,
      setShowXhsInput: vi.fn(),
      xhsLink: '',
      setXhsLink: vi.fn(),
      xhsExtractedImages: [],
      isExtractingXhs: false,
      chooseLocalDrawing: vi.fn(),
      extractXiaohongshuImage: vi.fn(),
      importXhsImage: vi.fn(),
      xhsPreviewSrc: vi.fn(),
      showCreateCanvasModal: false,
      openBlankCanvasCreation: vi.fn(),
      requireLogin: vi.fn(),
      homeTemplateCards: [],
      notifications: [],
      setActiveTab: vi.fn(),
    });
    const xhsInput = collectElements(shell).find((element) => element.type === 'input' && element.props['aria-label'] === '小红书链接');
    const markup = renderToStaticMarkup(shell);

    expect(xhsInput).toBeDefined();
    expect(xhsInput?.props.placeholder).toBe('粘贴小红书笔记链接或分享口令');
    expect(markup).not.toContain('粘贴 xiaohongshu.com 或 xhslink.com 链接');
  });
});

describe('Xiaohongshu image picker modal', () => {
  it('renders as a separate dialog and sends the selected image to the importer', () => {
    const image = { imageDataUrl: 'data:image/png;base64,AA==' };
    const onClose = vi.fn();
    const onImport = vi.fn();
    const modal = XhsImagePickerModal({
      images: [image],
      title: '小红书图纸',
      isImporting: false,
      onClose,
      onImport,
      xhsPreviewSrc: (value: typeof image) => value.imageDataUrl || '',
    });

    expect(modal.props.role).toBe('presentation');
    const content = collectElements(modal).find((element) => element.props.className === 'xhs-image-picker-modal-panel');
    expect(content?.props.role).toBe('dialog');
    expect(content?.props['aria-modal']).toBeTruthy();
    const imageButton = collectElements(modal).find((element) => element.props['aria-label'] === '选择第 1 张小红书图片');
    imageButton?.props.onClick?.();
    expect(onImport).toHaveBeenCalledWith(image);
  });

  it('keeps clicks inside the panel from closing the modal', () => {
    const event = { stopPropagation: vi.fn() };
    const modal = XhsImagePickerModal({
      images: [], title: '小红书图纸', isImporting: false, onClose: vi.fn(), onImport: vi.fn(), xhsPreviewSrc: vi.fn(),
    });
    const panel = collectElements(modal).find((element) => element.props.className === 'xhs-image-picker-modal-panel');
    panel?.props.onClick?.(event as never);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });
});
