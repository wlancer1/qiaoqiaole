import { type ReactNode, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Brush,
  Compass,
  Crop,
  Eraser,
  Eye,
  Folder,
  Grid2X2,
  Hand,
  Heart,
  House,
  Layers3,
  MessageCircle,
  PaintBucket,
  Pipette,
  Plus,
  Search,
  Settings,
  Share2,
  Shapes,
  Sparkles,
  Star,
  Upload,
  UserRound,
  CircleHelp,
  Download,
  FileDown,
  Redo2,
  SlidersHorizontal,
  Undo2,
  X,
} from 'lucide-react';
import { TransformWrapper, TransformComponent, useTransformEffect } from 'react-zoom-pan-pinch';
import {
  buildCellsFromSamples,
  buildModelParts,
  bucketFill,
  cropTransparentBounds,
  DEFAULT_SETTINGS,
  MARD_221_COLORS,
  MARD_221_HEX,
  SPLIT_DOMINANT_SAMPLE_GRID_SIZE,
  mergeSimilarCells,
  nearestPaletteColor,
  replaceCell,
  sampleDominantColor,
  serializeAsciiStl,
  type Cell,
} from '@qiaoqiaole/core';
import {
  FlowTopbar,
  getImportAction,
  HomeUploadHero,
  SegmentedControl,
  SplitCanvasLoading,
  SplitBeadList,
  ThresholdControl,
} from './flow/H5FlowComponents';
import { filterPaletteByQuery, filterPaletteByUsage } from './utils/palette';
import { H5CanvasLayers } from './canvas/H5CanvasLayers';
import {
  CanvasRulers,
  CanvasScaleObserver,
  GridAlignmentHandles,
  GridOverlay,
  SplitPreviewCanvas,
  cellsFromAlignedGrid,
  cellsFromAlignedGridAsync,
  cellsFromImageAsync,
  clampSplitImageScale,
  createBlankCells,
  fitSplitImageRect,
  getImageCrop,
  gridSizeFromAlignment,
  scaleRectFromCenter,
  touchDistance,
} from './canvas/H5CanvasPreview';
import { Icon } from './shared/h5Icons';
import { ConfirmDialog, type ConfirmDialogRequest } from './shared/ConfirmDialog';
import {
  colorCodeOf,
  colorCodeTextColor,
  createBeadPatternCanvas,
  createBeadThumbnailCanvas,
  downloadBlob,
  downloadText,
  extractUrlFromText,
  isSupportedXiaohongshuUrl,
  fileToDataUrl,
  imageDataToUrl,
  loadImageData,
  loadImageDataFromUrl,
  normalizeGridSize,
  parseGridSizeInput,
  resizeCells,
  safeImageFilename,
  sameCells,
  xhsPreviewSrc,
  yieldToBrowser,
} from './utils/h5AppUtils';
import { normalizeProjectPayload, parseProjectCells, serializeProjectCells } from './utils/projectPayload';
import { cropSize, getAutoCropBounds, splitCropRegion, splitPreviewBackTarget, type CropBounds } from './utils/splitCrop';
import { defaultSplitImageView } from './utils/splitImageView';
import { removeGridEdgeBackground } from './utils/gridBackground';
import { resolveFolderId, type ProjectFolder } from './projects/projectFolders';
import { CreateProjectFolderSheet, MoveProjectFolderSheet } from './projects/ProjectFolderSheets';
import { applyCreatedProjectFolder, applyMovedProjectFolder, beginProjectFolderMove, type ProjectFolderCreateOrigin } from './projects/projectFolderFlow';
import { consumeProjectFolderHistorySentinel, ensureProjectFolderHistorySentinel, resolveProjectFolderHistoryPop } from './projects/projectFolderHistory';
import { ShareCommunityDialog } from './community/ShareCommunityDialog';
import { AuthorProfilePage, FollowersPage, FollowingPage, MyWorksPage, PatternDetailPage, PatternDiscoverPage, PatternMessagesPage } from './patterns/H5PatternPages';
import { quickTools } from './patterns/h5PatternData';
import { insertCommentReply, removeCommentTree, sortCommunityPosts, toPatternListCard, type CommunityComment, type CommunityCommentsResponse, type CommunityNotification, type CommunityPost } from './community/communityData';
import { nextAuthorBackTarget, nextDetailBackTarget } from './community/communityNavigation';
import { WarehousePage } from './pages/warehouse/WarehousePage';
import { WarehouseListPage } from './pages/warehouse/WarehouseListPage';
import { SplitCropPage, SplitPreviewPage, SplitSettingsPage } from './pages/split/SplitPages';
import { CanvasPage } from './pages/editor/CanvasPage';
import { BeadingSessionPage } from './pages/beading/BeadingSessionPage';
import { InventoryCheckSheet } from './pages/beading/InventoryCheckSheet';
import { ProjectActionSheet } from './pages/beading/ProjectActionSheet';
import type { BeadingSession, InventoryCheck } from './beading/beadingSessionClient';
import type { Complete, Prepare, Resume, SessionMutation, SessionTransition } from './pages/beading/useBeadingSessionActions';
import { HomeShellPage, PhoneLoginModal, ProfileEditModal } from './pages/home/HomeShellPage';
import { refreshHomeData } from './pages/home/homeRefresh';
import {
  cloneImageData,
  DEFAULT_BACKGROUND_SENSITIVITY,
  deriveSplitImage,
} from './pages/split/splitImageProcessing';
import { prepareBackgroundRemoval } from '@qiaoqiaole/core';
import { defaultSplitGeometryFromCrop } from './pages/split/splitImageState';
import { resolveRestoredDisplayName } from './utils/authDisplayName';
import { createNonce, createRequestId, getPhoneDeviceId, normalizePhone, showTencentCaptcha, signWebSmsRequest } from './utils/phoneAuthClient';
import { passwordValidationMessage, validatePasswordLength } from './utils/passwordValidation';
import type {
  AlignedGrid,
  AuthorProfile,
  AppScreen,
  CanvasTool,
  GridHandle,
  GridHandlePosition,
  HomeTab,
  IconName,
  PaintStroke,
  PatternListCard,
  ReferenceImage,
  RecentProject,
  FollowingUser,
  SplitMode,
  SplitPreviewTab,
  UploadedSplitImage,
  Warehouse,
  WarehouseUnit,
  WorkMode,
  XhsExtractedImage,
} from './shared/h5Types';
import {
  DEFAULT_SPLIT_LONG_SIDE,
  MAX_SPLIT_LONG_SIDE,
  MIN_SPLIT_LONG_SIDE,
  clampSplitLongSide,
  gridSizeFromSplitBounds,
  maxSplitLongSideFromBounds,
} from './utils/splitConfig';

const MAX_IMAGE_SIDE = 4096;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_AUTO_GRID_SIDE = 120;
const EMPTY_COLOR = '#ffffff';
const WHITE_BEAD_COLOR = nearestPaletteColor(255, 255, 255, MARD_221_HEX);
const BEADS_PER_GRAM = 15;
const WAREHOUSE_LETTERS = ['全部', ...Array.from(new Set(MARD_221_COLORS.map((color) => color.code.charAt(0))))];
const API_BASE = '/api';
const CAPTCHA_APP_ID = String((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_TENCENT_CAPTCHA_APP_ID || '');
const AUTH_STORAGE_KEY = 'qiaoqiaole.auth';
const STATUS_VISIBLE_MS = 2800;
const STICKY_STATUS_PREFIXES = ['正在'];
type RequestApiError = Error & { status?: number; code?: string; body?: unknown };

const GRID_CONTROL_CELLS = 3;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isCompleteBeadingSession = (value: unknown): value is BeadingSession => {
  if (!isRecord(value) || !Array.isArray(value.requirements) || !Array.isArray(value.completedColorCodes) || !isRecord(value.progress)) return false;
  return typeof value.id === 'string'
    && (value.projectId === null || typeof value.projectId === 'string')
    && typeof value.projectName === 'string'
    && value.requirements.every((item) => isRecord(item) && typeof item.colorCode === 'string' && typeof item.required === 'number')
    && (value.warehouseId === null || typeof value.warehouseId === 'string')
    && (value.warehouseName === null || typeof value.warehouseName === 'string')
    && typeof value.status === 'string'
    && value.completedColorCodes.every((code) => typeof code === 'string')
    && typeof value.progress.completed === 'number'
    && typeof value.progress.total === 'number'
    && typeof value.progress.percent === 'number'
    && typeof value.elapsedSeconds === 'number'
    && (value.timerStartedAt === null || typeof value.timerStartedAt === 'string')
    && typeof value.inventoryDeducted === 'boolean'
    && Number.isInteger(value.version);
};

const beadingSessionFromError = (error: unknown, expectedSessionId: string): BeadingSession | null => {
  if (!isRecord(error)) return null;
  const session = isRecord(error.body) ? error.body.session : null;
  return isCompleteBeadingSession(session) && session.id === expectedSessionId ? session : null;
};

const canvasTools: Array<{ tool: CanvasTool; label: string; icon: IconName }> = [
  { tool: 'pan', label: '手抓移动工具', icon: 'hand' },
  { tool: 'brush', label: '画笔工具', icon: 'brush' },
  { tool: 'eraser', label: '橡皮工具', icon: 'eraser' },
  { tool: 'fill', label: '填充工具', icon: 'fill' },
  { tool: 'eyedropper', label: '取色工具', icon: 'eyedropper' },
];

function H5App() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [activeTab, setActiveTab] = useState<HomeTab>('home');
  const [activePattern, setActivePattern] = useState<PatternListCard | null>(null);
  const [authorProfile, setAuthorProfile] = useState<AuthorProfile | null>(null);
  const [authorProfilePosts, setAuthorProfilePosts] = useState<PatternListCard[]>([]);
  const [authorProfileError, setAuthorProfileError] = useState('');
  const [isAuthorProfileLoading, setIsAuthorProfileLoading] = useState(false);
  const authorProfileBackTargetRef = useRef<'discover' | 'detail' | 'following' | 'followers'>('discover');
  const [rows, setRows] = useState<number>(32);
  const [cols, setCols] = useState<number>(32);
  const [cells, setCells] = useState<Cell[]>(() => createBlankCells(32, 32));
  const [workMode, setWorkMode] = useState<WorkMode>('bead');
  const [selectedColor, setSelectedColor] = useState<string>(MARD_221_COLORS[0]?.hex ?? '#faf4c8');
  const [selectedCode, setSelectedCode] = useState<string>(MARD_221_COLORS[0]?.code ?? 'A1');
  const [tool, setTool] = useState<CanvasTool>('pan');
  const [status, setStatusState] = useState('');
  const statusScopeRef = useRef(`${screen}:${activeTab}`);
  const statusScope = `${screen}:${activeTab}`;
  const setStatus = (message: string) => {
    if (statusScopeRef.current !== statusScope) return;
    setStatusState(message);
  };
  const [history, setHistory] = useState<Cell[][]>([]);
  const [future, setFuture] = useState<Cell[][]>([]);
  const [showPaletteSearch, setShowPaletteSearch] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUserId, setAuthUserId] = useState('');
  const [legacyDraftOwnerId, setLegacyDraftOwnerId] = useState('');
  const [loginName, setLoginName] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const [receivedLikesCount, setReceivedLikesCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);
  const [followersUsers, setFollowersUsers] = useState<FollowingUser[]>([]);
  const [isFollowingLoading, setIsFollowingLoading] = useState(false);
  const [isFollowersLoading, setIsFollowersLoading] = useState(false);
  const [followingError, setFollowingError] = useState('');
  const [followersError, setFollowersError] = useState('');
  const [showProfileEditModal, setShowProfileEditModal] = useState(false);
  const [profileEditName, setProfileEditName] = useState('');
  const [profileEditAvatar, setProfileEditAvatar] = useState('');
  const [profileEditError, setProfileEditError] = useState('');
  const [profileEditSaving, setProfileEditSaving] = useState(false);
  const profileAvatarInputRef = useRef<HTMLInputElement>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phonePassword, setPhonePassword] = useState('');
  const [phoneConfirmPassword, setPhoneConfirmPassword] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneAuthMode, setPhoneAuthMode] = useState<'login' | 'register'>('login');
  const [phoneAgreement, setPhoneAgreement] = useState(false);
  const [phoneAuthError, setPhoneAuthError] = useState('');
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [phoneCountdown, setPhoneCountdown] = useState(0);
  const [phoneChallenge, setPhoneChallenge] = useState<{ challengeId: string; seed: string; serverTime: number } | null>(null);
  const [phoneSmsRequestId, setPhoneSmsRequestId] = useState('');
  const switchPhoneAuthMode = (mode: 'login' | 'register') => {
    setPhoneAuthMode(mode);
    setStatus('');
    setPhoneNumber('');
    setPhonePassword('');
    setPhoneConfirmPassword('');
    setPhoneCode('');
    setPhoneAuthError('');
    setPhoneCountdown(0);
    setPhoneChallenge(null);
    setPhoneSmsRequestId('');
  };
  const [authToken, setAuthToken] = useState('');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>([]);
  const [saveFolderId, setSaveFolderId] = useState<string | null>(null);
  const [activeProjectFolderId, setActiveProjectFolderId] = useState<string | null | 'all'>('all');
  const [showProjectFolderCreate, setShowProjectFolderCreate] = useState(false);
  const [projectFolderCreateOrigin, setProjectFolderCreateOrigin] = useState<ProjectFolderCreateOrigin>('my-works');
  const [projectFolderName, setProjectFolderName] = useState('');
  const [isCreatingProjectFolder, setIsCreatingProjectFolder] = useState(false);
  const [projectFolderCreateError, setProjectFolderCreateError] = useState('');
  const [projectFolderMoveTarget, setProjectFolderMoveTarget] = useState<RecentProject | null>(null);
  const [projectFolderMoveSelectedId, setProjectFolderMoveSelectedId] = useState<string | null>(null);
  const [isMovingProjectFolder, setIsMovingProjectFolder] = useState(false);
  const [projectFolderMoveError, setProjectFolderMoveError] = useState('');
  const projectFolderCreateReturnFocusRef = useRef<HTMLElement | null>(null);
  const projectFolderMoveReturnFocusRef = useRef<HTMLElement | null>(null);
  const projectActionReturnFocusRef = useRef<HTMLElement | null>(null);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([]);
  const [communityComments, setCommunityComments] = useState<CommunityCommentsResponse['comments']>([]);
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [isCommunityLoading, setIsCommunityLoading] = useState(false);
  const [isCommunityCommentsLoading, setIsCommunityCommentsLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentReplyPendingId, setCommentReplyPendingId] = useState('');
  const [commentDeletePendingId, setCommentDeletePendingId] = useState('');
  const [communitySort, setCommunitySort] = useState<'hot' | 'latest'>('hot');
  const [communityQuery, setCommunityQuery] = useState('');
  const [debouncedCommunityQuery, setDebouncedCommunityQuery] = useState('');
  const [communitySelectedTags, setCommunitySelectedTags] = useState<string[]>([]);
  const [communityAvailableTags, setCommunityAvailableTags] = useState<string[]>([]);
  const sortedRecentProjects = useMemo(
    () => [...recentProjects].sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)),
    [recentProjects],
  );
  const activeSavedProject = useMemo(
    () => recentProjects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, recentProjects],
  );
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSaveProjectModal, setShowSaveProjectModal] = useState(false);
  const [showSaveLoginPrompt, setShowSaveLoginPrompt] = useState(false);
  const [shareToCommunity, setShareToCommunity] = useState(false);
  const [shareDialogProject, setShareDialogProject] = useState<RecentProject | null>(null);
  const [shareDialogTags, setShareDialogTags] = useState<string[]>([]);
  const [sharingProjectId, setSharingProjectId] = useState('');
  const [shareFailedProjectIds, setShareFailedProjectIds] = useState<Set<string>>(() => new Set());
  const [copyingPatternId, setCopyingPatternId] = useState('');
  const [showBeadList, setShowBeadList] = useState(false);
  const [beadingSession, setBeadingSession] = useState<BeadingSession | null>(null);
  const [beadingInventoryCheck, setBeadingInventoryCheck] = useState<InventoryCheck | null>(null);
  const [projectActionTarget, setProjectActionTarget] = useState<RecentProject | null>(null);
  const [confirmDialogRequest, setConfirmDialogRequest] = useState<ConfirmDialogRequest | null>(null);
  const requestConfirm = (request: ConfirmDialogRequest) => setConfirmDialogRequest(request);
  const myWorksBackTargetRef = useRef<'home' | 'profile'>('profile');
  const patternDetailBackTargetRef = useRef<'home' | 'author-profile'>('home');
  const authorProfileReturnPatternRef = useRef<PatternListCard | null>(null);
  const closeConfirmDialog = () => setConfirmDialogRequest(null);
  const confirmDialog = confirmDialogRequest ? <ConfirmDialog
    {...confirmDialogRequest}
    onCancel={closeConfirmDialog}
    onConfirm={() => {
      const action = confirmDialogRequest.onConfirm;
      closeConfirmDialog();
      return action();
    }}
  /> : null;
  const [saveProjectName, setSaveProjectName] = useState('未命名作品');
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [activeWarehouseId, setActiveWarehouseId] = useState('');
  const [showWarehouseCreateModal, setShowWarehouseCreateModal] = useState(false);
  const [warehouseName, setWarehouseName] = useState('默认豆子仓库');
  const [warehouseRemark, setWarehouseRemark] = useState('');
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [warehouseLetter, setWarehouseLetter] = useState('全部');
  const [selectedWarehouseCodes, setSelectedWarehouseCodes] = useState<string[]>([]);
  const [warehouseUnit, setWarehouseUnit] = useState<WarehouseUnit>('count');
  const [warehouseAmount, setWarehouseAmount] = useState('100');
  const [beadStock, setBeadStock] = useState<Record<string, number>>({});
  const [uploadedSplitImage, setUploadedSplitImage] = useState<UploadedSplitImage | null>(null);
  const [uploadedSourceImageDataUrl, setUploadedSourceImageDataUrl] = useState('');
  const [isBackgroundProcessing, setIsBackgroundProcessing] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>('quick');
  const [splitLongSide, setSplitLongSide] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [splitRows, setSplitRows] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [splitCols, setSplitCols] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [splitMergeThreshold, setSplitMergeThreshold] = useState(0);
  const [splitPreviewTab, setSplitPreviewTab] = useState<SplitPreviewTab>('settings');
  const [isSplitCropStep, setIsSplitCropStep] = useState(false);
  const [isSplitCropped, setIsSplitCropped] = useState(false);
  const [splitCropBounds, setSplitCropBounds] = useState<CropBounds>({ top: 0, right: 1, bottom: 1, left: 0 });
  const deferredSplitMergeThreshold = useDeferredValue(splitMergeThreshold);
  const [splitPreviewRawCells, setSplitPreviewRawCells] = useState<Cell[]>([]);
  const [splitPreviewCells, setSplitPreviewCells] = useState<Cell[]>([]);
  const [splitPreviewLoading, setSplitPreviewLoading] = useState(false);
  const [splitLoadingStage, setSplitLoadingStage] = useState('正在分析图片...');
  const [splitLoadingProgress, setSplitLoadingProgress] = useState(15);
  const [alignCellSize, setAlignCellSize] = useState(1);
  const [alignOffsetX, setAlignOffsetX] = useState(0);
  const [alignOffsetY, setAlignOffsetY] = useState(0);
  const [lockedAlignedGrid, setLockedAlignedGrid] = useState<AlignedGrid | null>(null);
  const [gridFrameOrigin, setGridFrameOrigin] = useState<GridHandlePosition>({ x: 40, y: 40 });
  const [splitImageScale, setSplitImageScale] = useState(1);
  const [splitImageOffset, setSplitImageOffset] = useState({ x: 0, y: 0 });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showXhsImagePicker, setShowXhsImagePicker] = useState(false);
  const [isImportingXhsImage, setIsImportingXhsImage] = useState(false);
  const [showXhsInput, setShowXhsInput] = useState(false);
  const [xhsLink, setXhsLink] = useState('');
  const [isExtractingXhs, setIsExtractingXhs] = useState(false);
  const [xhsExtractedTitle, setXhsExtractedTitle] = useState('');
  const [xhsExtractedImages, setXhsExtractedImages] = useState<XhsExtractedImage[]>([]);
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null);
  const [isReferenceMinimized, setIsReferenceMinimized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const pendingAuthActionRef = useRef<((token: string) => void) | null>(null);
  const xhsRequestSeqRef = useRef(0);
  const xhsImportSeqRef = useRef(0);
  const canvasBackgroundJobRef = useRef(0);
  const authRequestSeqRef = useRef(0);
  const activeWarehouseIdRef = useRef('');
  const communityPostsRequestSeqRef = useRef(0);
  const communityCommentsRequestSeqRef = useRef(0);
  const notificationsRequestSeqRef = useRef(0);
  const warehousesRequestSeqRef = useRef(0);
  const inventoryRequestSeqRef = useRef(0);
  const recentProjectsRequestSeqRef = useRef(0);
  const authorProfileRequestSeqRef = useRef(0);
  const saveProjectInFlightRef = useRef(false);
  const cellsRef = useRef(cells);
  const canvasArtboardRef = useRef<HTMLDivElement | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const paintStrokeRef = useRef<PaintStroke>({
    active: false,
    tool: 'brush',
    baseCells: [],
    draftCells: [],
    changedCount: 0,
    pointerId: null,
    lastCell: null,
    initialPainted: true,
  });
  const canvasTouchPointersRef = useRef<Set<number>>(new Set());

  // Zoom & Pan states for mobile artboard
  const [zoom, setZoom] = useState(1.0);
  const [canvasScale, setCanvasScale] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const keyboardCellRef = useRef({ x: 0, y: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateCanvasModal, setShowCreateCanvasModal] = useState(false);

  // Config fields inside modal
  const [cfgRows, setCfgRows] = useState<number | ''>(32);
  const [cfgCols, setCfgCols] = useState<number | ''>(32);

  const gestureRef = useRef({
    isPointerDown: false,
    lastX: 0,
    lastY: 0,
    initialDistance: 0,
    initialZoom: 1.0,
    initialPanX: 0,
    initialPanY: 0,
    isPinching: false,
    moved: false,
  });
  const splitImagePinchRef = useRef({
    active: false,
    startDistance: 0,
    startScale: 1,
  });
  const splitImageOffsetRef = useRef({ x: 0, y: 0 });
  const splitImagePanRef = useRef({
    active: false,
    pointerId: null as number | null,
    lastX: 0,
    lastY: 0,
  });
  const suppressSplitImageClickRef = useRef(false);
  const splitGridHandleDragRef = useRef<{
    handle: GridHandle | null;
    lastX: number;
    lastY: number;
  }>({
    handle: null,
    lastX: 0,
    lastY: 0,
  });
  const splitLiveLongSideRef = useRef(DEFAULT_SPLIT_LONG_SIDE);
  const splitLiveAlignCellSizeRef = useRef(1);
  const splitLiveAlignOffsetRef = useRef({ x: 0, y: 0 });
  const splitLiveGridFrameOriginRef = useRef<GridHandlePosition>({ x: 40, y: 40 });
  const splitAlignFrameRef = useRef(0);
  const splitPreviewJobRef = useRef(0);
  const splitScreenRef = useRef<AppScreen>(screen);
  const uploadedSplitImageRef = useRef<UploadedSplitImage | null>(null);
  const splitBackgroundSensitivityFrameRef = useRef(0);
  const queuedBackgroundSensitivityRef = useRef(DEFAULT_BACKGROUND_SENSITIVITY);

  const isCurrentSplitBackgroundJob = (
    jobId: number,
    sourceImage: UploadedSplitImage,
    expectedScreen: AppScreen,
  ) => (
    splitPreviewJobRef.current === jobId
    && splitScreenRef.current === expectedScreen
    && ['split', 'split-crop', 'split-preview'].includes(splitScreenRef.current)
    && uploadedSplitImageRef.current?.originalImageData === sourceImage.originalImageData
  );

  useLayoutEffect(() => {
    splitScreenRef.current = screen;
    if (!['split', 'split-crop', 'split-preview'].includes(screen)) {
      splitPreviewJobRef.current += 1;
      setIsBackgroundProcessing(false);
    }
  }, [screen]);

  useEffect(() => {
    uploadedSplitImageRef.current = uploadedSplitImage;
  }, [uploadedSplitImage]);

  useEffect(() => () => {
    if (splitBackgroundSensitivityFrameRef.current) {
      cancelAnimationFrame(splitBackgroundSensitivityFrameRef.current);
    }
  }, []);

  const hasBlockingModal = Boolean(
    confirmDialogRequest
      || showProfileEditModal
      || showLoginModal
      || showSaveLoginPrompt
      || showSaveProjectModal
      || showUploadModal
      || showXhsImagePicker
      || showCreateCanvasModal
      || showProjectFolderCreate
      || projectFolderMoveTarget
      || showLogoutConfirm
      || shareDialogProject
      || projectActionTarget
      || showPaletteSearch,
  );

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  useEffect(() => {
    document.body.classList.toggle('h5-modal-open', hasBlockingModal);
    return () => document.body.classList.remove('h5-modal-open');
  }, [hasBlockingModal]);

  useEffect(() => {
    if (!showXhsImagePicker) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isImportingXhsImage) setShowXhsImagePicker(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImportingXhsImage, showXhsImagePicker]);

  const folderSheetOpen = showProjectFolderCreate || Boolean(projectFolderMoveTarget);
  const ignoreProjectFolderHistoryPopRef = useRef(false);
  useEffect(() => {
    if (folderSheetOpen) ensureProjectFolderHistorySentinel(window.history, window.location.href);
    else if (consumeProjectFolderHistorySentinel(window.history)) ignoreProjectFolderHistoryPopRef.current = true;
  }, [folderSheetOpen]);

  useEffect(() => {
    const closeTopProjectFolderLayer = () => {
      if (ignoreProjectFolderHistoryPopRef.current) {
        ignoreProjectFolderHistoryPopRef.current = false;
        return;
      }
      const resolution = resolveProjectFolderHistoryPop({ createOpen: showProjectFolderCreate, createPending: isCreatingProjectFolder, moveOpen: Boolean(projectFolderMoveTarget), movePending: isMovingProjectFolder });
      if (resolution.retainSentinel) ensureProjectFolderHistorySentinel(window.history, window.location.href);
      if (resolution.close === 'create') { setShowProjectFolderCreate(false); setProjectFolderCreateError(''); }
      if (resolution.close === 'move') setProjectFolderMoveTarget(null);
    };
    window.addEventListener('popstate', closeTopProjectFolderLayer);
    return () => window.removeEventListener('popstate', closeTopProjectFolderLayer);
  }, [isCreatingProjectFolder, isMovingProjectFolder, projectFolderMoveTarget, showProjectFolderCreate]);

  useEffect(() => {
    activeWarehouseIdRef.current = activeWarehouseId;
  }, [activeWarehouseId]);

  useEffect(() => {
    if (screen !== 'pattern-detail' && screen !== 'author-profile') patternDetailBackTargetRef.current = nextDetailBackTarget(screen);
  }, [screen]);

  useLayoutEffect(() => {
    statusScopeRef.current = statusScope;
    setStatusState('');
  }, [statusScope]);

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
    splitLiveLongSideRef.current = splitLongSide;
  }, [splitLongSide]);

  useEffect(() => {
    splitLiveAlignCellSizeRef.current = alignCellSize;
  }, [alignCellSize]);

  useEffect(() => {
    splitLiveAlignOffsetRef.current = { x: alignOffsetX, y: alignOffsetY };
  }, [alignOffsetX, alignOffsetY]);

  useEffect(() => {
    splitLiveGridFrameOriginRef.current = gridFrameOrigin;
  }, [gridFrameOrigin]);

  useEffect(() => () => {
    if (splitAlignFrameRef.current) cancelAnimationFrame(splitAlignFrameRef.current);
  }, []);

  useEffect(() => () => {
    if (referenceImage?.url) URL.revokeObjectURL(referenceImage.url);
  }, [referenceImage]);

  useEffect(() => {
    if (!status) return;
    if (STICKY_STATUS_PREFIXES.some((prefix) => status.startsWith(prefix))) return;
    const timer = window.setTimeout(() => setStatus(''), STATUS_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (phoneCountdown <= 0) return undefined;
    const timer = window.setInterval(() => setPhoneCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [phoneCountdown]);

  useEffect(() => {
    let cancelled = false;
    const restoreSession = async () => {
      let stored: { token?: string; username?: string; userId?: string } | null = null;
      try {
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        stored = raw ? JSON.parse(raw) as { token?: string; username?: string; userId?: string } : null;
      } catch {
        stored = null;
      }
      if (!stored?.token) return;

      try {
        const response = await fetch(`${API_BASE}/me`, {
          headers: { authorization: `Bearer ${stored.token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || '登录状态已失效');
        if (cancelled) return;
        if (!payload.user || typeof payload.user !== 'object') throw new Error('登录状态响应无效');
        setAuthToken(stored.token);
        setAuthUserId(payload.user.id || stored.userId || '');
        setLegacyDraftOwnerId((stored.username || '').trim());
        setLoginName(resolveRestoredDisplayName(payload.user, stored.username));
        setProfileAvatarUrl(String(payload.user.avatarUrl || ''));
        setReceivedLikesCount(Number(payload.likesCount || 0));
        setFollowingCount(Number(payload.followingCount || 0));
        setFollowersCount(Number(payload.followersCount || 0));
        setIsLoggedIn(true);
        await loadRecentProjects(stored.token);
        await loadCommunityPosts('hot', stored.token);
        await loadNotifications(stored.token);
        await loadWarehouses(stored.token);
      } catch {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const openProfileEdit = () => {
    setProfileEditName(loginName);
    setProfileEditAvatar(profileAvatarUrl);
    setProfileEditError('');
    setShowProfileEditModal(true);
  };

  const closeProfileEdit = () => {
    if (profileEditSaving) return;
    setShowProfileEditModal(false);
    setProfileEditError('');
  };

  const chooseProfileAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setProfileEditError('头像仅支持 PNG、JPG 或 WebP 图片');
      if (profileAvatarInputRef.current) profileAvatarInputRef.current.value = '';
      return;
    }
    if (file.size > 1024 * 1024) {
      setProfileEditError('头像不能超过 1MB');
      if (profileAvatarInputRef.current) profileAvatarInputRef.current.value = '';
      return;
    }
    try {
      setProfileEditAvatar(await fileToDataUrl(file));
      setProfileEditError('');
    } catch {
      setProfileEditError('头像读取失败，请换一张图片');
    } finally {
      if (profileAvatarInputRef.current) profileAvatarInputRef.current.value = '';
    }
  };

  const saveProfile = async () => {
    const nickname = profileEditName.trim();
    if (!nickname) {
      setProfileEditError('请输入用户名');
      return;
    }
    setProfileEditSaving(true);
    setProfileEditError('');
    try {
      const payload = await requestApi<{ user: { nickname: string; avatarUrl?: string | null } }>('/profile', {
        method: 'PATCH',
        body: JSON.stringify({ nickname, avatarUrl: profileEditAvatar || null }),
      });
      setLoginName(payload.user.nickname);
      setProfileAvatarUrl(payload.user.avatarUrl || '');
      setShowProfileEditModal(false);
    } catch (error) {
      setProfileEditError(error instanceof Error ? error.message : '资料保存失败');
    } finally {
      setProfileEditSaving(false);
    }
  };

  const totalBeads = useMemo(() => cells.filter((cell) => !cell.transparent).length, [cells]);
  const usedColors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cell of cells) {
      if (!cell.transparent) counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [cells]);
  const beadListColors = useMemo(
    () => usedColors.map(([color, count]) => ({ color, count, code: colorCodeOf(color) })),
    [usedColors],
  );
  const alignedGrid = useMemo(() => (
    uploadedSplitImage
      ? gridSizeFromAlignment(uploadedSplitImage.crop, alignCellSize, alignOffsetX, alignOffsetY)
      : { rows: splitRows, cols: splitCols, offsetX: 0, offsetY: 0, cellSize: 1, cropWidth: 1, cropHeight: 1 }
  ), [alignCellSize, alignOffsetX, alignOffsetY, splitCols, splitRows, uploadedSplitImage]);
  const flowAlignedGrid = splitMode === 'align'
    && ['split-crop', 'split-preview'].includes(screen)
    && lockedAlignedGrid
    ? lockedAlignedGrid
    : alignedGrid;
  const activeSplitRows = splitMode === 'align' ? flowAlignedGrid.rows : splitRows;
  const activeSplitCols = splitMode === 'align' ? flowAlignedGrid.cols : splitCols;
  const maxQuickSplitLongSide = uploadedSplitImage
    ? maxSplitLongSideFromBounds(uploadedSplitImage.crop.width, uploadedSplitImage.crop.height)
    : MAX_SPLIT_LONG_SIDE;
  const splitColorList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cell of splitPreviewCells) {
      if (cell.transparent) continue;
      counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([color, count]) => ({ color, count, code: colorCodeOf(color) }));
  }, [splitPreviewCells]);

  const previewSplitSize = useMemo(
    () => isSplitCropped ? cropSize(splitCropBounds) : { cols: activeSplitCols, rows: activeSplitRows },
    [activeSplitCols, activeSplitRows, isSplitCropped, splitCropBounds],
  );

  useEffect(() => {
    if (screen !== 'split-preview' || !isSplitCropped || !uploadedSplitImage) return;
    const jobId = splitPreviewJobRef.current + 1;
    splitPreviewJobRef.current = jobId;
    let cancelled = false;
    setSplitPreviewRawCells([]);
    setSplitPreviewCells([]);
    setSplitPreviewLoading(true);
    setSplitLoadingStage('正在分析图片...');
    setSplitLoadingProgress(15);

    const run = async () => {
      await yieldToBrowser(180);
      if (cancelled || splitPreviewJobRef.current !== jobId) return;
      setSplitLoadingStage('正在匹配拼豆色号...');
      setSplitLoadingProgress(28);
      const croppedSource = splitCropRegion(
        uploadedSplitImage.crop,
        splitCropBounds,
        activeSplitCols,
        activeSplitRows,
        splitMode === 'align' ? flowAlignedGrid : undefined,
      );
      const rawCells = splitMode === 'align'
        ? await cellsFromAlignedGridAsync(uploadedSplitImage.imageData, {
          ...flowAlignedGrid,
          cols: cropSize(splitCropBounds).cols,
          rows: cropSize(splitCropBounds).rows,
          offsetX: flowAlignedGrid.offsetX + splitCropBounds.left * flowAlignedGrid.cellSize,
          offsetY: flowAlignedGrid.offsetY + splitCropBounds.top * flowAlignedGrid.cellSize,
        }, uploadedSplitImage.crop, (progress) => {
          if (!cancelled && splitPreviewJobRef.current === jobId) setSplitLoadingProgress(28 + Math.round(progress * 0.42));
        })
        : await cellsFromImageAsync(uploadedSplitImage.imageData, cropSize(splitCropBounds).rows, cropSize(splitCropBounds).cols, croppedSource, (progress) => {
          if (!cancelled && splitPreviewJobRef.current === jobId) setSplitLoadingProgress(28 + Math.round(progress * 0.42));
        });
      if (cancelled || splitPreviewJobRef.current !== jobId) return;
      setSplitPreviewRawCells(rawCells);
      setSplitLoadingStage('正在生成画布...');
      setSplitLoadingProgress(72);
      await yieldToBrowser();
      if (cancelled || splitPreviewJobRef.current !== jobId) return;
      setSplitLoadingStage('正在统计豆子数量...');
      setSplitLoadingProgress(86);
      await yieldToBrowser();
      if (cancelled || splitPreviewJobRef.current !== jobId) return;
      setSplitLoadingStage('即将完成...');
      setSplitLoadingProgress(96);
      await yieldToBrowser();
      if (cancelled || splitPreviewJobRef.current !== jobId) return;
      setSplitLoadingProgress(100);
      setSplitPreviewLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeSplitCols, activeSplitRows, flowAlignedGrid, isSplitCropped, screen, splitCols, splitCropBounds, splitMode, splitRows, uploadedSplitImage]);

  useEffect(() => {
    if (!['split-crop', 'split-preview'].includes(screen) || splitPreviewRawCells.length === 0) return;
    let cancelled = false;
    const run = async () => {
      if (deferredSplitMergeThreshold === 0) {
        setSplitPreviewCells(splitPreviewRawCells.map((cell) => ({ ...cell, color: cell.color.toLowerCase() })));
        setSplitLoadingProgress(100);
        setSplitPreviewLoading(false);
        return;
      }
      setSplitPreviewLoading(true);
      setSplitLoadingStage('正在匹配拼豆色号...');
      setSplitLoadingProgress(72);
      await yieldToBrowser();
      if (cancelled) return;
      setSplitPreviewCells(mergeSimilarCells(splitPreviewRawCells, deferredSplitMergeThreshold));
      setSplitLoadingStage('正在统计豆子数量...');
      setSplitLoadingProgress(96);
      await yieldToBrowser();
      if (cancelled) return;
      setSplitLoadingProgress(100);
      setSplitPreviewLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [deferredSplitMergeThreshold, screen, splitPreviewRawCells]);

  useEffect(() => {
    if (!isSplitCropStep || splitPreviewLoading || splitPreviewCells.length === 0) return;
    setSplitCropBounds(getAutoCropBounds(splitPreviewCells, activeSplitCols, activeSplitRows));
  }, [activeSplitCols, activeSplitRows, isSplitCropStep, splitPreviewCells, splitPreviewLoading]);
  const prioritizedPaletteColors = useMemo(
    () => filterPaletteByUsage(MARD_221_COLORS, cells, ''),
    [cells],
  );
  const filteredPaletteColors = useMemo(
    () => filterPaletteByQuery(prioritizedPaletteColors, paletteQuery),
    [paletteQuery, prioritizedPaletteColors],
  );
  const warehouseColors = useMemo(() => {
    const query = warehouseSearch.trim().toLowerCase();
    return MARD_221_COLORS.filter((color) => {
      const matchesLetter = warehouseLetter === '全部' || color.code.startsWith(warehouseLetter);
      const matchesQuery = !query || color.code.toLowerCase().includes(query) || color.hex.toLowerCase().includes(query);
      return matchesLetter && matchesQuery;
    });
  }, [warehouseLetter, warehouseSearch]);
  const selectedWarehouseCount = selectedWarehouseCodes.length;
  const activeWarehouse = warehouses.find((warehouse) => warehouse.id === activeWarehouseId) ?? null;
  const totalWarehouseStock = useMemo(() => Object.values(beadStock).reduce((sum, count) => sum + count, 0), [beadStock]);
  const stockedColorCount = useMemo(() => Object.values(beadStock).filter((count) => count > 0).length, [beadStock]);
  const missingColorCount = MARD_221_COLORS.length - stockedColorCount;

  const selectPaletteColor = (color: { code: string; hex: string }) => {
    setSelectedColor(color.hex);
    setSelectedCode(color.code);
    setTool('brush');
  };

  const fitView = () => {
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  };

  const openUpload = (nextMode: WorkMode) => {
    xhsRequestSeqRef.current += 1;
    setWorkMode(nextMode);
    setActiveTab('home');
    setShowUploadModal(true);
    setShowXhsImagePicker(false);
    setShowXhsInput(false);
    setXhsLink('');
    setXhsExtractedTitle('');
    setXhsExtractedImages([]);
  };

  const closeUploadModal = () => {
    xhsRequestSeqRef.current += 1;
    xhsImportSeqRef.current += 1;
    setShowUploadModal(false);
    setShowXhsImagePicker(false);
    setIsImportingXhsImage(false);
    setShowXhsInput(false);
    setXhsLink('');
    setXhsExtractedTitle('');
    setXhsExtractedImages([]);
    setIsExtractingXhs(false);
  };

  const chooseLocalDrawing = () => {
    closeUploadModal();
    fileInputRef.current?.click();
  };

  const chooseReferenceImage = () => {
    referenceInputRef.current?.click();
  };

  const clearReferenceImage = () => {
    setReferenceImage((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
    setIsReferenceMinimized(false);
  };

  const requestApi = async <T,>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> => {
    const effectiveToken = token === null ? '' : token || (() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || 'null') as { token?: string } | null;
        return stored?.token || authToken;
      } catch {
        return '';
      }
    })();
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(effectiveToken ? { authorization: `Bearer ${effectiveToken}` } : {}),
        ...(options.headers ?? {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    const body = payload;
    if (!response.ok) {
      const message = response.status === 401 ? '登录状态已失效，请重新登录' : body.message || '请求失败';
      const error = Object.assign(new Error(message), { status: response.status, code: body.error || body.code, body }) as RequestApiError;
      error.status = response.status;
      error.code = payload.error || payload.code;
      throw error;
    }
    return body as T;
  };

  const loadProjectFolders = async (token: string) => {
    try {
      const payload = await requestApi<{ folders: ProjectFolder[] }>('/project-folders', {}, token);
      setProjectFolders(payload.folders || []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '文件夹读取失败');
    }
  };

  const loadRecentProjects = async (token: string, { preserveOnError = false } = {}) => {
    const requestSeq = recentProjectsRequestSeqRef.current + 1;
    recentProjectsRequestSeqRef.current = requestSeq;
    try {
      const response = await fetch(`${API_BASE}/projects`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || '最近项目读取失败');
      if (recentProjectsRequestSeqRef.current !== requestSeq) return;
      setRecentProjects(payload.projects as RecentProject[]);
      void loadProjectFolders(token);
    } catch (error) {
      if (recentProjectsRequestSeqRef.current !== requestSeq) return;
      if (!preserveOnError) setRecentProjects([]);
      setStatus(error instanceof Error ? error.message : '最近项目读取失败');
    }
  };

  const loadFollowingCount = async (token: string) => {
    try {
      const payload = await requestApi<{ likesCount?: number; followingCount?: number; followersCount?: number }>('/me', {}, token);
      setReceivedLikesCount(typeof payload.likesCount === 'number' ? payload.likesCount : 0);
      setFollowingCount(typeof payload.followingCount === 'number' ? payload.followingCount : 0);
      setFollowersCount(typeof payload.followersCount === 'number' ? payload.followersCount : 0);
    } catch {
      setReceivedLikesCount(0);
      setFollowingCount(0);
      setFollowersCount(0);
    }
  };

  const loadFollowingUsers = async (token = authToken) => {
    if (!token) return;
    setIsFollowingLoading(true);
    setFollowingError('');
    try {
      const payload = await requestApi<{ users: FollowingUser[] }>('/community/following', { headers: { authorization: `Bearer ${token}` } }, token);
      setFollowingUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (error) {
      setFollowingUsers([]);
      setFollowingError(error instanceof Error ? error.message : '关注列表读取失败');
    } finally {
      setIsFollowingLoading(false);
    }
  };

  const loadFollowersUsers = async (token = authToken) => {
    if (!token) return;
    setIsFollowersLoading(true);
    setFollowersError('');
    try {
      const payload = await requestApi<{ users: FollowingUser[] }>('/community/followers', { headers: { authorization: `Bearer ${token}` } }, token);
      setFollowersUsers(Array.isArray(payload.users) ? payload.users : []);
    } catch (error) {
      setFollowersUsers([]);
      setFollowersError(error instanceof Error ? error.message : '粉丝列表读取失败');
    } finally {
      setIsFollowersLoading(false);
    }
  };

  const loadAuthorProfile = async (authorId: string, token = authToken) => {
    const requestSeq = authorProfileRequestSeqRef.current + 1;
    authorProfileRequestSeqRef.current = requestSeq;
    setIsAuthorProfileLoading(true);
    setAuthorProfileError('');
    try {
      const pageSize = 50;
      let page = 1;
      let profile: AuthorProfile | null = null;
      const posts: CommunityPost[] = [];
      while (true) {
        const payload = await requestApi<{ profile: AuthorProfile; posts: CommunityPost[] }>(`/community/users/${authorId}/profile?page=${page}&pageSize=${pageSize}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }, token || null);
        if (authorProfileRequestSeqRef.current !== requestSeq) return;
        profile = payload.profile;
        posts.push(...(Array.isArray(payload.posts) ? payload.posts : []));
        if (payload.posts.length < pageSize) break;
        page += 1;
      }
      if (authorProfileRequestSeqRef.current !== requestSeq) return;
      setAuthorProfile(profile);
      setAuthorProfilePosts(posts.map(toPatternListCard));
    } catch (error) {
      if (authorProfileRequestSeqRef.current !== requestSeq) return;
      setAuthorProfile(null);
      setAuthorProfilePosts([]);
      setAuthorProfileError(error instanceof Error ? error.message : '作者主页读取失败');
    } finally {
      if (authorProfileRequestSeqRef.current === requestSeq) setIsAuthorProfileLoading(false);
    }
  };

  const openAuthorProfile = (pattern: PatternListCard, backTarget: 'discover' | 'detail' | 'following' | 'followers' = 'discover') => {
    if (pattern.authorId && pattern.authorId === authUserId) {
      setActiveTab('profile');
      openMyWorks('profile');
      return;
    }
    if (!pattern.authorId) return;
    authorProfileRequestSeqRef.current += 1;
    authorProfileBackTargetRef.current = nextAuthorBackTarget(backTarget === 'detail' ? 'pattern-detail' : backTarget);
    authorProfileReturnPatternRef.current = backTarget === 'detail' ? pattern : null;
    setActivePattern(pattern);
    setAuthorProfile(null);
    setAuthorProfilePosts([]);
    setAuthorProfileError('');
    setScreen('author-profile');
    void loadAuthorProfile(pattern.authorId);
  };

  const openFollowUserProfile = (user: FollowingUser, from: 'following' | 'followers') => {
    openAuthorProfile({
      id: `user-${user.id}`,
      title: user.name,
      author: user.name,
      authorId: user.id,
      authorAvatar: user.avatarUrl,
      size: '',
      meta: '',
      likes: '0',
      comments: '0',
      downloads: '0',
      tone: 'recent-flower',
      beads: [],
      image: '',
      likesCount: 0,
      commentsCount: 0,
      likedByMe: false,
    }, from);
  };

  const loadCommunityPosts = async (sort: 'hot' | 'latest' = communitySort, token = authToken, { preserveOnError = false } = {}) => {
    const requestSeq = communityPostsRequestSeqRef.current + 1;
    communityPostsRequestSeqRef.current = requestSeq;
    setIsCommunityLoading(true);
    try {
      const allPosts: CommunityPost[] = [];
      let page = 1;
      const pageSize = 50;
      while (page <= 20) {
        const params = new URLSearchParams({ sort, page: String(page), pageSize: String(pageSize) });
        if (activeTab === 'discover' && debouncedCommunityQuery.trim()) params.set('q', debouncedCommunityQuery.trim());
        if (activeTab === 'discover' && communitySelectedTags.length) params.set('tags', communitySelectedTags.join(','));
        const payload = await requestApi<{ posts: CommunityPost[]; tagCounts?: Array<{ tag: string; count: number }> }>(`/community/posts?${params.toString()}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        if (page === 1 && communityPostsRequestSeqRef.current === requestSeq) {
          setCommunityAvailableTags((payload.tagCounts || []).filter(({ count }) => count > 0).map(({ tag }) => tag));
        }
        allPosts.push(...payload.posts);
        if (payload.posts.length < pageSize) break;
        page += 1;
      }
      if (communityPostsRequestSeqRef.current !== requestSeq) return;
      setCommunityPosts(sort === 'hot' ? sortCommunityPosts(allPosts) : allPosts);
    } catch (error) {
      if (communityPostsRequestSeqRef.current !== requestSeq) return;
      if (!preserveOnError) setCommunityPosts([]);
      setStatus(error instanceof Error ? error.message : '社区稿件读取失败');
    } finally {
      if (communityPostsRequestSeqRef.current === requestSeq) setIsCommunityLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedCommunityQuery(communityQuery), 300);
    return () => window.clearTimeout(timer);
  }, [communityQuery]);

  useEffect(() => {
    if (activeTab === 'discover') void loadCommunityPosts(communitySort, authToken);
  }, [activeTab, authToken, communitySort, debouncedCommunityQuery, communitySelectedTags]);

  useEffect(() => {
    if (screen === 'following' && authToken) void loadFollowingUsers(authToken);
    if (screen === 'followers' && authToken) void loadFollowersUsers(authToken);
  }, [screen, authToken]);

  const communityCards = useMemo(() => communityPosts.map(toPatternListCard), [communityPosts]);
  const homeTemplateCards = useMemo(() => communityCards.slice(0, 3), [communityCards]);

  const loadCommunityComments = async (projectId: string) => {
    const requestSeq = communityCommentsRequestSeqRef.current + 1;
    communityCommentsRequestSeqRef.current = requestSeq;
    setCommunityComments([]);
    setIsCommunityCommentsLoading(true);
    try {
      const payload = await requestApi<CommunityCommentsResponse>(`/community/posts/${projectId}/comments`);
      if (communityCommentsRequestSeqRef.current !== requestSeq) return;
      setCommunityComments(payload.comments);
    } catch (error) {
      if (communityCommentsRequestSeqRef.current !== requestSeq) return;
      setCommunityComments([]);
      setStatus(error instanceof Error ? error.message : '评论读取失败');
    } finally {
      if (communityCommentsRequestSeqRef.current === requestSeq) setIsCommunityCommentsLoading(false);
    }
  };

  const loadNotifications = async (token = authToken, { preserveOnError = false } = {}) => {
    if (!token) {
      if (!preserveOnError) setNotifications([]);
      return;
    }
    const requestSeq = notificationsRequestSeqRef.current + 1;
    notificationsRequestSeqRef.current = requestSeq;
    try {
      const payload = await requestApi<{ notifications: CommunityNotification[] }>('/notifications', {
        headers: { authorization: `Bearer ${token}` },
      });
      if (notificationsRequestSeqRef.current === requestSeq) setNotifications(payload.notifications || []);
    } catch (error) {
      if (notificationsRequestSeqRef.current === requestSeq) setStatus(error instanceof Error ? error.message : '消息读取失败');
    }
  };

  const openNotification = async (notification: CommunityNotification) => {
    let opened = !notification.projectId;
    if (notification.projectId) {
      try {
        const payload = await requestApi<{ post: CommunityPost }>(`/community/posts/${notification.projectId}`);
        setActivePattern(toPatternListCard(payload.post));
        setScreen('pattern-detail');
        opened = true;
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '作品读取失败');
      }
    }
    if (opened && !notification.isRead) {
      try {
        await requestApi(`/notifications/${notification.id}/read`, { method: 'PATCH' });
        setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : '消息状态更新失败');
      }
    }
  };

  const likeCommunityPost = async (projectId: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void likeCommunityPost(projectId, nextToken));
      return;
    }
    try {
      const payload = await requestApi<{ likesCount: number }>(`/community/posts/${projectId}/like`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      setCommunityPosts((posts) => posts.map((post) => post.id === projectId ? { ...post, likesCount: payload.likesCount, likedByMe: true } : post));
      setActivePattern((pattern) => pattern?.id === projectId ? { ...pattern, likes: String(payload.likesCount), likesCount: payload.likesCount, likedByMe: true } : pattern);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '点赞失败');
    }
  };

  const toggleCommunityFollow = async (authorId: string, currentlyFollowing: boolean, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void toggleCommunityFollow(authorId, currentlyFollowing, nextToken));
      return;
    }
    try {
      const payload = await requestApi<{ following: boolean; followingCount?: number; followersCount?: number }>(`/community/users/${authorId}/follow`, {
        method: currentlyFollowing ? 'DELETE' : 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      setCommunityPosts((posts) => posts.map((post) => post.authorId === authorId ? { ...post, isFollowing: payload.following } : post));
      setAuthorProfilePosts((posts) => posts.map((post) => post.authorId === authorId ? { ...post, isFollowing: payload.following } : post));
      setActivePattern((pattern) => pattern?.authorId === authorId ? { ...pattern, isFollowing: payload.following } : pattern);
      setAuthorProfile((profile) => profile?.id === authorId ? {
        ...profile,
        isFollowing: payload.following,
        followersCount: typeof payload.followersCount === 'number' ? payload.followersCount : profile.followersCount + (payload.following ? 1 : -1),
      } : profile);
      void loadFollowingCount(token);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '关注操作失败');
    }
  };

  const addCommunityComment = async (projectId: string, content: string, parentId?: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void addCommunityComment(projectId, content, parentId, nextToken));
      return;
    }
    if (parentId) setCommentReplyPendingId(parentId);
    else setCommentSubmitting(true);
    try {
      const payload = await requestApi<{ comment: CommunityComment }>(`/community/posts/${projectId}/comments`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ content, ...(parentId ? { parentId } : {}) }),
      });
      setCommunityComments((comments) => parentId
        ? insertCommentReply(comments, payload.comment)
        : [{ ...payload.comment, replies: payload.comment.replies || [] }, ...comments]);
      setCommunityPosts((posts) => posts.map((post) => post.id === projectId ? { ...post, commentsCount: post.commentsCount + 1 } : post));
      setActivePattern((pattern) => pattern?.id === projectId ? { ...pattern, comments: String(pattern.commentsCount + 1), commentsCount: pattern.commentsCount + 1 } : pattern);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '评论发布失败');
    } finally {
      if (parentId) setCommentReplyPendingId('');
      else setCommentSubmitting(false);
    }
  };

  const deleteCommunityComment = async (projectId: string, commentId: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void deleteCommunityComment(projectId, commentId, nextToken));
      return;
    }
    setCommentDeletePendingId(commentId);
    try {
      const payload = await requestApi<{ deletedCount: number }>(`/community/posts/${projectId}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      setCommunityComments((comments) => removeCommentTree(comments, commentId));
      setCommunityPosts((posts) => posts.map((post) => post.id === projectId ? { ...post, commentsCount: Math.max(0, post.commentsCount - payload.deletedCount) } : post));
      setActivePattern((pattern) => pattern?.id === projectId ? { ...pattern, comments: String(Math.max(0, pattern.commentsCount - payload.deletedCount)), commentsCount: Math.max(0, pattern.commentsCount - payload.deletedCount) } : pattern);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '评论删除失败');
    } finally {
      setCommentDeletePendingId('');
    }
  };

  const saveRecentProject = async (name: string, projectRows: number, projectCols: number, tone = 'recent-flower', images: { sourceImagePath?: string; thumbnailImagePath?: string } = {}, token = authToken) => {
    if (!token) return null;
    const projectPayload = normalizeProjectPayload(name, projectRows, projectCols);
    if (!projectPayload) {
      setStatus('作品名称或画布尺寸无效，请重新设置后再保存。');
      return null;
    }
    try {
      const projectPath = activeProjectId ? `/projects/${activeProjectId}` : '/projects';
      const response = await fetch(`${API_BASE}${projectPath}`, {
        method: activeProjectId ? 'PUT' : 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...projectPayload,
          ...images,
          canvasData: serializeProjectCells(cells),
          beadList: beadListColors.map(({ code, count }) => ({ color: code, count })),
          tone,
          folderId: resolveFolderId(saveFolderId, projectFolders),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || '最近项目保存失败');
      const savedProject = payload.project as RecentProject;
      setActiveProjectId(savedProject.id);
      setRecentProjects((projects) => [savedProject, ...projects.filter((project) => project.id !== savedProject.id)]);
      return savedProject;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '最近项目保存失败');
      return null;
    }
  };

  const saveCurrentProject = (token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => saveCurrentProject(nextToken));
      return;
    }
    setSaveProjectName((activeSavedProject?.name || '未命名作品').slice(0, 30));
    setSaveFolderId(resolveFolderId(activeSavedProject?.folderId, projectFolders));
    setShareToCommunity(Boolean(activeSavedProject?.sharedToCommunity));
    setShowSaveProjectModal(true);
  };

  const moveProjectToFolder = async (projectId: string, folderId: string | null) => {
    if (!authToken) {
      requireLogin((token) => void moveProjectToFolder(projectId, folderId));
      return;
    }
    try {
      const payload = await requestApi<{ project: { id: string; folderId: string | null; updatedAt: string } }>(`/projects/${projectId}/folder`, { method: 'PATCH', body: JSON.stringify({ folderId }) });
      setRecentProjects((projects) => applyMovedProjectFolder(projects, payload.project));
    } catch (error) {
      const message = error instanceof Error ? error.message : '移动作品失败';
      setStatus(message);
      throw error;
    }
  };

  const openProjectFolderCreate = (origin: ProjectFolderCreateOrigin) => {
    if (!authToken) {
      requireLogin(() => openProjectFolderCreate(origin));
      return;
    }
    projectFolderCreateReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setProjectFolderCreateOrigin(origin);
    setProjectFolderName('');
    setProjectFolderCreateError('');
    setShowProjectFolderCreate(true);
  };

  const createProjectFolder = async (requestedName = projectFolderName) => {
    const name = requestedName.trim();
    if (!name || isCreatingProjectFolder) return;
    if (!authToken) {
      throw new Error('请先登录后再新建文件夹');
    }
    setIsCreatingProjectFolder(true);
    setProjectFolderCreateError('');
    try {
      const payload = await requestApi<{ folder: ProjectFolder }>('/project-folders', { method: 'POST', body: JSON.stringify({ name }) });
      const next = applyCreatedProjectFolder({ folders: projectFolders, activeFolderId: activeProjectFolderId, saveFolderId, move: projectFolderMoveTarget ? { projectId: projectFolderMoveTarget.id, selectedFolderId: projectFolderMoveSelectedId } : null }, payload.folder, projectFolderCreateOrigin);
      setProjectFolders(next.folders);
      setActiveProjectFolderId(next.activeFolderId);
      setSaveFolderId(next.saveFolderId);
      if (next.move) setProjectFolderMoveSelectedId(next.move.selectedFolderId);
      setProjectFolderName('');
      setShowProjectFolderCreate(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '新建文件夹失败';
      setProjectFolderCreateError(message);
      throw error;
    } finally {
      setIsCreatingProjectFolder(false);
    }
  };

  const openProjectFolderMove = (project: RecentProject) => {
    const stableProjectCard = projectActionReturnFocusRef.current?.isConnected
      ? projectActionReturnFocusRef.current
      : document.querySelector<HTMLElement>(`[data-project-card-id="${CSS.escape(project.id)}"]`);
    projectFolderMoveReturnFocusRef.current = stableProjectCard ?? null;
    const flow = beginProjectFolderMove({ folders: projectFolders, activeFolderId: activeProjectFolderId, saveFolderId, move: null }, project);
    setProjectActionTarget(null);
    setProjectFolderMoveTarget(project);
    setProjectFolderMoveSelectedId(flow.move?.selectedFolderId ?? null);
    setProjectFolderMoveError('');
  };

  const openProjectActions = (project: RecentProject) => {
    const active = document.activeElement;
    projectActionReturnFocusRef.current = active instanceof HTMLElement && active.dataset.projectCardId === project.id
      ? active
      : document.querySelector<HTMLElement>(`[data-project-card-id="${CSS.escape(project.id)}"]`);
    setProjectActionTarget(project);
  };

  const confirmProjectFolderMove = async (folderId: string | null) => {
    const target = projectFolderMoveTarget;
    if (!target || isMovingProjectFolder) return;
    setIsMovingProjectFolder(true);
    setProjectFolderMoveError('');
    try {
      await moveProjectToFolder(target.id, folderId);
      setProjectFolderMoveTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '移动作品失败';
      setProjectFolderMoveError(message);
      throw error;
    } finally {
      setIsMovingProjectFolder(false);
    }
  };

  const deleteProjectFolder = (folder: ProjectFolder) => {
    requestConfirm({
      title: `删除“${folder.name}”？`,
      message: '文件夹中的作品会保留，并移到未分类。',
      confirmText: '删除文件夹',
      danger: true,
      onConfirm: async () => {
        try {
          await requestApi(`/project-folders/${folder.id}`, { method: 'DELETE' });
          setProjectFolders((folders) => folders.filter((item) => item.id !== folder.id));
          setRecentProjects((projects) => projects.map((project) => project.folderId === folder.id ? { ...project, folderId: null } : project));
          setActiveProjectFolderId((current) => current === folder.id ? 'all' : current);
          setSaveFolderId((current) => current === folder.id ? null : current);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : '删除文件夹失败');
        }
      },
    });
  };

  const shareCommunityPost = async (projectId: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void shareCommunityPost(projectId, nextToken));
      return;
    }
    const shareUrl = window.location.origin + window.location.pathname + '?project=' + encodeURIComponent(projectId);
    try {
      const shareApi = navigator as Navigator & { share?: (data: { title: string; url: string }) => Promise<void>; clipboard?: { writeText: (value: string) => Promise<void> } };
      if (shareApi.share) {
        await shareApi.share({ title: activePattern?.title || '拼豆图纸', url: shareUrl });
      } else if (shareApi.clipboard) {
        await shareApi.clipboard.writeText(shareUrl);
      } else {
        setStatus('当前浏览器不支持分享，请复制页面地址。');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
      } else {
        setStatus(error instanceof Error ? error.message : '分享失败，请稍后重试。');
      }
    }
  };

  const copyCommunityPattern = async (projectId: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => { void copyCommunityPattern(projectId, nextToken); });
      return;
    }
    if (copyingPatternId) return;
    setCopyingPatternId(projectId);
    try {
      await requestApi(`/projects/${projectId}/copy`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      await loadRecentProjects(token);
      setStatus('已复制到仓库，可在我的作品中查看。');
      openMyWorks('home');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '复制到仓库失败，请稍后重试。');
    } finally {
      setCopyingPatternId('');
    }
  };

  const openSavedProject = (project: RecentProject) => {
    const nextRows = Math.max(1, Math.round(project.rows));
    const nextCols = Math.max(1, Math.round(project.cols));
    const restoredCells = parseProjectCells(project.canvasData, nextRows, nextCols);
    setRows(nextRows);
    setCols(nextCols);
    setCfgRows(nextRows);
    setCfgCols(nextCols);
    setCells(restoredCells ?? createBlankCells(nextRows, nextCols));
    setHistory([]);
    setFuture([]);
    setTool('pan');
    setZoom(1);
    setCanvasScale(1);
    setPanX(0);
    setPanY(0);
    setUploadedSplitImage(null);
    setUploadedSourceImageDataUrl('');
    setActiveProjectId(project.id);
    setScreen('canvas');
  };

  const startBeadingProject = async (project: RecentProject, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void startBeadingProject(project, nextToken));
      return;
    }
    setProjectActionTarget(null);
    openSavedProject(project);
    try {
      const sessionPayload = await requestApi<{ session: BeadingSession }>(`/v1/projects/${project.id}/beading-session`, { method: 'POST', body: JSON.stringify({ warehouseId: activeWarehouseId || undefined }) });
      const inventory = await requestApi<any>(`/v1/beading-sessions/${sessionPayload.session.id}/inventory-check`, { method: 'POST', body: JSON.stringify({}) });
      setBeadingSession(sessionPayload.session);
      setBeadingInventoryCheck(inventory);
      setScreen('beading');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '无法开始拼豆');
    }
  };

  const enterBeadingSession = () => {
    setBeadingInventoryCheck(null);
    setScreen('beading');
  };

  const syncBeadingSessionFromError = (error: unknown, expectedSessionId: string) => {
    const latestSession = beadingSessionFromError(error, expectedSessionId);
    if (latestSession) setBeadingSession(latestSession);
  };

  const patchBeadingProgress: SessionMutation = async ({ completedColorCodes, elapsedSeconds, version }) => {
    if (!beadingSession) throw new Error('拼豆会话已失效');
    try {
      const payload = await requestApi<{ session: BeadingSession }>(`/v1/beading-sessions/${beadingSession.id}`, { method: 'PATCH', body: JSON.stringify({ version, completedColorCodes, elapsedSeconds }) });
      setBeadingSession(payload.session);
      return payload.session;
    } catch (error) {
      syncBeadingSessionFromError(error, beadingSession.id);
      setStatus(error instanceof Error ? error.message : '拼豆进度同步失败');
      throw error;
    }
  };

  const pauseBeading: SessionMutation = async ({ completedColorCodes, elapsedSeconds, version }) => {
    const activeSession = beadingSession;
    if (!activeSession) throw new Error('拼豆会话已失效');
    let patchedSession: BeadingSession | null = null;
    try {
      const patched = await requestApi<{ session: BeadingSession }>(`/v1/beading-sessions/${activeSession.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ version, completedColorCodes, elapsedSeconds }),
      });
      patchedSession = patched.session;
      const paused = await requestApi<{ session: BeadingSession }>(`/v1/beading-sessions/${activeSession.id}/pause`, {
        method: 'POST',
        body: JSON.stringify({ version: patched.session.version }),
      });
      setBeadingSession(paused.session);
      return paused.session;
    } catch (error) {
      if (patchedSession) setBeadingSession(patchedSession);
      syncBeadingSessionFromError(error, activeSession.id);
      setStatus(error instanceof Error ? error.message : '无法暂停拼豆');
      throw error;
    }
  };

  const prepareBeadingCompletion: Prepare = async ({ version }) => {
    if (!beadingSession) throw new Error('拼豆会话已失效');
    try {
      const payload = await requestApi<{ session: BeadingSession }>(`/v1/beading-sessions/${beadingSession.id}/prepare-completion`, { method: 'POST', body: JSON.stringify({ version }) });
      setBeadingSession(payload.session);
      return payload.session;
    } catch (error) {
      syncBeadingSessionFromError(error, beadingSession.id);
      setStatus(error instanceof Error ? error.message : '无法准备完成确认');
      throw error;
    }
  };

  const completeBeading: Complete = async ({ deduct }) => {
    if (!beadingSession) throw new Error('拼豆会话已失效');
    try {
      const idempotencyKey = `${beadingSession.id}:${deduct ? 'deduct' : 'no-deduct'}`;
      const payload = await requestApi<{ session: BeadingSession; deducted: boolean }>(`/v1/beading-sessions/${beadingSession.id}/complete`, { method: 'POST', body: JSON.stringify({ idempotencyKey, deductInventory: deduct, warehouseId: activeWarehouseId || undefined }) });
      setBeadingSession(payload.session);
      return payload.session;
    } catch (error) {
      syncBeadingSessionFromError(error, beadingSession.id);
      setStatus(error instanceof Error ? error.message : '完成拼豆失败');
      throw error;
    }
  };

  const resumeBeading: Resume = async ({ version }) => {
    if (!beadingSession) throw new Error('拼豆会话已失效');
    try {
      const payload = await requestApi<{ session: BeadingSession }>(`/v1/beading-sessions/${beadingSession.id}/resume`, { method: 'POST', body: JSON.stringify({ version }) });
      setBeadingSession(payload.session);
      return payload.session;
    } catch (error) {
      syncBeadingSessionFromError(error, beadingSession.id);
      setStatus(error instanceof Error ? error.message : '无法继续拼豆');
      throw error;
    }
  };

  const returnBeadingToProgress: SessionTransition = async ({ version }) => {
    if (!beadingSession) throw new Error('拼豆会话已失效');
    try {
      const payload = await requestApi<{ session: BeadingSession }>(`/v1/beading-sessions/${beadingSession.id}/return-to-progress`, { method: 'POST', body: JSON.stringify({ version }) });
      setBeadingSession(payload.session);
      return payload.session;
    } catch (error) {
      syncBeadingSessionFromError(error, beadingSession.id);
      setStatus(error instanceof Error ? error.message : '无法返回检查');
      throw error;
    }
  };

  const abandonBeading: SessionTransition = async ({ version }) => {
    if (!beadingSession) throw new Error('拼豆会话已失效');
    try {
      const payload = await requestApi<{ session: BeadingSession }>(`/v1/beading-sessions/${beadingSession.id}/abandon`, { method: 'POST', body: JSON.stringify({ version }) });
      setBeadingSession(payload.session);
      return payload.session;
    } catch (error) {
      syncBeadingSessionFromError(error, beadingSession.id);
      setStatus(error instanceof Error ? error.message : '无法放弃会话');
      throw error;
    }
  };

  const openBeadingInventory = async (): Promise<void> => {
    if (!beadingSession) throw new Error('拼豆会话已失效');
    try {
      const payload = await requestApi<InventoryCheck>(`/v1/beading-sessions/${beadingSession.id}/inventory-check`, { method: 'POST', body: JSON.stringify({}) });
      setBeadingInventoryCheck(payload);
    } catch (error) {
      syncBeadingSessionFromError(error, beadingSession.id);
      setStatus(error instanceof Error ? error.message : '库存检测失败');
      throw error;
    }
  };

  const confirmSaveProject = async ({ startBeading = false }: { startBeading?: boolean } = {}) => {
    if (isSavingProject || saveProjectInFlightRef.current) return;
    const name = saveProjectName.trim().slice(0, 30);
    if (!name) {
      setStatus('请输入设计稿名称。');
      return;
    }
    saveProjectInFlightRef.current = true;
    setIsSavingProject(true);
    try {
      const thumbnailDataUrl = createBeadThumbnailCanvas(cells, rows, cols).toDataURL('image/webp', 0.82);
      const imagePayload = await requestApi<{ sourceImagePath?: string; thumbnailImagePath?: string }>('/uploads/projects', {
        method: 'POST',
        body: JSON.stringify({
          images: [
            ...(uploadedSourceImageDataUrl ? [{ kind: 'source', filename: uploadedSplitImage?.name || 'source.png', dataUrl: uploadedSourceImageDataUrl }] : []),
            { kind: 'thumbnail', filename: 'thumbnail.webp', dataUrl: thumbnailDataUrl },
          ],
        }),
      });
      const saved = await saveRecentProject(name, rows, cols, uploadedSplitImage ? 'recent-dog' : 'recent-flower', imagePayload);
      if (!saved) {
        return;
      }
      setShowSaveProjectModal(false);
      if (shareToCommunity && !saved.sharedToCommunity) { setShareDialogProject(saved); setShareDialogTags(saved.tags || []); }
      if (startBeading) await startBeadingProject(saved);
   } catch (error) {
     setStatus(error instanceof Error ? error.message : '作品保存失败，请稍后重试。');
    } finally {
      saveProjectInFlightRef.current = false;
      setIsSavingProject(false);
    }
  };

  const shareSavedProject = async (project: RecentProject, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void shareSavedProject(project, nextToken));
      return;
    }
    if (sharingProjectId) return;
    setShareDialogProject(project);
    setShareDialogTags(project.tags || []);
  };

  const confirmShareCommunity = async (tags: string[]) => {
    const project = shareDialogProject;
    if (!project || !authToken || sharingProjectId) return;
    setSharingProjectId(project.id);
    try {
      const payload: { tags: string[]; sharedAt?: string } = project.sharedToCommunity
        ? await requestApi(`/projects/${project.id}/community-tags`, { method: 'PATCH', body: JSON.stringify({ tags }) })
        : await requestApi(`/projects/${project.id}/share`, { method: 'POST', body: JSON.stringify({ tags }) });
      setRecentProjects((items) => items.map((item) => item.id === project.id ? { ...item, sharedToCommunity: true, sharedAt: payload.sharedAt ?? item.sharedAt, tags: payload.tags } : item));
      setShareDialogProject(null);
      await loadCommunityPosts('hot');
    } catch (error) { setStatus(error instanceof Error ? error.message : '分享失败'); }
    finally { setSharingProjectId(''); }
  };

  const loadWarehouses = async (token = authToken, { preserveOnError = false } = {}) => {
    if (!token) return;
    const requestSeq = warehousesRequestSeqRef.current + 1;
    warehousesRequestSeqRef.current = requestSeq;
    try {
      const payload = await fetch(`${API_BASE}/warehouses`, { headers: { authorization: `Bearer ${token}` } }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || '仓库读取失败');
        return data as { warehouses: Warehouse[] };
      });
      if (warehousesRequestSeqRef.current !== requestSeq) return;
      setWarehouses(payload.warehouses);
      if (!activeWarehouseId && payload.warehouses[0]) {
        activeWarehouseIdRef.current = payload.warehouses[0].id;
        setActiveWarehouseId(payload.warehouses[0].id);
        await loadInventory(payload.warehouses[0].id, token);
      }
    } catch (error) {
      if (!preserveOnError || warehousesRequestSeqRef.current === requestSeq) setStatus(error instanceof Error ? error.message : '仓库读取失败');
    }
  };

  const refreshCurrentHome = () => refreshHomeData({
    token: authToken,
    loadCommunity: () => loadCommunityPosts('hot', authToken, { preserveOnError: true }),
    loadRecentProjects: () => authToken ? loadRecentProjects(authToken, { preserveOnError: true }) : Promise.resolve(),
    loadNotifications: () => authToken ? loadNotifications(authToken, { preserveOnError: true }) : Promise.resolve(),
    loadWarehouses: () => authToken ? loadWarehouses(authToken, { preserveOnError: true }) : Promise.resolve(),
    loadProfile: () => authToken ? loadFollowingCount(authToken) : Promise.resolve(),
  });

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

  const loadInventory = async (warehouseId = activeWarehouseId, token = authToken) => {
    if (!warehouseId || !token) return;
    const requestSeq = inventoryRequestSeqRef.current + 1;
    inventoryRequestSeqRef.current = requestSeq;
    setBeadStock({});
    try {
      const payload = await fetch(`${API_BASE}/warehouses/${warehouseId}/inventory`, {
        headers: { authorization: `Bearer ${token}` },
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || '库存读取失败');
        return data as { inventory: Record<string, number> };
      });
      if (inventoryRequestSeqRef.current !== requestSeq) return;
      if (activeWarehouseIdRef.current !== warehouseId) return;
      setBeadStock(payload.inventory);
    } catch (error) {
      if (inventoryRequestSeqRef.current !== requestSeq) return;
      setStatus(error instanceof Error ? error.message : '库存读取失败');
    }
  };

  const requireLogin = (next: (token: string) => void) => {
    if (isLoggedIn) {
      next(authToken);
      return;
    }
    pendingAuthActionRef.current = next;
    setShowLoginModal(true);
    setStatus('请先登录后使用我的功能。');
  };

  const submitLogin = async () => {
    const username = loginName.trim();
    const password = loginPassword;
    if (!username || !password) {
      setStatus('请输入用户名和密码。');
      return;
    }
    const requestSeq = authRequestSeqRef.current + 1;
    authRequestSeqRef.current = requestSeq;
    setIsAuthenticating(true);
    try {
      const payload = await requestApi<{ token: string; user: { id: string; username: string; nickname?: string; avatarUrl?: string | null } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (authRequestSeqRef.current !== requestSeq || !showLoginModal) return;
      setAuthToken(payload.token);
      setAuthUserId(payload.user.id);
      setLegacyDraftOwnerId(payload.user.username.trim());
      setLoginName(payload.user.nickname || payload.user.username);
      setProfileAvatarUrl(payload.user.avatarUrl || '');
      await loadFollowingCount(payload.token);
      setIsLoggedIn(true);
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: payload.token, username: payload.user.username, userId: payload.user.id }));
      setShowLoginModal(false);
      setLoginPassword('');
      await loadRecentProjects(payload.token);
      await loadCommunityPosts('hot', payload.token);
      await loadNotifications(payload.token);
      await loadWarehouses(payload.token);
      const pendingAuthAction = pendingAuthActionRef.current;
      pendingAuthActionRef.current = null;
      pendingAuthAction?.(payload.token);
    } catch (error) {
      if (authRequestSeqRef.current !== requestSeq) return;
      setStatus(error instanceof Error ? error.message : '登录失败');
    } finally {
      if (authRequestSeqRef.current === requestSeq) setIsAuthenticating(false);
    }
  };

  const sendPhoneCode = async () => {
    if (phoneSending || phoneCountdown > 0) return;
    setPhoneAuthError('');
    setStatus('');
    let phone: string;
    try {
      phone = normalizePhone(phoneNumber);
    } catch (error) {
      setPhoneAuthError(error instanceof Error ? error.message : '请输入正确的手机号');
      return;
    }
    setPhoneSending(true);
    try {
      const deviceId = getPhoneDeviceId();
      const challengeResponse = await fetch(`${API_BASE}/v1/auth/sms/challenge`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform: 'web', deviceId }),
      });
      const challengePayload = await challengeResponse.json().catch(() => ({}));
      if (!challengeResponse.ok) throw new Error(challengePayload.message || '请求已失效，请稍后重试');
      const challenge = challengePayload.data as { challengeId: string; seed: string; serverTime: number };
      const requestId = createRequestId();
      const nonce = createNonce();
      const timestamp = challenge.serverTime;
      const captcha = await showTencentCaptcha(CAPTCHA_APP_ID);
      const body = { phone, scene: 'REGISTER', captchaTicket: captcha.ticket, captchaRandstr: captcha.randstr, deviceId };
      const signature = await signWebSmsRequest(body, { platform: 'web', signVersion: 'web-v1', timestamp, requestId, nonce, challengeId: challenge.challengeId }, challenge.seed);
      const sendResponse = await fetch(`${API_BASE}/v1/auth/sms/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json', 'x-client-platform': 'web', 'x-client-version': '1.0.0', 'x-sign-version': 'web-v1',
          'x-request-id': requestId, 'x-timestamp': String(timestamp), 'x-nonce': nonce, 'x-challenge-id': challenge.challengeId, 'x-signature': signature,
        },
        body: JSON.stringify(body),
      });
      const sendPayload = await sendResponse.json().catch(() => ({}));
      if (!sendResponse.ok) {
        const retryAfter = Number(sendResponse.headers.get('retry-after') || 0);
        if (retryAfter > 0) setPhoneCountdown(retryAfter);
        throw new Error(sendPayload.message || '操作过于频繁，请稍后再试');
      }
      setPhoneChallenge({ challengeId: challenge.challengeId, seed: challenge.seed, serverTime: challenge.serverTime });
      setPhoneSmsRequestId(sendPayload.data.smsRequestId);
      setPhoneCountdown(Number(sendPayload.data.retryAfter || 60));
    } catch (error) {
      setPhoneAuthError(error instanceof Error ? error.message : '验证码发送失败');
    } finally {
      setPhoneSending(false);
    }
  };

  const submitPhoneAuth = async (mode: 'login' | 'register') => {
    if (phoneVerifying) return;
    if (!phoneAgreement) {
      setPhoneAuthError('请先勾选用户协议和隐私政策');
      return;
    }
    let phone: string;
    try { phone = normalizePhone(phoneNumber); } catch (error) {
      setPhoneAuthError(error instanceof Error ? error.message : '请输入正确的手机号');
      return;
    }
    const passwordError = passwordValidationMessage(phonePassword);
    if (!validatePasswordLength(phonePassword)) {
      setPhoneAuthError(passwordError || '密码至少需要 8 位');
      return;
    }
    if (mode === 'register' && (!phoneSmsRequestId || !/^\d{6}$/.test(phoneCode))) {
      setPhoneAuthError('请输入6位验证码');
      return;
    }
    setPhoneVerifying(true);
    setPhoneAuthError('');
    try {
      if (mode === 'register' && phonePassword !== phoneConfirmPassword) {
        setPhoneAuthError('两次密码输入不一致');
        return;
      }
      const response = await fetch(`${API_BASE}/v1/auth/sms/${mode}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, password: phonePassword, ...(mode === 'register' ? { confirmPassword: phoneConfirmPassword, smsRequestId: phoneSmsRequestId, code: phoneCode } : {}), agreementVersion: 'privacy-2026-08-01', device: { platform: 'web', deviceId: getPhoneDeviceId(), appVersion: '1.0.0' } }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || '登录失败，请稍后重试');
      const data = payload.data as { accessToken: string; user: { nickname?: string; id: string; avatarUrl?: string | null } };
      setAuthToken(data.accessToken);
      setAuthUserId(data.user.id);
      setLegacyDraftOwnerId((data.user.nickname || '我的创作').trim());
      setLoginName(data.user.nickname || '我的创作');
      setProfileAvatarUrl(data.user.avatarUrl || '');
      await loadFollowingCount(data.accessToken);
      setIsLoggedIn(true);
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: data.accessToken, username: data.user.nickname || '我的创作', userId: data.user.id }));
      setShowLoginModal(false);
      setPhoneCode('');
      setPhonePassword('');
      setPhoneConfirmPassword('');
      setPhoneSmsRequestId('');
      setPhoneChallenge(null);
      await loadRecentProjects(data.accessToken);
      await loadCommunityPosts('hot', data.accessToken);
      await loadNotifications(data.accessToken);
      await loadWarehouses(data.accessToken);
      const pendingAuthAction = pendingAuthActionRef.current;
      pendingAuthActionRef.current = null;
      pendingAuthAction?.(data.accessToken);
    } catch (error) {
      setPhoneAuthError(error instanceof Error ? error.message : '登录失败，请稍后重试');
    } finally {
      setPhoneVerifying(false);
    }
  };

  const submitPhoneLogin = async () => submitPhoneAuth('login');
  const submitPhoneRegister = async () => submitPhoneAuth('register');

  const logoutPhone = async () => {
    try {
      await fetch(`${API_BASE}/v1/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    } catch {
      // Clear the local session even when the server is unavailable.
    }
    setAuthToken('');
    setAuthUserId('');
    setLegacyDraftOwnerId('');
    setIsLoggedIn(false);
    setLoginName('');
    setProfileAvatarUrl('');
    setReceivedLikesCount(0);
    setFollowingCount(0);
    setFollowersCount(0);
    setFollowingUsers([]);
    setFollowersUsers([]);
    setRecentProjects([]);
    setCommunityPosts([]);
    setCommunityComments([]);
    setNotifications([]);
    setWarehouses([]);
    setBeadStock({});
    pendingAuthActionRef.current = null;
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setShowLogoutConfirm(false);
  };

  const openWarehouse = () => {
    requireLogin(() => {
      setScreen('warehouse');
    });
  };

  const openWarehouseDetail = (warehouseId: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => openWarehouseDetail(warehouseId, nextToken));
      return;
    }
    activeWarehouseIdRef.current = warehouseId;
    setActiveWarehouseId(warehouseId);
    setSelectedWarehouseCodes([]);
    setScreen('warehouse-detail');
    void loadInventory(warehouseId, token);
  };

  const toggleWarehouseCode = (code: string) => {
    setSelectedWarehouseCodes((current) => (
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code]
    ));
  };

  const selectVisibleWarehouseColors = () => {
    setSelectedWarehouseCodes((current) => Array.from(new Set([...current, ...warehouseColors.map((color) => color.code)])));
  };

  const invertVisibleWarehouseColors = () => {
    const visibleCodes = new Set(warehouseColors.map((color) => color.code));
    setSelectedWarehouseCodes((current) => {
      const currentSet = new Set(current);
      for (const code of visibleCodes) {
        if (currentSet.has(code)) currentSet.delete(code);
        else currentSet.add(code);
      }
      return [...currentSet];
    });
  };

  const applyWarehouseChange = async (direction: 'in' | 'out', token = authToken) => {
    if (selectedWarehouseCodes.length === 0) {
      setStatus('请先选择需要操作的色号。');
      return;
    }
    if (!token) {
      requireLogin((nextToken) => { void applyWarehouseChange(direction, nextToken); });
      return;
    }
    if (!activeWarehouseId) {
      setStatus('请先创建或选择仓库。');
      return;
    }
    const amount = Number.parseFloat(warehouseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus('请输入有效的入库或出库数量。');
      return;
    }
    const beadCount = Math.max(1, Math.round(warehouseUnit === 'gram' ? amount * BEADS_PER_GRAM : amount));
    try {
      const payload = await requestApi<{ inventory: Record<string, number> }>(`/warehouses/${activeWarehouseId}/inventory`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({
          codes: selectedWarehouseCodes,
          type: direction,
          quantity: beadCount,
          inputUnit: warehouseUnit,
          inputValue: amount,
        }),
      });
      setBeadStock(payload.inventory);
      const nextStockedColorCount = Object.values(payload.inventory).filter((count) => count > 0).length;
      const nextTotalStock = Object.values(payload.inventory).reduce((sum, count) => sum + count, 0);
      setWarehouses((items) => items.map((warehouse) => (
        warehouse.id === activeWarehouseId
          ? { ...warehouse, stockedColorCount: nextStockedColorCount, totalWarehouseStock: nextTotalStock }
          : warehouse
      )));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '库存操作失败');
    }
  };

  const createWarehouse = async (token?: string) => {
    const authTokenOverride = typeof token === 'string' ? token : undefined;
    const name = warehouseName.trim();
    if (!name) {
      setStatus('请输入仓库名称。');
      return;
    }
    if (!token) {
      requireLogin((nextToken) => { void createWarehouse(nextToken); });
      return;
    }
    try {
      const payload = await requestApi<{ warehouse: Warehouse }>('/warehouses', {
        method: 'POST',
        body: JSON.stringify({ name, remark: warehouseRemark }),
      }, authTokenOverride);
      setWarehouses((items) => [payload.warehouse, ...items]);
      activeWarehouseIdRef.current = payload.warehouse.id;
      setActiveWarehouseId(payload.warehouse.id);
      setBeadStock({});
      setSelectedWarehouseCodes([]);
      setShowWarehouseCreateModal(false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '创建仓库失败');
    }
  };

  const deleteWarehouse = async (warehouseId: string) => {
    try {
      await requestApi<{ deleted: boolean }>(`/warehouses/${warehouseId}`, { method: 'DELETE' });
      setWarehouses((items) => items.filter((warehouse) => warehouse.id !== warehouseId));
      if (activeWarehouseIdRef.current === warehouseId) {
        activeWarehouseIdRef.current = '';
        setActiveWarehouseId('');
        setBeadStock({});
        setSelectedWarehouseCodes([]);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '删除仓库失败');
    }
  };

  const openCreateCanvasModal = () => {
    setCfgCols(cols);
    setCfgRows(rows);
    setShowCreateCanvasModal(true);
  };

  const openBlankCanvasCreation = () => {
    closeUploadModal();
    openCreateCanvasModal();
  };

  const createBlankCanvas = () => {
    const nextCols = normalizeGridSize(cfgCols);
    const nextRows = normalizeGridSize(cfgRows);
    setCols(nextCols);
    setRows(nextRows);
    setCfgCols(nextCols);
    setCfgRows(nextRows);
    setCells(createBlankCells(nextRows, nextCols));
    setUploadedSourceImageDataUrl('');
    setUploadedSplitImage(null);
    setActiveProjectId('');
    setWorkMode('bead');
    setHistory([]);
    setFuture([]);
    setTool('pan');
    setZoom(1.0);
    setCanvasScale(1.0);
    setPanX(0);
    setPanY(0);
    clearReferenceImage();
    setShowCreateCanvasModal(false);
    setScreen('canvas');
  };

  const commitCells = (nextCellsOrUpdater: Cell[] | ((current: Cell[]) => Cell[])) => {
    setCells((current) => {
      const nextCells = typeof nextCellsOrUpdater === 'function'
        ? nextCellsOrUpdater(current)
        : nextCellsOrUpdater;
      if (sameCells(current, nextCells)) {
        return current;
      }
      setHistory((items) => [...items.slice(-24), current]);
      setFuture([]);
      return nextCells;
    });
  };

  const undo = () => {
    setHistory((items) => {
      if (items.length === 0) return items;
      const previous = items[items.length - 1];
      setFuture((futureItems) => [cells, ...futureItems]);
      setCells(previous);
      return items.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((items) => {
      if (items.length === 0) return items;
      const [next, ...remaining] = items;
      setHistory((historyItems) => [...historyItems, cells]);
      setCells(next);
      return remaining;
    });
  };

  const updateSplitLongSide = (value: number) => {
    const nextLongSide = Math.min(
      maxQuickSplitLongSide,
      clampSplitLongSide(value),
    );
    if (nextLongSide === splitLiveLongSideRef.current) return;
    splitLiveLongSideRef.current = nextLongSide;
    setSplitLongSide(nextLongSide);
    if (!uploadedSplitImage) return;
    const nextSize = gridSizeFromSplitBounds(uploadedSplitImage.crop.width, uploadedSplitImage.crop.height, nextLongSide);
    setSplitRows(nextSize.rows);
    setSplitCols(nextSize.cols);
  };

  const scheduleAlignStateCommit = () => {
    if (splitAlignFrameRef.current) return;
    splitAlignFrameRef.current = requestAnimationFrame(() => {
      splitAlignFrameRef.current = 0;
      setAlignCellSize(splitLiveAlignCellSizeRef.current);
      setAlignOffsetX(splitLiveAlignOffsetRef.current.x);
      setAlignOffsetY(splitLiveAlignOffsetRef.current.y);
    });
  };

  const updateAlignCellSize = (value: number, options: { deferred?: boolean; silent?: boolean } = {}) => {
    if (!uploadedSplitImage) return;
    const { crop } = uploadedSplitImage;
    const origin = splitLiveGridFrameOriginRef.current;
    const originX = (origin.x / 100) * crop.width;
    const originY = (origin.y / 100) * crop.height;
    const maxCellSize = Math.max(1, Math.min(
      (crop.width - originX) / GRID_CONTROL_CELLS,
      (crop.height - originY) / GRID_CONTROL_CELLS,
    ));
    const nextCellSize = Math.max(1, Math.min(maxCellSize, value));
    splitLiveAlignCellSizeRef.current = nextCellSize;
    splitLiveAlignOffsetRef.current = { x: originX, y: originY };
    if (options.deferred) {
      scheduleAlignStateCommit();
    } else {
      setAlignCellSize(nextCellSize);
      setAlignOffsetX(originX);
      setAlignOffsetY(originY);
    }
  };

  const nudgeAlignOffset = (deltaX: number, deltaY: number, options: { deferred?: boolean } = {}) => {
    const nextOffset = {
      x: splitLiveAlignOffsetRef.current.x + deltaX,
      y: splitLiveAlignOffsetRef.current.y + deltaY,
    };
    splitLiveAlignOffsetRef.current = nextOffset;
    if (options.deferred) {
      scheduleAlignStateCommit();
      return;
    }
    setAlignOffsetX(nextOffset.x);
    setAlignOffsetY(nextOffset.y);
  };

  const alignDeltaFromScreen = (deltaX: number, deltaY: number, target: Element) => {
    if (!uploadedSplitImage) return { x: 0, y: 0 };
    const frame = target.closest('.split-image-frame') ?? target.querySelector('.split-image-frame') ?? target;
    const rect = frame.getBoundingClientRect();
    const baseImageRect = fitSplitImageRect(rect, uploadedSplitImage.crop);
    const scaledImageRect = scaleRectFromCenter(baseImageRect, splitImageScale);
    const imageRect = {
      ...scaledImageRect,
      x: scaledImageRect.x + splitImageOffsetRef.current.x,
      y: scaledImageRect.y + splitImageOffsetRef.current.y,
    };
    return {
      x: imageRect.width > 0 ? (deltaX / imageRect.width) * uploadedSplitImage.crop.width : 0,
      y: imageRect.height > 0 ? (deltaY / imageRect.height) * uploadedSplitImage.crop.height : 0,
    };
  };

  const gridPointFromScreen = (clientX: number, clientY: number, target: Element) => {
    if (!uploadedSplitImage) return { x: 0, y: 0 };
    const frame = target.closest('.split-image-frame') ?? target.querySelector('.split-image-frame') ?? target;
    const rect = frame.getBoundingClientRect();
    const baseImageRect = fitSplitImageRect(rect, uploadedSplitImage.crop);
    const scaledImageRect = scaleRectFromCenter(baseImageRect, splitImageScale);
    const imageRect = {
      ...scaledImageRect,
      x: scaledImageRect.x + splitImageOffsetRef.current.x,
      y: scaledImageRect.y + splitImageOffsetRef.current.y,
    };
    return {
      x: imageRect.width > 0 ? ((clientX - rect.left - imageRect.x) / imageRect.width) * uploadedSplitImage.crop.width : 0,
      y: imageRect.height > 0 ? ((clientY - rect.top - imageRect.y) / imageRect.height) * uploadedSplitImage.crop.height : 0,
    };
  };

  const moveGridControlFrame = (deltaX: number, deltaY: number, options: { deferred?: boolean } = {}) => {
    if (!uploadedSplitImage) return;
    const { crop } = uploadedSplitImage;
    const currentOrigin = splitLiveGridFrameOriginRef.current;
    const currentX = (currentOrigin.x / 100) * crop.width;
    const currentY = (currentOrigin.y / 100) * crop.height;
    const frameSize = splitLiveAlignCellSizeRef.current * GRID_CONTROL_CELLS;
    const nextX = Math.max(0, Math.min(Math.max(0, crop.width - frameSize), currentX + deltaX));
    const nextY = Math.max(0, Math.min(Math.max(0, crop.height - frameSize), currentY + deltaY));
    const nextOrigin = {
      x: (nextX / crop.width) * 100,
      y: (nextY / crop.height) * 100,
    };
    splitLiveGridFrameOriginRef.current = nextOrigin;
    setGridFrameOrigin(nextOrigin);
    nudgeAlignOffset(nextX - currentX, nextY - currentY, options);
  };

  const startGridHandleDrag = (handle: GridHandle, clientX: number, clientY: number) => {
    splitGridHandleDragRef.current = {
      handle,
      lastX: clientX,
      lastY: clientY,
    };
  };

  const continueGridHandleDrag = (clientX: number, clientY: number, target: Element) => {
    const current = splitGridHandleDragRef.current;
    const activeHandle = current.handle;
    if (!activeHandle) return;
    if (activeHandle === 'move') {
      const delta = alignDeltaFromScreen(clientX - current.lastX, clientY - current.lastY, target);
      moveGridControlFrame(delta.x, delta.y, { deferred: true });
    } else {
      if (!uploadedSplitImage) return;
      const point = gridPointFromScreen(clientX, clientY, target);
      const origin = splitLiveGridFrameOriginRef.current;
      const originX = (origin.x / 100) * uploadedSplitImage.crop.width;
      const originY = (origin.y / 100) * uploadedSplitImage.crop.height;
      const nextCellSize = ((point.x - originX) + (point.y - originY)) / (GRID_CONTROL_CELLS * 2);
      updateAlignCellSize(nextCellSize, { deferred: true, silent: true });
    }
    splitGridHandleDragRef.current.lastX = clientX;
    splitGridHandleDragRef.current.lastY = clientY;
  };

  const handleSplitTouchStart = (event: React.TouchEvent) => {
    if ((event.target as HTMLElement).closest('.split-grid-handle')) return;
    suppressSplitImageClickRef.current = false;
    if (event.touches.length !== 2) return;
    event.preventDefault();
    splitImagePinchRef.current = {
      active: true,
      startDistance: touchDistance(event.touches[0], event.touches[1]),
      startScale: splitImageScale,
    };
  };

  const handleSplitTouchMove = (event: React.TouchEvent) => {
    if (!splitImagePinchRef.current.active || event.touches.length !== 2) return;
    if (event.cancelable) event.preventDefault();
    const distance = touchDistance(event.touches[0], event.touches[1]);
    suppressSplitImageClickRef.current = true;
    const scaleRatio = distance / Math.max(1, splitImagePinchRef.current.startDistance);
    setSplitImageScale(clampSplitImageScale(splitImagePinchRef.current.startScale * scaleRatio));
  };

  const handleSplitTouchEnd = (event: React.TouchEvent) => {
    if (event.touches.length >= 2) return;
    splitImagePinchRef.current.active = false;
    splitGridHandleDragRef.current.handle = null;
  };

  const handleSplitWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.split-grid-handle')) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 0.9;
    zoomSplitImageAtPoint(event.clientX, event.clientY, factor, event.currentTarget);
  };

  const handleSplitClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.split-grid-handle')) return;
    if (suppressSplitImageClickRef.current) {
      suppressSplitImageClickRef.current = false;
      return;
    }
    zoomSplitImageAtPoint(event.clientX, event.clientY, 1.12, event.currentTarget);
  };

  const updateSplitImageOffset = (offset: { x: number; y: number }) => {
    splitImageOffsetRef.current = offset;
    setSplitImageOffset(offset);
  };

  const zoomSplitImageAtPoint = (
    clientX: number,
    clientY: number,
    factor: number,
    target: Element,
  ) => {
    if (!uploadedSplitImage) return;
    const frame = target.closest('.split-image-frame') ?? target;
    const rect = frame.getBoundingClientRect();
    const baseRect = fitSplitImageRect(rect, uploadedSplitImage.crop);
    const currentRect = {
      ...scaleRectFromCenter(baseRect, splitImageScale),
      x: scaleRectFromCenter(baseRect, splitImageScale).x + splitImageOffsetRef.current.x,
      y: scaleRectFromCenter(baseRect, splitImageScale).y + splitImageOffsetRef.current.y,
    };
    const pointX = clientX - rect.left;
    const pointY = clientY - rect.top;
    const relativeX = currentRect.width > 0 ? (pointX - currentRect.x) / currentRect.width : 0.5;
    const relativeY = currentRect.height > 0 ? (pointY - currentRect.y) / currentRect.height : 0.5;
    const nextScale = clampSplitImageScale(splitImageScale * factor);
    const nextRect = scaleRectFromCenter(baseRect, nextScale);
    updateSplitImageOffset({
      x: pointX - (nextRect.x + relativeX * nextRect.width),
      y: pointY - (nextRect.y + relativeY * nextRect.height),
    });
    setSplitImageScale(nextScale);
  };

  const handleSplitPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.split-grid-handle')) return;
    splitImagePanRef.current = {
      active: true,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSplitPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = splitImagePanRef.current;
    if (!pan.active || pan.pointerId !== event.pointerId || splitImagePinchRef.current.active) return;
    const deltaX = event.clientX - pan.lastX;
    const deltaY = event.clientY - pan.lastY;
    if (Math.abs(deltaX) + Math.abs(deltaY) < 1) return;
    updateSplitImageOffset({
      x: splitImageOffsetRef.current.x + deltaX,
      y: splitImageOffsetRef.current.y + deltaY,
    });
    suppressSplitImageClickRef.current = true;
    pan.lastX = event.clientX;
    pan.lastY = event.clientY;
  };

  const handleSplitPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = splitImagePanRef.current;
    if (pan.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    splitImagePanRef.current.active = false;
    splitImagePanRef.current.pointerId = null;
  };

  const endGridHandleDrag = () => {
    splitGridHandleDragRef.current.handle = null;
  };

  const handleGridHandlePointerDown = (handle: GridHandle, event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    startGridHandleDrag(handle, event.clientX, event.clientY);
  };

  const handleGridHandlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!splitGridHandleDragRef.current.handle) return;
    event.preventDefault();
    event.stopPropagation();
    continueGridHandleDrag(event.clientX, event.clientY, event.currentTarget);
  };

  const handleGridHandlePointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endGridHandleDrag();
  };

  const importSplitToCanvas = () => {
    if (!uploadedSplitImage || splitPreviewCells.length === 0) return;
    setRows(previewSplitSize.rows);
    setCols(previewSplitSize.cols);
    setCfgRows(previewSplitSize.rows);
    setCfgCols(previewSplitSize.cols);
    setCells(splitPreviewCells);
    setHistory([]);
    setFuture([]);
    setTool('pan');
    setZoom(1.0);
    setCanvasScale(1.0);
    setPanX(0);
    setPanY(0);
    clearReferenceImage();
    setScreen('canvas');
  };

  const openSplitPreview = () => {
    const finalizedAlignment = splitMode === 'align' && uploadedSplitImage
      ? gridSizeFromAlignment(
        uploadedSplitImage.crop,
        splitLiveAlignCellSizeRef.current,
        splitLiveAlignOffsetRef.current.x,
        splitLiveAlignOffsetRef.current.y,
      )
      : null;
    if (finalizedAlignment) {
      if (splitAlignFrameRef.current) cancelAnimationFrame(splitAlignFrameRef.current);
      splitAlignFrameRef.current = 0;
      setAlignCellSize(splitLiveAlignCellSizeRef.current);
      setAlignOffsetX(splitLiveAlignOffsetRef.current.x);
      setAlignOffsetY(splitLiveAlignOffsetRef.current.y);
    }
    setLockedAlignedGrid(finalizedAlignment);
    const nextRows = finalizedAlignment?.rows ?? splitRows;
    const nextCols = finalizedAlignment?.cols ?? splitCols;
    const nextImageView = defaultSplitImageView();
    setSplitImageScale(nextImageView.scale);
    updateSplitImageOffset(nextImageView.offset);
    setIsSplitCropStep(true);
    setIsSplitCropped(false);
    setSplitPreviewLoading(false);
    setSplitPreviewRawCells([]);
    setSplitPreviewCells([]);
    setSplitCropBounds({ top: 0, right: nextCols, bottom: nextRows, left: 0 });
    setScreen('split-crop');
  };

  const resetSplitCrop = () => {
    setSplitCropBounds(getAutoCropBounds(splitPreviewCells, activeSplitCols, activeSplitRows));
  };

  const zoomSplitCropImage = (factor: number) => {
    setSplitImageScale((value) => clampSplitImageScale(value * factor));
  };

  const resetSplitCropImage = () => {
    setSplitImageScale(1);
    updateSplitImageOffset({ x: 0, y: 0 });
  };

  const confirmSplitCrop = () => {
    if (splitMergeThreshold !== deferredSplitMergeThreshold || !uploadedSplitImage) return;
    setIsSplitCropped(true);
    setIsSplitCropStep(false);
    setSplitPreviewLoading(true);
    setSplitLoadingStage('正在生成像素图...');
    setSplitLoadingProgress(15);
    setScreen('split-preview');
  };

  const returnToSplitCrop = () => {
    setIsSplitCropStep(true);
    setIsSplitCropped(false);
    setSplitPreviewLoading(false);
    setScreen(splitPreviewBackTarget());
  };

  const applyDefaultSplitGeometry = (crop: UploadedSplitImage['crop'], { resetCrop = true } = {}) => {
    const geometry = defaultSplitGeometryFromCrop(crop);
    setSplitMode('quick');
    setSplitLongSide(geometry.longSide);
    setSplitRows(geometry.rows);
    setSplitCols(geometry.cols);
    setSplitPreviewTab('settings');
    setLockedAlignedGrid(null);
    splitLiveAlignCellSizeRef.current = geometry.alignCellSize;
    splitLiveAlignOffsetRef.current = geometry.alignOffset;
    splitLiveGridFrameOriginRef.current = geometry.gridFrameOrigin;
    setAlignCellSize(geometry.alignCellSize);
    setAlignOffsetX(geometry.alignOffset.x);
    setAlignOffsetY(geometry.alignOffset.y);
    setGridFrameOrigin(geometry.gridFrameOrigin);
    if (resetCrop) {
      setIsSplitCropped(false);
      setSplitCropBounds({ top: 0, right: geometry.cols, bottom: geometry.rows, left: 0 });
    }
    setSplitImageScale(1);
    updateSplitImageOffset({ x: 0, y: 0 });
    splitImagePinchRef.current.active = false;
    return geometry;
  };

  const loadSplitImage = (name: string, imageData: ImageData): number => {
    splitPreviewJobRef.current += 1;
    const originalImageData = cloneImageData(imageData);
    const backgroundCache = prepareBackgroundRemoval(originalImageData);
    const derived = deriveSplitImage(originalImageData, false, { toUrl: imageDataToUrl, getCrop: getImageCrop }, { backgroundCache });
    const { crop, url } = derived;
    const uploadedImage = {
      name,
      originalImageData,
      imageData: derived.imageData,
      crop,
      url,
      originalUrl: url,
      backgroundRemoved: false,
      backgroundSensitivity: DEFAULT_BACKGROUND_SENSITIVITY,
      backgroundCache,
    };
    uploadedSplitImageRef.current = uploadedImage;
    queuedBackgroundSensitivityRef.current = DEFAULT_BACKGROUND_SENSITIVITY;
    setUploadedSplitImage(uploadedImage);
    setActiveProjectId('');
    setSplitMergeThreshold(0);
    const defaultGeometry = applyDefaultSplitGeometry(crop);
    setHistory([]);
    setFuture([]);
    setScreen('split');
    return defaultGeometry.longSide;
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setStatus('请上传 PNG、JPG 或 WebP 图片。');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setStatus('图片不能超过 20MB。');
      return;
    }

    try {
      const imageData = await loadImageData(file);
      loadSplitImage(file.name, imageData);
      setUploadedSourceImageDataUrl(imageDataToUrl(imageData));
    } catch {
      setStatus('图片读取失败，请换一张图片。');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggleSplitBackground = async () => {
    if (!uploadedSplitImage || isBackgroundProcessing) return;
    const toggleScreen = splitScreenRef.current;
    if (!['split', 'split-crop', 'split-preview'].includes(toggleScreen)) return;
    if (splitBackgroundSensitivityFrameRef.current) {
      cancelAnimationFrame(splitBackgroundSensitivityFrameRef.current);
      splitBackgroundSensitivityFrameRef.current = 0;
    }
    setIsBackgroundProcessing(true);
    const jobId = splitPreviewJobRef.current + 1;
    splitPreviewJobRef.current = jobId;
    try {
      await yieldToBrowser();
      const backgroundRemoved = !uploadedSplitImage.backgroundRemoved;
      const derived = deriveSplitImage(
        uploadedSplitImage.originalImageData,
        backgroundRemoved,
        { toUrl: imageDataToUrl, getCrop: getImageCrop },
        {
          sensitivity: queuedBackgroundSensitivityRef.current,
          backgroundCache: uploadedSplitImage.backgroundCache,
        },
      );
      if (!isCurrentSplitBackgroundJob(jobId, uploadedSplitImage, toggleScreen)) return;
      setUploadedSplitImage((current) => {
        if (!current || !isCurrentSplitBackgroundJob(jobId, uploadedSplitImage, toggleScreen)) return current;
        const next = {
          ...current,
          ...derived,
          crop: current.crop,
          backgroundSensitivity: queuedBackgroundSensitivityRef.current,
        };
        uploadedSplitImageRef.current = next;
        return next;
      });
      if (!isCurrentSplitBackgroundJob(jobId, uploadedSplitImage, toggleScreen)) return;
      setUploadedSourceImageDataUrl(derived.url);
      setSplitPreviewRawCells([]);
      setSplitPreviewCells([]);
    } catch {
      if (isCurrentSplitBackgroundJob(jobId, uploadedSplitImage, toggleScreen)) {
        setStatus('图片去背景失败，请重试。');
      }
    } finally {
      if (isCurrentSplitBackgroundJob(jobId, uploadedSplitImage, toggleScreen)) setIsBackgroundProcessing(false);
    }
  };

  const updateSplitBackgroundSensitivity = (value: number) => {
    const sensitivityScreen = splitScreenRef.current;
    if (sensitivityScreen !== 'split-preview') return;
    const sensitivity = Math.max(0, Math.min(100, Math.round(value)));
    queuedBackgroundSensitivityRef.current = sensitivity;
    setUploadedSplitImage((current) => {
      if (!current) return current;
      const next = { ...current, backgroundSensitivity: sensitivity };
      uploadedSplitImageRef.current = next;
      return next;
    });
    const currentImage = uploadedSplitImageRef.current;
    if (!currentImage?.backgroundRemoved || splitBackgroundSensitivityFrameRef.current) return;

    splitBackgroundSensitivityFrameRef.current = requestAnimationFrame(() => {
      splitBackgroundSensitivityFrameRef.current = 0;
      if (splitScreenRef.current !== sensitivityScreen) return;
      const sourceImage = uploadedSplitImageRef.current;
      if (!sourceImage?.backgroundRemoved) return;
      const jobId = splitPreviewJobRef.current + 1;
      splitPreviewJobRef.current = jobId;
      if (!isCurrentSplitBackgroundJob(jobId, sourceImage, sensitivityScreen)) return;
      const sensitivityToApply = queuedBackgroundSensitivityRef.current;
      const derived = deriveSplitImage(
        sourceImage.originalImageData,
        true,
        { toUrl: imageDataToUrl, getCrop: getImageCrop },
        { sensitivity: sensitivityToApply, backgroundCache: sourceImage.backgroundCache },
      );
      if (!isCurrentSplitBackgroundJob(jobId, sourceImage, sensitivityScreen)) return;
      setUploadedSplitImage((current) => {
        if (!current || !current.backgroundRemoved || !isCurrentSplitBackgroundJob(jobId, sourceImage, sensitivityScreen)) return current;
        const next = {
          ...current,
          imageData: derived.imageData,
          url: derived.url,
          backgroundSensitivity: sensitivityToApply,
        };
        uploadedSplitImageRef.current = next;
        return next;
      });
      if (!isCurrentSplitBackgroundJob(jobId, sourceImage, sensitivityScreen)) return;
      setUploadedSourceImageDataUrl(derived.url);
    });
  };

  const toggleCanvasBackground = async () => {
    if (isBackgroundProcessing || screen !== 'canvas') return;
    const jobId = canvasBackgroundJobRef.current + 1;
    canvasBackgroundJobRef.current = jobId;
    setIsBackgroundProcessing(true);
    try {
      await yieldToBrowser();
      if (canvasBackgroundJobRef.current !== jobId || splitScreenRef.current !== 'canvas') return;
      commitCells((current) => removeGridEdgeBackground(current, rows, cols));
    } catch {
      if (canvasBackgroundJobRef.current === jobId) setStatus('网格去背景失败，请重试。');
    } finally {
      if (canvasBackgroundJobRef.current === jobId) setIsBackgroundProcessing(false);
    }
  };

  const handleReferenceUpload = (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setStatus('请上传 PNG、JPG 或 WebP 参考图。');
      if (referenceInputRef.current) referenceInputRef.current.value = '';
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setStatus('参考图不能超过 20MB。');
      if (referenceInputRef.current) referenceInputRef.current.value = '';
      return;
    }

    setReferenceImage((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return { name: file.name, url: URL.createObjectURL(file) };
    });
    setIsReferenceMinimized(false);
    if (referenceInputRef.current) referenceInputRef.current.value = '';
  };

  const closeReferenceImage = () => {
    clearReferenceImage();
  };

  const extractXiaohongshuImage = async () => {
    if (!isLoggedIn) {
      requireLogin(() => setShowXhsInput(true));
      return;
    }
    const url = extractUrlFromText(xhsLink);
    if (!url) {
      setStatus('未识别到链接。');
      return;
    }
    if (!isSupportedXiaohongshuUrl(url)) {
      setStatus('不支持的链接域名。');
      return;
    }
    const requestSeq = xhsRequestSeqRef.current + 1;
    xhsRequestSeqRef.current = requestSeq;
    setIsExtractingXhs(true);
    setXhsExtractedImages([]);
    try {
      const payload = await requestApi<{ imageUrl?: string; imageDataUrl?: string; title?: string; images?: XhsExtractedImage[] }>('/xiaohongshu/extract', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      if (xhsRequestSeqRef.current !== requestSeq || !showUploadModal) return;
      const images = (payload.images?.length ? payload.images : [{ imageUrl: payload.imageUrl || '', imageDataUrl: payload.imageDataUrl || '' }])
        .filter((image): image is XhsExtractedImage => Boolean(image.imageUrl || image.imageDataUrl));
      if (images.length === 0) throw new Error('未找到可用图片');
      if (images.length === 1) {
        await importXhsImage(images[0], payload.title);
        return;
      }
      setXhsExtractedTitle(payload.title?.trim() || '小红书图纸');
      setXhsExtractedImages(images);
      setShowUploadModal(false);
      setShowXhsInput(false);
      setShowXhsImagePicker(true);
    } catch (error) {
      if (xhsRequestSeqRef.current !== requestSeq) return;
      setStatus(error instanceof Error ? error.message : '小红书图片提取失败。');
    } finally {
      if (xhsRequestSeqRef.current === requestSeq) setIsExtractingXhs(false);
    }
  };

  const importXhsImage = async (image: XhsExtractedImage, title = xhsExtractedTitle) => {
    if (!image.imageDataUrl && !image.imageUrl) {
      setStatus('未找到可用图片。');
      return;
    }
    const requestSeq = xhsImportSeqRef.current + 1;
    xhsImportSeqRef.current = requestSeq;
    setIsImportingXhsImage(true);
    try {
      let source = image.imageDataUrl || '';
      if (!source && image.imageUrl) {
        const payload = await requestApi<{ imageDataUrl: string }>('/xiaohongshu/image', {
          method: 'POST',
          body: JSON.stringify({ imageUrl: image.imageUrl }),
        });
        source = payload.imageDataUrl;
      }
      const imageData = await loadImageDataFromUrl(source);
      if (xhsImportSeqRef.current !== requestSeq || (!showUploadModal && !showXhsImagePicker)) return;
      loadSplitImage(safeImageFilename(title || 'xiaohongshu-drawing', 'image/png'), imageData);
      setUploadedSourceImageDataUrl(imageDataToUrl(imageData));
      setShowUploadModal(false);
      setShowXhsImagePicker(false);
      setShowXhsInput(false);
      setXhsLink('');
      setXhsExtractedTitle('');
      setXhsExtractedImages([]);
    } catch {
      if (xhsImportSeqRef.current !== requestSeq) return;
      setStatus('小红书图片读取失败，请换一张图片。');
    } finally {
      if (xhsImportSeqRef.current === requestSeq) setIsImportingXhsImage(false);
    }
  };

  const closeXhsImagePicker = () => {
    if (isImportingXhsImage) return;
    xhsImportSeqRef.current += 1;
    setShowXhsImagePicker(false);
    setXhsExtractedTitle('');
    setXhsExtractedImages([]);
  };

  const paintCellInDraft = (sourceCells: Cell[], x: number, y: number, paintTool: 'brush' | 'eraser') => {
    const sourceCell = sourceCells.find((item) => item.x === x && item.y === y);
    if (!sourceCell) return { nextCells: sourceCells, changed: false };

    if (paintTool === 'eraser') {
      if (sourceCell.transparent) return { nextCells: sourceCells, changed: false };
      return {
        nextCells: sourceCells.map((item) => (item.x === x && item.y === y ? { ...item, color: EMPTY_COLOR, transparent: true } : item)),
        changed: true,
      };
    }

    if (!sourceCell.transparent && sourceCell.color.toLowerCase() === selectedColor.toLowerCase()) {
      return { nextCells: sourceCells, changed: false };
    }

    return { nextCells: replaceCell(sourceCells, x, y, selectedColor), changed: true };
  };

  const paintStrokeAt = (x: number, y: number) => {
    const stroke = paintStrokeRef.current;
    if (!stroke.active) return;
    const { nextCells, changed } = paintCellInDraft(stroke.draftCells, x, y, stroke.tool);
    if (!changed) return;
    stroke.draftCells = nextCells;
    stroke.changedCount += 1;
    cellsRef.current = nextCells;
    setCells(nextCells);
  };

  const resetPaintStroke = () => {
    paintStrokeRef.current = {
      active: false,
      tool: 'brush',
      baseCells: [],
      draftCells: [],
      changedCount: 0,
      pointerId: null,
      lastCell: null,
      initialPainted: true,
    };
  };

  const paintInitialStrokeCell = () => {
    const stroke = paintStrokeRef.current;
    if (!stroke.active || stroke.initialPainted || !stroke.lastCell) return;
    stroke.initialPainted = true;
    paintStrokeAt(stroke.lastCell.x, stroke.lastCell.y);
  };

  const cancelPaintStroke = () => {
    const stroke = paintStrokeRef.current;
    if (!stroke.active) return;
    if (stroke.changedCount > 0) {
      cellsRef.current = stroke.baseCells;
      setCells(stroke.baseCells);
    }
    resetPaintStroke();
    suppressCanvasClickRef.current = false;
  };

  const beginPaintStroke = (x: number, y: number, pointerId: number, target: EventTarget & HTMLElement, deferInitialPaint = false) => {
    if (tool !== 'brush' && tool !== 'eraser') return false;
    setStatus('');
    const baseCells = cellsRef.current;
    paintStrokeRef.current = {
      active: true,
      tool,
      baseCells,
      draftCells: baseCells,
      changedCount: 0,
      pointerId,
      lastCell: { x, y },
      initialPainted: false,
    };
    suppressCanvasClickRef.current = true;
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Some test/browser targets do not expose capture for synthetic pointers.
    }
    if (!deferInitialPaint) {
      paintInitialStrokeCell();
    }
    return true;
  };

  const continuePaintStroke = (x: number, y: number, pointerId: number) => {
    const stroke = paintStrokeRef.current;
    if (!stroke.active || stroke.pointerId !== pointerId) return;
    const start = stroke.lastCell;
    if (!start) {
      paintStrokeAt(x, y);
      stroke.lastCell = { x, y };
      return;
    }
    paintInitialStrokeCell();
    const dx = x - start.x;
    const dy = y - start.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let step = 1; step <= steps; step += 1) {
      const nextX = Math.round(start.x + (dx * step) / steps);
      const nextY = Math.round(start.y + (dy * step) / steps);
      paintStrokeAt(nextX, nextY);
    }
    stroke.lastCell = { x, y };
  };

  const breakPaintStroke = (pointerId: number) => {
    const stroke = paintStrokeRef.current;
    if (!stroke.active || stroke.pointerId !== pointerId) return;
    stroke.lastCell = null;
  };

  const endPaintStroke = (pointerId: number, target?: EventTarget & HTMLElement) => {
    const stroke = paintStrokeRef.current;
    if (!stroke.active || stroke.pointerId !== pointerId) return;
    paintInitialStrokeCell();
    if (stroke.changedCount > 0) {
      setHistory((items) => [...items.slice(-24), stroke.baseCells]);
      setFuture([]);
    }
    resetPaintStroke();
    if (target) {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    }
    window.setTimeout(() => {
      suppressCanvasClickRef.current = false;
    }, 0);
  };

  const handleCanvasPointerDownCapture = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return;
    canvasTouchPointersRef.current.add(event.pointerId);
    if (canvasTouchPointersRef.current.size > 1) {
      cancelPaintStroke();
    }
  };

  const handleCanvasPointerEndCapture = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return;
    canvasTouchPointersRef.current.delete(event.pointerId);
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const isMultiTouch = event.pointerType === 'touch' && canvasTouchPointersRef.current.size > 1;
    if (isMultiTouch) return;
    const point = cellFromCanvasPointer(event.clientX, event.clientY, event.currentTarget);
    if (!point) return;
    if (beginPaintStroke(point.x, point.y, event.pointerId, event.currentTarget, event.pointerType === 'touch')) {
      event.preventDefault();
    }
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const point = cellFromCanvasPointer(event.clientX, event.clientY, event.currentTarget);
    if (!point) {
      breakPaintStroke(event.pointerId);
      return;
    }
    continuePaintStroke(point.x, point.y, event.pointerId);
  };

  const handleCanvasPaintPointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    endPaintStroke(event.pointerId, event.currentTarget);
    if (event.pointerType === 'touch') {
      canvasTouchPointersRef.current.delete(event.pointerId);
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLElement>) => {
    if (suppressCanvasClickRef.current) {
      suppressCanvasClickRef.current = false;
      return;
    }
    const point = cellFromCanvasPointer(event.clientX, event.clientY, event.currentTarget);
    if (!point) return;
    const cell = cells.find((item) => item.x === point.x && item.y === point.y);
    if (!cell) return;
    handleCellTap(cell);
  };

  const handleCanvasKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const current = keyboardCellRef.current;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = {
        x: Math.max(0, Math.min(cols - 1, current.x + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0))),
        y: Math.max(0, Math.min(rows - 1, current.y + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0))),
      };
      keyboardCellRef.current = next;
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    const cell = cells.find((item) => item.x === current.x && item.y === current.y);
    if (cell) handleCellTap(cell);
  };

  const cellFromCanvasPointer = (clientX: number, clientY: number, artwork: HTMLElement) => {
    const rect = artwork.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return null;
    const x = Math.min(cols - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * cols)));
    const y = Math.min(rows - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * rows)));
    return { x, y };
  };

  const handleCellTap = (cell: Cell) => {
    if (tool === 'eyedropper') {
      if (!cell.transparent) {
        setSelectedColor(cell.color);
        setSelectedCode(colorCodeOf(cell.color));
      }
      return;
    }

    if (tool === 'eraser') {
      setStatus('');
      if (cell.transparent) return;
      commitCells(cells.map((item) => (item.x === cell.x && item.y === cell.y ? { ...item, color: EMPTY_COLOR, transparent: true } : item)));
      return;
    }

    if (tool === 'fill') {
      const nextCells = bucketFill(cells, rows, cols, cell.x, cell.y, selectedColor);
      if (sameCells(cells, nextCells)) {
        return;
      }
      commitCells(nextCells);
      return;
    }

    if (tool !== 'brush') return;
    setStatus('');
    if (!cell.transparent && cell.color.toLowerCase() === selectedColor.toLowerCase()) return;
    commitCells(replaceCell(cells, cell.x, cell.y, selectedColor));
  };

  const exportPatternPng = () => {
    const patternCanvas = createBeadPatternCanvas(cells, rows, cols);
    patternCanvas.toBlob((blob) => {
      if (!blob) {
        setStatus('导出图纸失败，请重试。');
        return;
      }
      downloadBlob('qiaoqiaole-h5-pattern.png', blob);
    }, 'image/png');
  };

  const exportStl = () => {
    const parts = buildModelParts(cells, rows, cols, DEFAULT_SETTINGS);
    downloadText('qiaoqiaole-h5-board.stl', serializeAsciiStl('qiaoqiaole-h5-board', parts));
  };

  // Resize canvas handler
  const handleResizeCanvas = () => {
    const nextCols = normalizeGridSize(cfgCols);
    const nextRows = normalizeGridSize(cfgRows);
    const newCells = resizeCells(cells, rows, cols, nextRows, nextCols);
    setRows(nextRows);
    setCols(nextCols);
    setCfgCols(nextCols);
    setCfgRows(nextRows);
    commitCells(newCells);
    setShowSettings(false);
  };

  // Gesture events
  const handleTouchStart = (e: React.TouchEvent) => {
    const touches = e.touches;
    gestureRef.current.isPointerDown = true;
    gestureRef.current.moved = false;

    if (touches.length === 1) {
      gestureRef.current.lastX = touches[0].clientX;
      gestureRef.current.lastY = touches[0].clientY;
      gestureRef.current.isPinching = false;
    } else if (touches.length === 2) {
      e.preventDefault();
      gestureRef.current.isPinching = true;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      gestureRef.current.initialDistance = Math.hypot(dx, dy);
      gestureRef.current.initialZoom = zoom;
      gestureRef.current.initialPanX = panX;
      gestureRef.current.initialPanY = panY;
      gestureRef.current.lastX = (touches[0].clientX + touches[1].clientX) / 2;
      gestureRef.current.lastY = (touches[0].clientY + touches[1].clientY) / 2;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!gestureRef.current.isPointerDown) return;
    const touches = e.touches;

    if (touches.length === 1 && !gestureRef.current.isPinching) {
      const dx = touches[0].clientX - gestureRef.current.lastX;
      const dy = touches[0].clientY - gestureRef.current.lastY;
      if (Math.hypot(dx, dy) > 2) {
        gestureRef.current.moved = true;
      }
      if (tool === 'pan') {
        e.preventDefault();
        setPanX((prev) => prev + dx);
        setPanY((prev) => prev + dy);
        gestureRef.current.lastX = touches[0].clientX;
        gestureRef.current.lastY = touches[0].clientY;
      }
    } else if (touches.length === 2 && gestureRef.current.isPinching) {
      e.preventDefault();
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.hypot(dx, dy);

      const scale = dist / gestureRef.current.initialDistance;
      setZoom(Math.min(8.0, Math.max(0.3, gestureRef.current.initialZoom * scale)));

      const midX = (touches[0].clientX + touches[1].clientX) / 2;
      const midY = (touches[0].clientY + touches[1].clientY) / 2;
      const pDX = midX - gestureRef.current.lastX;
      const pDY = midY - gestureRef.current.lastY;
      setPanX((prev) => prev + pDX);
      setPanY((prev) => prev + pDY);

      gestureRef.current.lastX = midX;
      gestureRef.current.lastY = midY;
    }
  };

  const handleTouchEnd = () => {
    gestureRef.current.isPointerDown = false;
    gestureRef.current.isPinching = false;
  };

  // Mouse fallback
  const handleMouseDown = (e: React.MouseEvent) => {
    gestureRef.current.isPointerDown = true;
    gestureRef.current.moved = false;
    gestureRef.current.lastX = e.clientX;
    gestureRef.current.lastY = e.clientY;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!gestureRef.current.isPointerDown) return;
    const dx = e.clientX - gestureRef.current.lastX;
    const dy = e.clientY - gestureRef.current.lastY;
    if (Math.hypot(dx, dy) > 2) {
      gestureRef.current.moved = true;
    }
    if (tool === 'pan') {
      e.preventDefault();
      setPanX((prev) => prev + dx);
      setPanY((prev) => prev + dy);
    }
    gestureRef.current.lastX = e.clientX;
    gestureRef.current.lastY = e.clientY;
  };

  const handleMouseUp = () => {
    gestureRef.current.isPointerDown = false;
  };

  const closeLoginModal = () => {
    authRequestSeqRef.current += 1;
    setIsAuthenticating(false);
    pendingAuthActionRef.current = null;
    setShowLoginModal(false);
  };
  const dismissSaveLoginPrompt = () => {
    setShowSaveLoginPrompt(false);
  };
  const loginModalFallback = showLoginModal && !(screen === 'home' && (activeTab === 'home' || activeTab === 'profile')) ? (
    <PhoneLoginModal
      phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber} phoneCode={phoneCode} setPhoneCode={setPhoneCode}
      phonePassword={phonePassword} setPhonePassword={setPhonePassword}
      phoneConfirmPassword={phoneConfirmPassword} setPhoneConfirmPassword={setPhoneConfirmPassword}
      phoneAuthMode={phoneAuthMode} setPhoneAuthMode={switchPhoneAuthMode}
      phoneAgreement={phoneAgreement} setPhoneAgreement={setPhoneAgreement} phoneAuthError={phoneAuthError}
      phoneSending={phoneSending} phoneVerifying={phoneVerifying} phoneCountdown={phoneCountdown}
      sendPhoneCode={sendPhoneCode} submitPhoneLogin={submitPhoneLogin} submitPhoneRegister={submitPhoneRegister} closeLoginModal={closeLoginModal}
      logoutPhone={logoutPhone}
      showLogoutConfirm={showLogoutConfirm} setShowLogoutConfirm={setShowLogoutConfirm}
    />
  ) : null;
  const projectFolderSheets = <>
    {projectFolderMoveTarget ? <MoveProjectFolderSheet
      folders={projectFolders}
      currentFolderId={projectFolderMoveTarget.folderId ?? null}
      selectedFolderId={projectFolderMoveSelectedId}
      onSelectionChange={setProjectFolderMoveSelectedId}
      onConfirm={confirmProjectFolderMove}
      onCreateFolder={() => openProjectFolderCreate('move')}
      onClose={() => { if (!isMovingProjectFolder) setProjectFolderMoveTarget(null); }}
      pending={isMovingProjectFolder}
      covered={showProjectFolderCreate}
      error={projectFolderMoveError}
      returnFocusRef={projectFolderMoveReturnFocusRef}
    /> : null}
    {showProjectFolderCreate ? <CreateProjectFolderSheet
      name={projectFolderName}
      onNameChange={setProjectFolderName}
      onCreate={createProjectFolder}
      onClose={() => { if (!isCreatingProjectFolder) { setShowProjectFolderCreate(false); setProjectFolderCreateError(''); } }}
      pending={isCreatingProjectFolder}
      error={projectFolderCreateError}
      returnFocusRef={projectFolderCreateReturnFocusRef}
    /> : null}
  </>;
  const withAppOverlays = (content: ReactNode, includeConfirmDialog = false) => (
    <div className="h5-app-shell">
      <div className="h5-app-screen">{content}</div>
      <div className="h5-app-overlays">
        {shareDialogProject ? <ShareCommunityDialog project={shareDialogProject} tags={shareDialogTags} onTagsChange={setShareDialogTags} onConfirm={(tags) => { void confirmShareCommunity(tags); }} onClose={() => { if (!sharingProjectId) setShareDialogProject(null); }} isSaving={sharingProjectId === shareDialogProject.id} isShared={Boolean(shareDialogProject.sharedToCommunity)} /> : null}
        {projectActionSheet}
        {projectFolderSheets}
        {includeConfirmDialog ? confirmDialog : null}
        {loginModalFallback}
      </div>
    </div>
  );
  const projectActionSheet = projectActionTarget ? (() => {
    const target = projectActionTarget;
    const hasSession = Boolean(beadingSession?.projectId === target.id && beadingSession != null && ['in_progress', 'paused', 'pending_completion'].includes(beadingSession.status));
    return <>
      <ProjectActionSheet
      project={target}
      hasSession={hasSession}
      onClose={() => setProjectActionTarget(null)}
      onStart={() => { void startBeadingProject(target); }}
      onEdit={() => {
        setProjectActionTarget(null);
        openSavedProject(target);
      }}
      onShare={() => {
        void shareSavedProject(target);
        setProjectActionTarget(null);
      }}
      onMove={() => openProjectFolderMove(target)}
      onDelete={async () => {
        requestConfirm({
          title: '删除作品？',
          message: '删除后将同时放弃未完成的拼豆会话，且无法恢复。',
          confirmText: '删除作品',
          danger: true,
          onConfirm: async () => {
            try {
              await requestApi(`/projects/${target.id}`, { method: 'DELETE' });
              setRecentProjects((projects) => projects.filter((project) => project.id !== target.id));
              setProjectActionTarget((current) => current?.id === target.id ? null : current);
            } catch (error) {
              const requestError = error as RequestApiError;
              const invalidProjectError = requestError.status === 401 || requestError.status === 404 || requestError.code === 'NOT_FOUND';
              if (invalidProjectError) setProjectActionTarget((current) => current?.id === target.id ? null : current);
              setStatus(error instanceof Error ? error.message : '删除作品失败');
            }
          },
        });
      }}
      />
    </>;
  })() : null;

  if (screen === 'split' && uploadedSplitImage) {
    return withAppOverlays(<SplitSettingsPage
      splitMode={splitMode}
      setScreen={setScreen}
      setSplitMode={setSplitMode}
      uploadedSplitImage={uploadedSplitImage}
      splitImageScale={splitImageScale}
      splitImageOffset={splitImageOffset}
      handleSplitTouchStart={handleSplitTouchStart}
      handleSplitTouchMove={handleSplitTouchMove}
      handleSplitTouchEnd={handleSplitTouchEnd}
      handleSplitWheel={handleSplitWheel}
      handleSplitClick={handleSplitClick}
      handleSplitPointerDown={handleSplitPointerDown}
      handleSplitPointerMove={handleSplitPointerMove}
      handleSplitPointerEnd={handleSplitPointerEnd}
      activeSplitRows={activeSplitRows}
      activeSplitCols={activeSplitCols}
      alignedGrid={alignedGrid}
      gridFrameOrigin={gridFrameOrigin}
      handleGridHandlePointerDown={handleGridHandlePointerDown}
      handleGridHandlePointerMove={handleGridHandlePointerMove}
      handleGridHandlePointerEnd={handleGridHandlePointerEnd}
      updateSplitLongSide={updateSplitLongSide}
      splitLongSide={splitLongSide}
      minSplitLongSide={MIN_SPLIT_LONG_SIDE}
      maxSplitLongSide={maxQuickSplitLongSide}
      alignCellSize={alignCellSize}
      moveGridControlFrame={moveGridControlFrame}
      updateAlignCellSize={updateAlignCellSize}
      onNext={openSplitPreview}
    />);
  }

  if (screen === 'split-crop' && uploadedSplitImage) {
    return withAppOverlays(<SplitCropPage
      setScreen={setScreen}
      splitPreviewLoading={splitPreviewLoading}
      splitPreviewCells={splitPreviewCells}
      uploadedSplitImage={uploadedSplitImage}
      splitMode={splitMode}
      alignedGrid={flowAlignedGrid}
      splitImageScale={splitImageScale}
      onZoomStep={zoomSplitCropImage}
      onZoomChange={setSplitImageScale}
      onResetImageZoom={resetSplitCropImage}
      activeSplitCols={activeSplitCols}
      activeSplitRows={activeSplitRows}
      splitLoadingStage={splitLoadingStage}
      splitLoadingProgress={splitLoadingProgress}
      splitMergeThreshold={splitMergeThreshold}
      deferredSplitMergeThreshold={deferredSplitMergeThreshold}
      cropBounds={splitCropBounds}
      onCropBoundsChange={setSplitCropBounds}
      onConfirmCrop={confirmSplitCrop}
      onResetCrop={resetSplitCrop}
    />);
  }

  if (screen === 'split-preview' && uploadedSplitImage) {
    return withAppOverlays(<SplitPreviewPage
      setScreen={setScreen}
      splitPreviewLoading={splitPreviewLoading}
      splitMergeThreshold={splitMergeThreshold}
      setSplitMergeThreshold={setSplitMergeThreshold}
      deferredSplitMergeThreshold={deferredSplitMergeThreshold}
      splitPreviewCells={splitPreviewCells}
      importSplitToCanvas={importSplitToCanvas}
      activeSplitCols={activeSplitCols}
      activeSplitRows={activeSplitRows}
      splitLoadingStage={splitLoadingStage}
      splitLoadingProgress={splitLoadingProgress}
      splitColorList={splitColorList}
      backgroundRemoved={Boolean(uploadedSplitImage.backgroundRemoved)}
      isBackgroundProcessing={isBackgroundProcessing}
      onToggleBackground={toggleSplitBackground}
      backgroundSensitivity={uploadedSplitImage.backgroundSensitivity}
      onBackgroundSensitivityChange={updateSplitBackgroundSensitivity}
      setSplitPreviewTab={setSplitPreviewTab}
      splitPreviewTab={splitPreviewTab}
      previewCols={previewSplitSize.cols}
      previewRows={previewSplitSize.rows}
      onBackToCrop={returnToSplitCrop}
    />);
  }

  if (screen === 'canvas') {
    return withAppOverlays(<CanvasPage
      fileInputRef={fileInputRef}
      handleUpload={handleUpload}
      referenceInputRef={referenceInputRef}
      handleReferenceUpload={handleReferenceUpload}
      clearReferenceImage={clearReferenceImage}
      uploadedSplitImage={uploadedSplitImage}
      canRemoveGridBackground={Boolean(uploadedSplitImage || activeSavedProject)}
      isBackgroundProcessing={isBackgroundProcessing}
      onToggleBackground={toggleCanvasBackground}
      setScreen={setScreen}
      setShowSettings={setShowSettings}
      cols={cols}
      rows={rows}
      history={history}
      future={future}
      undo={undo}
      redo={redo}
      chooseReferenceImage={chooseReferenceImage}
      exportPatternPng={exportPatternPng}
      workMode={workMode}
      exportStl={exportStl}
      saveCurrentProject={saveCurrentProject}
      showSaveProjectModal={showSaveProjectModal}
      setShowSaveProjectModal={setShowSaveProjectModal}
      showSaveLoginPrompt={showSaveLoginPrompt}
      setShowSaveLoginPrompt={dismissSaveLoginPrompt}
      onLoginForSave={() => {
        setShowSaveLoginPrompt(false);
        requireLogin((nextToken) => void saveCurrentProject(nextToken));
      }}
      saveProjectName={saveProjectName}
      setSaveProjectName={setSaveProjectName}
      isSavingProject={isSavingProject}
      confirmSaveProject={confirmSaveProject}
      shareToCommunity={shareToCommunity}
      setShareToCommunity={setShareToCommunity}
      projectFolders={projectFolders}
      saveFolderId={saveFolderId}
      setSaveFolderId={setSaveFolderId}
      createProjectFolder={() => openProjectFolderCreate('save')}
      projectFolderSheetOpen={showProjectFolderCreate}
      activeProjectShared={Boolean(activeSavedProject?.sharedToCommunity)}
      selectedCode={selectedCode}
      selectedColor={selectedColor}
      showSettings={showSettings}
      cfgCols={cfgCols}
      setCfgCols={setCfgCols}
      cfgRows={cfgRows}
      setCfgRows={setCfgRows}
      parseGridSizeInput={parseGridSizeInput}
      normalizeGridSize={normalizeGridSize}
      fitView={fitView}
      handleResizeCanvas={handleResizeCanvas}
      canvasTools={canvasTools}
      tool={tool}
      setTool={setTool}
      handleCanvasPointerDownCapture={handleCanvasPointerDownCapture}
      handleCanvasPointerEndCapture={handleCanvasPointerEndCapture}
      setCanvasScale={setCanvasScale}
      canvasArtboardRef={canvasArtboardRef}
      cells={cells}
      canvasScale={canvasScale}
      getCode={colorCodeOf}
      getTextColor={colorCodeTextColor}
      handleCanvasKeyDown={handleCanvasKeyDown}
      handleCanvasPointerDown={handleCanvasPointerDown}
      handleCanvasPointerMove={handleCanvasPointerMove}
      handleCanvasPaintPointerEnd={handleCanvasPaintPointerEnd}
      handleCanvasClick={handleCanvasClick}
      referenceImage={referenceImage}
      isReferenceMinimized={isReferenceMinimized}
      setIsReferenceMinimized={setIsReferenceMinimized}
      closeReferenceImage={closeReferenceImage}
      status={status}
      prioritizedPaletteColors={prioritizedPaletteColors}
      selectPaletteColor={selectPaletteColor}
      showPaletteSearch={showPaletteSearch}
      setShowPaletteSearch={setShowPaletteSearch}
      paletteQuery={paletteQuery}
      setPaletteQuery={setPaletteQuery}
      filteredPaletteColors={filteredPaletteColors}
      showBeadList={showBeadList}
      setShowBeadList={setShowBeadList}
      beadListColors={beadListColors}
      totalBeads={totalBeads}
      onInventoryCheck={() => {
        const continueInventoryCheck = (token: string) => {
          if (activeSavedProject) void startBeadingProject(activeSavedProject, token);
          else saveCurrentProject(token);
        };
        if (authToken) continueInventoryCheck(authToken);
        else requireLogin(continueInventoryCheck);
      }}
      onStartBeading={() => {
        const continueBeading = (token: string) => {
          if (activeSavedProject) void startBeadingProject(activeSavedProject, token);
          else saveCurrentProject(token);
        };
        if (authToken) continueBeading(authToken);
        else requireLogin(continueBeading);
      }}
    />);
  }

  if (screen === 'beading' && beadingSession) {
    return withAppOverlays(<>
      <BeadingSessionPage
        session={beadingSession}
        cells={cells}
        rows={rows}
        cols={cols}
        getCode={colorCodeOf}
        onPatch={patchBeadingProgress}
        onPause={pauseBeading}
        onReturnToProgress={returnBeadingToProgress}
        onAbandon={abandonBeading}
        onPrepareCompletion={prepareBeadingCompletion}
        onComplete={completeBeading}
        onResume={resumeBeading}
        onOpenInventory={openBeadingInventory}
        onSessionConflict={(latest) => setBeadingSession(latest)}
        draftOwnerId={authUserId || undefined}
        legacyDraftOwnerId={legacyDraftOwnerId || undefined}
        onStatus={setStatus}
        onExit={() => setScreen('canvas')}
        status={status}
        requestConfirm={requestConfirm}
        confirmDialog={confirmDialog}
      />
      {beadingInventoryCheck ? <InventoryCheckSheet result={beadingInventoryCheck} warehouseId={beadingInventoryCheck.warehouseId || ''} warehouseOptions={warehouses} onWarehouseChange={(warehouseId) => { if (!beadingSession) return; void requestApi<any>(`/v1/beading-sessions/${beadingSession.id}/inventory-check`, { method: 'POST', body: JSON.stringify({ warehouseId: warehouseId || undefined }) }).then(setBeadingInventoryCheck).catch((error) => setStatus(error instanceof Error ? error.message : '库存检测失败')); }} onClose={() => setBeadingInventoryCheck(null)} onStart={enterBeadingSession} /> : null}
    </>);
  }

  if (screen === 'warehouse') {
    return withAppOverlays(<WarehouseListPage
      status={status}
      setActiveTab={setActiveTab}
      setScreen={setScreen}
      warehouses={warehouses}
      activeWarehouseId={activeWarehouseId}
      openWarehouseDetail={openWarehouseDetail}
      showWarehouseCreateModal={showWarehouseCreateModal}
      setShowWarehouseCreateModal={setShowWarehouseCreateModal}
      warehouseName={warehouseName}
      setWarehouseName={setWarehouseName}
      warehouseRemark={warehouseRemark}
      setWarehouseRemark={setWarehouseRemark}
      createWarehouse={createWarehouse}
      deleteWarehouse={deleteWarehouse}
      requestConfirm={requestConfirm}
      confirmDialog={confirmDialog}
    />);
  }

  if (screen === 'warehouse-detail') {
    return withAppOverlays(<WarehousePage
      status={status}
      setActiveTab={setActiveTab}
      setScreen={setScreen}
      activeWarehouse={activeWarehouse}
      stockedColorCount={stockedColorCount}
      totalWarehouseStock={totalWarehouseStock}
      missingColorCount={missingColorCount}
      activeWarehouseId={activeWarehouseId}
      warehouseLetters={WAREHOUSE_LETTERS}
      warehouseSearch={warehouseSearch}
      setWarehouseSearch={setWarehouseSearch}
      warehouseLetter={warehouseLetter}
      setWarehouseLetter={setWarehouseLetter}
      selectedWarehouseCodes={selectedWarehouseCodes}
      selectedWarehouseCount={selectedWarehouseCount}
      selectVisibleWarehouseColors={selectVisibleWarehouseColors}
      invertVisibleWarehouseColors={invertVisibleWarehouseColors}
      warehouseColors={warehouseColors}
      beadStock={beadStock}
      toggleWarehouseCode={toggleWarehouseCode}
      warehouseUnit={warehouseUnit}
      setWarehouseUnit={setWarehouseUnit}
      warehouseAmount={warehouseAmount}
      setWarehouseAmount={setWarehouseAmount}
      applyWarehouseChange={applyWarehouseChange}
      beadsPerGram={BEADS_PER_GRAM}
    />);
  }

  if (screen === 'pattern-detail') {
    return withAppOverlays(
      <PatternDetailPage
        pattern={activePattern ?? communityCards[0]}
        currentUserId={authUserId}
        isLoggedIn={isLoggedIn}
        comments={communityComments}
        isLoadingComments={isCommunityCommentsLoading}
        onLoadComments={() => activePattern && void loadCommunityComments(activePattern.id)}
        onOpenAuthor={() => activePattern && openAuthorProfile(activePattern, 'detail')}
        onLike={() => activePattern && void likeCommunityPost(activePattern.id)}
        onFollow={() => activePattern?.authorId && void toggleCommunityFollow(activePattern.authorId, Boolean(activePattern.isFollowing))}
        onShare={() => activePattern && void shareCommunityPost(activePattern.id)}
        onCopyToRepository={() => activePattern && void copyCommunityPattern(activePattern.id)}
        copyingToRepository={copyingPatternId === activePattern?.id}
        onComment={(content) => activePattern && void addCommunityComment(activePattern.id, content)}
        onReply={(commentId, content) => activePattern && void addCommunityComment(activePattern.id, content, commentId)}
        onDeleteComment={(commentId) => activePattern && void deleteCommunityComment(activePattern.id, commentId)}
        commentSubmitting={commentSubmitting}
        commentReplyPendingId={commentReplyPendingId}
        commentDeletePendingId={commentDeletePendingId}
        onLogin={() => setShowLoginModal(true)}
        onBack={() => {
          if (patternDetailBackTargetRef.current === 'author-profile') {
            setScreen('author-profile');
            return;
          }
          setScreen('home');
          setActiveTab('discover');
        }}
      />
    );
  }

  if (screen === 'author-profile') {
    return withAppOverlays(<AuthorProfilePage
        patterns={authorProfilePosts}
        authorPattern={activePattern ?? communityCards[0]}
        authorProfile={authorProfile ?? undefined}
        loading={isAuthorProfileLoading}
        error={authorProfileError}
        onRetry={() => activePattern?.authorId && void loadAuthorProfile(activePattern.authorId)}
        currentUserId={authUserId}
        onBack={() => {
          const returnTarget = authorProfileBackTargetRef.current;
          const returnToDetail = returnTarget === 'detail';
          if (returnToDetail && authorProfileReturnPatternRef.current) setActivePattern(authorProfileReturnPatternRef.current);
          setScreen(returnToDetail ? 'pattern-detail' : returnTarget === 'following' ? 'following' : returnTarget === 'followers' ? 'followers' : 'home');
          setActiveTab(returnTarget === 'discover' || returnTarget === 'detail' ? 'discover' : 'profile');
        }}
        onOpen={(pattern) => {
          patternDetailBackTargetRef.current = 'author-profile';
          setActivePattern(pattern);
          setScreen('pattern-detail');
        }}
        onFollow={() => activePattern?.authorId && void toggleCommunityFollow(activePattern.authorId, Boolean(authorProfile?.isFollowing ?? activePattern.isFollowing))}
      />);
  }

  if (screen === 'my-works') {
    return withAppOverlays(
      <MyWorksPage
        projects={sortedRecentProjects}
          onBack={() => { setScreen('home'); setActiveTab(myWorksBackTargetRef.current); }}
        onOpen={openProjectActions}
        folders={projectFolders}
        activeFolderId={activeProjectFolderId}
        onFolderChange={setActiveProjectFolderId}
        onCreateFolder={() => openProjectFolderCreate('my-works')}
        onDeleteFolder={deleteProjectFolder}
        actionSheet={null}
      />,
      true,
    );
  }

  if (screen === 'following') {
    return withAppOverlays(<FollowingPage
        users={followingUsers}
        loading={isFollowingLoading}
        error={followingError}
        onBack={() => { setScreen('home'); setActiveTab('profile'); }}
        onRetry={() => void loadFollowingUsers()}
        onOpenUser={(user) => openFollowUserProfile(user, 'following')}
      />);
  }

  if (screen === 'followers') {
    return withAppOverlays(<FollowersPage
        users={followersUsers}
        loading={isFollowersLoading}
        error={followersError}
        onBack={() => { setScreen('home'); setActiveTab('profile'); }}
        onRetry={() => void loadFollowersUsers()}
        onOpenUser={(user) => openFollowUserProfile(user, 'followers')}
      />);
  }

  return withAppOverlays(<HomeShellPage
    fileInputRef={fileInputRef} handleUpload={handleUpload} status={status} activeTab={activeTab}
    recentProjects={sortedRecentProjects} homeTemplateCards={homeTemplateCards} onOpenRecentProject={openProjectActions} actionSheet={null}
    openUpload={openUpload} isLoggedIn={isLoggedIn}
    loginName={loginName} setLoginName={setLoginName} loginPassword={loginPassword} setLoginPassword={setLoginPassword} submitLogin={submitLogin}
    isAuthenticating={isAuthenticating} showLoginModal={showLoginModal} setShowLoginModal={setShowLoginModal}
    showUploadModal={showUploadModal} closeUploadModal={closeUploadModal} showXhsInput={showXhsInput}
    setShowXhsInput={setShowXhsInput} xhsLink={xhsLink} setXhsLink={setXhsLink}
    xhsExtractedImages={xhsExtractedImages} isExtractingXhs={isExtractingXhs} chooseLocalDrawing={chooseLocalDrawing}
    extractXiaohongshuImage={extractXiaohongshuImage} importXhsImage={importXhsImage}
    showXhsImagePicker={showXhsImagePicker} closeXhsImagePicker={closeXhsImagePicker} isImportingXhsImage={isImportingXhsImage} xhsExtractedTitle={xhsExtractedTitle}
    xhsPreviewSrc={xhsPreviewSrc} usedColors={usedColors} colorCodeOf={colorCodeOf} quickTools={quickTools}
    showCreateCanvasModal={showCreateCanvasModal} setShowCreateCanvasModal={setShowCreateCanvasModal} openCreateCanvasModal={openCreateCanvasModal}
    openBlankCanvasCreation={openBlankCanvasCreation}
    cfgCols={cfgCols} setCfgCols={setCfgCols} cfgRows={cfgRows} setCfgRows={setCfgRows}
    normalizeGridSize={normalizeGridSize} parseGridSizeInput={parseGridSizeInput} createBlankCanvas={createBlankCanvas} requireLogin={requireLogin}
    setStatus={setStatus} patternListCards={communityCards} setActivePattern={setActivePattern} setScreen={setScreen} openAuthorProfile={openAuthorProfile}
    notifications={notifications} loadNotifications={loadNotifications} openNotification={openNotification}
    warehouses={warehouses} stockedColorCount={stockedColorCount} totalWarehouseStock={totalWarehouseStock}
    activeWarehouse={activeWarehouse} mardColors={MARD_221_COLORS} openWarehouse={openWarehouse}
    setActiveTab={setActiveTab} communitySort={communitySort} setCommunitySort={setCommunitySort}
    communityQuery={communityQuery} setCommunityQuery={setCommunityQuery}
    communitySelectedTags={communitySelectedTags} setCommunitySelectedTags={setCommunitySelectedTags} communityAvailableTags={communityAvailableTags}
    authRequestSeqRef={authRequestSeqRef} pendingAuthActionRef={pendingAuthActionRef}
    setIsAuthenticating={setIsAuthenticating} setIsLoggedIn={setIsLoggedIn} setAuthToken={setAuthToken}
    phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber} phoneCode={phoneCode} setPhoneCode={setPhoneCode}
    phonePassword={phonePassword} setPhonePassword={setPhonePassword}
    phoneConfirmPassword={phoneConfirmPassword} setPhoneConfirmPassword={setPhoneConfirmPassword}
    phoneAuthMode={phoneAuthMode} setPhoneAuthMode={switchPhoneAuthMode}
    phoneAgreement={phoneAgreement} setPhoneAgreement={setPhoneAgreement} phoneAuthError={phoneAuthError}
    phoneSending={phoneSending} phoneVerifying={phoneVerifying} phoneCountdown={phoneCountdown}
    sendPhoneCode={sendPhoneCode} submitPhoneLogin={submitPhoneLogin} submitPhoneRegister={submitPhoneRegister} closeLoginModal={closeLoginModal}
    logoutPhone={logoutPhone}
    confirmDialog={confirmDialog}
    requestConfirm={requestConfirm}
    profileAvatarUrl={profileAvatarUrl} receivedLikesCount={receivedLikesCount} followingCount={followingCount} followersCount={followersCount} showProfileEditModal={showProfileEditModal} openProfileEdit={openProfileEdit} openMyWorks={openMyWorks}
    profileEditModal={<ProfileEditModal
      profileEditName={profileEditName} setProfileEditName={setProfileEditName}
      profileEditAvatar={profileEditAvatar} profileEditError={profileEditError} profileEditSaving={profileEditSaving}
      profileAvatarInputRef={profileAvatarInputRef} chooseProfileAvatar={chooseProfileAvatar}
      saveProfile={saveProfile} closeProfileEdit={closeProfileEdit}
    />}
    showLogoutConfirm={showLogoutConfirm} setShowLogoutConfirm={setShowLogoutConfirm}
    recentProjectsRequestSeqRef={recentProjectsRequestSeqRef} inventoryRequestSeqRef={inventoryRequestSeqRef}
    setWarehouses={setWarehouses} activeWarehouseIdRef={activeWarehouseIdRef} setActiveWarehouseId={setActiveWarehouseId}
    setBeadStock={setBeadStock} setSelectedWarehouseCodes={setSelectedWarehouseCodes}
  />);
}

export default H5App;
