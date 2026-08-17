import fs from 'node:fs';
import path from 'node:path';
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { HomeShellPage, PhoneLoginModal, ProfileEditModal, XhsImagePickerModal } from './HomeShellPage';
import { CommunityPatternCard } from '../../community/CommunityPatternCard';
import { ImageWithSkeleton } from '../../shared/ImageWithSkeleton';

const props = {
  phoneNumber: '', setPhoneNumber: vi.fn(), phonePassword: '1234567', setPhonePassword: vi.fn(), phoneConfirmPassword: '', setPhoneConfirmPassword: vi.fn(), phoneCode: '', setPhoneCode: vi.fn(), phoneAuthMode: 'login', setPhoneAuthMode: vi.fn(), phoneAgreement: true, setPhoneAgreement: vi.fn(), phoneAuthError: '', phoneSending: false, phoneVerifying: false, phoneCountdown: 0, sendPhoneCode: vi.fn(), submitPhoneLogin: vi.fn(), submitPhoneRegister: vi.fn(), closeLoginModal: vi.fn(), logoutPhone: vi.fn(), rememberPassword: true, setRememberPassword: vi.fn(),
};

function renderPhoneLoginModal(nextProps = props) {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PhoneLoginModal, nextProps)));
}

describe('phone login bug fixes', () => {
  it('shows the short-password error and keeps the primary button branded', () => {
    const markup = renderPhoneLoginModal();
    expect(markup).toContain('密码至少需要 8 位');
    expect(markup).toContain('phone-login-submit');
    expect(markup).toContain('home-create-submit');
  });

  it('shows the remember-password option only for phone login', () => {
    const loginMarkup = renderPhoneLoginModal();
    expect(loginMarkup).toContain('记住手机号和密码');

    const registerMarkup = renderPhoneLoginModal({ ...props, phoneAuthMode: 'register' });
    expect(registerMarkup).not.toContain('记住手机号和密码');
  });

  it('links the agreement copy to the legal pages without replacing the checkbox', () => {
    const markup = renderPhoneLoginModal();

    expect(markup).toContain('href="/user-agreement"');
    expect(markup).toContain('href="/privacy-policy"');
    expect(markup).toContain('《用户协议》');
    expect(markup).toContain('《隐私政策》');
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

  it('centers the nested loading wrapper and fallback icon in the profile avatar', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    expect(styles).toContain('.profile-avatar-content .image-with-skeleton');
    expect(styles).toContain('.profile-avatar-content .image-with-skeleton > svg');
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
  it('delegates local image loading to the application overlay instead of the upload dialog', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/pages/home/HomeShellPage.tsx'), 'utf8');
    const splitProvider = fs.readFileSync(path.resolve('apps/h5/src/features/split/SplitFeatureProvider.tsx'), 'utf8');

    expect(source).not.toContain('SplitCanvasLoading');
    expect(splitProvider).toContain("setOverlaySlot('loading'");
    expect(splitProvider).toContain('split-import-page-loading');
  });

  it('uses independent columns for the popular template masonry layout', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/pages/home/HomeShellPage.tsx'), 'utf8');
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');

    expect(source).toContain('home-template-masonry-column');
    expect(styles).toContain('.home-template-masonry-column');
  });

  it('does not retain the old colored recent-project artwork styles', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    expect(styles).not.toContain('.recent-flower .home-recent-thumb');
    expect(styles).not.toContain('.recent-bear .home-recent-thumb');
  });

  it('opens the supplied action sheet when a recent project card is selected', () => {
    const project = {
      id: 'recent-1',
      name: '最近的小熊',
      rows: 32,
      cols: 32,
      tone: 'recent-bear',
      thumbnailImage: '/api/projects/recent-1/thumbnail',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    const homeTemplateCard = {
      id: 'template-1',
      title: '热门图纸',
      author: '作者',
      authorId: 'author-1',
      authorAvatar: null,
      image: '/template.webp',
      detailImage: '/template.webp',
      tone: 'pattern-flower',
      tags: [],
      likes: '0',
      comments: '0',
      downloads: '0',
      size: '1×1',
      meta: '今天',
      beads: [],
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
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
      homeTemplateCards: [homeTemplateCard],
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
    expect(markup).toContain('src="/api/projects/recent-1/thumbnail"');
    expect(markup).toContain('loading="eager"');

    const recentThumbnail = collectElements(shell).find((element) => element.type === ImageWithSkeleton);
    expect(recentThumbnail?.props).toMatchObject({
      loading: 'eager',
      fetchPriority: 'high',
      loadTimeoutMs: 2_500,
      maxRetries: 0,
    });

    const popularCard = collectElements(shell).find((element) => element.type === CommunityPatternCard);
    expect(popularCard?.props).toMatchObject({
      pattern: homeTemplateCard,
      loading: 'lazy',
      fetchPriority: 'low',
      deferUntilVisible: true,
      loadTimeoutMs: 2_500,
      maxRetries: 0,
    });

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
  it('preserves structured API errors while deletion is delegated to the project action domain', () => {
    const application = fs.readFileSync(path.resolve('apps/h5/src/app/H5Application.tsx'), 'utf8');
    const actions = fs.readFileSync(path.resolve('apps/h5/src/features/projects/useProjectActions.ts'), 'utf8');

    expect(application).toContain('Object.assign(new Error(message), { status: response.status, code: payload.error || payload.code, body: payload })');
    expect(actions).toContain('requestConfirm({');
    expect(actions).toContain('onProjectDeleted?.(project.id);');
    expect(actions).toContain("setStatus(error instanceof Error ? error.message : '删除作品失败');");
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
    const xhsInput = collectElements(shell).find((element) => element.props['aria-label'] === '小红书链接');
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
