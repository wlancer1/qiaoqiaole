import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  buildModelParts, bucketFill, DEFAULT_SETTINGS, MARD_221_COLORS, replaceCell, serializeAsciiStl, type Cell,
} from '@qiaoqiaole/core';
import { CanvasPage } from '../../pages/editor/CanvasPage';
import { PageSkeleton } from '../../loading/H5LoadingStates';
import { createBlankCells } from '../../canvas/H5CanvasPreview';
import { colorCodeOf, colorCodeTextColor, createBeadPatternCanvas, downloadBlob, downloadText, normalizeGridSize, parseGridSizeInput, resizeCells, sameCells } from '../../utils/h5AppUtils';
import { filterPaletteByQuery, filterPaletteByUsage } from '../../utils/palette';
import { parseProjectCells } from '../../utils/projectPayload';
import type { CanvasTool, PaintStroke, RecentProject, ReferenceImage, WorkMode } from '../../shared/h5Types';
import { useEditorProjectLoader } from './useEditorProjectLoader';
import { parseEditorProjectRoute } from './editorRoute';

const EMPTY_COLOR = '#ffffff';
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const canvasTools: Array<{ tool: CanvasTool; label: string; icon: any }> = [
  { tool: 'pan', label: '手抓移动工具', icon: 'hand' }, { tool: 'brush', label: '画笔工具', icon: 'brush' },
  { tool: 'eraser', label: '橡皮工具', icon: 'eraser' }, { tool: 'fill', label: '填充工具', icon: 'fill' }, { tool: 'eyedropper', label: '取色工具', icon: 'eyedropper' },
];

export type EditorFeatureCommands = {
  replaceCanvas: (value: { rows: number; cols: number; cells: Cell[]; sourceImage?: string; workMode?: WorkMode }) => void;
  createBlankCanvas: (rows?: number, cols?: number) => void;
  snapshot: () => { rows: number; cols: number; cells: Cell[]; activeProjectId: string; totalBeads: number };
  markSaved: (projectId: string) => void;
};

type Props = {
  requestApi: <T>(path: string, options?: RequestInit, token?: string | null) => Promise<T>;
  token: string | null;
  authStatus: string;
  requireLogin: (next: (token: string) => void) => void;
  setStatus: (message: string) => void;
  onCommands?: (commands: EditorFeatureCommands) => void;
  onSave?: (value: { id: string; rows: number; cols: number; cells: Cell[] }) => void;
  onStartBeading?: (projectId: string, token?: string) => void;
  sourceImagePresent?: boolean;
  onToggleBackground?: () => void;
  backgroundProcessing?: boolean;
};

/** The editor owns canvas pixels, history and pointer streams; consumers get only stable commands. */
export function EditorFeatureContent({ requestApi, token, authStatus, requireLogin, setStatus, onCommands, onSave, onStartBeading, sourceImagePresent = false, onToggleBackground, backgroundProcessing = false }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseEditorProjectRoute(location.pathname);
  const routeProjectId = route?.projectId ?? '';
  const invalidProjectRoute = !route && location.pathname.startsWith('/projects/');
  const [routeError, setRouteError] = useState<string | null>(invalidProjectRoute ? '作品地址无效。' : null);
  const [rows, setRows] = useState(32); const [cols, setCols] = useState(32);
  const [cells, setCells] = useState<Cell[]>(() => createBlankCells(32, 32));
  const cellsRef = useRef(cells); useEffect(() => { cellsRef.current = cells; }, [cells]);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [workMode, setWorkMode] = useState<WorkMode>('bead');
  const [selectedColor, setSelectedColor] = useState<string>(MARD_221_COLORS[0]?.hex ?? '#faf4c8');
  const [selectedCode, setSelectedCode] = useState<string>(MARD_221_COLORS[0]?.code ?? 'A1');
  const [tool, setTool] = useState<CanvasTool>('pan'); const toolRef = useRef(tool); useEffect(() => { toolRef.current = tool; }, [tool]);
  const [history, setHistory] = useState<Cell[][]>([]); const [future, setFuture] = useState<Cell[][]>([]);
  const [showSettings, setShowSettings] = useState(false); const [cfgRows, setCfgRows] = useState<number | ''>(32); const [cfgCols, setCfgCols] = useState<number | ''>(32);
  const [canvasScale, setCanvasScale] = useState(1); const canvasArtboardRef = useRef<HTMLDivElement | null>(null);
  const [showPaletteSearch, setShowPaletteSearch] = useState(false); const [paletteQuery, setPaletteQuery] = useState(''); const [showBeadList, setShowBeadList] = useState(false);
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null); const [isReferenceMinimized, setIsReferenceMinimized] = useState(false);
  const referenceInputRef = useRef<HTMLInputElement | null>(null); const suppressClickRef = useRef(false); const touchPointersRef = useRef(new Set<number>()); const keyboardCellRef = useRef({ x: 0, y: 0 });
  const strokeRef = useRef<PaintStroke>({ active: false, tool: 'brush', baseCells: [], draftCells: [], changedCount: 0, pointerId: null, lastCell: null, initialPainted: true });

  const reset = useCallback((next: { rows: number; cols: number; cells: Cell[]; sourceImage?: string; workMode?: WorkMode }) => {
    setRows(next.rows); setCols(next.cols); setCfgRows(next.rows); setCfgCols(next.cols); setCells(next.cells); setHistory([]); setFuture([]); setTool('pan'); setCanvasScale(1); setActiveProjectId(''); if (next.workMode) setWorkMode(next.workMode);
  }, []);
  useEffect(() => { onCommands?.({ replaceCanvas: reset, createBlankCanvas: (nextRows = 32, nextCols = 32) => { reset({ rows: nextRows, cols: nextCols, cells: createBlankCells(nextRows, nextCols) }); navigate('/canvas'); }, snapshot: () => ({ rows, cols, cells: cellsRef.current, activeProjectId, totalBeads: cellsRef.current.filter((cell) => !cell.transparent).length }), markSaved: setActiveProjectId }); }, [activeProjectId, cols, navigate, onCommands, reset, rows]);
  useEffect(() => () => { if (referenceImage?.url) URL.revokeObjectURL(referenceImage.url); }, [referenceImage]);

  const loadProject = useCallback((detail: RecentProject) => { const nextRows = Math.max(1, Math.round(detail.rows)); const nextCols = Math.max(1, Math.round(detail.cols)); setRows(nextRows); setCols(nextCols); setCfgRows(nextRows); setCfgCols(nextCols); setCells(parseProjectCells(detail.canvasData, nextRows, nextCols) ?? createBlankCells(nextRows, nextCols)); setHistory([]); setFuture([]); setTool('pan'); setCanvasScale(1); setActiveProjectId(detail.id); setRouteError(null); }, []);
  useEffect(() => { setRouteError(invalidProjectRoute ? '作品地址无效。' : null); }, [invalidProjectRoute, location.pathname]);
  useEditorProjectLoader<RecentProject>({ projectId: routeProjectId, activeProjectId, enabled: location.pathname === '/canvas' || Boolean(routeProjectId), authStatus, token, requestProject: (id, nextToken) => requestApi<{ project: RecentProject }>(`/projects/${encodeURIComponent(id)}`, {}, nextToken), onLoaded: loadProject, onNeedsLogin: () => { setRouteError('登录后才能查看该作品。'); setStatus('登录后才能查看该作品。'); requireLogin(() => undefined); }, onFailed: (error) => { const status = typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: number }).status : undefined; const message = status === 401 ? '登录后才能查看该作品。' : status === 404 ? '作品不存在或已被删除。' : '作品读取失败，请返回作品列表后重试。'; setRouteError(message); setStatus(message); if (status === 401) requireLogin(() => undefined); }, setStatus });

  const commit = useCallback((nextOrUpdater: Cell[] | ((current: Cell[]) => Cell[])) => { setCells((current) => { const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(current) : nextOrUpdater; if (sameCells(current, next)) return current; setHistory((items) => [...items.slice(-24), current]); setFuture([]); return next; }); }, []);
  const undo = () => setHistory((items) => { if (!items.length) return items; const previous = items.at(-1)!; setFuture((later) => [cellsRef.current, ...later]); setCells(previous); return items.slice(0, -1); });
  const redo = () => setFuture((items) => { if (!items.length) return items; const [next, ...later] = items; setHistory((earlier) => [...earlier, cellsRef.current]); setCells(next); return later; });
  const cellFromEvent = (x: number, y: number, artboard: HTMLElement) => { const rect = artboard.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0 || x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) return null; return { x: Math.min(cols - 1, Math.max(0, Math.floor(((x - rect.left) / rect.width) * cols))), y: Math.min(rows - 1, Math.max(0, Math.floor(((y - rect.top) / rect.height) * rows))) }; };
  const tap = (cell: Cell) => { if (toolRef.current === 'eyedropper') { if (!cell.transparent) { setSelectedColor(cell.color); setSelectedCode(colorCodeOf(cell.color)); } return; } if (toolRef.current === 'eraser') { if (!cell.transparent) commit(cellsRef.current.map((item) => item.x === cell.x && item.y === cell.y ? { ...item, color: EMPTY_COLOR, transparent: true } : item)); return; } if (toolRef.current === 'fill') { const next = bucketFill(cellsRef.current, rows, cols, cell.x, cell.y, selectedColor); if (!sameCells(next, cellsRef.current)) commit(next); return; } if (toolRef.current === 'brush' && (cell.transparent || cell.color.toLowerCase() !== selectedColor.toLowerCase())) commit(replaceCell(cellsRef.current, cell.x, cell.y, selectedColor)); };
  const pointerDown = (event: React.PointerEvent<HTMLElement>) => { if (event.pointerType === 'touch' && touchPointersRef.current.size > 1) return; const point = cellFromEvent(event.clientX, event.clientY, event.currentTarget); if (!point || !['brush', 'eraser'].includes(toolRef.current)) return; const base = cellsRef.current; strokeRef.current = { active: true, tool: toolRef.current as 'brush' | 'eraser', baseCells: base, draftCells: base, changedCount: 0, pointerId: event.pointerId, lastCell: point, initialPainted: false }; suppressClickRef.current = true; try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} ; pointerPaint(point.x, point.y); event.preventDefault(); };
  const pointerPaint = (x: number, y: number) => { const stroke = strokeRef.current; if (!stroke.active) return; const current = stroke.draftCells.find((item) => item.x === x && item.y === y); if (!current) return; const next = stroke.tool === 'eraser' ? (current.transparent ? stroke.draftCells : stroke.draftCells.map((item) => item === current ? { ...item, color: EMPTY_COLOR, transparent: true } : item)) : (!current.transparent && current.color.toLowerCase() === selectedColor.toLowerCase() ? stroke.draftCells : replaceCell(stroke.draftCells, x, y, selectedColor)); if (next === stroke.draftCells) return; stroke.draftCells = next; stroke.changedCount++; cellsRef.current = next; setCells(next); };
  const pointerMove = (event: React.PointerEvent<HTMLElement>) => { const stroke = strokeRef.current; if (!stroke.active || stroke.pointerId !== event.pointerId) return; const point = cellFromEvent(event.clientX, event.clientY, event.currentTarget); if (!point) { stroke.lastCell = null; return; } const from = stroke.lastCell; if (from) { const steps = Math.max(Math.abs(point.x - from.x), Math.abs(point.y - from.y)); for (let step = 0; step <= steps; step++) pointerPaint(Math.round(from.x + ((point.x - from.x) * step) / Math.max(1, steps)), Math.round(from.y + ((point.y - from.y) * step) / Math.max(1, steps))); } else pointerPaint(point.x, point.y); stroke.lastCell = point; };
  const pointerEnd = (event: React.PointerEvent<HTMLElement>) => { const stroke = strokeRef.current; if (stroke.active && stroke.pointerId === event.pointerId) { if (stroke.changedCount) { setHistory((items) => [...items.slice(-24), stroke.baseCells]); setFuture([]); } strokeRef.current = { active: false, tool: 'brush', baseCells: [], draftCells: [], changedCount: 0, pointerId: null, lastCell: null, initialPainted: true }; window.setTimeout(() => { suppressClickRef.current = false; }, 0); } if (event.pointerType === 'touch') touchPointersRef.current.delete(event.pointerId); };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => { const current = keyboardCellRef.current; if (/^Arrow/.test(event.key)) { event.preventDefault(); keyboardCellRef.current = { x: Math.max(0, Math.min(cols - 1, current.x + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0))), y: Math.max(0, Math.min(rows - 1, current.y + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0))) }; return; } if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const cell = cellsRef.current.find((item) => item.x === current.x && item.y === current.y); if (cell) tap(cell); } };
  const selectPalette = (color: { code: string; hex: string }) => { setSelectedColor(color.hex); setSelectedCode(color.code); setTool('brush'); };
  const clearReference = () => { setReferenceImage((current) => { if (current?.url) URL.revokeObjectURL(current.url); return null; }); setIsReferenceMinimized(false); };
  const handleReferenceUpload = (file: File | undefined) => { if (!file) return; if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > MAX_FILE_SIZE) { setStatus(file.size > MAX_FILE_SIZE ? '参考图不能超过 20MB。' : '请上传 PNG、JPG 或 WebP 参考图。'); return; } setReferenceImage((current) => { if (current?.url) URL.revokeObjectURL(current.url); return { name: file.name, url: URL.createObjectURL(file) }; }); setIsReferenceMinimized(false); if (referenceInputRef.current) referenceInputRef.current.value = ''; };
  const saveCurrent = () => { if (!token) { requireLogin(() => saveCurrent()); return; } if (!activeProjectId) { setStatus('请先保存作品后再开始拼豆。'); return; } onSave?.({ id: activeProjectId, rows, cols, cells: cellsRef.current }); };
  const prioritizedPaletteColors = useMemo(() => filterPaletteByUsage(MARD_221_COLORS, cells, ''), [cells]); const filteredPaletteColors = useMemo(() => filterPaletteByQuery(prioritizedPaletteColors, paletteQuery), [paletteQuery, prioritizedPaletteColors]); const totalBeads = useMemo(() => cells.filter((cell) => !cell.transparent).length, [cells]); const beadListColors = useMemo(() => { const count = new Map<string, number>(); for (const cell of cells) if (!cell.transparent) count.set(cell.color, (count.get(cell.color) ?? 0) + 1); return [...count].map(([color, count]) => ({ color, count, code: colorCodeOf(color) })); }, [cells]);
  if (routeError) return <main className="editor-route-error" role="alert"><p>{routeError}</p><button type="button" onClick={() => navigate('/projects', { replace: true })}>返回作品列表</button></main>;
  if (routeProjectId && activeProjectId !== routeProjectId) return <PageSkeleton kind="editor" label="正在加载作品" />;
  return <CanvasPage fileInputRef={{ current: null }} handleUpload={() => undefined} referenceInputRef={referenceInputRef} handleReferenceUpload={handleReferenceUpload} clearReferenceImage={clearReference} setScreen={(screen: string) => navigate(screen === 'home' ? '/' : '/canvas')} setShowSettings={setShowSettings} cols={cols} rows={rows} history={history} future={future} undo={undo} redo={redo} chooseReferenceImage={() => referenceInputRef.current?.click()} exportPatternPng={() => createBeadPatternCanvas(cells, rows, cols).toBlob((blob) => blob ? downloadBlob('qiaoqiaole-h5-pattern.png', blob) : setStatus('导出图纸失败，请重试。'), 'image/png')} workMode={workMode} exportStl={() => downloadText('qiaoqiaole-h5-board.stl', serializeAsciiStl('qiaoqiaole-h5-board', buildModelParts(cells, rows, cols, DEFAULT_SETTINGS)))} saveCurrentProject={saveCurrent} showSaveProjectModal={false} showSaveLoginPrompt={false} projectFolderSheetOpen={false} selectedCode={selectedCode} selectedColor={selectedColor} showSettings={showSettings} cfgCols={cfgCols} setCfgCols={setCfgCols} cfgRows={cfgRows} setCfgRows={setCfgRows} fitView={() => setCanvasScale(1)} handleResizeCanvas={() => { const nextRows = normalizeGridSize(cfgRows); const nextCols = normalizeGridSize(cfgCols); setRows(nextRows); setCols(nextCols); setCfgRows(nextRows); setCfgCols(nextCols); commit(resizeCells(cellsRef.current, rows, cols, nextRows, nextCols)); setShowSettings(false); }} canvasTools={canvasTools} tool={tool} setTool={setTool} handleCanvasPointerDownCapture={(event: React.PointerEvent<HTMLElement>) => { if (event.pointerType === 'touch') touchPointersRef.current.add(event.pointerId); }} handleCanvasPointerEndCapture={(event: React.PointerEvent<HTMLElement>) => { if (event.pointerType === 'touch') touchPointersRef.current.delete(event.pointerId); }} parseGridSizeInput={parseGridSizeInput} normalizeGridSize={normalizeGridSize} setCanvasScale={setCanvasScale} canvasArtboardRef={canvasArtboardRef} cells={cells} canvasScale={canvasScale} getCode={colorCodeOf} getTextColor={colorCodeTextColor} handleCanvasKeyDown={handleKeyDown} handleCanvasPointerDown={pointerDown} handleCanvasPointerMove={pointerMove} handleCanvasPaintPointerEnd={pointerEnd} handleCanvasClick={(event: React.MouseEvent<HTMLElement>) => { if (suppressClickRef.current) return; const point = cellFromEvent(event.clientX, event.clientY, event.currentTarget); const cell = point && cellsRef.current.find((item) => item.x === point.x && item.y === point.y); if (cell) tap(cell); }} referenceImage={referenceImage} uploadedSplitImage={sourceImagePresent ? {} : null} canRemoveGridBackground={sourceImagePresent} isBackgroundProcessing={backgroundProcessing} onToggleBackground={onToggleBackground ?? (() => undefined)} isReferenceMinimized={isReferenceMinimized} setIsReferenceMinimized={setIsReferenceMinimized} closeReferenceImage={clearReference} status="" prioritizedPaletteColors={prioritizedPaletteColors} selectPaletteColor={selectPalette} showPaletteSearch={showPaletteSearch} setShowPaletteSearch={setShowPaletteSearch} paletteQuery={paletteQuery} setPaletteQuery={setPaletteQuery} filteredPaletteColors={filteredPaletteColors} showBeadList={showBeadList} setShowBeadList={setShowBeadList} beadListColors={beadListColors} totalBeads={totalBeads} onInventoryCheck={() => activeProjectId && onStartBeading?.(activeProjectId, token ?? undefined)} onStartBeading={() => activeProjectId && onStartBeading?.(activeProjectId, token ?? undefined)} />;
}
