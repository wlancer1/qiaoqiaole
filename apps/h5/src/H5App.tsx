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
  cellsFromImage,
  cellsFromImageAsync,
  centeredAlignmentOffset,
  centeredGridControlOrigin,
  clampSplitImageScale,
  createBlankCells,
  fitSplitImageRect,
  getImageCrop,
  gridSizeFromAlignment,
  initialAlignCellSize,
  scaleRectFromCenter,
  touchDistance,
} from './canvas/H5CanvasPreview';
import { Icon } from './shared/h5Icons';
import {
  colorCodeOf,
  colorCodeTextColor,
  createBeadPatternCanvas,
  createBeadThumbnailCanvas,
  downloadBlob,
  downloadText,
  extractUrlFromText,
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
import { AuthorProfilePage, MyWorksPage, PatternDetailPage, PatternDiscoverPage, PatternMessagesPage } from './patterns/H5PatternPages';
import { quickTools } from './patterns/h5PatternData';
import { sortCommunityPosts, toPatternListCard, type CommunityComment, type CommunityNotification, type CommunityPost } from './community/communityData';
import { WarehousePage } from './pages/warehouse/WarehousePage';
import { WarehouseListPage } from './pages/warehouse/WarehouseListPage';
import { SplitCropPage, SplitPreviewPage, SplitSettingsPage } from './pages/split/SplitPages';
import { CanvasPage } from './pages/editor/CanvasPage';
import { BeadingSessionPage } from './pages/beading/BeadingSessionPage';
import { InventoryCheckSheet } from './pages/beading/InventoryCheckSheet';
import { ProjectActionSheet } from './pages/beading/ProjectActionSheet';
import type { BeadingSession, InventoryCheck } from './beading/beadingSessionClient';
import type { Complete, Prepare, Resume, SessionMutation, SessionTransition } from './pages/beading/useBeadingSessionActions';
import { HomeShellPage, PhoneLoginModal } from './pages/home/HomeShellPage';
import { createNonce, createRequestId, getPhoneDeviceId, normalizePhone, showTencentCaptcha, signWebSmsRequest } from './utils/phoneAuthClient';
import { passwordValidationMessage, validatePasswordLength } from './utils/passwordValidation';
import type {
  AlignedGrid,
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
  defaultSplitLongSideFromBounds,
  gridSizeFromSplitBounds,
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
  const [rows, setRows] = useState<number>(32);
  const [cols, setCols] = useState<number>(32);
  const [cells, setCells] = useState<Cell[]>(() => createBlankCells(32, 32));
  const [workMode, setWorkMode] = useState<WorkMode>('bead');
  const [selectedColor, setSelectedColor] = useState<string>(MARD_221_COLORS[0]?.hex ?? '#faf4c8');
  const [selectedCode, setSelectedCode] = useState<string>(MARD_221_COLORS[0]?.code ?? 'A1');
  const [tool, setTool] = useState<CanvasTool>('pan');
  const [status, setStatus] = useState('');
  const [history, setHistory] = useState<Cell[][]>([]);
  const [future, setFuture] = useState<Cell[][]>([]);
  const [showPaletteSearch, setShowPaletteSearch] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUserId, setAuthUserId] = useState('');
  const [loginName, setLoginName] = useState('');
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
  const [activeProjectId, setActiveProjectId] = useState('');
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([]);
  const [communityComments, setCommunityComments] = useState<CommunityComment[]>([]);
  const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
  const [isCommunityLoading, setIsCommunityLoading] = useState(false);
  const [isCommunityCommentsLoading, setIsCommunityCommentsLoading] = useState(false);
  const [communitySort, setCommunitySort] = useState<'hot' | 'latest'>('hot');
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
  const [sharingProjectId, setSharingProjectId] = useState('');
  const [shareFailedProjectIds, setShareFailedProjectIds] = useState<Set<string>>(() => new Set());
  const [showBeadList, setShowBeadList] = useState(false);
  const [beadingSession, setBeadingSession] = useState<BeadingSession | null>(null);
  const [beadingInventoryCheck, setBeadingInventoryCheck] = useState<InventoryCheck | null>(null);
  const [projectActionTarget, setProjectActionTarget] = useState<RecentProject | null>(null);
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
  const [showBlankCanvasOption, setShowBlankCanvasOption] = useState(false);
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
  const authRequestSeqRef = useRef(0);
  const activeWarehouseIdRef = useRef('');
  const communityPostsRequestSeqRef = useRef(0);
  const communityCommentsRequestSeqRef = useRef(0);
  const inventoryRequestSeqRef = useRef(0);
  const recentProjectsRequestSeqRef = useRef(0);
  const saveProjectInFlightRef = useRef(false);
  const saveAndStartRef = useRef(false);
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

  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);

  useEffect(() => {
    activeWarehouseIdRef.current = activeWarehouseId;
  }, [activeWarehouseId]);

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
        setAuthToken(stored.token);
        setAuthUserId(payload.user.id || stored.userId || '');
        setLoginName(payload.user.username || payload.user.nickname || stored.username || '');
        setIsLoggedIn(true);
        await loadRecentProjects(stored.token);
        await loadCommunityPosts('hot', stored.token);
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
    setStatus(`已选择色号 ${color.code}。`);
  };

  const fitView = () => {
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
    setStatus('已重置并居中视图。');
  };

  const openUpload = (nextMode: WorkMode, includeBlankCanvas = false) => {
    xhsRequestSeqRef.current += 1;
    setWorkMode(nextMode);
    setActiveTab('home');
    setShowBlankCanvasOption(includeBlankCanvas);
    setShowUploadModal(true);
    setShowXhsInput(false);
    setXhsLink('');
    setXhsExtractedTitle('');
    setXhsExtractedImages([]);
  };

  const closeUploadModal = () => {
    xhsRequestSeqRef.current += 1;
    xhsImportSeqRef.current += 1;
    setShowUploadModal(false);
    setShowBlankCanvasOption(false);
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

  const requestApi = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 401 ? '登录状态已失效，请重新登录' : body.message || '请求失败';
      throw Object.assign(new Error(message), { status: response.status, code: body.error || body.code, body });
    }
    return body as T;
  };

  const loadRecentProjects = async (token: string) => {
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
    } catch (error) {
      if (recentProjectsRequestSeqRef.current !== requestSeq) return;
      setRecentProjects([]);
      setStatus(error instanceof Error ? error.message : '最近项目读取失败');
    }
  };

  const loadCommunityPosts = async (sort: 'hot' | 'latest' = communitySort, token = authToken) => {
    const requestSeq = communityPostsRequestSeqRef.current + 1;
    communityPostsRequestSeqRef.current = requestSeq;
    setIsCommunityLoading(true);
    try {
      const allPosts: CommunityPost[] = [];
      let page = 1;
      const pageSize = 50;
      while (page <= 20) {
        const payload = await requestApi<{ posts: CommunityPost[] }>(`/community/posts?sort=${sort}&page=${page}&pageSize=${pageSize}`, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        });
        allPosts.push(...payload.posts);
        if (payload.posts.length < pageSize) break;
        page += 1;
      }
      if (communityPostsRequestSeqRef.current !== requestSeq) return;
      setCommunityPosts(sort === 'hot' ? sortCommunityPosts(allPosts) : allPosts);
    } catch (error) {
      if (communityPostsRequestSeqRef.current !== requestSeq) return;
      setCommunityPosts([]);
      setStatus(error instanceof Error ? error.message : '社区稿件读取失败');
    } finally {
      if (communityPostsRequestSeqRef.current === requestSeq) setIsCommunityLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'home' || activeTab === 'discover') {
      void loadCommunityPosts(activeTab === 'discover' ? communitySort : 'hot', authToken);
    }
  }, [activeTab, authToken, communitySort]);

  const communityCards = useMemo(() => communityPosts.map(toPatternListCard), [communityPosts]);
  const homeTemplateCards = useMemo(() => communityCards.slice(0, 3), [communityCards]);

  const loadCommunityComments = async (projectId: string) => {
    const requestSeq = communityCommentsRequestSeqRef.current + 1;
    communityCommentsRequestSeqRef.current = requestSeq;
    setCommunityComments([]);
    setIsCommunityCommentsLoading(true);
    try {
      const payload = await requestApi<{ comments: CommunityComment[] }>(`/community/posts/${projectId}/comments`);
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

  const loadNotifications = async (token = authToken) => {
    if (!token) {
      setNotifications([]);
      return;
    }
    try {
      const payload = await requestApi<{ notifications: CommunityNotification[] }>('/notifications', {
        headers: { authorization: `Bearer ${token}` },
      });
      setNotifications(payload.notifications || []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '消息读取失败');
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
      const payload = await requestApi<{ following: boolean }>(`/community/users/${authorId}/follow`, {
        method: currentlyFollowing ? 'DELETE' : 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      setCommunityPosts((posts) => posts.map((post) => post.authorId === authorId ? { ...post, isFollowing: payload.following } : post));
      setActivePattern((pattern) => pattern?.authorId === authorId ? { ...pattern, isFollowing: payload.following } : pattern);
      setStatus(payload.following ? '已关注作者。' : '已取消关注。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '关注操作失败');
    }
  };

  const addCommunityComment = async (projectId: string, content: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void addCommunityComment(projectId, content, nextToken));
      return;
    }
    try {
      const payload = await requestApi<{ comment: CommunityComment }>(`/community/posts/${projectId}/comments`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ content }),
      });
      setCommunityComments((comments) => [payload.comment, ...comments]);
      setCommunityPosts((posts) => posts.map((post) => post.id === projectId ? { ...post, commentsCount: post.commentsCount + 1 } : post));
      setActivePattern((pattern) => pattern?.id === projectId ? { ...pattern, comments: String(pattern.commentsCount + 1), commentsCount: pattern.commentsCount + 1 } : pattern);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '评论发布失败');
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
      setShowSaveLoginPrompt(true);
      return;
    }
    const sourceName = uploadedSplitImage?.name?.replace(/\.[^/.]+$/, '').trim();
    setSaveProjectName((activeSavedProject?.name || sourceName || `空白画布 ${cols} × ${rows}`).slice(0, 30));
    setShareToCommunity(Boolean(activeSavedProject?.sharedToCommunity));
    setShowSaveProjectModal(true);
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
        setStatus('分享面板已打开。');
      } else if (shareApi.clipboard) {
        await shareApi.clipboard.writeText(shareUrl);
        setStatus('分享链接已复制。');
      } else {
        setStatus('当前浏览器不支持分享，请复制页面地址。');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('已取消分享。');
      } else {
        setStatus(error instanceof Error ? error.message : '分享失败，请稍后重试。');
      }
    }
  };

  const downloadCommunityPattern = (projectId: string, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => downloadCommunityPattern(projectId, nextToken));
      return;
    }
    const pattern = activePattern?.id === projectId ? activePattern : communityCards.find((item) => item.id === projectId);
    const image = pattern?.detailImage || pattern?.image;
    if (!image) {
      setStatus('该图纸暂无可下载的预览图。');
      return;
    }
    const link = document.createElement('a');
    link.href = image;
    link.download = (pattern?.title || '拼豆图纸') + '.png';
    link.rel = 'noopener';
    link.click();
    setStatus('图纸下载已开始。');
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
    setStatus(restoredCells ? `已打开作品：${project.name}。` : `已打开作品：${project.name}，旧作品未保存画布快照。`);
  };

  const startBeadingProject = async (project: RecentProject, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void startBeadingProject(project, nextToken));
      return;
    }
    setProjectActionTarget(null);
    openSavedProject(project);
    try {
      setStatus('正在准备拼豆会话。');
      const sessionPayload = await requestApi<{ session: BeadingSession }>(`/v1/projects/${project.id}/beading-session`, { method: 'POST', body: JSON.stringify({ warehouseId: activeWarehouseId || undefined }) });
      const inventory = await requestApi<any>(`/v1/beading-sessions/${sessionPayload.session.id}/inventory-check`, { method: 'POST', body: JSON.stringify({}) });
      setBeadingSession(sessionPayload.session);
      setBeadingInventoryCheck(inventory);
      setScreen('beading');
      setStatus('库存检测完成，缺豆也可以继续拼豆。');
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
      setStatus(payload.deducted ? '已完成拼豆并扣减库存。' : '已完成拼豆，库存未扣减。');
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

  const confirmSaveProject = async () => {
    if (isSavingProject || saveProjectInFlightRef.current) return;
    const name = saveProjectName.trim().slice(0, 30);
    if (!name) {
      setStatus('请输入设计稿名称。');
      return;
    }
    saveProjectInFlightRef.current = true;
    setIsSavingProject(true);
    try {
      setStatus('正在上传作品图片。');
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
        saveAndStartRef.current = false;
        return;
      }
      const shouldStartBeading = saveAndStartRef.current;
      saveAndStartRef.current = false;
      if (shareToCommunity && !saved.sharedToCommunity) {
        try {
          await requestApi(`/projects/${saved.id}/share`, { method: 'POST' });
          setRecentProjects((projects) => projects.map((project) => project.id === saved.id ? { ...project, sharedToCommunity: true, sharedAt: new Date().toISOString() } : project));
          await loadCommunityPosts('hot');
          setStatus('作品已保存并分享到社区。');
        } catch (error) {
          setStatus(error instanceof Error ? `${error.message}，作品已保存，可稍后重试分享。` : '分享失败，作品已保存，可稍后重试分享。');
        }
      }
      setShowSaveProjectModal(false);
      if (!shareToCommunity || saved.sharedToCommunity) setStatus(saved.sharedToCommunity ? '已保存，社区分享状态保持不变。' : '已保存到我的作品。');
      if (shouldStartBeading) await startBeadingProject(saved);
   } catch (error) {
      saveAndStartRef.current = false;
     setStatus(error instanceof Error ? error.message : '作品保存失败，请稍后重试。');
    } finally {
      saveProjectInFlightRef.current = false;
      setIsSavingProject(false);
    }
  };

  const saveAndStartProject = () => {
    saveAndStartRef.current = true;
    saveCurrentProject();
  };

  const shareSavedProject = async (project: RecentProject, token = authToken) => {
    if (!token) {
      requireLogin((nextToken) => void shareSavedProject(project, nextToken));
      return;
    }
    if (project.sharedToCommunity || sharingProjectId) return;
    setSharingProjectId(project.id);
    try {
      const payload = await requestApi<{ sharedAt: string }>(`/projects/${project.id}/share`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      setRecentProjects((projects) => projects.map((item) => (
        item.id === project.id ? { ...item, sharedToCommunity: true, sharedAt: payload.sharedAt } : item
      )));
      setShareFailedProjectIds((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });
      await loadCommunityPosts('hot');
      setStatus('作品已分享到社区。');
    } catch (error) {
      setShareFailedProjectIds((current) => new Set(current).add(project.id));
      setStatus(error instanceof Error ? `${error.message}，可在我的作品中重试分享。` : '分享失败，可在我的作品中重试分享。');
    } finally {
      setSharingProjectId('');
    }
  };

  const loadWarehouses = async (token = authToken) => {
    if (!token) return;
    const payload = await fetch(`${API_BASE}/warehouses`, {
      headers: { authorization: `Bearer ${token}` },
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || '仓库读取失败');
      return data as { warehouses: Warehouse[] };
    });
    setWarehouses(payload.warehouses);
    if (!activeWarehouseId && payload.warehouses[0]) {
      activeWarehouseIdRef.current = payload.warehouses[0].id;
      setActiveWarehouseId(payload.warehouses[0].id);
      await loadInventory(payload.warehouses[0].id, token);
    }
  };

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
      const payload = await requestApi<{ token: string; user: { id: string; username: string } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (authRequestSeqRef.current !== requestSeq || !showLoginModal) return;
      setAuthToken(payload.token);
      setAuthUserId(payload.user.id);
      setLoginName(payload.user.username);
      setIsLoggedIn(true);
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: payload.token, username: payload.user.username, userId: payload.user.id }));
      setShowLoginModal(false);
      setLoginPassword('');
      setStatus(`登录成功：${payload.user.username}。`);
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
      setStatus('验证码已发送，请注意查收短信。');
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
      const data = payload.data as { accessToken: string; user: { nickname?: string; id: string } };
      setAuthToken(data.accessToken);
      setAuthUserId(data.user.id);
      setLoginName(data.user.nickname || '我的创作');
      setIsLoggedIn(true);
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: data.accessToken, username: data.user.nickname || '我的创作', userId: data.user.id }));
      setShowLoginModal(false);
      setPhoneCode('');
      setPhonePassword('');
      setPhoneConfirmPassword('');
      setPhoneSmsRequestId('');
      setPhoneChallenge(null);
      setStatus(data.user.nickname ? `登录成功：${data.user.nickname}。` : '登录成功。');
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
    setIsLoggedIn(false);
    setLoginName('');
    setRecentProjects([]);
    setCommunityPosts([]);
    setCommunityComments([]);
    setNotifications([]);
    setWarehouses([]);
    setBeadStock({});
    pendingAuthActionRef.current = null;
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    setShowLogoutConfirm(false);
    setStatus('已退出登录。');
  };

  const openWarehouse = () => {
    requireLogin(() => {
      setScreen('warehouse');
      setStatus('已进入豆子仓库。');
    });
  };

  const openWarehouseDetail = (warehouseId: string) => {
    activeWarehouseIdRef.current = warehouseId;
    setActiveWarehouseId(warehouseId);
    setSelectedWarehouseCodes([]);
    setScreen('warehouse-detail');
    void loadInventory(warehouseId);
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

  const applyWarehouseChange = async (direction: 'in' | 'out') => {
    if (selectedWarehouseCodes.length === 0) {
      setStatus('请先选择需要操作的色号。');
      return;
    }
    if (!authToken) {
      setStatus('请先登录。');
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
      setStatus(`${direction === 'in' ? '已入库' : '已出库'} ${selectedWarehouseCodes.length} 个色号，每色 ${beadCount} 颗。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '库存操作失败');
    }
  };

  const createWarehouse = async () => {
    const name = warehouseName.trim();
    if (!name) {
      setStatus('请输入仓库名称。');
      return;
    }
    if (!authToken) {
      setStatus('请先登录。');
      return;
    }
    try {
      const payload = await requestApi<{ warehouse: Warehouse }>('/warehouses', {
        method: 'POST',
        body: JSON.stringify({ name, remark: warehouseRemark }),
      });
      setWarehouses((items) => [payload.warehouse, ...items]);
      activeWarehouseIdRef.current = payload.warehouse.id;
      setActiveWarehouseId(payload.warehouse.id);
      setBeadStock({});
      setSelectedWarehouseCodes([]);
      setShowWarehouseCreateModal(false);
      setStatus(`已创建仓库：${payload.warehouse.name}。`);
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
      setStatus('仓库已删除。');
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
    setStatus(`已创建 ${nextCols} x ${nextRows} 空白画布。`);
  };

  const commitCells = (nextCells: Cell[], nextStatus?: string) => {
    setCells((current) => {
      if (sameCells(current, nextCells)) {
        return current;
      }
      setHistory((items) => [...items.slice(-24), current]);
      setFuture([]);
      return nextCells;
    });
    if (nextStatus) setStatus(nextStatus);
  };

  const undo = () => {
    setHistory((items) => {
      if (items.length === 0) return items;
      const previous = items[items.length - 1];
      setFuture((futureItems) => [cells, ...futureItems]);
      setCells(previous);
      setStatus('已撤销上一步。');
      return items.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((items) => {
      if (items.length === 0) return items;
      const [next, ...remaining] = items;
      setHistory((historyItems) => [...historyItems, cells]);
      setCells(next);
      setStatus('已重做。');
      return remaining;
    });
  };

  const updateSplitLongSide = (value: number) => {
    const nextLongSide = clampSplitLongSide(value);
    if (nextLongSide === splitLiveLongSideRef.current) return;
    splitLiveLongSideRef.current = nextLongSide;
    setSplitLongSide(nextLongSide);
    if (!uploadedSplitImage) return;
    const nextSize = gridSizeFromSplitBounds(uploadedSplitImage.crop.width, uploadedSplitImage.crop.height, nextLongSide);
    setSplitRows(nextSize.rows);
    setSplitCols(nextSize.cols);
    setStatus(`分割数量已调整为 ${nextSize.cols} x ${nextSize.rows}。`);
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
    if (!options.silent) setStatus(`格距已调整为 ${nextCellSize.toFixed(1)}px。`);
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
    setStatus(`已导入画布：${previewSplitSize.cols} x ${previewSplitSize.rows}。`);
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
    const size = cropSize(splitCropBounds);
    setIsSplitCropped(true);
    setIsSplitCropStep(false);
    setSplitPreviewLoading(true);
    setSplitLoadingStage('正在生成像素图...');
    setSplitLoadingProgress(15);
    setScreen('split-preview');
    setStatus(`已裁剪为 ${size.cols} x ${size.rows} 格。`);
  };

  const returnToSplitCrop = () => {
    setIsSplitCropStep(true);
    setIsSplitCropped(false);
    setSplitPreviewLoading(false);
    setScreen(splitPreviewBackTarget());
  };

  const loadSplitImage = (name: string, imageData: ImageData): number => {
    const crop = getImageCrop(imageData);
    const url = imageDataToUrl(imageData);
    const defaultLongSide = defaultSplitLongSideFromBounds(crop.width, crop.height);
    const { rows: defaultRows, cols: defaultCols } = gridSizeFromSplitBounds(crop.width, crop.height, defaultLongSide);
    setUploadedSplitImage({ name, imageData, crop, url });
    setActiveProjectId('');
    setSplitMode('quick');
    setSplitLongSide(defaultLongSide);
    setSplitRows(defaultRows);
    setSplitCols(defaultCols);
    setSplitMergeThreshold(0);
    setSplitPreviewTab('settings');
    setLockedAlignedGrid(null);
    const defaultCellSize = initialAlignCellSize(crop, defaultCols, defaultRows);
    const defaultOffset = centeredAlignmentOffset(crop, defaultCellSize);
    splitLiveAlignCellSizeRef.current = defaultCellSize;
    splitLiveAlignOffsetRef.current = defaultOffset;
    const defaultFrameOrigin = centeredGridControlOrigin(crop, defaultCellSize, defaultOffset);
    splitLiveGridFrameOriginRef.current = defaultFrameOrigin;
    setAlignCellSize(defaultCellSize);
    setAlignOffsetX(defaultOffset.x);
    setAlignOffsetY(defaultOffset.y);
    setGridFrameOrigin(defaultFrameOrigin);
    setSplitImageScale(1);
    updateSplitImageOffset({ x: 0, y: 0 });
    splitImagePinchRef.current.active = false;
    setHistory([]);
    setFuture([]);
    setScreen('split');
    return defaultLongSide;
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
      const sourceImageDataUrl = await fileToDataUrl(file);
      setUploadedSourceImageDataUrl(sourceImageDataUrl);
      const defaultLongSide = loadSplitImage(file.name, imageData);
      setStatus(`已载入 ${file.name}，默认长边 ${defaultLongSide} 格。`);
    } catch {
      setStatus('图片读取失败，请换一张图片。');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
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
    setStatus(`已载入参考图：${file.name}。`);
    if (referenceInputRef.current) referenceInputRef.current.value = '';
  };

  const closeReferenceImage = () => {
    clearReferenceImage();
    setStatus('已关闭参考图。');
  };

  const extractXiaohongshuImage = async () => {
    if (!isLoggedIn) {
      requireLogin(() => setShowXhsInput(true));
      return;
    }
    const url = extractUrlFromText(xhsLink);
    if (!url || !/xiaohongshu\.com|xhslink\.com/i.test(url)) {
      setStatus('请输入有效的小红书链接。');
      return;
    }
    const requestSeq = xhsRequestSeqRef.current + 1;
    xhsRequestSeqRef.current = requestSeq;
    setIsExtractingXhs(true);
    setXhsExtractedImages([]);
    setStatus('正在提取小红书图片。');
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
      setStatus(`已提取 ${images.length} 张图片，请选择一张导入。`);
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
    try {
      setStatus('正在载入小红书图片。');
      let source = image.imageDataUrl || '';
      if (!source && image.imageUrl) {
        const payload = await requestApi<{ imageDataUrl: string }>('/xiaohongshu/image', {
          method: 'POST',
          body: JSON.stringify({ imageUrl: image.imageUrl }),
        });
        source = payload.imageDataUrl;
      }
      const imageData = await loadImageDataFromUrl(source);
      if (xhsImportSeqRef.current !== requestSeq || !showUploadModal) return;
      setUploadedSourceImageDataUrl(source);
      const defaultLongSide = loadSplitImage(safeImageFilename(title || 'xiaohongshu-drawing', 'image/png'), imageData);
      setShowUploadModal(false);
      setShowXhsInput(false);
      setXhsLink('');
      setXhsExtractedTitle('');
      setXhsExtractedImages([]);
      setStatus(`已载入 ${title || '小红书图纸'}，默认长边 ${defaultLongSide} 格。`);
    } catch {
      if (xhsImportSeqRef.current !== requestSeq) return;
      setStatus('小红书图片读取失败，请换一张图片。');
    }
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
        setStatus(`已吸取 ${colorCodeOf(cell.color)}。`);
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
        setStatus(`当前区域已经是 ${selectedCode}。`);
        return;
      }
      commitCells(nextCells, `已填充 ${selectedCode}。`);
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
      setStatus('已导出拼豆图纸 PNG。');
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
    commitCells(newCells, `已调整画布为 ${nextCols} x ${nextRows}。`);
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
    saveAndStartRef.current = false;
    setShowLoginModal(false);
  };
  const dismissSaveLoginPrompt = () => {
    saveAndStartRef.current = false;
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
  const withLoginModalFallback = (content: ReactNode) => (
    <>
      {content}
      {loginModalFallback}
    </>
  );

  if (screen === 'split' && uploadedSplitImage) {
    return <SplitSettingsPage
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
      maxSplitLongSide={MAX_SPLIT_LONG_SIDE}
      alignCellSize={alignCellSize}
      moveGridControlFrame={moveGridControlFrame}
      updateAlignCellSize={updateAlignCellSize}
      onNext={openSplitPreview}
    />;
  }

  if (screen === 'split-crop' && uploadedSplitImage) {
    return <SplitCropPage
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
    />;
  }

  if (screen === 'split-preview' && uploadedSplitImage) {
    return <SplitPreviewPage
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
      setSplitPreviewTab={setSplitPreviewTab}
      splitPreviewTab={splitPreviewTab}
      previewCols={previewSplitSize.cols}
      previewRows={previewSplitSize.rows}
      onBackToCrop={returnToSplitCrop}
    />;
  }

  if (screen === 'canvas') {
    return <CanvasPage
      fileInputRef={fileInputRef}
      handleUpload={handleUpload}
      referenceInputRef={referenceInputRef}
      handleReferenceUpload={handleReferenceUpload}
      clearReferenceImage={clearReferenceImage}
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
      saveAndStartProject={saveAndStartProject}
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
      onInventoryCheck={() => { if (activeSavedProject) void startBeadingProject(activeSavedProject); else saveCurrentProject(); }}
      onStartBeading={() => { if (activeSavedProject) void startBeadingProject(activeSavedProject); else saveCurrentProject(); }}
    />;
  }

  if (screen === 'beading' && beadingSession) {
    return <>
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
        onStatus={setStatus}
        onExit={() => setScreen('canvas')}
        status={status}
      />
      {beadingInventoryCheck ? <InventoryCheckSheet result={beadingInventoryCheck} warehouseId={beadingInventoryCheck.warehouseId || ''} warehouseOptions={warehouses} onWarehouseChange={(warehouseId) => { if (!beadingSession) return; void requestApi<any>(`/v1/beading-sessions/${beadingSession.id}/inventory-check`, { method: 'POST', body: JSON.stringify({ warehouseId: warehouseId || undefined }) }).then(setBeadingInventoryCheck).catch((error) => setStatus(error instanceof Error ? error.message : '库存检测失败')); }} onClose={() => setBeadingInventoryCheck(null)} onStart={enterBeadingSession} /> : null}
    </>;
  }

  if (screen === 'warehouse') {
    return <WarehouseListPage
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
    />;
  }

  if (screen === 'warehouse-detail') {
    return <WarehousePage
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
    />;
  }

  if (screen === 'pattern-detail') {
    return withLoginModalFallback(
      <PatternDetailPage
        pattern={activePattern ?? communityCards[0]}
        isLoggedIn={isLoggedIn}
        comments={communityComments}
        isLoadingComments={isCommunityCommentsLoading}
        onLoadComments={() => activePattern && void loadCommunityComments(activePattern.id)}
        onLike={() => activePattern && void likeCommunityPost(activePattern.id)}
        onFollow={() => activePattern?.authorId && void toggleCommunityFollow(activePattern.authorId, Boolean(activePattern.isFollowing))}
        onShare={() => activePattern && void shareCommunityPost(activePattern.id)}
        onDownload={() => activePattern && downloadCommunityPattern(activePattern.id)}
        onComment={(content) => activePattern && void addCommunityComment(activePattern.id, content)}
        onLogin={() => setShowLoginModal(true)}
        onBack={() => {
          setScreen('home');
          setActiveTab('discover');
        }}
      />
    );
  }

  if (screen === 'author-profile') {
    return (
      <AuthorProfilePage
        patterns={communityCards}
        authorPattern={activePattern ?? communityCards[0]}
        onBack={() => {
          setScreen('home');
          setActiveTab('discover');
        }}
        onOpen={(pattern) => {
          setActivePattern(pattern);
          setScreen('pattern-detail');
        }}
        onFollow={() => activePattern?.authorId && void toggleCommunityFollow(activePattern.authorId, Boolean(activePattern.isFollowing))}
      />
    );
  }

  if (screen === 'my-works') {
    return (
      <MyWorksPage
        projects={sortedRecentProjects}
        onBack={() => { setScreen('home'); setActiveTab('home'); }}
        onOpen={(project) => setProjectActionTarget(project)}
        onShare={shareSavedProject}
        sharingProjectId={sharingProjectId}
        shareFailedProjectIds={shareFailedProjectIds}
        actionSheet={projectActionTarget ? <ProjectActionSheet project={projectActionTarget} hasSession={Boolean(beadingSession?.projectId === projectActionTarget.id && ['in_progress', 'paused', 'pending_completion'].includes(beadingSession.status))} onClose={() => setProjectActionTarget(null)} onStart={() => { void startBeadingProject(projectActionTarget); }} onEdit={() => { setProjectActionTarget(null); openSavedProject(projectActionTarget); }} onShare={() => { void shareSavedProject(projectActionTarget); setProjectActionTarget(null); }} onDelete={async () => { if (!window.confirm('删除后将同时放弃未完成的拼豆会话，确定删除吗？')) return; try { await requestApi(`/projects/${projectActionTarget.id}`, { method: 'DELETE' }); setRecentProjects((projects) => projects.filter((project) => project.id !== projectActionTarget.id)); setProjectActionTarget(null); setStatus('作品已删除。'); } catch (error) { setStatus(error instanceof Error ? error.message : '删除作品失败'); } }} /> : null}
      />
    );
  }

  return withLoginModalFallback(<HomeShellPage
    fileInputRef={fileInputRef} handleUpload={handleUpload} status={status} activeTab={activeTab}
    recentProjects={sortedRecentProjects} homeTemplateCards={homeTemplateCards} onOpenRecentProject={openSavedProject}
    openUpload={openUpload} isLoggedIn={isLoggedIn}
    loginName={loginName} setLoginName={setLoginName} loginPassword={loginPassword} setLoginPassword={setLoginPassword} submitLogin={submitLogin}
    isAuthenticating={isAuthenticating} showLoginModal={showLoginModal} setShowLoginModal={setShowLoginModal}
    showUploadModal={showUploadModal} showBlankCanvasOption={showBlankCanvasOption} closeUploadModal={closeUploadModal} showXhsInput={showXhsInput}
    setShowXhsInput={setShowXhsInput} xhsLink={xhsLink} setXhsLink={setXhsLink}
    xhsExtractedImages={xhsExtractedImages} isExtractingXhs={isExtractingXhs} chooseLocalDrawing={chooseLocalDrawing}
    extractXiaohongshuImage={extractXiaohongshuImage} importXhsImage={importXhsImage}
    xhsPreviewSrc={xhsPreviewSrc} usedColors={usedColors} colorCodeOf={colorCodeOf} quickTools={quickTools}
    showCreateCanvasModal={showCreateCanvasModal} setShowCreateCanvasModal={setShowCreateCanvasModal} openCreateCanvasModal={openCreateCanvasModal}
    openBlankCanvasCreation={openBlankCanvasCreation}
    cfgCols={cfgCols} setCfgCols={setCfgCols} cfgRows={cfgRows} setCfgRows={setCfgRows}
    normalizeGridSize={normalizeGridSize} parseGridSizeInput={parseGridSizeInput} createBlankCanvas={createBlankCanvas} requireLogin={requireLogin}
    setStatus={setStatus} patternListCards={communityCards} setActivePattern={setActivePattern} setScreen={setScreen}
    notifications={notifications} loadNotifications={loadNotifications} openNotification={openNotification}
    warehouses={warehouses} stockedColorCount={stockedColorCount} totalWarehouseStock={totalWarehouseStock}
    activeWarehouse={activeWarehouse} mardColors={MARD_221_COLORS} openWarehouse={openWarehouse}
    setActiveTab={setActiveTab} communitySort={communitySort} setCommunitySort={setCommunitySort}
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
    showLogoutConfirm={showLogoutConfirm} setShowLogoutConfirm={setShowLogoutConfirm}
    recentProjectsRequestSeqRef={recentProjectsRequestSeqRef} inventoryRequestSeqRef={inventoryRequestSeqRef}
    setWarehouses={setWarehouses} activeWarehouseIdRef={activeWarehouseIdRef} setActiveWarehouseId={setActiveWarehouseId}
    setBeadStock={setBeadStock} setSelectedWarehouseCodes={setSelectedWarehouseCodes}
  />);
}

export default H5App;
