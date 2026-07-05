import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import {
  bucketFill,
  buildCellsFromSamples,
  cropTransparentBounds,
  DEFAULT_SETTINGS,
  MARD_221_COLORS,
  MARD_221_HEX,
  nearestPaletteColor,
  replaceCell,
  sampleDominantColor,
  buildModelParts,
  estimateMaterialCm3,
  serializeAsciiStl,
  type Cell,
  type Settings,
} from '@qiaoqiaole/core';

type Tool = 'brush' | 'bucket' | 'eyedropper';
type ViewMode = '2d' | '3d';
type ActiveTool = 'bead-pattern' | 'peg-board';
type RangeStyle = CSSProperties & { '--progress': string };

type UploadedImage = {
  name: string;
  url: string;
  width: number;
  height: number;
  imageData: ImageData;
  crop: { x: number; y: number; width: number; height: number };
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_IMAGE_SIDE = 4096;

function App() {
  const [rows, setRows] = useState(16);
  const [cols, setCols] = useState(16);
  const [cells, setCells] = useState<Cell[] | null>(null); // null = no grid yet
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selectedColor, setSelectedColor] = useState('#fc283c');
  const [tool, setTool] = useState<Tool>('brush');
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [activeTool, setActiveTool] = useState<ActiveTool>('bead-pattern');
  const [history, setHistory] = useState<Cell[][]>([]);
  const [future, setFuture] = useState<Cell[][]>([]);
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [status, setStatus] = useState('上传图片或手动设置网格大小后开始编辑。');
  const [zoom, setZoom] = useState(1.0);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const pixelGridRef = useRef<HTMLDivElement | null>(null);

  // Derived from cells for rendering; if null, show empty canvas
  const activeCells = cells ?? [];

  const modelParts = useMemo(() => buildModelParts(activeCells, rows, cols, settings), [activeCells, rows, cols, settings]);
  const materialCm3 = useMemo(() => estimateMaterialCm3(modelParts), [modelParts]);
  const dimensions = useMemo(
    () => ({
      width: cols * settings.cellSize,
      depth: rows * settings.cellSize,
      height: settings.pegHeight,
    }),
    [cols, rows, settings],
  );
  const paletteStats = useMemo(() => buildPaletteStats(activeCells), [activeCells]);
  const totalBeads = useMemo(() => activeCells.filter((cell) => !cell.transparent).length, [activeCells]);

  const commitCells = useCallback((nextCells: Cell[]) => {
    setCells((current) => {
      setHistory((items) => [...items.slice(-24), current ?? []]);
      setFuture([]);
      return nextCells;
    });
  }, []);

  const regenerateFromImage = useCallback(
    (image: UploadedImage, nextRows = rows, nextCols = cols) => {
      const generated = cellsFromImageData(image.imageData, image.crop, nextRows, nextCols);
      setRows(nextRows);
      setCols(nextCols);
      commitCells(generated);
      setStatus(`已从 ${image.name} 生成 ${nextCols} x ${nextRows} 网格。`);
    },
    [cols, commitCells, rows],
  );

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setStatus('仅支持 jpg、jpeg、png、webp 图片。');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setStatus('图片超过 20MB，请压缩后再上传。');
      return;
    }

    try {
      const parsed = await loadImageFile(file);
      setUploadedImage(parsed);
      regenerateFromImage(parsed);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '图片处理失败。');
    }
  };

  const handleCellAction = (cell: Cell) => {
    if (!cells) return;
    if (tool === 'eyedropper') {
      if (!cell.transparent) setSelectedColor(cell.color);
      setStatus(`已吸取颜色 ${cell.color}`);
      return;
    }

    if (tool === 'bucket') {
      commitCells(bucketFill(cells, rows, cols, cell.x, cell.y, selectedColor));
      return;
    }

    commitCells(replaceCell(cells, cell.x, cell.y, selectedColor));
  };

  const undo = useCallback(() => {
    setHistory((items) => {
      if (items.length === 0) return items;
      const previous = items[items.length - 1];
      setFuture((futureItems) => [activeCells, ...futureItems]);
      setCells(previous.length === 0 ? null : previous);
      return items.slice(0, -1);
    });
  }, [activeCells]);

  const redo = useCallback(() => {
    setFuture((items) => {
      if (items.length === 0) return items;
      const [next, ...remaining] = items;
      setHistory((historyItems) => [...historyItems, activeCells]);
      setCells(next.length === 0 ? null : next);
      return remaining;
    });
  }, [activeCells]);

  // Fit canvas zoom to fill the visible area
  const fitToView = useCallback(() => {
    const scroll = canvasScrollRef.current;
    if (!scroll || !cells) return;
    const CELL = 28; // px, the base cell size (--pixel-cell-size)
    const MARGIN = 32; // 16px * 2
    const availW = scroll.clientWidth - MARGIN;
    const availH = scroll.clientHeight - MARGIN;
    const gridW = cols * CELL + cols; // cells + gaps
    const gridH = rows * CELL + rows;
    const scale = Math.min(availW / gridW, availH / gridH, 4);
    setZoom(Math.max(0.1, scale));
    // After zoom settles, scroll to center
    requestAnimationFrame(() => {
      if (!scroll) return;
      scroll.scrollLeft = (scroll.scrollWidth - scroll.clientWidth) / 2;
      scroll.scrollTop = (scroll.scrollHeight - scroll.clientHeight) / 2;
    });
  }, [cells, cols, rows]);

  // Ctrl+wheel = zoom canvas
  useEffect(() => {
    const el = canvasScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(4, Math.max(0.1, Math.round((z + delta) * 10) / 10)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
      } else if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  const exportStl = () => {
    const stl = serializeAsciiStl('qiaoqiaole_peg_board', modelParts);
    const blob = new Blob([stl], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'qiaoqiaole-all.stl';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const export2dDrawing = () => {
    const svg = serializeGridAsSvg(activeCells, rows, cols, settings);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'qiaoqiaole-2d-drawing.svg';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <h1>拼豆 / 敲豆豆生成器</h1>
        </div>

        <nav className="tool-switcher-header" aria-label="工具切换">
          <button
            aria-label="拼豆图纸"
            className={activeTool === 'bead-pattern' ? 'active' : ''}
            onClick={() => {
              setActiveTool('bead-pattern');
              setViewMode('2d');
            }}
          >
            拼豆图纸
          </button>
          <button
            aria-label="敲豆豆图纸"
            className={activeTool === 'peg-board' ? 'active' : ''}
            onClick={() => setActiveTool('peg-board')}
          >
            敲豆豆图纸
          </button>
        </nav>

        <div className="topbar-actions">
          <button className="secondary-button" onClick={undo} disabled={history.length === 0}>撤销</button>
          <button className="secondary-button" onClick={redo} disabled={future.length === 0}>重做</button>
          <button className="secondary-button" onClick={export2dDrawing}>导出 SVG</button>
          <button className="primary-button" onClick={exportStl}>导出 STL</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel left-panel">
          <PanelTitle title="图片与网格" hint="上传、裁切、像素化" />
          <label className="upload-zone">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => handleUpload(event.target.files?.[0])}
            />
            <div className="upload-icon">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <span>选择参考图片</span>
            <small>最大 4096 x 4096 / 20MB</small>
          </label>

          {uploadedImage ? (
            <div className="image-preview">
              <img src={uploadedImage.url} alt="处理后的参考图" />
              <dl>
                <div><dt>原图</dt><dd>{uploadedImage.width} x {uploadedImage.height}</dd></div>
                <div><dt>裁切</dt><dd>{uploadedImage.crop.width} x {uploadedImage.crop.height}</dd></div>
              </dl>
            </div>
          ) : (
            <div className="empty-preview">当前使用内置示例网格</div>
          )}

          <div className="control-grid">
            <NumberField label="网格大小" value={rows} min={1} max={200} onChange={(value) => {
              if (uploadedImage) {
                regenerateFromImage(uploadedImage, value, value);
              } else {
                setRows(value);
                setCols(value);
                // Only create cells when user explicitly sets size
                commitCells(createEmptyCells(value, value));
              }
            }} />
          </div>

          <div>
            {cells == null ? (
              <button className="primary-button full-canvas-btn" onClick={() => {
                const initialCells = createEmptyCells(rows, cols);
                setCells(initialCells);
              }}>
                新建 {rows} × {cols} 网格
              </button>
            ) : null}
          </div>

          <p className="status-line">{status}</p>
        </aside>

        <section className="editor-area">
          <div className="toolbar">
            {activeTool === 'peg-board' && (
              <SegmentedControl
                value={viewMode}
                options={[
                  ['2d', '2D'],
                  ['3d', '3D 预览'],
                ]}
                onChange={setViewMode}
              />
            )}
            {(activeTool === 'bead-pattern' || viewMode === '2d') ? (
              <>
                <SegmentedControl
                  value={tool}
                  options={[
                    ['brush', '画笔'],
                    ['bucket', '填充'],
                    ['eyedropper', '取色'],
                  ]}
                  onChange={setTool}
                />
                <label className="active-color color-picker" aria-label="当前颜色">
                  <span style={{ background: selectedColor }} />
                  <span className="color-hex">{selectedColor}</span>
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(event) => setSelectedColor(nearestMardColor(event.target.value))}
                    aria-label="选择当前颜色"
                  />
                </label>
              </>
            ) : (
              <div className="model-stats" aria-label="模型尺寸">
                <span>{dimensions.width.toFixed(1)} × {dimensions.depth.toFixed(1)} × {dimensions.height.toFixed(1)} mm</span>
                <span>{materialCm3.toFixed(1)} cm³</span>
              </div>
            )}
            {cells && (
              <div className="zoom-controls">
                <button className="zoom-btn" onClick={() => setZoom(z => Math.max(0.1, Math.round((z - 0.1) * 10) / 10))} aria-label="缩小">−</button>
                <button className="zoom-level" onClick={fitToView} title="单击适应窗口">{Math.round(zoom * 100)}%</button>
                <button className="zoom-btn" onClick={() => setZoom(z => Math.min(4, Math.round((z + 0.1) * 10) / 10))} aria-label="放大">+</button>
              </div>
            )}
            <div className="sheet-metrics" aria-label="图纸规格">
              {cells ? <span>{cols} × {rows} &nbsp;共 {totalBeads} 颗</span> : <span>未建立画布</span>}
            </div>
          </div>

          {(activeTool === 'bead-pattern' || viewMode === '2d') ? (
            <div className="canvas-scroll" ref={canvasScrollRef} aria-label="2D 网格滚动画布">
              {cells == null ? (
                <div className="canvas-empty-state">
                  <div className="canvas-empty-content">
                    <p>请先设置网格大小并点击「新建」，或上传图片开始。</p>
                  </div>
                </div>
              ) : (
                /* scroll-sizer: gives the scroll container real dimensions at the zoomed size */
                <div
                  className="pixel-grid-sizer"
                  style={{
                    width: `calc(var(--pixel-cell-size) * ${cols} * ${zoom} + ${cols}px * ${zoom} + 32px)`,
                    height: `calc(var(--pixel-cell-size) * ${rows} * ${zoom} + ${rows}px * ${zoom} + 32px)`,
                  }}
                >
                  <div
                    className="pixel-grid"
                    ref={pixelGridRef}
                    style={{
                      gridTemplateColumns: `repeat(${cols}, var(--pixel-cell-size))`,
                      transform: `scale(${zoom})`,
                    }}
                  >
                    {activeCells.map((cell) => (
                      <button
                        key={`${cell.x}-${cell.y}`}
                        className={`pixel-cell ${activeTool === 'bead-pattern' ? 'pattern-sheet-cell' : 'peg-board-sheet-cell'}`}
                        style={{ background: cell.transparent ? 'transparent' : cell.color }}
                        title={`${cell.x}, ${cell.y}: ${cell.transparent ? '透明' : cell.color}`}
                        onClick={() => handleCellAction(cell)}
                        aria-label={`格子 ${cell.x}, ${cell.y}, ${cell.transparent ? '透明' : cell.color}`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="model-view">
              <div className="model-info-bar">
                <span>{dimensions.width.toFixed(1)} × {dimensions.depth.toFixed(1)} × {dimensions.height.toFixed(1)} mm</span>
                <span>{materialCm3.toFixed(1)} cm³</span>
              </div>
              <ThreePreview cells={activeCells} rows={rows} cols={cols} settings={settings} />
            </div>
          )}
        </section>

        <aside className="panel right-panel">
          {activeTool === 'bead-pattern' ? (
            <BeadPatternPanel
              cols={cols}
              rows={rows}
              totalBeads={totalBeads}
              paletteStats={paletteStats}
              onExport={export2dDrawing}
            />
          ) : (
            <PegBoardPanel
              settings={settings}
              setSettings={setSettings}
              dimensions={dimensions}
              materialCm3={materialCm3}
              onExport={exportStl}
            />
          )}

          {(activeTool === 'bead-pattern' || viewMode === '2d') && (
            <div className="settings-block">
              <PanelTitle title="MARD 221 色卡" hint="标准拼豆色" />
              <div className="palette-chip-list">
                {MARD_221_COLORS.map((color) => (
                  <button
                    key={color.code}
                    className={color.hex === selectedColor ? 'palette-chip selected' : 'palette-chip'}
                    style={{ background: color.hex }}
                    title={`${color.code} ${color.hex}`}
                    aria-label={`选择颜色 ${color.code} ${color.hex}`}
                    onClick={() => setSelectedColor(color.hex)}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function BeadPatternPanel({
  cols,
  rows,
  totalBeads,
  paletteStats,
  onExport,
}: {
  cols: number;
  rows: number;
  totalBeads: number;
  paletteStats: Array<{ color: string; code: string; count: number }>;
  onExport: () => void;
}) {
  return (
    <div className="tool-panel-content">
      <PanelTitle title="颜色用量" hint="拼豆清单" />
      <div className="summary-grid">
        <div>
          <span>图纸尺寸</span>
          <strong>{cols} x {rows}</strong>
        </div>
        <div>
          <span>总用量</span>
          <strong>共 {totalBeads} 颗</strong>
        </div>
      </div>
      <div className="color-usage-list">
        {paletteStats.map((item) => (
          <div key={item.color} className="color-usage-row">
            <span className="swatch" style={{ background: item.color }} />
            <code>{item.code} {item.color}</code>
            <strong>{item.count} 颗</strong>
          </div>
        ))}
      </div>
      <button className="primary-button full-width" onClick={onExport}>导出拼豆图纸 SVG</button>
    </div>
  );
}

function PegBoardPanel({
  settings,
  setSettings,
  dimensions,
  materialCm3,
  onExport,
}: {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  dimensions: { width: number; depth: number; height: number };
  materialCm3: number;
  onExport: () => void;
}) {
  return (
    <div className="tool-panel-content">
      <PanelTitle title="打印参数" hint="单位：mm" />
      <div className="summary-grid">
        <div>
          <span>模型尺寸</span>
          <strong>{dimensions.width.toFixed(1)} x {dimensions.depth.toFixed(1)}</strong>
        </div>
        <div>
          <span>预计体积</span>
          <strong>{materialCm3.toFixed(1)} cm³</strong>
        </div>
      </div>
      <NumberField label="格子尺寸" value={settings.cellSize} min={4} max={30} step={0.5} onChange={(value) => setSettings({ ...settings, cellSize: value })} />
      <NumberField label="网格高度" value={settings.wallHeight} min={1} max={20} step={0.5} onChange={(value) => setSettings({ ...settings, wallHeight: value })} />
      <NumberField label="网格厚度" value={settings.wallThickness} min={0.4} max={4} step={0.1} onChange={(value) => setSettings({ ...settings, wallThickness: value })} />
      <NumberField label="底板厚度" value={settings.baseThickness} min={0.4} max={6} step={0.1} onChange={(value) => setSettings({ ...settings, baseThickness: value })} />
      <NumberField label="边框厚度" value={settings.frameThickness} min={0.5} max={8} step={0.1} onChange={(value) => setSettings({ ...settings, frameThickness: value })} />
      <NumberField label="豆豆直径" value={settings.pegDiameter} min={2} max={25} step={0.5} onChange={(value) => setSettings({ ...settings, pegDiameter: value })} />
      <NumberField label="豆豆高度" value={settings.pegHeight} min={1} max={12} step={0.5} onChange={(value) => setSettings({ ...settings, pegHeight: value })} />
      <button className="primary-button full-width" onClick={onExport}>导出 STL</button>
    </div>
  );
}

function PanelTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <p>{hint}</p>
    </div>
  );
}

function getOptionIcon(value: string) {
  switch (value) {
    case '2d':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
        </svg>
      );
    case '3d':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'brush':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          <path d="M7.5 10.5c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5z" />
          <path d="M11.5 7.5c.828 0 1.5-.672 1.5-1.5S12.328 4.5 11.5 4.5 10 5.172 10 6s.672 1.5 1.5 1.5z" />
          <path d="M16.5 9.5c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5-1.5.672-1.5 1.5.672 1.5 1.5 1.5z" />
          <path d="M6 14c0-2 2-3 4-3 2.5 0 4.5 1.5 5 4 .324 1.622-1 3-2.5 3H7.5c-1.5 0-1.5-4-1.5-4z" />
        </svg>
      );
    case 'bucket':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22a7 7 0 0 0 7-7c0-4.3-7-11-7-11S5 10.7 5 15a7 7 0 0 0 7 7z" />
        </svg>
      );
    case 'eyedropper':
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m2 22 1-1h3l9-9-3-3-9 9v3H2Z" />
          <path d="M16 8 20 4l-2-2-4 4 2 2Z" />
          <path d="m19 9 3 3" />
        </svg>
      );
    default:
      return null;
  }
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-control">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          className={value === optionValue ? 'active' : ''}
          onClick={() => onChange(optionValue)}
        >
          {getOptionIcon(optionValue)}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const normalizedValue = Number.isInteger(step) ? value : Number(value.toFixed(2));
  const commitValue = (rawValue: number) => {
    if (!Number.isFinite(rawValue)) return;
    const precision = decimalsOf(step);
    const clamped = Math.min(max, Math.max(min, rawValue));
    const rounded = Number(clamped.toFixed(precision));
    onChange(rounded);
  };

  return (
    <div className="number-field">
      <div className="number-field-head">
        <span>{label}</span>
        <input
          aria-label={label}
          type="number"
          value={normalizedValue}
          min={min}
          max={max}
          step={step}
          onChange={(event) => commitValue(Number(event.target.value))}
        />
      </div>
      <input
        aria-label={`${label}滑杆`}
        className="range-control"
        type="range"
        value={normalizedValue}
        min={min}
        max={max}
        step={step}
        onChange={(event) => commitValue(Number(event.target.value))}
        style={{ '--progress': `${((normalizedValue - min) / (max - min)) * 100}%` } as RangeStyle}
      />
    </div>
  );
}

function decimalsOf(step: number): number {
  const text = String(step);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

function buildPaletteStats(cells: Cell[]): Array<{ color: string; code: string; count: number }> {
  const counts = new Map<string, number>();
  for (const cell of cells) {
    if (cell.transparent) {
      continue;
    }

    counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1);
  }
  return Array.from(counts, ([color, count]) => ({ color, code: mardCodeOf(color), count }))
    .sort((left, right) => right.count - left.count || left.color.localeCompare(right.color));
}

function mardCodeOf(hex: string): string {
  return MARD_221_COLORS.find((color) => color.hex === hex)?.code ?? '自定义';
}

function nearestMardColor(hex: string): string {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : MARD_221_HEX[0];
  return nearestPaletteColor(
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
    MARD_221_HEX,
  );
}

function serializeGridAsSvg(cells: Cell[], rows: number, cols: number, settings: Settings): string {
  const cellSize = 24;
  const padding = 12;
  const width = cols * cellSize + padding * 2;
  const height = rows * cellSize + padding * 2;
  const frameWidth = cols * cellSize;
  const frameHeight = rows * cellSize;

  const cellsSvg = cells
    .filter((cell) => !cell.transparent)
    .map(
      (cell) => `<rect x="${padding + cell.x * cellSize}" y="${padding + cell.y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${cell.color}" stroke="#1f1f1f" stroke-width="1" />`,
    )
    .join('');

  const metadata = `网格：${cols} x ${rows}，格子尺寸：${settings.cellSize}mm`;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#ffffff" />`,
    `<rect x="${padding}" y="${padding}" width="${frameWidth}" height="${frameHeight}" fill="#f7f5ef" stroke="#1f1f1f" stroke-width="2" />`,
    `<text x="${padding}" y="${Math.max(20, padding - 2)}" fill="#20201d" font-family="Avenir Next, SF Pro Text, Segoe UI, sans-serif" font-size="12" font-weight="700">${metadata}</text>`,
    `<g shape-rendering="crispEdges">${cellsSvg}</g>`,
    '</svg>',
  ].join('');
}

function ThreePreview({ cells, rows, cols, settings }: { cells: Cell[]; rows: number; cols: number; settings: Settings }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef({ dragging: false, lastX: 0, angle: -0.62 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f7f5ef');
    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const ambient = new THREE.AmbientLight('#ffffff', 1.8);
    const directional = new THREE.DirectionalLight('#ffffff', 2.2);
    directional.position.set(120, -180, 220);
    scene.add(ambient, directional);

    const width = cols * settings.cellSize;
    const depth = rows * settings.cellSize;
    const centerX = width / 2;
    const centerY = depth / 2;
    const solidCells = cells.filter((cell) => !cell.transparent);

    for (const cell of solidCells) {
      const material = new THREE.MeshStandardMaterial({ color: cell.color, roughness: 0.48, metalness: 0.02 });
      addHollowSquareRing(
        group,
        material,
        cell.x * settings.cellSize + settings.cellSize / 2,
        cell.y * settings.cellSize + settings.cellSize / 2,
        settings,
      );
    }

    const maxSide = Math.max(width, depth);
    const target = new THREE.Vector3(centerX, centerY, settings.pegHeight * 0.35);
    const updateCamera = () => {
      const angle = dragRef.current.angle;
      const radius = maxSide * 1.72;
      camera.position.set(
        centerX + Math.cos(angle) * radius,
        centerY + Math.sin(angle) * radius,
        maxSide * 1.18,
      );
      camera.lookAt(target);
    };
    updateCamera();

    let frame = 0;
    let disposed = false;
    const render = () => {
      if (disposed) return;
      if (!dragRef.current.dragging) {
        dragRef.current.angle += 0.0018;
      }
      updateCamera();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    const resize = () => {
      const widthPx = host.clientWidth;
      const heightPx = host.clientHeight;
      camera.aspect = widthPx / Math.max(heightPx, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(widthPx, heightPx);
    };

    const onPointerDown = (event: PointerEvent) => {
      dragRef.current.dragging = true;
      dragRef.current.lastX = event.clientX;
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragRef.current.dragging) return;
      const delta = event.clientX - dragRef.current.lastX;
      dragRef.current.lastX = event.clientX;
      dragRef.current.angle += delta * 0.01;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragRef.current.dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };

    window.addEventListener('resize', resize);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      host.removeChild(renderer.domElement);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
      renderer.dispose();
    };
  }, [cells, rows, cols, settings]);

  return <div ref={hostRef} className="three-preview" aria-label="3D 预览画布" />;
}

function addHollowSquareRing(group: THREE.Group, material: THREE.Material, centerX: number, centerY: number, settings: Settings) {
  const outer = settings.cellSize;
  const thickness = Math.min(settings.wallThickness, outer / 2);
  const inner = Math.max(0, outer - thickness * 2);

  addPreviewBox(group, material, centerX, centerY - outer / 2 + thickness / 2, outer, thickness, settings.pegHeight);
  addPreviewBox(group, material, centerX, centerY + outer / 2 - thickness / 2, outer, thickness, settings.pegHeight);

  if (inner <= 0) {
    return;
  }

  addPreviewBox(group, material, centerX - outer / 2 + thickness / 2, centerY, thickness, inner, settings.pegHeight);
  addPreviewBox(group, material, centerX + outer / 2 - thickness / 2, centerY, thickness, inner, settings.pegHeight);
}

function addPreviewBox(
  group: THREE.Group,
  material: THREE.Material,
  centerX: number,
  centerY: number,
  width: number,
  depth: number,
  height: number,
) {
  const geometry = new THREE.BoxGeometry(width, depth, height);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(centerX, centerY, height / 2);
  group.add(mesh);
}

async function loadImageFile(file: File): Promise<UploadedImage> {
  const rawUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = rawUrl;
  await image.decode();

  if (image.naturalWidth > MAX_IMAGE_SIDE || image.naturalHeight > MAX_IMAGE_SIDE) {
    URL.revokeObjectURL(rawUrl);
    throw new Error('图片尺寸超过 4096 x 4096。');
  }

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    URL.revokeObjectURL(rawUrl);
    throw new Error('当前浏览器无法处理 Canvas 图像。');
  }

  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  removeFlatBackground(imageData);
  context.putImageData(imageData, 0, 0);

  const alpha = Array.from({ length: canvas.width * canvas.height }, (_, index) => imageData.data[index * 4 + 3]);
  const crop = cropTransparentBounds(alpha, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/png');
  URL.revokeObjectURL(rawUrl);

  return {
    name: file.name,
    url,
    width: canvas.width,
    height: canvas.height,
    imageData,
    crop,
  };
}

function removeFlatBackground(imageData: ImageData) {
  const { data, width, height } = imageData;
  const samples = [
    0,
    (width - 1) * 4,
    ((height - 1) * width) * 4,
    ((height - 1) * width + width - 1) * 4,
  ];
  const background = samples.reduce(
    (sum, index) => [sum[0] + data[index], sum[1] + data[index + 1], sum[2] + data[index + 2]],
    [0, 0, 0],
  ).map((value) => value / samples.length);

  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.hypot(data[i] - background[0], data[i + 1] - background[1], data[i + 2] - background[2]);
    if (distance < 42) {
      data[i + 3] = 0;
    }
  }
}

function cellsFromImageData(imageData: ImageData, crop: UploadedImage['crop'], rows: number, cols: number): Cell[] {
  const cells: Cell[] = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
    const startX = Math.floor(crop.x + (x * crop.width) / cols);
    const endX = Math.max(startX + 1, Math.floor(crop.x + ((x + 1) * crop.width) / cols));
    const startY = Math.floor(crop.y + (y * crop.height) / rows);
    const endY = Math.max(startY + 1, Math.floor(crop.y + ((y + 1) * crop.height) / rows));
    const pixels: number[] = [];
      let opaquePixels = 0;

    for (let yy = startY; yy < Math.min(endY, imageData.height); yy += 1) {
      for (let xx = startX; xx < Math.min(endX, imageData.width); xx += 1) {
        const index = (yy * imageData.width + xx) * 4;
          if (imageData.data[index + 3] >= 16) {
            opaquePixels += 1;
          }
        pixels.push(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2], imageData.data[index + 3]);
      }
    }

      if (opaquePixels === 0) {
        cells.push({ x, y, color: '#ffffff', transparent: true });
      } else {
        cells.push({ x, y, color: sampleDominantColor(pixels, MARD_221_HEX) });
      }
    }
  }

  return cells;
}

function createDemoCells(rows: number, cols: number): Cell[] {
  return buildCellsFromSamples(rows, cols, (x, y) => {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const distance = Math.hypot((x - cx) / cols, (y - cy) / rows);
    if (distance < 0.18) return '#fc283c';
    if ((x + y) % 7 === 0) return '#24b88c';
    if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) return '#000000';
    return '#f5ecd2';
  });
}

/** Creates a fully transparent (empty) grid — no color preset */
function createEmptyCells(rows: number, cols: number): Cell[] {
  const result: Cell[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      result.push({ x, y, color: '#ffffff', transparent: true });
    }
  }
  return result;
}

export default App;
