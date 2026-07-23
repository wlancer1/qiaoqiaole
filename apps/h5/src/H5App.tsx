import { useEffect, useMemo, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent, useTransformEffect } from 'react-zoom-pan-pinch';
import {
  buildCellsFromSamples,
  buildModelParts,
  bucketFill,
  cropTransparentBounds,
  DEFAULT_SETTINGS,
  MARD_221_COLORS,
  MARD_221_HEX,
  nearestPaletteColor,
  replaceCell,
  sampleDominantColor,
  serializeAsciiStl,
  type Cell,
} from '@qiaoqiaole/core';
import { filterPaletteByQuery, filterPaletteByUsage } from './palette';

type AppScreen = 'home' | 'profile' | 'split' | 'split-preview' | 'canvas' | 'warehouse';
type CanvasKind = 'image' | 'grid';
type CanvasTool = 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'pan';
type WorkMode = 'bead' | 'peg';
type SplitMode = 'quick' | 'align';
type GridHandle = 'move' | 'scale';
type GridHandlePosition = { x: number; y: number };
type WarehouseUnit = 'count' | 'gram';
type Warehouse = { id: string; name: string; remark: string; colorSystem: string };
type XhsExtractedImage = { imageUrl?: string; imageDataUrl?: string };
type ReferenceImage = { name: string; url: string };
type IconName =
  | 'bell'
  | 'brush'
  | 'eraser'
  | 'eyedropper'
  | 'fill'
  | 'folder'
  | 'help'
  | 'home'
  | 'layers'
  | 'plus'
  | 'profile'
  | 'settings'
  | 'upload'
  | 'hand'
  | 'crop'
  | 'shape'
  | 'spark';

const MAX_IMAGE_SIDE = 4096;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_AUTO_GRID_SIDE = 120;
const DEFAULT_SPLIT_LONG_SIDE = 18;
const EMPTY_COLOR = '#ffffff';
const WHITE_BEAD_COLOR = nearestPaletteColor(255, 255, 255, MARD_221_HEX);
const BEADS_PER_GRAM = 15;
const WAREHOUSE_LETTERS = ['全部', ...Array.from(new Set(MARD_221_COLORS.map((color) => color.code.charAt(0))))];
const API_BASE = '/api';
const STATUS_VISIBLE_MS = 2800;
const STICKY_STATUS_PREFIXES = ['正在'];

type UploadedSplitImage = {
  name: string;
  imageData: ImageData;
  crop: { x: number; y: number; width: number; height: number };
  url: string;
};

type PaintStroke = {
  active: boolean;
  tool: 'brush' | 'eraser';
  baseCells: Cell[];
  draftCells: Cell[];
  changedCount: number;
  pointerId: number | null;
  lastCell: { x: number; y: number } | null;
  initialPainted: boolean;
};

type AlignedGrid = {
  rows: number;
  cols: number;
  cellSize: number;
  offsetX: number;
  offsetY: number;
  cropWidth: number;
  cropHeight: number;
};

const GRID_CONTROL_CELLS = 6;

const canvasTools: Array<{ tool: CanvasTool; label: string; icon: IconName }> = [
  { tool: 'pan', label: '手抓移动工具', icon: 'hand' },
  { tool: 'brush', label: '画笔工具', icon: 'brush' },
  { tool: 'eraser', label: '橡皮工具', icon: 'eraser' },
  { tool: 'fill', label: '填充工具', icon: 'fill' },
  { tool: 'eyedropper', label: '取色工具', icon: 'eyedropper' },
];

function H5App() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [activeTab, setActiveTab] = useState<'home' | 'profile'>('home');
  const [rows, setRows] = useState<number>(32);
  const [cols, setCols] = useState<number>(32);
  const [cells, setCells] = useState<Cell[]>(() => createBlankCells(32, 32));
  const [canvasKind, setCanvasKind] = useState<CanvasKind>('grid');
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
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
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
  const [splitMode, setSplitMode] = useState<SplitMode>('quick');
  const [splitLongSide, setSplitLongSide] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [splitRows, setSplitRows] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [splitCols, setSplitCols] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [alignCellSize, setAlignCellSize] = useState(1);
  const [alignOffsetX, setAlignOffsetX] = useState(0);
  const [alignOffsetY, setAlignOffsetY] = useState(0);
  const [gridFrameOrigin, setGridFrameOrigin] = useState<GridHandlePosition>({ x: 40, y: 40 });
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showXhsInput, setShowXhsInput] = useState(false);
  const [xhsLink, setXhsLink] = useState('');
  const [isExtractingXhs, setIsExtractingXhs] = useState(false);
  const [xhsExtractedTitle, setXhsExtractedTitle] = useState('');
  const [xhsExtractedImages, setXhsExtractedImages] = useState<XhsExtractedImage[]>([]);
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null);
  const [isReferenceMinimized, setIsReferenceMinimized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingAuthActionRef = useRef<(() => void) | null>(null);
  const xhsRequestSeqRef = useRef(0);
  const xhsImportSeqRef = useRef(0);
  const authRequestSeqRef = useRef(0);
  const activeWarehouseIdRef = useRef('');
  const inventoryRequestSeqRef = useRef(0);
  const cellsRef = useRef(cells);
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
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateCanvasModal, setShowCreateCanvasModal] = useState(false);

  // Config fields inside modal
  const [cfgRows, setCfgRows] = useState(32);
  const [cfgCols, setCfgCols] = useState(32);

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
  const splitPinchRef = useRef({
    active: false,
    startDistance: 0,
    startLongSide: DEFAULT_SPLIT_LONG_SIDE,
  });
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

  useEffect(() => {
    if (canvasKind !== 'image') return;
    const canvas = imageCanvasRef.current;
    if (!canvas) return;
    canvas.width = cols;
    canvas.height = rows;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, cols, rows);
    context.imageSmoothingEnabled = false;
    for (const cell of cells) {
      if (cell.transparent) continue;
      context.fillStyle = cell.color;
      context.fillRect(cell.x, cell.y, 1, 1);
    }
  }, [canvasKind, cells, cols, rows]);

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

  const totalBeads = useMemo(() => cells.filter((cell) => !cell.transparent).length, [cells]);
  const usedColors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cell of cells) {
      if (!cell.transparent) counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [cells]);
  const alignedGrid = useMemo(() => (
    uploadedSplitImage
      ? gridSizeFromAlignment(uploadedSplitImage.crop, alignCellSize, alignOffsetX, alignOffsetY)
      : { rows: splitRows, cols: splitCols, offsetX: 0, offsetY: 0, cellSize: 1, cropWidth: 1, cropHeight: 1 }
  ), [alignCellSize, alignOffsetX, alignOffsetY, splitCols, splitRows, uploadedSplitImage]);
  const activeSplitRows = splitMode === 'align' ? alignedGrid.rows : splitRows;
  const activeSplitCols = splitMode === 'align' ? alignedGrid.cols : splitCols;
  const splitPreviewCells = useMemo(() => {
    if (screen !== 'split-preview') return [];
    if (!uploadedSplitImage) return [];
    if (splitMode === 'align') {
      return cellsFromAlignedGrid(uploadedSplitImage.imageData, alignedGrid, uploadedSplitImage.crop);
    }
    return cellsFromImage(uploadedSplitImage.imageData, splitRows, splitCols, uploadedSplitImage.crop);
  }, [alignedGrid, screen, splitCols, splitMode, splitRows, uploadedSplitImage]);
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

  const openUpload = (nextMode: WorkMode) => {
    xhsRequestSeqRef.current += 1;
    setWorkMode(nextMode);
    setActiveTab('home');
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
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || '请求失败');
    return payload as T;
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

  const requireLogin = (next: () => void) => {
    if (isLoggedIn) {
      next();
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
      const payload = await requestApi<{ token: string; user: { username: string } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (authRequestSeqRef.current !== requestSeq || !showLoginModal) return;
      setAuthToken(payload.token);
      setLoginName(payload.user.username);
      setIsLoggedIn(true);
      setShowLoginModal(false);
      setLoginPassword('');
      setStatus(`登录成功：${payload.user.username}。`);
      await loadWarehouses(payload.token);
      const pendingAuthAction = pendingAuthActionRef.current;
      pendingAuthActionRef.current = null;
      pendingAuthAction?.();
    } catch (error) {
      if (authRequestSeqRef.current !== requestSeq) return;
      setStatus(error instanceof Error ? error.message : '登录失败');
    } finally {
      if (authRequestSeqRef.current === requestSeq) setIsAuthenticating(false);
    }
  };

  const openWarehouse = () => {
    requireLogin(() => {
      setScreen('warehouse');
      setStatus('已进入豆子仓库。');
    });
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

  const openCreateCanvasModal = () => {
    setCfgCols(cols);
    setCfgRows(rows);
    setShowCreateCanvasModal(true);
  };

  const createBlankCanvas = () => {
    const nextCols = normalizeGridSize(cfgCols);
    const nextRows = normalizeGridSize(cfgRows);
    setCols(nextCols);
    setRows(nextRows);
    setCfgCols(nextCols);
    setCfgRows(nextRows);
    setCells(createBlankCells(nextRows, nextCols));
    setCanvasKind('grid');
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
    const nextLongSide = Math.max(4, Math.min(MAX_AUTO_GRID_SIDE, Math.round(value)));
    if (nextLongSide === splitLiveLongSideRef.current) return;
    splitLiveLongSideRef.current = nextLongSide;
    setSplitLongSide(nextLongSide);
    if (!uploadedSplitImage) return;
    const nextSize = gridSizeFromImageBounds(uploadedSplitImage.crop.width, uploadedSplitImage.crop.height, nextLongSide);
    setSplitRows(nextSize.rows);
    setSplitCols(nextSize.cols);
    setStatus(`分割数量已调整为 ${nextSize.cols} x ${nextSize.rows}。`);
  };

  const resetAlignment = () => {
    if (!uploadedSplitImage) return;
    const nextCellSize = initialAlignCellSize(uploadedSplitImage.crop, splitCols, splitRows);
    const nextOffset = centeredAlignmentOffset(uploadedSplitImage.crop, nextCellSize);
    splitLiveAlignCellSizeRef.current = nextCellSize;
    splitLiveAlignOffsetRef.current = nextOffset;
    const nextOrigin = centeredGridControlOrigin(uploadedSplitImage.crop, nextCellSize, nextOffset);
    splitLiveGridFrameOriginRef.current = nextOrigin;
    setAlignCellSize(nextCellSize);
    setAlignOffsetX(nextOffset.x);
    setAlignOffsetY(nextOffset.y);
    setGridFrameOrigin(nextOrigin);
    setStatus('已重置对格子参数。');
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
    return {
      x: rect.width > 0 ? (deltaX / rect.width) * uploadedSplitImage.crop.width : 0,
      y: rect.height > 0 ? (deltaY / rect.height) * uploadedSplitImage.crop.height : 0,
    };
  };

  const gridPointFromScreen = (clientX: number, clientY: number, target: Element) => {
    if (!uploadedSplitImage) return { x: 0, y: 0 };
    const frame = target.closest('.split-image-frame') ?? target.querySelector('.split-image-frame') ?? target;
    const rect = frame.getBoundingClientRect();
    return {
      x: rect.width > 0 ? ((clientX - rect.left) / rect.width) * uploadedSplitImage.crop.width : 0,
      y: rect.height > 0 ? ((clientY - rect.top) / rect.height) * uploadedSplitImage.crop.height : 0,
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
    if (splitMode === 'align') return;
    if (event.touches.length !== 2) return;
    const distance = touchDistance(event.touches[0], event.touches[1]);
    splitPinchRef.current = {
      active: true,
      startDistance: distance,
      startLongSide: splitLongSide,
    };
  };

  const handleSplitTouchMove = (event: React.TouchEvent) => {
    if (splitMode === 'align') return;
    if (!splitPinchRef.current.active || event.touches.length !== 2) return;
    if (event.cancelable) event.preventDefault();
    const distance = touchDistance(event.touches[0], event.touches[1]);
    const delta = distance - splitPinchRef.current.startDistance;
    const nextLongSide = splitPinchRef.current.startLongSide + Math.round(delta / 12);
    updateSplitLongSide(nextLongSide);
  };

  const handleSplitTouchEnd = (event: React.TouchEvent) => {
    if (event.touches.length >= 2) return;
    splitPinchRef.current.active = false;
    splitGridHandleDragRef.current.handle = null;
  };

  const endGridHandleDrag = () => {
    splitGridHandleDragRef.current.handle = null;
  };

  const handleGridHandlePointerDown = (handle: GridHandle, event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    startGridHandleDrag(handle, event.clientX, event.clientY);
  };

  const handleGridHandlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!splitGridHandleDragRef.current.handle) return;
    event.preventDefault();
    event.stopPropagation();
    continueGridHandleDrag(event.clientX, event.clientY, event.currentTarget);
  };

  const handleGridHandlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    endGridHandleDrag();
  };

  const importSplitToCanvas = () => {
    if (!uploadedSplitImage) return;
    const nextCells = splitMode === 'align'
      ? cellsFromAlignedGrid(uploadedSplitImage.imageData, alignedGrid, uploadedSplitImage.crop)
      : cellsFromImage(uploadedSplitImage.imageData, splitRows, splitCols, uploadedSplitImage.crop);
    setRows(activeSplitRows);
    setCols(activeSplitCols);
    setCfgRows(activeSplitRows);
    setCfgCols(activeSplitCols);
    setCells(nextCells);
    setCanvasKind('image');
    setHistory([]);
    setFuture([]);
    setTool('pan');
    setZoom(1.0);
    setCanvasScale(1.0);
    setPanX(0);
    setPanY(0);
    clearReferenceImage();
    setScreen('canvas');
    setStatus(`已导入画布：${activeSplitCols} x ${activeSplitRows}。`);
  };

  const loadSplitImage = (name: string, imageData: ImageData) => {
    const crop = getImageCrop(imageData);
    const url = imageDataToUrl(imageData);
    const { rows: defaultRows, cols: defaultCols } = gridSizeFromImageBounds(crop.width, crop.height, DEFAULT_SPLIT_LONG_SIDE);
    setUploadedSplitImage({ name, imageData, crop, url });
    setSplitMode('quick');
    setSplitLongSide(DEFAULT_SPLIT_LONG_SIDE);
    setSplitRows(defaultRows);
    setSplitCols(defaultCols);
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
    setHistory([]);
    setFuture([]);
    setScreen('split');
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
      setStatus(`已载入 ${file.name}，默认长边 ${DEFAULT_SPLIT_LONG_SIDE} 格。`);
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
      loadSplitImage(safeImageFilename(title || 'xiaohongshu-drawing', 'image/png'), imageData);
      setShowUploadModal(false);
      setShowXhsInput(false);
      setXhsLink('');
      setXhsExtractedTitle('');
      setXhsExtractedImages([]);
      setStatus(`已载入 ${title || '小红书图纸'}，默认长边 ${DEFAULT_SPLIT_LONG_SIDE} 格。`);
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

  const cellFromCanvasPoint = (clientX: number, clientY: number, rect: DOMRect) => {
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return null;
    const x = Math.min(cols - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * cols)));
    const y = Math.min(rows - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * rows)));
    return { x, y };
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

  const beginPaintStroke = (x: number, y: number, pointerId: number, target: EventTarget & Element, deferInitialPaint = false) => {
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

  const endPaintStroke = (pointerId: number, target?: EventTarget & Element) => {
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

  const handleGridCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const isMultiTouch = event.pointerType === 'touch' && canvasTouchPointersRef.current.size > 1;
    if (isMultiTouch) return;
    const point = cellFromGridPointer(event.clientX, event.clientY, event.currentTarget);
    if (!point) return;
    if (beginPaintStroke(point.x, point.y, event.pointerId, event.currentTarget, event.pointerType === 'touch')) {
      event.preventDefault();
    }
  };

  const handleGridCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = cellFromGridPointer(event.clientX, event.clientY, event.currentTarget);
    if (!point) {
      breakPaintStroke(event.pointerId);
      return;
    }
    continuePaintStroke(point.x, point.y, event.pointerId);
  };

  const handleCanvasPaintPointerEnd = (event: React.PointerEvent<Element>) => {
    endPaintStroke(event.pointerId, event.currentTarget);
    if (event.pointerType === 'touch') {
      canvasTouchPointersRef.current.delete(event.pointerId);
    }
  };

  const handleGridCellClick = (cell: Cell) => {
    if (suppressCanvasClickRef.current) {
      suppressCanvasClickRef.current = false;
      return;
    }
    handleCellTap(cell);
  };

  const cellFromGridPointer = (clientX: number, clientY: number, grid: HTMLDivElement) => {
    const element = document.elementFromPoint(clientX, clientY);
    const cellElement = element instanceof HTMLElement ? element.closest<HTMLElement>('.h5-canvas-cell') : null;
    if (!cellElement || !grid.contains(cellElement)) return null;
    const x = Number(cellElement.dataset.cellX);
    const y = Number(cellElement.dataset.cellY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
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

  const handleImageCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (suppressCanvasClickRef.current) {
      suppressCanvasClickRef.current = false;
      return;
    }
    if (tool === 'pan') return;
    const canvas = event.currentTarget;
    const point = cellFromCanvasPoint(event.clientX, event.clientY, canvas.getBoundingClientRect());
    if (!point) return;
    const { x, y } = point;
    const cell = cells.find((item) => item.x === x && item.y === y);
    if (cell) handleCellTap(cell);
  };

  const handleImageCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const isMultiTouch = event.pointerType === 'touch' && canvasTouchPointersRef.current.size > 1;
    if (isMultiTouch) return;
    const point = cellFromCanvasPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (!point) return;
    if (beginPaintStroke(point.x, point.y, event.pointerId, event.currentTarget, event.pointerType === 'touch')) {
      event.preventDefault();
    }
  };

  const handleImageCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = cellFromCanvasPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (!point) {
      breakPaintStroke(event.pointerId);
      return;
    }
    continuePaintStroke(point.x, point.y, event.pointerId);
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
    const newCells = resizeCells(cells, rows, cols, cfgRows, cfgCols);
    setRows(cfgRows);
    setCols(cfgCols);
    commitCells(newCells, `已调整画布为 ${cfgCols} x ${cfgRows}。`);
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

  if (screen === 'split' && uploadedSplitImage) {
    return (
      <main className={`split-page split-page--${splitMode}`}>
        <header className="split-topbar">
          <button className="split-icon-btn" aria-label="返回首页" onClick={() => setScreen('home')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m12 5-7 7 7 7" />
            </svg>
          </button>
          <h1 className="split-topbar-title">分割</h1>
          <button className="split-action-btn" onClick={() => setScreen('split-preview')}>下一步</button>
        </header>

        <section className="split-main">
          <div
            className="split-image-container"
            aria-label="分割预览图"
            onTouchStartCapture={handleSplitTouchStart}
            onTouchMoveCapture={handleSplitTouchMove}
            onTouchEndCapture={handleSplitTouchEnd}
            onTouchCancelCapture={handleSplitTouchEnd}
          >
            <TransformWrapper
              initialScale={1}
              minScale={0.6}
              maxScale={8}
              centerOnInit={true}
              doubleClick={{ disabled: true }}
              wheel={{ step: 0.12 }}
              pinch={{ disabled: true }}
              panning={{ disabled: splitMode === 'align' }}
            >
              {() => (
                <>
                  <TransformComponent
                    wrapperClass="split-image-zoom-wrapper"
                    contentClass="split-image-zoom-content"
                  >
                    <div
                      className="split-image-frame"
                      style={{ aspectRatio: `${uploadedSplitImage.crop.width} / ${uploadedSplitImage.crop.height}` }}
                    >
                      <SplitPreviewCanvas
                        imageData={uploadedSplitImage.imageData}
                        crop={uploadedSplitImage.crop}
                        rows={activeSplitRows}
                        cols={activeSplitCols}
                        alignment={splitMode === 'align' ? alignedGrid : undefined}
                      />
                      {splitMode === 'align' ? (
                        <GridAlignmentHandles
                          grid={alignedGrid}
                          origin={gridFrameOrigin}
                          onPointerDown={handleGridHandlePointerDown}
                          onPointerMove={handleGridHandlePointerMove}
                          onPointerEnd={handleGridHandlePointerEnd}
                        />
                      ) : null}
                    </div>
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          </div>

          <div className="split-controls-card">
            <div className="split-mode-switch" aria-label="分割模式">
              <button
                className={splitMode === 'quick' ? 'active' : ''}
                onClick={() => setSplitMode('quick')}
              >快速分割</button>
              <button
                className={splitMode === 'align' ? 'active' : ''}
                onClick={() => setSplitMode('align')}
              >对格子</button>
            </div>
            <div className="split-info-row">
              <span className="split-info-label">分割数量</span>
              <span className="split-info-value">{activeSplitCols} × {activeSplitRows}</span>
            </div>
            {splitMode === 'quick' ? (
              <div className="split-slider-row">
                <button
                  className="split-step-btn"
                  aria-label="减少格数"
                  onClick={() => updateSplitLongSide(splitLongSide - 1)}
                >−</button>
                <div className="split-slider-wrap">
                  <input
                    aria-label="长边格数"
                    type="range"
                    min="4"
                    max="80"
                    value={splitLongSide}
                    className="split-range"
                    onChange={(event) => updateSplitLongSide(Number(event.target.value))}
                  />
                  <span className="split-slider-value">长边 {splitLongSide} 格</span>
                </div>
                <button
                  className="split-step-btn"
                  aria-label="增加格数"
                  onClick={() => updateSplitLongSide(splitLongSide + 1)}
                >+</button>
              </div>
            ) : (
              <div className="split-align-panel">
                <div className="split-align-readout">
                  格距 {alignedGrid.cellSize.toFixed(1)}px｜偏移 X {alignedGrid.offsetX.toFixed(1)} Y {alignedGrid.offsetY.toFixed(1)}
                </div>
                <div className="split-align-controls" aria-label="对格子微调">
                  <div className="split-nudge-pad" aria-label="移动网格">
                    <button aria-label="上移网格" onClick={() => moveGridControlFrame(0, -1)}>↑</button>
                    <span className="split-nudge-center">移动</span>
                    <button aria-label="下移网格" onClick={() => moveGridControlFrame(0, 1)}>↓</button>
                    <button aria-label="左移网格" onClick={() => moveGridControlFrame(-1, 0)}>←</button>
                    <span />
                    <button aria-label="右移网格" onClick={() => moveGridControlFrame(1, 0)}>→</button>
                  </div>
                  <div className="split-cell-actions" aria-label="缩放网格">
                    <button aria-label="减小格距" onClick={() => updateAlignCellSize(alignCellSize - 1)}>− 格距</button>
                    <div className="split-cell-size-value">{alignedGrid.cellSize.toFixed(2)} px / 格</div>
                    <button aria-label="增大格距" onClick={() => updateAlignCellSize(alignCellSize + 1)}>+ 格距</button>
                    <button aria-label="重置对格" onClick={resetAlignment}>重置</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'split-preview' && uploadedSplitImage) {
    return (
      <main className="split-page split-preview-page">
        <header className="split-topbar">
          <button className="split-icon-btn" aria-label="返回分割" onClick={() => setScreen('split')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m12 5-7 7 7 7" />
            </svg>
          </button>
          <h1 className="split-topbar-title">浏览</h1>
          <button className="split-action-btn split-action-btn--primary" onClick={importSplitToCanvas}>导入画布</button>
        </header>

        <div className="split-preview-meta">
          <span className="split-meta-chip">{activeSplitCols} × {activeSplitRows} 格</span>
          <span className="split-meta-desc">确认效果后点击「导入画布」继续编辑。</span>
        </div>

        <section className="split-browser-container" aria-label="分割浏览预览">
          <div
            className="split-grid-preview"
            style={{ gridTemplateColumns: `repeat(${splitCols}, 1fr)` }}
          >
            {splitPreviewCells.map((cell) => (
              <span
                key={`${cell.x}-${cell.y}`}
                className={cell.transparent ? 'split-preview-cell transparent' : 'split-preview-cell'}
                style={{ background: cell.transparent ? undefined : cell.color }}
              />
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (screen === 'canvas') {
    return (
      <main className={canvasScale >= 1.5 ? 'h5-canvas-page cell-codes-visible' : 'h5-canvas-page'} aria-label="H5 画布编辑器">
        <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleUpload(event.target.files?.[0])} />
        <input ref={referenceInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="参考图文件" onChange={(event) => handleReferenceUpload(event.target.files?.[0])} />
        
        <header className="canvas-topbar">
          <div className="topbar-left">
            <button className="top-icon-btn close-btn" aria-label="关闭画布" onClick={() => { clearReferenceImage(); setScreen('home'); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <button className="top-icon-btn sliders-btn" aria-label="画布设置" onClick={() => setShowSettings(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            </button>
            <span className="canvas-size-pill">{cols}×{rows}</span>
          </div>
          
          <div className="topbar-center">
            <button className="top-icon-btn undo-btn" aria-label="撤销" onClick={undo} disabled={history.length === 0}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>
            </button>
            <button className="top-icon-btn redo-btn" aria-label="重做" onClick={redo} disabled={future.length === 0}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path></svg>
            </button>
          </div>
          
          <div className="topbar-right">
            <button className="top-icon-btn reference-upload-btn" aria-label="上传参考图" onClick={chooseReferenceImage}>
              <Icon name="upload" />
            </button>
            <button className="top-icon-btn save-btn" aria-label="导出拼豆图纸" onClick={exportPatternPng}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><polyline points="9 15 12 18 15 15"></polyline></svg>
            </button>
            {workMode === 'peg' ? (
              <button className="top-icon-btn layers-btn" aria-label="导出 STL" onClick={exportStl}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polygon points="2 17 12 22 22 17"></polygon><polygon points="2 12 12 17 22 12"></polygon></svg>
              </button>
            ) : null}
            <button className="current-color-dot" aria-label={`当前色号 ${selectedCode}`} style={{ background: selectedColor }} />
          </div>
        </header>

        {showSettings && (
          <div className="h5-settings-modal">
            <div className="h5-settings-modal-content">
              <h3>画布参数调整</h3>
              <div className="h5-settings-form">
                <label>
                  <span>宽度列数 (Cols):</span>
                  <input type="number" min={2} max={120} value={cfgCols} onChange={(e) => setCfgCols(Math.max(2, parseInt(e.target.value) || 32))} />
                </label>
                <label>
                  <span>高度行数 (Rows):</span>
                  <input type="number" min={2} max={120} value={cfgRows} onChange={(e) => setCfgRows(Math.max(2, parseInt(e.target.value) || 32))} />
                </label>
              </div>
              <div className="h5-modal-actions">
                <button className="fit-btn" onClick={fitView}>重置视图</button>
                <button className="confirm-btn" onClick={handleResizeCanvas}>确定调整</button>
                <button className="cancel-btn" onClick={() => {
                  setCfgCols(cols);
                  setCfgRows(rows);
                  setShowSettings(false);
                }}>取消</button>
              </div>
            </div>
          </div>
        )}

        <section className="canvas-workbench">
          <aside className="canvas-rail" aria-label="画布工具栏">
            {canvasTools.map((item) => (
              <button
                key={item.tool}
                className={tool === item.tool ? 'rail-tool active' : 'rail-tool'}
                aria-label={item.label}
                aria-pressed={tool === item.tool}
                onClick={() => setTool(item.tool)}
              >
                <Icon name={item.icon} />
              </button>
            ))}
          </aside>

          <section
            className={tool === 'pan' ? 'canvas-stage is-pan-tool' : 'canvas-stage'}
            onPointerDownCapture={handleCanvasPointerDownCapture}
            onPointerUpCapture={handleCanvasPointerEndCapture}
            onPointerCancelCapture={handleCanvasPointerEndCapture}
            onLostPointerCapture={handleCanvasPointerEndCapture}
          >
            <TransformWrapper
              initialScale={1}
              minScale={0.2}
              maxScale={12}
              centerOnInit={true}
              panning={{ disabled: false, excluded: tool === 'pan' ? [] : ['canvas-artwork'] }}
              pinch={{ disabled: false, allowPanning: true, excluded: [] }}
              doubleClick={{ disabled: true }}
              wheel={{ step: 0.15 }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <CanvasScaleObserver onScaleChange={setCanvasScale} />
                  <TransformComponent
                    wrapperStyle={{ width: '100%', height: '100%', overflow: 'hidden' }}
                    contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {canvasKind === 'image' ? (
                      <div className="h5-image-artboard" style={{ aspectRatio: `${cols} / ${rows}`, width: `min(calc(${cols} * var(--canvas-cell-size)), calc(100% - var(--canvas-ruler-gutter)))` }}>
                        <CanvasRulers rows={rows} cols={cols} />
                        <canvas
                          ref={imageCanvasRef}
                          className="h5-image-canvas canvas-artwork"
                          aria-label="拼豆像素画布"
                          onPointerDown={handleImageCanvasPointerDown}
                          onPointerMove={handleImageCanvasPointerMove}
                          onPointerUp={handleCanvasPaintPointerEnd}
                          onPointerCancel={handleCanvasPaintPointerEnd}
                          onLostPointerCapture={handleCanvasPaintPointerEnd}
                          onClick={handleImageCanvasClick}
                        />
                        <GridOverlay rows={rows} cols={cols} className="h5-image-grid-overlay" />
                        <ImageCellCodeOverlay cells={cells} cols={cols} />
                      </div>
                    ) : (
                      <div
                        className="h5-artboard"
                        style={{
                          aspectRatio: `${cols} / ${rows}`,
                          width: `min(calc(${cols} * var(--canvas-cell-size)), calc(100% - var(--canvas-ruler-gutter)))`,
                        }}
                      >
                        <CanvasRulers rows={rows} cols={cols} />
                        <div
                          className="h5-canvas-grid canvas-artwork"
                          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                          onPointerDown={handleGridCanvasPointerDown}
                          onPointerMove={handleGridCanvasPointerMove}
                          onPointerUp={handleCanvasPaintPointerEnd}
                          onPointerCancel={handleCanvasPaintPointerEnd}
                          onLostPointerCapture={handleCanvasPaintPointerEnd}
                        >
                          {cells.map((cell) => (
                            <button
                              key={`${cell.x}-${cell.y}`}
                              className={cell.transparent ? 'h5-canvas-cell transparent' : 'h5-canvas-cell'}
                              style={{ background: cell.transparent ? undefined : cell.color }}
                              aria-label={`格子 ${cell.x + 1},${cell.y + 1}`}
                              data-cell-x={cell.x}
                              data-cell-y={cell.y}
                              onClick={() => handleGridCellClick(cell)}
                            >
                              {!cell.transparent ? (
                                <span className="h5-cell-code" style={{ color: colorCodeTextColor(cell.color) }}>
                                  {colorCodeOf(cell.color)}
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </TransformComponent>
                  <div className="canvas-zoom-controls" aria-label="画布缩放控制">
                    <button aria-label="放大画布" onClick={() => { zoomIn(0.35); setCanvasScale((value) => Math.min(12, value + 0.35)); }}>+</button>
                    <button aria-label="缩小画布" onClick={() => { zoomOut(0.35); setCanvasScale((value) => Math.max(0.2, value - 0.35)); }}>-</button>
                    <button aria-label="重置画布视图" onClick={() => { resetTransform(); setCanvasScale(1); }}>1:1</button>
                  </div>
                </>
              )}
            </TransformWrapper>
            {referenceImage ? (
              <section className={isReferenceMinimized ? 'canvas-reference-window minimized' : 'canvas-reference-window'} aria-label="参考图">
                <header className="canvas-reference-head">
                  <strong>参考图</strong>
                  <span>{referenceImage.name}</span>
                  <button aria-label={isReferenceMinimized ? '展开参考图' : '最小化参考图'} onClick={() => setIsReferenceMinimized((value) => !value)}>
                    {isReferenceMinimized ? '+' : '−'}
                  </button>
                  <button aria-label="关闭参考图" onClick={closeReferenceImage}>×</button>
                </header>
                {!isReferenceMinimized ? (
                  <div className="canvas-reference-body">
                    <img src={referenceImage.url} alt="参考图" />
                  </div>
                ) : null}
              </section>
            ) : null}
            {status ? (
              <p className="canvas-status" role="status" aria-live="polite">{status}</p>
            ) : null}
          </section>
        </section>

        <footer className="canvas-palette" aria-label="底部色卡">
          <div className="palette-strip">
            {prioritizedPaletteColors.map((color) => (
              <button
                key={color.code}
                className={selectedCode === color.code ? 'palette-code active' : 'palette-code'}
                style={{ background: color.hex }}
                aria-label={`选择色号 ${color.code}`}
                onClick={() => {
                  selectPaletteColor(color);
                }}
              >
                <span className="palette-code-label">{color.code}</span>
                <span className="palette-active-indicator" />
              </button>
            ))}
          </div>
          <button className="filter-button" aria-label="筛选色卡" onClick={() => setShowPaletteSearch(true)} />
        </footer>
        {showPaletteSearch ? (
          <div className="palette-search-modal" role="dialog" aria-label="筛选色卡面板">
            <div className="palette-search-panel">
              <div className="palette-search-head">
                <strong>筛选色卡</strong>
                <button aria-label="关闭筛选" onClick={() => setShowPaletteSearch(false)}>关闭</button>
              </div>
              <input
                type="search"
                aria-label="搜索色号"
                placeholder="输入色号，如 M15"
                value={paletteQuery}
                onChange={(event) => setPaletteQuery(event.target.value)}
              />
              <div className="palette-search-results">
                {filteredPaletteColors.map((color) => (
                  <button
                    key={color.code}
                    className="palette-search-option"
                    aria-label={`选择色号 ${color.code}`}
                    onClick={() => {
                      selectPaletteColor(color);
                      setShowPaletteSearch(false);
                      setPaletteQuery('');
                    }}
                  >
                    <span style={{ background: color.hex }} />
                    <strong>{color.code}</strong>
                    <small>{color.hex}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  if (screen === 'warehouse') {
    return (
      <main className="warehouse-page" aria-label="豆子仓库">
        {status ? (
          <p className="app-status" role="status" aria-live="polite">{status}</p>
        ) : null}
        {/* Topbar */}
        <header className="split-topbar wh-topbar">
          <button className="split-icon-btn" aria-label="返回" onClick={() => { setActiveTab('profile'); setScreen('home'); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="m12 5-7 7 7 7" />
            </svg>
          </button>
          <h1 className="split-topbar-title">{activeWarehouse?.name ?? '豆子仓库'}</h1>
          <div className="wh-topbar-meta">
            <span>{stockedColorCount}</span>
            <small>种在库</small>
          </div>
        </header>

        {/* Stats strip */}
        <div className="wh-stats-strip">
          <div className="wh-stat-card">
            <strong>{totalWarehouseStock.toLocaleString()}</strong>
            <span>总库存颗</span>
          </div>
          <div className="wh-stat-card">
            <strong>{stockedColorCount}</strong>
            <span>有库存色</span>
          </div>
          <div className="wh-stat-card wh-stat-warn">
            <strong>{missingColorCount}</strong>
            <span>缺货色</span>
          </div>
        </div>

        <div className="wh-warehouse-strip" aria-label="仓库列表">
          {warehouses.map((warehouse) => (
            <button
              key={warehouse.id}
              className={warehouse.id === activeWarehouseId ? 'active' : ''}
              onClick={() => {
                activeWarehouseIdRef.current = warehouse.id;
                setActiveWarehouseId(warehouse.id);
                setSelectedWarehouseCodes([]);
                void loadInventory(warehouse.id);
              }}
            >
              {warehouse.name}
            </button>
          ))}
          <button className="wh-create-warehouse-btn" onClick={() => setShowWarehouseCreateModal(true)}>新建豆子仓库</button>
        </div>

        {warehouses.length === 0 ? (
          <section className="wh-empty-warehouse">
            <strong>还没有豆子仓库</strong>
            <span>先创建一个仓库，之后就可以按色号管理库存和出入库记录。</span>
            <button onClick={() => setShowWarehouseCreateModal(true)}>新建豆子仓库</button>
          </section>
        ) : null}

        {/* Search + letter tabs */}
        <div className="wh-filter-bar">
          <div className="wh-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="wh-search-icon">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="search"
              aria-label="搜索仓库色号"
              placeholder="搜索色号…"
              value={warehouseSearch}
              onChange={(event) => setWarehouseSearch(event.target.value)}
            />
          </div>
        </div>

        {/* Letter tabs - horizontal scroll */}
        <div className="wh-letter-tabs" aria-label="色号字母筛选">
          {WAREHOUSE_LETTERS.map((letter) => (
            <button
              key={letter}
              className={warehouseLetter === letter ? 'active' : ''}
              onClick={() => setWarehouseLetter(letter)}
            >
              {letter}
            </button>
          ))}
        </div>

        {/* Selection bar */}
        <div className="wh-select-bar">
          <span className="wh-select-info">
            已选 <em>{selectedWarehouseCount}</em> 色
          </span>
          <div className="wh-select-actions">
            <button onClick={selectVisibleWarehouseColors}>全选</button>
            <button onClick={invertVisibleWarehouseColors}>反选</button>
            <button onClick={() => setSelectedWarehouseCodes([])}>清除</button>
          </div>
        </div>

        {/* Color grid */}
        <div className="wh-grid-scroll" aria-label="仓库色卡">
          <div className="wh-color-grid">
            {warehouseColors.map((color) => {
              const selected = selectedWarehouseCodes.includes(color.code);
              const stock = beadStock[color.code] ?? 0;
              return (
                <button
                  key={color.code}
                  className={`wh-color-card${selected ? ' selected' : ''}${stock === 0 ? ' empty' : ''}`}
                  aria-label={`${color.code} 库存 ${stock} 颗`}
                  onClick={() => toggleWarehouseCode(color.code)}
                >
                  <span className="wh-swatch" style={{ background: color.hex }}>
                    {selected && <i className="wh-check" aria-hidden="true">✓</i>}
                  </span>
                  <span className="wh-code">{color.code}</span>
                  <span className="wh-stock">{stock > 0 ? `${stock}颗` : '—'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {showWarehouseCreateModal ? (
          <div className="home-create-modal" role="dialog" aria-label="新建豆子仓库">
            <div className="home-create-panel">
              <div className="home-create-head">
                <strong>新建豆子仓库</strong>
                <button aria-label="关闭新建仓库" onClick={() => setShowWarehouseCreateModal(false)}>关闭</button>
              </div>
              <div className="login-form">
                <label>
                  <span>仓库名称</span>
                  <input
                    type="text"
                    aria-label="仓库名称"
                    placeholder="例如 MARD 常用色仓库"
                    value={warehouseName}
                    onChange={(event) => setWarehouseName(event.target.value)}
                  />
                </label>
                <label>
                  <span>备注</span>
                  <input
                    type="text"
                    aria-label="仓库备注"
                    placeholder="可选"
                    value={warehouseRemark}
                    onChange={(event) => setWarehouseRemark(event.target.value)}
                  />
                </label>
              </div>
              <button className="home-create-submit" onClick={createWarehouse}>创建仓库</button>
            </div>
          </div>
        ) : null}

        {/* Bottom action card */}
        <div className="wh-action-card">
          <div className="wh-action-top">
            <span className="wh-action-desc">
              {selectedWarehouseCount > 0
                ? `已选 ${selectedWarehouseCount} 色`
                : '请先选择色号'}
            </span>
            <div className="wh-unit-toggle" role="group" aria-label="库存单位">
              <button className={warehouseUnit === 'count' ? 'active' : ''} onClick={() => setWarehouseUnit('count')}>按颗</button>
              <button className={warehouseUnit === 'gram' ? 'active' : ''} onClick={() => setWarehouseUnit('gram')}>按克</button>
            </div>
          </div>
          <div className="wh-action-row">
            <div className="wh-amount-field">
              <button className="wh-amount-step" onClick={() => setWarehouseAmount((v) => String(Math.max(1, Number(v) - 1)))}>−</button>
              <input
                type="number"
                min={1}
                aria-label="数量"
                value={warehouseAmount}
                onChange={(event) => setWarehouseAmount(event.target.value)}
              />
              <button className="wh-amount-step" onClick={() => setWarehouseAmount((v) => String(Number(v) + 1))}>+</button>
            </div>
            <button className="wh-out-btn" onClick={() => applyWarehouseChange('out')}>出库</button>
            <button className="wh-in-btn" onClick={() => applyWarehouseChange('in')}>入库</button>
          </div>
          {warehouseUnit === 'gram' && (
            <p className="wh-unit-hint">1g ≈ {BEADS_PER_GRAM} 颗豆子</p>
          )}
        </div>
      </main>
    );
  }


  return (
    <main className="h5-home-shell">
      <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleUpload(event.target.files?.[0])} />
      {status ? (
        <p className="app-status" role="status" aria-live="polite">{status}</p>
      ) : null}
      {activeTab === 'home' ? (
        <section className="home-page">
          {/* Header */}
          <header className="home-header">
            <h1>超级拼</h1>
            <button className="small-round" aria-label="消息中心"><Icon name="bell" /></button>
          </header>

          {/* Quick actions — 最近使用 first */}
          <div className="quick-action-grid">
            {quickTools.map((item) => (
              <button key={item.title} className="quick-action-card" onClick={() => openUpload(item.mode)}>
                <span className="qa-icon"><Icon name={item.icon} /></span>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </button>
            ))}
            <button className="quick-action-card qa-new" onClick={openCreateCanvasModal}>
              <span className="qa-icon"><Icon name="plus" /></span>
              <strong>新建空白画布</strong>
              <span>设置尺寸后开始画</span>
            </button>
          </div>

          {/* Color usage — small strip */}
          {usedColors.length > 0 && (
            <div className="home-color-strip">
              <span className="color-strip-label">已用颜色</span>
              <div className="color-strip-chips">
                {usedColors.slice(0, 8).map(([color, count]) => (
                  <span key={color} className="color-strip-chip" title={`${colorCodeOf(color)} × ${count}`}>
                    <i style={{ background: color }} />
                  </span>
                ))}
                {usedColors.length > 8 && (
                  <span className="color-strip-more">+{usedColors.length - 8}</span>
                )}
              </div>
            </div>
          )}

          {showCreateCanvasModal ? (
            <div className="home-create-modal" role="dialog" aria-label="新建画布设置">
              <div className="home-create-panel">
                <div className="home-create-head">
                  <strong>新建空白画布</strong>
                  <button aria-label="关闭新建画布" onClick={() => setShowCreateCanvasModal(false)}>关闭</button>
                </div>
                <div className="home-create-form">
                  <label>
                    <span>宽度列数</span>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={cfgCols}
                      aria-label="宽度列数"
                      onChange={(event) => setCfgCols(normalizeGridSize(parseInt(event.target.value) || 32))}
                    />
                  </label>
                  <label>
                    <span>高度行数</span>
                    <input
                      type="number"
                      min={2}
                      max={120}
                      value={cfgRows}
                      aria-label="高度行数"
                      onChange={(event) => setCfgRows(normalizeGridSize(parseInt(event.target.value) || 32))}
                    />
                  </label>
                </div>
                <button className="home-create-submit" onClick={createBlankCanvas}>创建画布</button>
              </div>
            </div>
          ) : null}
          {showUploadModal ? (
            <div className="home-create-modal" role="dialog" aria-label="上传图纸">
              <div className="home-create-panel upload-drawing-panel">
                <div className="home-create-head">
                  <strong>上传图纸</strong>
                  <button
                    aria-label="关闭上传图纸"
                    onClick={closeUploadModal}
                  >
                    关闭
                  </button>
                </div>
                <div className="upload-source-list">
                  <button className="upload-source-option" onClick={chooseLocalDrawing}>
                    <span className="upload-source-icon"><Icon name="upload" /></span>
                    <span>
                      <strong>选择图纸</strong>
                      <small>从相册或文件选择 PNG、JPG、WebP</small>
                    </span>
                  </button>
                  <button
                    className={showXhsInput ? 'upload-source-option active' : 'upload-source-option'}
                    onClick={() => requireLogin(() => setShowXhsInput(true))}
                  >
                    <span className="upload-source-icon"><Icon name="spark" /></span>
                    <span>
                      <strong>小红书提取</strong>
                      <small>粘贴笔记链接后提取图片</small>
                    </span>
                  </button>
                </div>
                {showXhsInput ? (
                  <div className="xhs-extract-form">
                    <label>
                      <span>小红书链接</span>
                      <input
                        type="url"
                        aria-label="小红书链接"
                        placeholder="粘贴 xiaohongshu.com 或 xhslink.com 链接"
                        value={xhsLink}
                        onChange={(event) => setXhsLink(event.target.value)}
                      />
                    </label>
                    <button className="home-create-submit" onClick={() => void extractXiaohongshuImage()} disabled={isExtractingXhs}>
                      {isExtractingXhs ? '提取中...' : '提取图片'}
                    </button>
                    {xhsExtractedImages.length > 1 ? (
                      <div className="xhs-image-picker">
                        <strong>选择笔记图片</strong>
                        <div className="xhs-image-grid">
                          {xhsExtractedImages.map((image, index) => (
                            <button
                              key={`${image.imageDataUrl || image.imageUrl}-${index}`}
                              aria-label={`选择第 ${index + 1} 张小红书图片`}
                              onClick={() => void importXhsImage(image)}
                            >
                              <img src={xhsPreviewSrc(image)} alt="" />
                              <span>{index + 1}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {showLoginModal ? (
            <div className="home-create-modal" role="dialog" aria-label="登录面板">
              <div className="home-create-panel">
                <div className="home-create-head">
                  <strong>登录</strong>
                  <button aria-label="关闭登录" onClick={() => {
                    authRequestSeqRef.current += 1;
                    setIsAuthenticating(false);
                    pendingAuthActionRef.current = null;
                    setShowLoginModal(false);
                  }}>关闭</button>
                </div>
                <div className="login-form">
                  <label>
                    <span>用户名</span>
                    <input
                      type="text"
                      aria-label="用户名"
                      placeholder="输入用户名"
                      value={loginName}
                      onChange={(event) => setLoginName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>密码</span>
                    <input
                      type="password"
                      aria-label="密码"
                      placeholder="输入密码"
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                    />
                  </label>
                </div>
                <button className="home-create-submit" onClick={() => void submitLogin()} disabled={isAuthenticating}>
                  {isAuthenticating ? '处理中...' : '登录并继续'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="profile-page">
          <header className="home-header">
            <div>
              <p>Profile</p>
              <h1>我的</h1>
            </div>
          </header>
          <div className="profile-card">
            <strong>{isLoggedIn ? loginName : '未登录'}</strong>
            <span>{isLoggedIn ? '可以管理豆子库存、历史记录和导出文件。' : '登录后可以使用我的豆子仓库和项目记录。'}</span>
            {isLoggedIn ? (
              <button className="profile-login-btn" onClick={() => {
                setIsLoggedIn(false);
                setLoginName('');
                setLoginPassword('');
                setAuthToken('');
                authRequestSeqRef.current += 1;
                inventoryRequestSeqRef.current += 1;
                pendingAuthActionRef.current = null;
                setWarehouses([]);
                activeWarehouseIdRef.current = '';
                setActiveWarehouseId('');
                setBeadStock({});
                setSelectedWarehouseCodes([]);
                setStatus('已退出登录。');
              }}>退出登录</button>
            ) : (
              <button className="profile-login-btn" onClick={() => setShowLoginModal(true)}>登录</button>
            )}
          </div>
          <button className="profile-row" onClick={openWarehouse}><Icon name="layers" /> 豆子仓库</button>
          <button className="profile-row"><Icon name="folder" /> 历史记录</button>
          <button className="profile-row"><Icon name="help" /> 帮助中心</button>
          <button className="profile-row"><Icon name="settings" /> 设置</button>
          {showLoginModal ? (
            <div className="home-create-modal" role="dialog" aria-label="登录面板">
              <div className="home-create-panel">
                <div className="home-create-head">
                  <strong>登录</strong>
                  <button aria-label="关闭登录" onClick={() => {
                    authRequestSeqRef.current += 1;
                    setIsAuthenticating(false);
                    pendingAuthActionRef.current = null;
                    setShowLoginModal(false);
                  }}>关闭</button>
                </div>
                <div className="login-form">
                  <label>
                    <span>用户名</span>
                    <input
                      type="text"
                      aria-label="用户名"
                      placeholder="输入用户名"
                      value={loginName}
                      onChange={(event) => setLoginName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>密码</span>
                    <input
                      type="password"
                      aria-label="密码"
                      placeholder="输入密码"
                      value={loginPassword}
                      onChange={(event) => setLoginPassword(event.target.value)}
                    />
                  </label>
                </div>
                <button className="home-create-submit" onClick={() => void submitLogin()} disabled={isAuthenticating}>
                  {isAuthenticating ? '处理中...' : '登录并继续'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      )}

      <nav className="bottom-tabs" aria-label="底部导航">
        <button className={activeTab === 'home' ? 'active' : ''} aria-label="首页" onClick={() => setActiveTab('home')}>
          <Icon name="home" />
          <span>首页</span>
        </button>
        <button className="plus-tab" aria-label="上传" onClick={() => openUpload('bead')}>
          <Icon name="plus" />
        </button>
        <button className={activeTab === 'profile' ? 'active' : ''} aria-label="我的" onClick={() => setActiveTab('profile')}>
          <Icon name="profile" />
          <span>我的</span>
        </button>
      </nav>
    </main>
  );
}

function Icon({ name }: { name: IconName }) {
  switch (name) {
    case 'bell':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 9a6 6 0 0 0-12 0c0 7-2.5 7-2.5 7h17S18 16 18 9Z" />
          <path d="M9.5 19a2.6 2.6 0 0 0 5 0" />
        </svg>
      );
    case 'brush':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 4 5 5-8.5 8.5H6.5V12.5L15 4Z" />
          <path d="M5 18c0 1.7-1.2 3-3 3 2.9 1.1 6-.2 6-3" />
        </svg>
      );
    case 'crop':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 2v16h16" />
          <path d="M2 6h16v16" />
        </svg>
      );
    case 'eraser':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m7 21-4-4L14 6a3 3 0 0 1 4 0 3 3 0 0 1 0 4L7 21Z" />
          <path d="m10 10 6 6" />
          <path d="M7 21h12" />
        </svg>
      );
    case 'eyedropper':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m3 21 3-1 10.5-10.5-2-2L4 18l-1 3Z" />
          <path d="m14.5 7.5 2.8-2.8a2 2 0 0 1 2.8 2.8l-2.8 2.8" />
        </svg>
      );
    case 'fill':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m4 14 7-7 7 7-7 7-7-7Z" />
          <path d="m11 7-3-3" />
          <path d="M19 16c1.2 1.2 2 2.4 2 3.4a2 2 0 0 1-4 0c0-1 0.8-2.2 2-3.4Z" />
        </svg>
      );
    case 'folder':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 6h7l2 3h9v10H3V6Z" />
        </svg>
      );
    case 'help':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M9.8 9a2.4 2.4 0 0 1 4.5 1.2c0 1.8-2.3 2-2.3 3.8" />
          <path d="M12 17h.01" />
        </svg>
      );
    case 'home':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v10h13V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case 'hand':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11" />
          <path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V11" />
          <path d="M14 10V6.5a1.5 1.5 0 0 1 3 0V12" />
          <path d="M17 11.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-4.7-2.3L3.7 15a1.7 1.7 0 0 1 2.4-2.4L8 14.5V11" />
        </svg>
      );
    case 'layers':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5" />
          <path d="m3 16 9 5 9-5" />
        </svg>
      );
    case 'plus':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'profile':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </svg>
      );
    case 'settings':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          <path d="M4 12H2m20 0h-2M12 4V2m0 20v-2m5.7-13.7 1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2-1.4-1.4" />
        </svg>
      );
    case 'shape':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="8" height="8" />
          <circle cx="16" cy="16" r="4" />
        </svg>
      );
    case 'spark':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z" />
        </svg>
      );
    case 'upload':
      return (
        <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M4 16v4h16v-4" />
        </svg>
      );
    default:
      return null;
  }
}

function GridOverlay({ rows, cols, className = '' }: { rows: number; cols: number; className?: string }) {
  const verticalLines = Array.from({ length: Math.max(0, cols - 1) }, (_, index) => index + 1);
  const horizontalLines = Array.from({ length: Math.max(0, rows - 1) }, (_, index) => index + 1);
  return (
    <div className={`split-grid-overlay ${className}`.trim()} aria-hidden="true">
      {verticalLines.map((line) => (
        <span key={`v-${line}`} className="split-grid-line vertical" style={{ left: `${(line / cols) * 100}%` }} />
      ))}
      {horizontalLines.map((line) => (
        <span key={`h-${line}`} className="split-grid-line horizontal" style={{ top: `${(line / rows) * 100}%` }} />
      ))}
    </div>
  );
}

function CanvasRulers({ rows, cols }: { rows: number; cols: number }) {
  const columnTicks = rulerTicks(cols);
  const rowTicks = rulerTicks(rows);
  return (
    <div className="h5-canvas-rulers" aria-hidden={false}>
      <div className="h5-column-ruler" aria-label="画布列标尺">
        {columnTicks.map((tick) => (
          <span
            key={`col-${tick}`}
            className="h5-ruler-label"
            aria-label={`画布列标 ${tick}`}
            style={{ left: `${((tick - 0.5) / cols) * 100}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
      <div className="h5-row-ruler" aria-label="画布行标尺">
        {rowTicks.map((tick) => (
          <span
            key={`row-${tick}`}
            className="h5-ruler-label"
            aria-label={`画布行标 ${tick}`}
            style={{ top: `${((tick - 0.5) / rows) * 100}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
    </div>
  );
}

function ImageCellCodeOverlay({ cells, cols }: { cells: Cell[]; cols: number }) {
  return (
    <div
      className="h5-image-code-overlay"
      aria-label="导入画布色号"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {cells.map((cell) => (
        <span
          key={`${cell.x}-${cell.y}`}
          className="h5-image-cell-code"
          aria-label={`格子 ${cell.x + 1},${cell.y + 1} 色号 ${colorCodeOf(cell.color)}`}
          style={{ color: colorCodeTextColor(cell.color) }}
        >
          {cell.transparent ? '' : colorCodeOf(cell.color)}
        </span>
      ))}
    </div>
  );
}

function rulerTicks(size: number): number[] {
  const safeSize = Math.max(1, size);
  const ticks: number[] = [];
  for (let tick = 1; tick <= safeSize; tick += 5) {
    ticks.push(tick);
  }
  return ticks;
}

function CanvasScaleObserver({ onScaleChange }: { onScaleChange: (scale: number) => void }) {
  useTransformEffect(({ state }) => {
    onScaleChange(state.scale);
  });
  return null;
}

function touchDistance(first: React.Touch, second: React.Touch): number {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function GridAlignmentHandles({
  grid,
  origin,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: {
  grid: AlignedGrid;
  origin: GridHandlePosition;
  onPointerDown: (handle: GridHandle, event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerEnd: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const frameWidth = (grid.cellSize * GRID_CONTROL_CELLS / Math.max(1, grid.cropWidth)) * 100;
  const frameHeight = (grid.cellSize * GRID_CONTROL_CELLS / Math.max(1, grid.cropHeight)) * 100;
  const handles: Array<{ id: GridHandle; label: string; text: string; className: string }> = [
    { id: 'move', label: '按住移动网格', text: '移动', className: 'move' },
    { id: 'scale', label: '按住缩放网格', text: '缩放', className: 'scale' },
  ];

  return (
    <div className="split-grid-handle-layer" aria-hidden={false}>
      <div
        className="split-grid-control-frame"
        data-grid-span={GRID_CONTROL_CELLS}
        style={{
          left: `${origin.x}%`,
          top: `${origin.y}%`,
          width: `${frameWidth}%`,
          height: `${frameHeight}%`,
        }}
      />
      {handles.map((handle) => (
        <button
          key={handle.id}
          type="button"
          aria-label={handle.label}
          className={`split-grid-handle ${handle.className}`}
          style={{
            left: `${origin.x + (handle.id === 'scale' ? frameWidth : 0)}%`,
            top: `${origin.y + (handle.id === 'scale' ? frameHeight : 0)}%`,
          }}
          onPointerDown={(event) => onPointerDown(handle.id, event)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <span className="split-grid-handle-ring" aria-hidden="true" />
          <span className="split-grid-handle-label">{handle.text}</span>
        </button>
      ))}
    </div>
  );
}

function drawAlignedGridLines(
  context: CanvasRenderingContext2D,
  rect: { width: number; height: number },
  startX: number,
  startY: number,
  stepX: number,
  stepY: number,
  majorEvery = 1,
) {
  if (stepX <= 0 || stepY <= 0) return;
  let firstColumn = Math.floor(-startX / stepX);
  while (startX + firstColumn * stepX > 0) firstColumn -= 1;
  for (let column = firstColumn; startX + column * stepX <= rect.width; column += 1) {
    if (column % majorEvery !== 0) continue;
    const px = startX + column * stepX;
    context.moveTo(px, 0);
    context.lineTo(px, rect.height);
  }

  let firstRow = Math.floor(-startY / stepY);
  while (startY + firstRow * stepY > 0) firstRow -= 1;
  for (let row = firstRow; startY + row * stepY <= rect.height; row += 1) {
    if (row % majorEvery !== 0) continue;
    const py = startY + row * stepY;
    context.moveTo(0, py);
    context.lineTo(rect.width, py);
  }
}

function SplitPreviewCanvas({
  imageData,
  crop,
  rows,
  cols,
  alignment,
}: {
  imageData: ImageData;
  crop: { x: number; y: number; width: number; height: number };
  rows: number;
  cols: number;
  alignment?: AlignedGrid;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceCanvas = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.putImageData(imageData, 0, 0);
    return canvas;
  }, [imageData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceCanvas) return;

    let frameId = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width * pixelRatio));
      const height = Math.max(1, Math.round(rect.height * pixelRatio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, rect.width, rect.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(sourceCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, rect.width, rect.height);

      context.lineWidth = 1;
      context.strokeStyle = 'rgba(32, 142, 220, 0.46)';
      context.beginPath();
      if (alignment) {
        const startX = (alignment.offsetX / crop.width) * rect.width;
        const startY = (alignment.offsetY / crop.height) * rect.height;
        const stepX = (alignment.cellSize / crop.width) * rect.width;
        const stepY = (alignment.cellSize / crop.height) * rect.height;
        drawAlignedGridLines(context, rect, startX, startY, stepX, stepY);
      } else {
        for (let x = 1; x < cols; x += 1) {
          const px = (x / cols) * rect.width;
          context.moveTo(px, 0);
          context.lineTo(px, rect.height);
        }
        for (let y = 1; y < rows; y += 1) {
          const py = (y / rows) * rect.height;
          context.moveTo(0, py);
          context.lineTo(rect.width, py);
        }
      }
      context.stroke();

      context.lineWidth = 1.5;
      context.strokeStyle = 'rgba(20, 105, 180, 0.72)';
      context.beginPath();
      if (alignment) {
        const startX = (alignment.offsetX / crop.width) * rect.width;
        const startY = (alignment.offsetY / crop.height) * rect.height;
        const stepX = (alignment.cellSize / crop.width) * rect.width;
        const stepY = (alignment.cellSize / crop.height) * rect.height;
        drawAlignedGridLines(context, rect, startX, startY, stepX, stepY, 5);
      } else {
        for (let x = 5; x < cols; x += 5) {
          const px = (x / cols) * rect.width;
          context.moveTo(px, 0);
          context.lineTo(px, rect.height);
        }
        for (let y = 5; y < rows; y += 5) {
          const py = (y / rows) * rect.height;
          context.moveTo(0, py);
          context.lineTo(rect.width, py);
        }
      }
      context.stroke();
    };

    const scheduleDraw = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(draw);
    };

    scheduleDraw();
    const resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(canvas);
    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [alignment, cols, crop.height, crop.width, crop.x, crop.y, rows, sourceCanvas]);

  return <canvas ref={canvasRef} className="split-preview-canvas" aria-label="切割画布预览" />;
}

function createBlankCells(rows: number, cols: number): Cell[] {
  return buildCellsFromSamples(rows, cols, () => EMPTY_COLOR).map((cell) => ({ ...cell, transparent: true }));
}

function getImageCrop(imageData: ImageData) {
  const alpha = Array.from({ length: imageData.data.length / 4 }, (_, index) => imageData.data[index * 4 + 3] ?? 0);
  return cropTransparentBounds(alpha, imageData.width, imageData.height);
}

function gridSizeFromImageBounds(width: number, height: number, longSide = MAX_AUTO_GRID_SIDE): { rows: number; cols: number } {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeLongSide = Math.max(1, Math.min(MAX_AUTO_GRID_SIDE, longSide));
  const scale = safeLongSide / Math.max(safeWidth, safeHeight);
  return {
    cols: Math.max(1, Math.round(safeWidth * scale)),
    rows: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function initialAlignCellSize(crop: { width: number; height: number }, cols: number, rows: number): number {
  const requestedSize = Math.max(crop.width / Math.max(1, cols), crop.height / Math.max(1, rows));
  return Math.max(1, Math.min(
    requestedSize,
    crop.width / GRID_CONTROL_CELLS,
    crop.height / GRID_CONTROL_CELLS,
  ));
}

function centeredAlignmentOffset(crop: { width: number; height: number }, cellSize: number) {
  const safeCellSize = Math.max(1, cellSize);
  const cols = Math.max(1, Math.floor(crop.width / safeCellSize));
  const rows = Math.max(1, Math.floor(crop.height / safeCellSize));
  return {
    x: Math.max(0, (crop.width - cols * safeCellSize) / 2),
    y: Math.max(0, (crop.height - rows * safeCellSize) / 2),
  };
}

function centeredGridControlOrigin(
  crop: { width: number; height: number },
  cellSize: number,
  offset: { x: number; y: number },
): GridHandlePosition {
  const frameSize = cellSize * GRID_CONTROL_CELLS;
  const centeredGridLine = (size: number, gridOffset: number) => {
    const maxStart = Math.max(0, size - frameSize);
    const minIndex = Math.ceil(-gridOffset / cellSize);
    const maxIndex = Math.floor((maxStart - gridOffset) / cellSize);
    if (maxIndex < minIndex) return maxStart / 2;
    const target = maxStart / 2;
    const targetIndex = Math.round((target - gridOffset) / cellSize);
    const index = Math.max(minIndex, Math.min(maxIndex, targetIndex));
    return gridOffset + index * cellSize;
  };
  return {
    x: (centeredGridLine(crop.width, offset.x) / Math.max(1, crop.width)) * 100,
    y: (centeredGridLine(crop.height, offset.y) / Math.max(1, crop.height)) * 100,
  };
}

function normalizeGridOffset(offset: number, cellSize: number): number {
  const safeCellSize = Math.max(1, cellSize);
  return ((offset % safeCellSize) + safeCellSize) % safeCellSize;
}

function gridSizeFromAlignment(
  crop: { width: number; height: number },
  cellSize: number,
  offsetX: number,
  offsetY: number,
): AlignedGrid {
  const safeCellSize = Math.max(1, cellSize);
  const normalizedOffsetX = normalizeGridOffset(offsetX, safeCellSize);
  const normalizedOffsetY = normalizeGridOffset(offsetY, safeCellSize);
  const safeOffsetX = Math.min(normalizedOffsetX, Math.max(0, crop.width - safeCellSize));
  const safeOffsetY = Math.min(normalizedOffsetY, Math.max(0, crop.height - safeCellSize));
  return {
    cols: Math.max(1, Math.floor((crop.width - safeOffsetX) / safeCellSize)),
    rows: Math.max(1, Math.floor((crop.height - safeOffsetY) / safeCellSize)),
    cellSize: safeCellSize,
    offsetX: safeOffsetX,
    offsetY: safeOffsetY,
    cropWidth: crop.width,
    cropHeight: crop.height,
  };
}

function cellsFromImage(
  imageData: ImageData,
  rows: number,
  cols: number,
  crop = getImageCrop(imageData),
): Cell[] {
  const samplesPerCell = 3;

  return buildCellsFromSamples(rows, cols, (x, y) => {
    const pixels: number[] = [];
    for (let sy = 0; sy < samplesPerCell; sy += 1) {
      for (let sx = 0; sx < samplesPerCell; sx += 1) {
        const px = Math.min(
          imageData.width - 1,
          Math.floor(crop.x + ((x + (sx + 0.5) / samplesPerCell) / cols) * crop.width),
        );
        const py = Math.min(
          imageData.height - 1,
          Math.floor(crop.y + ((y + (sy + 0.5) / samplesPerCell) / rows) * crop.height),
        );
        const offset = (py * imageData.width + px) * 4;
        pixels.push(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2], imageData.data[offset + 3]);
      }
    }
    return sampleDominantColor(pixels, MARD_221_HEX);
  }).map((cell) => ({ ...cell, transparent: false }));
}

function cellsFromAlignedGrid(
  imageData: ImageData,
  grid: AlignedGrid,
  crop = getImageCrop(imageData),
): Cell[] {
  const samplesPerCell = 3;

  return buildCellsFromSamples(grid.rows, grid.cols, (x, y) => {
    const pixels: number[] = [];
    for (let sy = 0; sy < samplesPerCell; sy += 1) {
      for (let sx = 0; sx < samplesPerCell; sx += 1) {
        const px = Math.min(
          imageData.width - 1,
          Math.floor(crop.x + grid.offsetX + (x + (sx + 0.5) / samplesPerCell) * grid.cellSize),
        );
        const py = Math.min(
          imageData.height - 1,
          Math.floor(crop.y + grid.offsetY + (y + (sy + 0.5) / samplesPerCell) * grid.cellSize),
        );
        const offset = (py * imageData.width + px) * 4;
        pixels.push(imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2], imageData.data[offset + 3]);
      }
    }
    return sampleDominantColor(pixels, MARD_221_HEX);
  }).map((cell) => ({ ...cell, transparent: false }));
}

async function loadImageData(file: File): Promise<ImageData> {
  const imageUrl = URL.createObjectURL(file);
  try {
    return await loadImageDataFromUrl(imageUrl);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function loadImageDataFromUrl(imageUrl: string): Promise<ImageData> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas unsupported');
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function extractUrlFromText(text: string): string {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0]?.trim() ?? text.trim();
}

function xhsPreviewSrc(image: XhsExtractedImage): string {
  if (image.imageDataUrl) return image.imageDataUrl;
  if (!image.imageUrl) return '';
  return `${API_BASE}/xiaohongshu/proxy?url=${encodeURIComponent(image.imageUrl)}`;
}

function safeImageFilename(filename: string, type: string): string {
  const base = filename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'xiaohongshu-drawing';
  const extension = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png';
  return `${base}.${extension}`;
}

function imageDataToUrl(imageData: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function colorCodeOf(hex: string): string {
  const normalized = normalizeHexForPalette(hex);
  const exact = MARD_221_COLORS.find((color) => color.hex.toLowerCase() === normalized);
  if (exact) return exact.code;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const nearest = nearestPaletteColor(r, g, b, MARD_221_HEX);
  return MARD_221_COLORS.find((color) => color.hex.toLowerCase() === nearest)?.code ?? hex;
}

function colorCodeTextColor(hex: string): '#000000' | '#ffffff' {
  const normalized = normalizeHexForPalette(hex);
  const relativeChannel = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const red = relativeChannel(Number.parseInt(normalized.slice(1, 3), 16));
  const green = relativeChannel(Number.parseInt(normalized.slice(3, 5), 16));
  const blue = relativeChannel(Number.parseInt(normalized.slice(5, 7), 16));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

function sameCells(left: Cell[], right: Cell[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftCell = left[index];
    const rightCell = right[index];
    if (
      leftCell.x !== rightCell.x ||
      leftCell.y !== rightCell.y ||
      leftCell.transparent !== rightCell.transparent ||
      leftCell.color.toLowerCase() !== rightCell.color.toLowerCase()
    ) {
      return false;
    }
  }
  return true;
}

function createBeadPatternCanvas(cells: Cell[], rows: number, cols: number): HTMLCanvasElement {
  const cellSize = Math.max(24, cols > 80 || rows > 80 ? 28 : cols > 50 || rows > 50 ? 34 : 44);
  const headerSize = cellSize;
  const margin = 28;
  const titleHeight = 68;
  const legendGap = 24;
  const legendSwatch = 54;
  const legendItemWidth = 74;
  const legendItemHeight = 82;
  const legendColumns = Math.max(1, Math.floor(((cols + 2) * cellSize) / legendItemWidth));
  const stats = beadPatternStats(cells);
  const legendRows = Math.max(1, Math.ceil(stats.length / legendColumns));
  const gridWidth = (cols + 2) * cellSize;
  const gridHeight = (rows + 2) * cellSize;
  const width = margin * 2 + gridWidth;
  const height = margin * 2 + titleHeight + gridHeight + legendGap + legendRows * legendItemHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return canvas;

  context.fillStyle = '#f2f2f2';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(margin, margin + titleHeight - 12, gridWidth, gridHeight + legendGap + legendRows * legendItemHeight);

  context.fillStyle = '#151515';
  context.font = '700 34px system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('导出拼豆图纸', width / 2, margin + 28);

  const gridX = margin;
  const gridY = margin + titleHeight;
  const headerFill = '#858bdc';
  const headerText = '#111111';
  const cellFontSize = Math.max(9, Math.floor(cellSize * 0.34));
  const headerFontSize = Math.max(10, Math.floor(cellSize * 0.36));

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 1;
  context.strokeStyle = '#1b1b1b';

  for (let y = 0; y < rows + 2; y += 1) {
    for (let x = 0; x < cols + 2; x += 1) {
      const px = gridX + x * cellSize;
      const py = gridY + y * cellSize;
      const isHeader = y === 0 || y === rows + 1 || x === 0 || x === cols + 1;
      context.fillStyle = isHeader ? headerFill : '#ffffff';

      if (!isHeader) {
        const cell = cells[(y - 1) * cols + (x - 1)];
        context.fillStyle = patternCellColor(cell);
      }
      context.fillRect(px, py, cellSize, cellSize);
      context.strokeRect(px, py, cellSize, cellSize);

      let label = '';
      if (isHeader) {
        if ((y === 0 || y === rows + 1) && x > 0 && x <= cols) label = String(x);
        if ((x === 0 || x === cols + 1) && y > 0 && y <= rows) label = String(y);
        context.fillStyle = headerText;
        context.font = `700 ${headerFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      } else {
        const cell = cells[(y - 1) * cols + (x - 1)];
        const color = patternCellColor(cell);
        label = colorCodeOf(color);
        context.fillStyle = readableTextColor(color);
        context.font = `700 ${cellFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      }
      if (label) context.fillText(label, px + cellSize / 2, py + cellSize / 2);
    }
  }

  context.strokeStyle = '#000000';
  context.lineWidth = 4;
  for (let x = 0; x <= cols + 2; x += 5) {
    const px = gridX + x * cellSize;
    context.beginPath();
    context.moveTo(px, gridY);
    context.lineTo(px, gridY + gridHeight);
    context.stroke();
  }
  for (let y = 0; y <= rows + 2; y += 5) {
    const py = gridY + y * cellSize;
    context.beginPath();
    context.moveTo(gridX, py);
    context.lineTo(gridX + gridWidth, py);
    context.stroke();
  }
  context.strokeRect(gridX, gridY, gridWidth, gridHeight);

  const legendX = margin;
  const legendY = gridY + gridHeight + legendGap;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  stats.forEach((item, index) => {
    const x = legendX + (index % legendColumns) * legendItemWidth;
    const y = legendY + Math.floor(index / legendColumns) * legendItemHeight;
    roundRect(context, x + 3, y, legendSwatch, legendSwatch, 10);
    context.fillStyle = item.color;
    context.fill();
    context.strokeStyle = '#555555';
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = readableTextColor(item.color);
    context.font = '700 17px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText(item.code, x + 3 + legendSwatch / 2, y + legendSwatch / 2);
    context.fillStyle = '#111111';
    context.font = '700 21px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText(String(item.count), x + 3 + legendSwatch / 2, y + legendSwatch + 22);
  });

  return canvas;
}

function beadPatternStats(cells: Cell[]): Array<{ code: string; color: string; count: number }> {
  const counts = new Map<string, { code: string; color: string; count: number }>();
  for (const cell of cells) {
    const color = patternCellColor(cell);
    const code = colorCodeOf(color);
    const key = `${code}:${color.toLowerCase()}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { code, color, count: 1 });
    }
  }
  return [...counts.values()].sort((left, right) => {
    return left.code.localeCompare(right.code, 'en', { numeric: true });
  });
}

function patternCellColor(cell: Cell | undefined): string {
  if (!cell || cell.transparent) return WHITE_BEAD_COLOR;
  return normalizeHexForPalette(cell.color);
}

function normalizeHexForPalette(hex: string): string {
  const normalized = hex.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : WHITE_BEAD_COLOR;
}

function readableTextColor(hex: string): string {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? '#151515' : '#ffffff';
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const quickTools: Array<{ title: string; description: string; icon: IconName; mode: WorkMode }> = [
  { title: '拼豆图纸', description: '上传图片生成色号清单', icon: 'spark', mode: 'bead' },
  { title: '敲豆豆图纸', description: '同一图纸导出 STL 模型', icon: 'layers', mode: 'peg' },
];

function normalizeGridSize(value: number): number {
  return Math.max(2, Math.min(MAX_AUTO_GRID_SIDE, Math.round(value) || 32));
}

function resizeCells(oldCells: Cell[], oldRows: number, oldCols: number, newRows: number, newCols: number): Cell[] {
  const result: Cell[] = [];
  for (let y = 0; y < newRows; y++) {
    for (let x = 0; x < newCols; x++) {
      const existing = oldCells.find((c) => c.x === x && c.y === y);
      if (existing) {
        result.push(existing);
      } else {
        result.push({ x, y, color: EMPTY_COLOR, transparent: true });
      }
    }
  }
  return result;
}

export default H5App;
