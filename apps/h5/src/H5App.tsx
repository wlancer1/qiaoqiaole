import { useEffect, useMemo, useRef, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
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

type AppScreen = 'home' | 'profile' | 'split' | 'split-preview' | 'canvas';
type CanvasKind = 'image' | 'grid';
type CanvasTool = 'brush' | 'eraser' | 'fill' | 'eyedropper' | 'pan';
type WorkMode = 'bead' | 'peg';
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

type UploadedSplitImage = {
  name: string;
  imageData: ImageData;
  crop: { x: number; y: number; width: number; height: number };
  url: string;
};

const canvasTools: Array<{ tool: CanvasTool; label: string; icon: IconName }> = [
  { tool: 'brush', label: '画笔工具', icon: 'brush' },
  { tool: 'eraser', label: '橡皮工具', icon: 'eraser' },
  { tool: 'fill', label: '填充工具', icon: 'fill' },
  { tool: 'eyedropper', label: '取色工具', icon: 'eyedropper' },
  { tool: 'pan', label: '拖拽工具', icon: 'hand' },
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
  const [tool, setTool] = useState<CanvasTool>('brush');
  const [status, setStatus] = useState('设置画布尺寸或上传图片开始。');
  const [history, setHistory] = useState<Cell[][]>([]);
  const [future, setFuture] = useState<Cell[][]>([]);
  const [showPaletteSearch, setShowPaletteSearch] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [uploadedSplitImage, setUploadedSplitImage] = useState<UploadedSplitImage | null>(null);
  const [splitLongSide, setSplitLongSide] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [splitRows, setSplitRows] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const [splitCols, setSplitCols] = useState(DEFAULT_SPLIT_LONG_SIDE);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Zoom & Pan states for mobile artboard
  const [zoom, setZoom] = useState(1.0);
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

  const totalBeads = useMemo(() => cells.filter((cell) => !cell.transparent).length, [cells]);
  const usedColors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cell of cells) {
      if (!cell.transparent) counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [cells]);
  const splitPreviewCells = useMemo(() => {
    if (screen !== 'split-preview') return [];
    if (!uploadedSplitImage) return [];
    return cellsFromImage(uploadedSplitImage.imageData, splitRows, splitCols, uploadedSplitImage.crop);
  }, [screen, splitCols, splitRows, uploadedSplitImage]);
  const filteredPaletteColors = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    if (!query) return MARD_221_COLORS;
    return MARD_221_COLORS.filter((color) => color.code.toLowerCase().includes(query) || color.hex.toLowerCase().includes(query));
  }, [paletteQuery]);

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
    setWorkMode(nextMode);
    fileInputRef.current?.click();
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
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
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
    setSplitLongSide(nextLongSide);
    if (!uploadedSplitImage) return;
    const nextSize = gridSizeFromImageBounds(uploadedSplitImage.crop.width, uploadedSplitImage.crop.height, nextLongSide);
    setSplitRows(nextSize.rows);
    setSplitCols(nextSize.cols);
    setStatus(`分割数量已调整为 ${nextSize.cols} x ${nextSize.rows}。`);
  };

  const importSplitToCanvas = () => {
    if (!uploadedSplitImage) return;
    const nextCells = cellsFromImage(uploadedSplitImage.imageData, splitRows, splitCols, uploadedSplitImage.crop);
    setRows(splitRows);
    setCols(splitCols);
    setCfgRows(splitRows);
    setCfgCols(splitCols);
    setCells(nextCells);
    setCanvasKind('image');
    setHistory([]);
    setFuture([]);
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
    setScreen('canvas');
    setStatus(`已导入画布：${splitCols} x ${splitRows}。`);
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
      const crop = getImageCrop(imageData);
      const url = imageDataToUrl(imageData);
      const { rows: defaultRows, cols: defaultCols } = gridSizeFromImageBounds(crop.width, crop.height, DEFAULT_SPLIT_LONG_SIDE);
      setUploadedSplitImage({ name: file.name, imageData, crop, url });
      setSplitLongSide(DEFAULT_SPLIT_LONG_SIDE);
      setSplitRows(defaultRows);
      setSplitCols(defaultCols);
      setHistory([]);
      setFuture([]);
      setScreen('split');
      setStatus(`已载入 ${file.name}，默认长边 ${DEFAULT_SPLIT_LONG_SIDE} 格。`);
    } catch {
      setStatus('图片读取失败，请换一张图片。');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
      if (cell.transparent) {
        setStatus('当前格子已经是空白。');
        return;
      }
      commitCells(
        cells.map((item) => (item.x === cell.x && item.y === cell.y ? { ...item, color: EMPTY_COLOR, transparent: true } : item)),
        '已擦除当前格子。',
      );
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

    if (!cell.transparent && cell.color.toLowerCase() === selectedColor.toLowerCase()) {
      setStatus(`当前格子已经是 ${selectedCode}。`);
      return;
    }
    commitCells(replaceCell(cells, cell.x, cell.y, selectedColor), `已绘制 ${selectedCode}。`);
  };

  const handleImageCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'pan') return;
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const x = Math.min(cols - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * cols)));
    const y = Math.min(rows - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * rows)));
    const cell = cells.find((item) => item.x === x && item.y === y);
    if (cell) handleCellTap(cell);
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
      <main className="split-page">
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
          <div className="split-image-container" aria-label="分割预览图">
            <div className="split-image-frame">
              <img src={uploadedSplitImage.url} alt="待分割图片" />
              <GridOverlay rows={splitRows} cols={splitCols} />
            </div>
          </div>

          <div className="split-controls-card">
            <div className="split-info-row">
              <span className="split-info-label">分割数量</span>
              <span className="split-info-value">{splitCols} × {splitRows}</span>
            </div>
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
          <span className="split-meta-chip">{splitCols} × {splitRows} 格</span>
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
      <main className="h5-canvas-page" aria-label="H5 画布编辑器">
        <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleUpload(event.target.files?.[0])} />
        
        <header className="canvas-topbar">
          <div className="topbar-left">
            <button className="top-icon-btn close-btn" aria-label="关闭画布" onClick={() => setScreen('home')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <button className="top-icon-btn sliders-btn" aria-label="画布设置" onClick={() => setShowSettings(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line></svg>
            </button>
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
                onClick={() => setTool(item.tool)}
              >
                <Icon name={item.icon} />
              </button>
            ))}
          </aside>

          <section className="canvas-stage">
            <TransformWrapper
              initialScale={1}
              minScale={0.2}
              maxScale={12}
              centerOnInit={true}
              panning={{ disabled: tool !== 'pan' }}
              doubleClick={{ disabled: true }}
              wheel={{ step: 0.15 }}
            >
              {({ zoomIn, zoomOut, resetTransform }) => (
                <>
                  <TransformComponent
                    wrapperStyle={{ width: '100%', height: '100%', overflow: 'hidden' }}
                    contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {canvasKind === 'image' ? (
                      <div className="h5-image-artboard" style={{ aspectRatio: `${cols} / ${rows}` }}>
                        <canvas
                          ref={imageCanvasRef}
                          className="h5-image-canvas"
                          aria-label="拼豆像素画布"
                          onClick={handleImageCanvasClick}
                        />
                        <GridOverlay rows={rows} cols={cols} className="h5-image-grid-overlay" />
                      </div>
                    ) : (
                      <div
                        className="h5-artboard"
                        style={{
                          aspectRatio: `${cols} / ${rows}`,
                        }}
                      >
                        <div className="h5-canvas-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                          {cells.map((cell) => (
                            <button
                              key={`${cell.x}-${cell.y}`}
                              className={cell.transparent ? 'h5-canvas-cell transparent' : 'h5-canvas-cell'}
                              style={{ background: cell.transparent ? undefined : cell.color }}
                              aria-label={`格子 ${cell.x + 1},${cell.y + 1}`}
                              onClick={() => handleCellTap(cell)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </TransformComponent>
                  <div className="canvas-zoom-controls" aria-label="画布缩放控制">
                    <button aria-label="放大画布" onClick={() => zoomIn(0.35)}>+</button>
                    <button aria-label="缩小画布" onClick={() => zoomOut(0.35)}>-</button>
                    <button aria-label="重置画布视图" onClick={() => resetTransform()}>1:1</button>
                  </div>
                </>
              )}
            </TransformWrapper>
            <p className="canvas-status">{status}</p>
          </section>
        </section>

        <footer className="canvas-palette" aria-label="底部色卡">
          <div className="palette-strip">
            {MARD_221_COLORS.map((color) => (
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

  return (
    <main className="h5-home-shell">
      <input ref={fileInputRef} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleUpload(event.target.files?.[0])} />
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
            <strong>本地项目</strong>
            <span>历史记录、收藏图纸和导出文件会放在这里。</span>
          </div>
          <button className="profile-row"><Icon name="folder" /> 历史记录</button>
          <button className="profile-row"><Icon name="help" /> 帮助中心</button>
          <button className="profile-row"><Icon name="settings" /> 设置</button>
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

async function loadImageData(file: File): Promise<ImageData> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
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
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
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
  // { title: '敲豆豆图纸', description: '同一图纸导出 STL 模型', icon: 'layers', mode: 'peg' },
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
