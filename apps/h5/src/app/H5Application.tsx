import { type ReactNode, type SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  MARD_221_COLORS,
  type Cell,
} from '@qiaoqiaole/core';
import { createBlankCells } from '../canvas/H5CanvasPreview';
import {
  colorCodeOf,
  createBeadThumbnailCanvas,
  fileToDataUrl,
  normalizeGridSize,
  parseGridSizeInput,
} from '../utils/h5AppUtils';
import { normalizeProjectPayload, serializeProjectCells } from '../utils/projectPayload';
import { removeGridEdgeBackground } from '../utils/gridBackground';
import { resolveFolderId } from '../projects/projectFolders';
import { MyWorksPage } from '../patterns/H5PatternPages';
import { quickTools } from '../patterns/h5PatternData';
import { CommunityFeatureContent } from '../features/community/CommunityFeatureContent';
import { CommunityFeatureProvider, type CommunityFeatureCommands } from '../features/community/CommunityFeatureProvider';
import { CommunityHomeShellSlot } from '../features/community/CommunityHomeShellSlot';
import { SplitFeatureContent } from '../features/split/SplitFeatureContent';
import { SplitFeatureProvider, type SplitFeatureCommands } from '../features/split/SplitFeatureProvider';
import { EditorFeatureContent, type EditorFeatureCommands } from '../features/editor/EditorFeatureContent';
import { WarehouseFeatureContent, type WarehouseFeatureCommands } from '../features/warehouse/WarehouseFeatureContent';
import { BeadingFeatureContent, type BeadingFeatureCommands } from '../features/beading/BeadingFeatureContent';
import { PhoneLoginModal, ProfileEditModal } from '../pages/home/HomeShellPage';
import { refreshHomeData, shouldRefreshHomeData } from '../pages/home/homeRefresh';
import { appPathForScreen, routeStateForPath } from './h5Routes';
import { H5RoutedContent } from './H5RoutedContent';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { useScopedStatus } from '../store/ui/useScopedStatus';
import { selectAuthAvatarUrl, selectAuthDisplayName, selectAuthStats, selectAuthToken, selectIsAuthenticated } from '../store/auth/authSlice';
import { useAuthFeature } from '../features/auth/useAuthFeature';
import { useProjectActions } from '../features/projects/useProjectActions';
import { useProjectListDomain } from '../features/projects/useProjectListDomain';
import { useProjectListRoute } from '../features/projects/useProjectListRoute';
import { useProjectFolderController } from '../features/projects/useProjectFolderController';
import { useProjectActionOverlay } from '../features/projects/useProjectActionOverlay';
import { useProjectSaveOverlay } from '../features/projects/useProjectSaveOverlay';
import { useAppOverlay } from './overlays/AppOverlayContext';
import { projectsLoaded, selectProjectFolders, selectProjects, selectSortedProjects } from '../store/projects/projectSlice';
import { selectActiveWarehouseId, selectWarehouses, selectWarehouseInventory } from '../store/warehouses/warehouseSlice';
import type {
  AppScreen,
  HomeTab,
  RecentProject,
} from '../shared/h5Types';

const API_BASE = '/api';
const CAPTCHA_APP_ID = String((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_TENCENT_CAPTCHA_APP_ID || '');
type RequestApiError = Error & { status?: number; code?: string; body?: unknown };

function H5Application() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const { screen, activeTab } = routeStateForPath(location.pathname);
  const { openConfirm: requestConfirm, setOverlaySlot } = useAppOverlay();
  const status = '';
  const setStatus = useScopedStatus();
  const isLoggedIn = useAppSelector(selectIsAuthenticated);
  const loginName = useAppSelector(selectAuthDisplayName);
  const profileAvatarUrl = useAppSelector(selectAuthAvatarUrl);
  const { likesCount: receivedLikesCount, followingCount, followersCount } = useAppSelector(selectAuthStats);
  const authToken = useAppSelector(selectAuthToken);
  const authStatus = useAppSelector((state) => state.auth.status);
  const authSessionVersion = useAppSelector((state) => state.auth.sessionVersion);
  const requestApi = async <T,>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> => {
    const effectiveToken = token === null ? '' : token || authToken;
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(effectiveToken ? { authorization: `Bearer ${effectiveToken}` } : {}),
        ...(options.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 401 ? '登录状态已失效，请重新登录' : payload.message || '请求失败';
      const error = Object.assign(new Error(message), { status: response.status, code: payload.error || payload.code, body: payload }) as RequestApiError;
      throw error;
    }
    return payload as T;
  };
  const requestApiRef = useRef<(<T,>(path: string, options?: RequestInit, token?: string | null) => Promise<T>) | null>(null);
  const communityCommandsRef = useRef<CommunityFeatureCommands | null>(null);
  const refreshAfterLoginRef = useRef<(token: string) => Promise<unknown>>(async () => undefined);
  const authFeature = useAuthFeature({
    apiBase: API_BASE,
    captchaAppId: CAPTCHA_APP_ID,
    requestRef: requestApiRef,
    refreshAfterLoginRef,
    fileToDataUrl,
  });
  const { dialog: authDialog, profile: profileEditor, isLoginModalOpen, openLogin, requireLogin, logout: logoutAuthSession, openProfileEdit } = authFeature;
  const editorCommandsRef = useRef<EditorFeatureCommands | null>(null);
  const pendingEditorCanvasRef = useRef<{ rows: number; cols: number; cells: Cell[] } | null>(null);
  const recentProjects = useAppSelector(selectProjects);
  const projectFolders = useAppSelector(selectProjectFolders);
  const sortedRecentProjects = useAppSelector(selectSortedProjects);
  const warehouses = useAppSelector(selectWarehouses);
  const activeWarehouseId = useAppSelector(selectActiveWarehouseId);
  const beadStock = useAppSelector(selectWarehouseInventory);
  const setRecentProjects = useCallback((next: SetStateAction<RecentProject[]>) => {
    dispatch(projectsLoaded(typeof next === 'function' ? next(recentProjects) : next));
  }, [dispatch, recentProjects]);
  const projectListDomain = useProjectListDomain({ requestApi, setStatus });
  const projectActions = useProjectActions({
    requestApi,
    token: authToken,
    setStatus,
    onProjectSaved: (project) => {
      editorCommandsRef.current?.markSaved(project.id);
      setRecentProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
    },
    onProjectDeleted: (projectId) => {
      setRecentProjects((projects) => projects.filter((project) => project.id !== projectId));
    },
    requestConfirm,
  });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const beadingCommandsRef = useRef<BeadingFeatureCommands | null>(null);
  const splitCommandsRef = useRef<SplitFeatureCommands | null>(null);
  const myWorksBackTargetRef = useRef<'home' | 'profile'>('profile');
  const [showCreateCanvasModal, setShowCreateCanvasModal] = useState(false);
  const [cfgRows, setCfgRows] = useState<number | ''>(32);
  const [cfgCols, setCfgCols] = useState<number | ''>(32);
  const warehouseCommandsRef = useRef<WarehouseFeatureCommands | null>(null);
  const homeDataRefreshRef = useRef<{ lastRefreshedAt: number; token: string; pending: Promise<unknown> | null }>({
    lastRefreshedAt: 0,
    token: '',
    pending: null,
  });

  const setActiveTab = (tab: HomeTab) => {
    navigate(appPathForScreen('home', tab));
  };

  const setScreen = (nextScreen: AppScreen) => {
    if (nextScreen === 'warehouse-detail' && activeWarehouseId) {
      navigate(`/warehouses/${encodeURIComponent(activeWarehouseId)}`);
      return;
    }
    navigate(appPathForScreen(nextScreen, activeTab));
  };

  const hasBlockingModal = Boolean(
    profileEditor.isOpen
      || isLoginModalOpen
      || showLogoutConfirm
      || projectActions.shareProject,
  );

  useEffect(() => {
    document.body.classList.toggle('h5-modal-open', hasBlockingModal);
    return () => document.body.classList.remove('h5-modal-open');
  }, [hasBlockingModal]);

  useLayoutEffect(() => {
    const resetScrollPositions = () => {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      } catch {
        window.scrollTo(0, 0);
      }
      document.querySelectorAll<HTMLElement>('*').forEach((element) => {
        const style = window.getComputedStyle(element);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflow === 'auto' || style.overflow === 'scroll') && element.scrollTop > 0) {
          element.scrollTop = 0;
        }
      });
    };

    resetScrollPositions();
    const frame = window.requestAnimationFrame(resetScrollPositions);
    return () => window.cancelAnimationFrame(frame);
  }, [screen, activeTab]);

  const openMyWorks = (backTarget: 'home' | 'profile' = 'profile') => {
    myWorksBackTargetRef.current = backTarget;
    setScreen('my-works');
  };

  useEffect(() => {
    if (isLoginModalOpen) authDialog.restoreRememberedLogin();
  }, [isLoginModalOpen]);

  const activeWarehouse = warehouses.find((warehouse) => warehouse.id === activeWarehouseId) ?? null;
  const totalWarehouseStock = useMemo(() => Object.values(beadStock).reduce((sum, count) => sum + count, 0), [beadStock]);
  const stockedColorCount = useMemo(() => Object.values(beadStock).filter((count) => count > 0).length, [beadStock]);

  requestApiRef.current = requestApi;

  const loadRecentProjects = async (token: string, { preserveOnError = false, page = 1 } = {}) => {
    await projectListDomain.loadPage(token, { folderId: 'all', page }, { preserveOnError });
  };
  const projectListRoute = useProjectListRoute({
    token: authToken,
    enabled: screen === 'my-works',
    hasMore: projectListDomain.hasMore,
    loading: projectListDomain.loading,
    loadPage: projectListDomain.loadPage,
  });
  const {
    saveFolderId,
    setSaveFolderId,
    openCreate: openProjectFolderCreate,
    openMove: openProjectFolderMove,
    deleteFolder: deleteProjectFolder,
  } = useProjectFolderController({
    token: authToken,
    activeFolderId: projectListRoute.route.folderId,
    onActiveFolderChange: projectListRoute.selectFolder,
    requireLogin,
    setStatus,
  });

  const loadFollowingCount = async (token: string) => {
    try {
      const payload = await requestApi<{ likesCount?: number; followingCount?: number; followersCount?: number }>('/me', {}, token);
      dispatch({ type: 'auth/profileStatsUpdated', payload: { token, sessionVersion: authSessionVersion, changes: {
        likesCount: typeof payload.likesCount === 'number' ? payload.likesCount : 0,
        followingCount: typeof payload.followingCount === 'number' ? payload.followingCount : 0,
        followersCount: typeof payload.followersCount === 'number' ? payload.followersCount : 0,
      } } });
    } catch {
    }
  };

  const saveRecentProject = async (name: string, projectRows: number, projectCols: number, tone = 'recent-flower', images: { sourceImagePath?: string; thumbnailImagePath?: string } = {}, token = authToken) => {
    if (!token) return null;
    const projectPayload = normalizeProjectPayload(name, projectRows, projectCols);
    if (!projectPayload) {
      setStatus('作品名称或画布尺寸无效，请重新设置后再保存。');
      return null;
    }
    return projectActions.save({
      ...projectPayload,
      ...images,
      projectId: editorCommandsRef.current?.snapshot().activeProjectId || undefined,
      canvasData: serializeProjectCells(editorCommandsRef.current?.snapshot().cells ?? []),
      beadList: [],
      tone,
      folderId: resolveFolderId(saveFolderId, projectFolders),
    }, token);
  };

  const saveCurrentProject = (token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => saveCurrentProject(nextToken));
      return;
    }
    setSaveFolderId(resolveFolderId(null, projectFolders));
    projectSaveOverlay.open();
  };

  const openSavedProject = async (project: RecentProject, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => { void openSavedProject(project, nextToken); });
      return false;
    }
    navigate(`/projects/${encodeURIComponent(project.id)}/edit`);
    return true;
  };

  const persistCurrentProject = async ({ name, shareToCommunity, intent: { startBeading = false } }: { name: string; shareToCommunity: boolean; intent: { startBeading: boolean } }) => {
    if (!name) {
      setStatus('请输入设计稿名称。');
      return false;
    }
    try {
      const snapshot = editorCommandsRef.current?.snapshot();
      if (!snapshot) return false;
      const thumbnailDataUrl = createBeadThumbnailCanvas(snapshot.cells, snapshot.rows, snapshot.cols).toDataURL('image/webp', 0.82);
      const sourceImage = splitCommandsRef.current?.getSourceImage() ?? null;
      const imagePayload = await requestApi<{ sourceImagePath?: string; thumbnailImagePath?: string }>('/uploads/projects', {
        method: 'POST',
        body: JSON.stringify({
          images: [
            ...(sourceImage ? [{ kind: 'source', filename: sourceImage.name, dataUrl: sourceImage.dataUrl }] : []),
            { kind: 'thumbnail', filename: 'thumbnail.webp', dataUrl: thumbnailDataUrl },
          ],
        }),
      });
      const saved = await saveRecentProject(name, snapshot.rows, snapshot.cols, sourceImage ? 'recent-dog' : 'recent-flower', imagePayload);
      if (!saved) return false;
      if (shareToCommunity && !saved.sharedToCommunity) projectActions.openShare(saved);
      if (startBeading) await beadingCommandsRef.current?.start(saved.id);
      return true;
   } catch (error) {
     setStatus(error instanceof Error ? error.message : '作品保存失败，请稍后重试。');
      return false;
    }
  };

  const refreshCurrentHome = () => {
    const cache = homeDataRefreshRef.current;
    if (cache.pending && cache.token === authToken) return cache.pending;
    if (!shouldRefreshHomeData({
      lastRefreshedAt: cache.lastRefreshedAt,
      cachedToken: cache.token,
      token: authToken,
      now: Date.now(),
    })) return Promise.resolve();

    const token = authToken;
    const pending = refreshHomeData({
      token,
      loadCommunity: () => communityCommandsRef.current?.refreshDiscovery(token, true) ?? Promise.resolve(),
      loadRecentProjects: () => token ? loadRecentProjects(token, { preserveOnError: true }) : Promise.resolve(),
      loadNotifications: () => token ? communityCommandsRef.current?.refreshNotifications(token, true) ?? Promise.resolve() : Promise.resolve(),
      loadWarehouses: () => token ? warehouseCommandsRef.current?.refresh(token) ?? Promise.resolve() : Promise.resolve(),
      loadProfile: () => token ? loadFollowingCount(token) : Promise.resolve(),
    });
    homeDataRefreshRef.current = { ...cache, token, pending };
    void pending.then(() => {
      if (homeDataRefreshRef.current.pending === pending) {
        homeDataRefreshRef.current = { lastRefreshedAt: Date.now(), token, pending: null };
      }
    });
    return pending;
  };

  useEffect(() => {
    if (screen !== 'home' || activeTab !== 'home') return;
    void refreshCurrentHome();
  }, [screen, activeTab, authToken]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && screen === 'home' && activeTab === 'home') void refreshCurrentHome();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [screen, activeTab, authToken]);

  refreshAfterLoginRef.current = async (token) => {
    await Promise.allSettled([
      loadRecentProjects(token),
      communityCommandsRef.current?.refreshDiscovery(token) ?? Promise.resolve(),
      communityCommandsRef.current?.refreshNotifications(token) ?? Promise.resolve(),
      warehouseCommandsRef.current?.refresh(token) ?? Promise.resolve(),
    ]);
  };

  const logoutPhone = useCallback(async () => {
    logoutAuthSession();
    communityCommandsRef.current?.clearForLogout();
    setRecentProjects([]);
    warehouseCommandsRef.current?.clear();
    setShowLogoutConfirm(false);
  }, [logoutAuthSession, setRecentProjects]);

  const openWarehouse = () => {
    requireLogin(() => {
      navigate('/warehouses');
    });
  };

  const openCreateCanvasModal = () => setShowCreateCanvasModal(true);
  const openBlankCanvasCreation = () => openCreateCanvasModal();
  const createBlankCanvas = () => {
    const next = { rows: normalizeGridSize(cfgRows), cols: normalizeGridSize(cfgCols) };
    pendingEditorCanvasRef.current = { ...next, cells: createBlankCells(next.rows, next.cols) };
    editorCommandsRef.current?.replaceCanvas(pendingEditorCanvasRef.current);
    navigate('/canvas');
    setShowCreateCanvasModal(false);
  };

  // Deliberate split → editor hand-off.  The split feature owns image and
  // preview state; the shell only places the completed canvas in the editor.
  const importSplitToCanvas = ({ cells, rows, cols }: { cells: Cell[]; rows: number; cols: number }) => {
    pendingEditorCanvasRef.current = { cells, rows, cols };
    editorCommandsRef.current?.replaceCanvas(pendingEditorCanvasRef.current);
    navigate('/canvas');
  };


  const toggleCanvasBackground = async () => {
    const snapshot = editorCommandsRef.current?.snapshot();
    if (!snapshot || screen !== 'canvas') return;
    editorCommandsRef.current?.replaceCanvas({ ...snapshot, cells: removeGridEdgeBackground(snapshot.cells, snapshot.rows, snapshot.cols) });
  };

  const loginModalFallback = useMemo(() => isLoginModalOpen ? (
    <PhoneLoginModal
      phoneNumber={authDialog.phoneNumber} setPhoneNumber={authDialog.setPhoneNumber} phoneCode={authDialog.code} setPhoneCode={authDialog.setCode}
      phonePassword={authDialog.password} setPhonePassword={authDialog.setPassword}
      rememberPassword={authDialog.rememberPassword} setRememberPassword={authDialog.setRememberPassword}
      phoneConfirmPassword={authDialog.confirmPassword} setPhoneConfirmPassword={authDialog.setConfirmPassword}
      phoneAuthMode={authDialog.mode} setPhoneAuthMode={authDialog.setMode}
      phoneAgreement={authDialog.agreement} setPhoneAgreement={authDialog.setAgreement} phoneAuthError={authDialog.error}
      phoneSending={authDialog.sending} phoneVerifying={authDialog.verifying} phoneCountdown={authDialog.countdown}
      sendPhoneCode={authDialog.sendCode} submitPhoneLogin={authDialog.submitPhoneLogin} submitPhoneRegister={authDialog.submitPhoneRegister} closeLoginModal={authDialog.close}
      logoutPhone={logoutPhone}
      showLogoutConfirm={showLogoutConfirm} setShowLogoutConfirm={setShowLogoutConfirm}
    />
  ) : null, [
    authDialog.agreement,
    authDialog.code,
    authDialog.confirmPassword,
    authDialog.countdown,
    authDialog.error,
    authDialog.mode,
    authDialog.password,
    authDialog.phoneNumber,
    authDialog.rememberPassword,
    authDialog.sending,
    authDialog.verifying,
    authDialog.close,
    authDialog.sendCode,
    authDialog.setAgreement,
    authDialog.setCode,
    authDialog.setConfirmPassword,
    authDialog.setMode,
    authDialog.setPassword,
    authDialog.setPhoneNumber,
    authDialog.setRememberPassword,
    authDialog.submitPhoneLogin,
    authDialog.submitPhoneRegister,
    isLoginModalOpen,
    logoutPhone,
    showLogoutConfirm,
  ]);
  const projectSaveOverlay = useProjectSaveOverlay({
    token: authToken,
    initialName: () => '未命名作品',
    initialShared: () => false,
    folders: projectFolders,
    folderId: saveFolderId,
    onFolderChange: setSaveFolderId,
    onCreateFolder: () => openProjectFolderCreate('save'),
    requireLogin,
    persist: persistCurrentProject,
  });
  const projectActionOverlay = useProjectActionOverlay({
    actions: projectActions,
    hasSession: (project) => beadingCommandsRef.current?.hasSession(project.id) ?? false,
    onStart: (project) => { void beadingCommandsRef.current?.start(project.id); },
    onEdit: (project) => { void openSavedProject(project); },
    onMove: (project, afterOpen) => openProjectFolderMove(project, afterOpen),
    onShareCommitted: async () => { await (communityCommandsRef.current?.refreshDiscovery() ?? Promise.resolve()); },
  });
  const withAppOverlays = (content: ReactNode) => (
    <div className="h5-app-shell">
      <div className="h5-app-screen">{content}</div>
    </div>
  );
  const profileEditOverlay = useMemo(() => profileEditor.isOpen ? <ProfileEditModal
    profileEditName={profileEditor.name} setProfileEditName={profileEditor.setName}
    profileEditAvatar={profileEditor.avatar} profileEditError={profileEditor.error} profileEditSaving={profileEditor.saving}
    profileAvatarInputRef={profileEditor.avatarInputRef} chooseProfileAvatar={profileEditor.chooseAvatar}
    saveProfile={profileEditor.save} closeProfileEdit={profileEditor.close}
  /> : null, [
    profileEditor.avatar,
    profileEditor.avatarInputRef,
    profileEditor.chooseAvatar,
    profileEditor.close,
    profileEditor.error,
    profileEditor.isOpen,
    profileEditor.name,
    profileEditor.save,
    profileEditor.saving,
    profileEditor.setName,
  ]);
  useEffect(() => {
    setOverlaySlot('login', loginModalFallback);
    setOverlaySlot('profile', profileEditOverlay);
  }, [loginModalFallback, profileEditOverlay, setOverlaySlot]);

  const renderPage = (requestedScreen: AppScreen) => {
  if (['split', 'split-crop', 'split-preview'].includes(requestedScreen)) return withAppOverlays(<SplitFeatureContent />);

  if (requestedScreen === 'canvas') {
    return withAppOverlays(<EditorFeatureContent requestApi={requestApi} token={authToken} authStatus={authStatus} requireLogin={requireLogin} setStatus={setStatus} onCommands={(commands) => { editorCommandsRef.current = commands; const pending = pendingEditorCanvasRef.current; if (pending) { pendingEditorCanvasRef.current = null; commands.replaceCanvas(pending); } }} onImportFile={async (file) => { await splitCommandsRef.current?.upload(file); }} sourceImagePresent={Boolean(splitCommandsRef.current?.getSourceImage())} backgroundProcessing={splitCommandsRef.current?.isBackgroundProcessing() ?? false} onToggleBackground={toggleCanvasBackground} onSave={() => projectSaveOverlay.open()} onStartBeading={(projectId, nextToken) => { void beadingCommandsRef.current?.start(projectId, nextToken); }} />);
  }

  if (requestedScreen === 'beading') {
    return null;
  }

  if (requestedScreen === 'warehouse' || requestedScreen === 'warehouse-detail') {
    return null;
  }

  if (requestedScreen === 'my-works') {
    return withAppOverlays(
      <MyWorksPage
        projects={sortedRecentProjects}
          onBack={() => navigate(myWorksBackTargetRef.current === 'profile' ? '/profile' : '/')}
        onOpen={projectActionOverlay.open}
        folders={projectFolders}
        activeFolderId={projectListRoute.route.folderId}
        onFolderChange={projectListRoute.selectFolder}
        onCreateFolder={() => openProjectFolderCreate('my-works')}
        onDeleteFolder={deleteProjectFolder}
        hasMore={projectListDomain.hasMore}
        loadingMore={projectListDomain.loading}
        onLoadMore={projectListRoute.loadMore}
        page={projectListRoute.route.page}
        total={projectListDomain.total}
        onLoadPrevious={projectListRoute.loadPrevious}
        actionSheet={null}
      />,
    );
  }

  return withAppOverlays(<CommunityFeatureContent fallback={<CommunityHomeShellSlot
    status={status} activeTab={activeTab}
    recentProjects={sortedRecentProjects} onOpenRecentProject={projectActionOverlay.open} actionSheet={null}
    isLoggedIn={isLoggedIn}
    loginName={loginName} loginPassword="" setLoginPassword={() => undefined} submitLogin={() => undefined}
    isAuthenticating={false} isLoginModalOpen={false} openLogin={openLogin} closeLogin={authDialog.close}
    usedColors={[]} colorCodeOf={colorCodeOf} quickTools={quickTools}
    showCreateCanvasModal={showCreateCanvasModal} setShowCreateCanvasModal={setShowCreateCanvasModal} openCreateCanvasModal={openCreateCanvasModal}
    openBlankCanvasCreation={openBlankCanvasCreation}
    cfgCols={cfgCols} setCfgCols={setCfgCols} cfgRows={cfgRows} setCfgRows={setCfgRows}
    normalizeGridSize={normalizeGridSize} parseGridSizeInput={parseGridSizeInput} createBlankCanvas={createBlankCanvas} requireLogin={requireLogin}
    setStatus={setStatus} setScreen={setScreen}
    warehouses={warehouses} stockedColorCount={stockedColorCount} totalWarehouseStock={totalWarehouseStock}
    activeWarehouse={activeWarehouse} mardColors={MARD_221_COLORS} openWarehouse={openWarehouse}
    setActiveTab={setActiveTab}
    phoneNumber={authDialog.phoneNumber} setPhoneNumber={authDialog.setPhoneNumber} phoneCode={authDialog.code} setPhoneCode={authDialog.setCode}
    phonePassword={authDialog.password} setPhonePassword={authDialog.setPassword}
    rememberPassword={authDialog.rememberPassword} setRememberPassword={authDialog.setRememberPassword}
    phoneConfirmPassword={authDialog.confirmPassword} setPhoneConfirmPassword={authDialog.setConfirmPassword}
    phoneAuthMode={authDialog.mode} setPhoneAuthMode={authDialog.setMode}
    phoneAgreement={authDialog.agreement} setPhoneAgreement={authDialog.setAgreement} phoneAuthError={authDialog.error}
    phoneSending={authDialog.sending} phoneVerifying={authDialog.verifying} phoneCountdown={authDialog.countdown}
    sendPhoneCode={authDialog.sendCode} submitPhoneLogin={authDialog.submitPhoneLogin} submitPhoneRegister={authDialog.submitPhoneRegister} closeLoginModal={authDialog.close}
    logoutPhone={logoutPhone}
    confirmDialog={null}
    requestConfirm={requestConfirm}
    profileAvatarUrl={profileAvatarUrl} receivedLikesCount={receivedLikesCount} followingCount={followingCount} followersCount={followersCount} showProfileEditModal={false} openProfileEdit={openProfileEdit} openMyWorks={openMyWorks}
    profileEditModal={null}
    showLogoutConfirm={showLogoutConfirm} setShowLogoutConfirm={setShowLogoutConfirm}
  />}/>);
  };

  return <SplitFeatureProvider setStatus={setStatus} onImport={importSplitToCanvas} onCommands={(commands) => { splitCommandsRef.current = commands; }} requestApi={requestApi} isLoggedIn={isLoggedIn} token={authToken} requireLogin={requireLogin}>
  <CommunityFeatureProvider
    requestApi={requestApi}
    requireLogin={requireLogin}
    loadFollowingCount={loadFollowingCount}
    onCommands={(commands) => { communityCommandsRef.current = commands; }}
  >
    <WarehouseFeatureContent requireLogin={requireLogin} onCommands={(commands) => { warehouseCommandsRef.current = commands; }} />
    <BeadingFeatureContent requestApi={requestApi} requireLogin={requireLogin} onCommands={(commands) => { beadingCommandsRef.current = commands; }} />
    <H5RoutedContent renderPage={renderPage} authStatus={authStatus} />
  </CommunityFeatureProvider>
  </SplitFeatureProvider>;
}

export default H5Application;
