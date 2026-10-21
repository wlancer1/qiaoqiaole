import { findBuiltinFabric, unifiedFabrics, presetAsset, matchesMaterialFabric, registerUsedPresetFabrics } from '../fabrics/fabricCatalog';
import { FabricStockDialog, recordFabricStock } from '../fabrics/FabricStockDialog';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Settings, Undo2, Redo2, Save, Upload, Download, MousePointer2, Pencil, Shapes,
  PaintBucket, Layers, Trash2, Copy, Lock, Unlock, Eye, EyeOff, RotateCw, FlipHorizontal2,
  FlipVertical2, X, Plus, Check, ChevronUp, ChevronDown, ChevronRight, RefreshCw, Scissors,
  Square, Circle, Triangle, Diamond, Hexagon, Star, Flower2, Leaf, LayoutGrid, SlidersHorizontal,
  Search, Palette, ImagePlus,
} from 'lucide-react';
import {
  area, clearCanvasContent, cloneDocument, hitTest, isConcave, makePiece, makeProject, makeShape, pointBounds,
  pointInPolygon, simplifyPoints, selfIntersects, transformPoints, validatePiece,
  type Guide, type Material, type PatchworkDocument, type PatchworkProject, type Piece,
  type Point, type Shape, type Technique,
} from './model';
import { drawScene, metrics, screenToWorld, worldToScreen, type Metrics, type View } from './canvas';
import { buildPatternPdf, cutList, downloadBlob, planIssues } from './export';
import { deleteAsset, getAsset, loadImage, putAsset, putAssetWithId, readDraft, saveDraft } from './assets';
import { renderPatternTile, shadeColor, TEXTURE_PATTERNS, type TexturePatternId } from './textures';
import { useAppOverlay } from '../app/overlays/AppOverlayContext';
import type { ProjectApiRequest } from '../projects/projectApi';
import { newPatchworkId } from './ids';
import type { SegmentMode, SegmentResult } from './segmentation';
import { useShapeLibrary } from './useShapeLibrary';
import { AddShapePanel } from './AddShapePanel';
import { useAppSelector } from '../store/hooks';
import { MatSwatch } from './FabricPicker';
import { ConnectedFabricPicker as FabricPicker } from '../fabrics/ConnectedFabricPicker';
import { PatchworkCreateDialog, type PatchworkCreateConfig } from './PatchworkCreateDialog';
import { FabricCreateDialog } from '../fabrics/FabricCreateDialog';
import { createWarehouseFabric, type FabricCreateResult } from '../fabrics/fabricCreate';
import { createEditorWarehouseFabric } from './editorFabricPersistence';
import { placeShapePieces, toShapeTemplate, type ShapeChoice, type ShapePlacement } from './shapeLibrary';
import {
  computeProjectMaterialRequirements,
  extractDominantColorFromRgba,
  fabricSpecLabel,
  formatCm2,
  recommendReplacementFabrics,
  type FabricItem,
} from './fabricInventory';
import './patchwork.css';
import './fabric-panel.css';

/* 拼布编辑器：几何一律毫米；历史以“一次完整手势 = 一条记录”为粒度（AC02）。 */

type Tool = 'select' | 'brush' | 'add' | 'fill' | 'layers';
type Panel = 'base' | 'add' | 'fill' | 'layers' | 'fabrics' | 'export' | 'import' | 'save' | 'open' | 'props' | 'leave' | 'fabriccrop' | null;
type MatDraft = { name: string; kind: 'color' | 'image'; color: string; pattern: TexturePatternId | 'none'; assetId?: string; sampleWidthMm?: number };
const PRESET_COLORS = ['#f2e6d2', '#e6cf9f', '#d9ad45', '#e8915a', '#e8a58c', '#d94f3d', '#ef9db4', '#b7a6e8', '#9db98a', '#7d9dbd'];
type CropRect = { x: number; y: number; w: number; h: number };
const clampCropRect = (r: CropRect): CropRect => {
  const MIN = 0.06;
  const w = Math.min(1, Math.max(MIN, r.w)), h = Math.min(1, Math.max(MIN, r.h));
  return { x: Math.min(1 - w, Math.max(0, r.x)), y: Math.min(1 - h, Math.max(0, r.y)), w, h };
};
type Candidate = { points: Point[]; color: string; excluded: boolean; asGuide: boolean; chosen: boolean; grouped: boolean; hasHoles: boolean };
type Analysis = { rgba: Uint8ClampedArray; width: number; height: number; pxPerMm: number; offsetX: number; offsetY: number };

const TECHNIQUE_LABEL: Record<Technique, string> = { raw: '贴布缝·毛边', turned: '贴布缝·折边', pieced: '几何拼接' };
const INDEX_KEY = 'qiaoqiaole:patchwork:index';
const uid = () => newPatchworkId();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type IndexEntry = { id: string; name: string; updatedAt: number; widthMm: number; heightMm: number; technique: Technique; cloudId?: string };
type CloudWork = { id: string; name: string; updatedAt: string; rows: number; cols: number };
type FabricItemLite = FabricItem;
const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error instanceof Error ? r.error : new Error('read failed')); r.readAsDataURL(blob); });
function readIndex(): IndexEntry[] { try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]') as IndexEntry[]; } catch { return []; } }
function writeIndex(list: IndexEntry[]) { try { localStorage.setItem(INDEX_KEY, JSON.stringify(list.slice(0, 60))); } catch { /* 存储满时忽略索引 */ } }
const ACTIVE_KEY = 'qiaoqiaole:patchwork:active';
function readActive(): string | null { try { return sessionStorage.getItem(ACTIVE_KEY); } catch { return null; } }
function writeActive(id: string) { try { sessionStorage.setItem(ACTIVE_KEY, id); } catch { /* 忽略 */ } }

/** polygon-clipping 的 union：输入/输出均为 [x,y] 环；在此收口类型转换。 */
import pc from 'polygon-clipping';
const unionFn = (pc as unknown as { union: (g: unknown, ...rest: unknown[]) => [number, number][][][] }).union;
function unionPolygons(polys: Point[][]): Point[][] {
  try {
    const geoms = polys.map((p) => [[...p, p[0]].map((pt) => [pt.x, pt.y] as [number, number])]);
    const result = unionFn(geoms[0], ...geoms.slice(1));
    return result.map((poly) => poly[0].map(([x, y]) => ({ x, y }))).filter((ring) => ring.length >= 3);
  } catch { return polys; }
}

const fmtCm = (mm: number) => { const v = mm / 10; return Number.isInteger(v) ? String(v) : v.toFixed(1); };
function thumbPoints(p: Piece): string {
  const b = pointBounds(p.points);
  const s = Math.min(20 / Math.max(1, b.width), 20 / Math.max(1, b.height));
  return p.points.map((pt) => `${(2 + (pt.x - b.x) * s).toFixed(1)},${(2 + (pt.y - b.y) * s).toFixed(1)}`).join(' ');
}
function PatternSwatch({ pattern, color }: { pattern: TexturePatternId | 'none'; color: string }) {
  if (pattern === 'none') return <span className="pw-patprev" style={{ background: color }} />;
  const dark = shadeColor(color, 0.8);
  const light = shadeColor(color, 1.22);
  return (
    <svg className="pw-patprev" viewBox="0 0 48 48" preserveAspectRatio="none" aria-hidden="true">
      <rect width="48" height="48" fill={color} />
      {pattern === 'linen' && [0, 10, 20, 30, 40].map((i) => (<g key={i}><rect x="0" y={i} width="48" height="1.6" fill="rgba(0,0,0,0.07)" /><rect x={i} y="0" width="1.6" height="48" fill="rgba(255,255,255,0.07)" /></g>))}
      {pattern === 'check' && (<><rect x="0" y="0" width="24" height="48" fill="rgba(255,255,255,0.34)" /><rect x="0" y="0" width="48" height="24" fill="rgba(255,255,255,0.34)" /></>)}
      {pattern === 'stripe' && (<><rect x="0" y="0" width="10" height="48" fill={dark} /><rect x="24" y="0" width="10" height="48" fill={dark} /></>)}
      {pattern === 'dot' && [0, 1].map((r) => [0, 1].map((c) => (<circle key={`${r}-${c}`} cx={12 + c * 24 + (r % 2 ? 12 : 0)} cy={12 + r * 24} r="5" fill={light} />)))}
    </svg>
  );
}

function PieceThumb({ p, mat }: { p: Piece; mat?: Material }) {
  const [tex, setTex] = useState<{ url: string; aspect: number } | null>(null);
  let created = '';
  const [tick, setTick] = useState(0);
  useEffect(() => { const h = () => setTick((t) => t + 1); window.addEventListener('pw-asset-ready', h); return () => window.removeEventListener('pw-asset-ready', h); }, []);
  const rid = useId().replace(/[^a-zA-Z0-9]/g, '');
  useEffect(() => {
    let live = true;
    if (!mat?.assetId) { setTex(null); return; }
    void getAsset(mat.assetId).then((b) => {
      if (!b || !live) return;
      const url = URL.createObjectURL(b);
      created = url;
      const img = new Image();
      img.onload = () => { if (live) setTex({ url, aspect: img.naturalHeight / Math.max(1, img.naturalWidth) }); };
      img.onerror = () => { if (live) setTex({ url, aspect: 1 }); };
      img.src = url;
    });
    return () => { live = false; if (created) URL.revokeObjectURL(created); };
  }, [mat?.assetId, tick]);
  const pts = thumbPoints(p);
  if (!mat?.assetId || !tex) {
    return <svg className="pw-thumb" viewBox="0 0 24 24" aria-hidden="true"><polygon points={pts} fill={mat?.color || '#ccc'} stroke="rgba(0,0,0,.15)" /></svg>;
  }
  // 与画布一致的纹理几何：以布片外框中心为锚，样本宽×纹理缩放为平铺尺寸，再按纹理偏移/旋转
  const b = pointBounds(p.points);
  const s = Math.min(20 / Math.max(1, b.width), 20 / Math.max(1, b.height));
  const cx = 2 + (b.width * s) / 2, cy = 2 + (b.height * s) / 2;
  const tileW = Math.max(0.5, (mat.sampleWidthMm || b.width) * p.texture.scale * s);
  const tileH = tileW * tex.aspect;
  return (
    <svg className="pw-thumb" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <pattern id={`tp${rid}`} width={tileW} height={tileH} patternUnits="userSpaceOnUse"
          x={cx + p.texture.offsetX * s} y={cy + p.texture.offsetY * s}
          patternTransform={p.texture.rotation ? `rotate(${p.texture.rotation} ${cx} ${cy})` : undefined}>
          <image href={tex.url} width={tileW} height={tileH} preserveAspectRatio="none" />
        </pattern>
      </defs>
      <polygon points={pts} fill={`url(#tp${rid})`} stroke="rgba(0,0,0,.15)" />
    </svg>
  );
}
function nextMatSeq(mats: Material[]): number {
  let mx = 0;
  mats.forEach((m) => { const mm = /^M(\d+)$/.exec(m.id); if (mm) mx = Math.max(mx, Number(mm[1])); });
  return mx + 1;
}
const docOf = (p: PatchworkProject): PatchworkDocument => ({
  name: p.name, technique: p.technique, widthMm: p.widthMm, heightMm: p.heightMm,
  base: p.base, materials: p.materials, pieces: p.pieces, guides: p.guides, reference: p.reference,
});

export function PatchworkPage({ requireLogin, requestApi, token }: { requireLogin?: (next: (nextToken: string) => void) => Promise<boolean>; requestApi?: ProjectApiRequest; token?: string | null } = {}) {
  const navigate = useNavigate();
  const { openConfirm } = useAppOverlay();
  // 与拼豆一致：保存作品、打开作品前先过登录门；未登录弹登录，成功后带着 token 继续原操作。
  const catalogAccountId = useAppSelector(state => state.auth.status === 'authenticated' ? state.auth.user?.id : undefined);
  const tokenRef = useRef<string>(token || '');
  useEffect(() => { tokenRef.current = token || ''; }, [token]);
  const projectRef = useRef<PatchworkProject | null>(null);
  const withToken = (fn: (t: string) => void) => {
    if (requireLogin) void requireLogin((t) => { tokenRef.current = t; fn(t); });
    else fn(tokenRef.current);
  };
  const params = useParams();
  const location = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fabricFileRef = useRef<HTMLInputElement>(null);
  const importModeRef = useRef<'partition' | 'reference'>('partition');
  const importToShapesRef = useRef(false);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const loadingImgs = useRef(new Set<string>());
  const savedJson = useRef('');
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const analysisRef = useRef<Analysis | null>(null);
  const textureOrig = useRef<PatchworkDocument | null>(null);

  const [project, setProject] = useState<PatchworkProject>(() => {
    const st = location.state as { fresh?: boolean; widthMm?: number; heightMm?: number; baseFabricId?: string } | null;
    const p0 = makeProject();
    if (st?.fresh && st.widthMm && st.heightMm) {
      p0.widthMm = st.widthMm; p0.heightMm = st.heightMm;
      p0.base = { materialId: '', locked: true, includeInCutList: false };
    }
    return p0;
  });
  projectRef.current = project;
  const [loaded, setLoaded] = useState(false);
  const [past, setPast] = useState<PatchworkDocument[]>([]);
  const [future, setFuture] = useState<PatchworkDocument[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [panel, setPanel] = useState<Panel>(null);
  const shapeDialogVersion = useRef(0);
  useEffect(() => () => { shapeDialogVersion.current += 1; }, [panel]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMaterialId, setActiveMaterialId] = useState('B');
  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 });
  const [message, setMessage] = useState('');
  const [imgVersion, setImgVersion] = useState(0);
  const [nodeMode, setNodeMode] = useState(false);
  const [nodeIndex, setNodeIndex] = useState<number | null>(null);
  const [stroke, setStroke] = useState<Point[]>([]);
  const [fillScope, setFillScope] = useState<'single' | 'same' | 'all'>('single');
  const [fillPick, setFillPick] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candStats, setCandStats] = useState<{ ignored: number; tooMany: boolean } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detail, setDetail] = useState<'simple' | 'standard' | 'fine'>('standard');
  const [detectedMode, setDetectedMode] = useState<SegmentMode>('color');
  const [importThumb, setImportThumb] = useState('');
  const [importStage, setImportStage] = useState<'crop' | 'preview'>('crop');
  const [importSource, setImportSource] = useState<{ url: string; w: number; h: number } | null>(null);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const importImgRef = useRef<HTMLImageElement | null>(null);
  const [fabSource, setFabSource] = useState<{ url: string; w: number; h: number } | null>(null);
  const [fabRect, setFabRect] = useState<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
  const [fabName, setFabName] = useState('');
  const [fabW, setFabW] = useState(150);
  const fabImgRef = useRef<HTMLImageElement | null>(null);
  const fabStageRef = useRef<HTMLDivElement>(null);
  const fabDragRef = useRef<{ mode: string; startX: number; startY: number; orig: CropRect } | null>(null);
  const cropStageRef = useRef<HTMLDivElement>(null);
  const cropDragRef = useRef<{ mode: string; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } } | null>(null);
  const [importName, setImportName] = useState('');
  const [saveName, setSaveName] = useState('');
  const [indexList, setIndexList] = useState<IndexEntry[]>([]);
  const [cloudList, setCloudList] = useState<CloudWork[]>([]);
  const [fabricPick, setFabricPick] = useState<FabricItemLite[] | null>(null);
  const [fabricPickerTarget, setFabricPickerTarget] = useState<'base' | 'props' | 'editor'>('editor');
  const [cloudId, setCloudIdState] = useState<string | null>(null);
  const cloudIdRef = useRef<string | null>(null);
  const setCloudId = (id: string | null) => { cloudIdRef.current = id; setCloudIdState(id); };
  const shapeLibrary = useShapeLibrary();
  const { templates } = shapeLibrary;
  const updateShapeTemplates = async (next: typeof templates) => {
    const saved = await shapeLibrary.updateTemplates(next);
    if (!saved) toast('形状尚未保存成功，请重试');
    return saved;
  };
  const [redrawTick, setRedrawTick] = useState(0);
  const [baseForm, setBaseForm] = useState<{ name: string; technique: Technique; w: number; h: number; materialId: string; include: boolean; locked: boolean; scaleDesign: boolean } | null>(null);
  const [paper, setPaper] = useState<'A4' | 'Letter'>('A4');
  const [includeHidden, setIncludeHidden] = useState(true);
  const [expTab, setExpTab] = useState<'list' | 'materials' | 'preview'>('list');
  const [expUrl, setExpUrl] = useState('');
  const [warehouseFabrics, setWarehouseFabrics] = useState<FabricItem[]>([]);
  const [stockFabric, setStockFabric] = useState<FabricItem | null>(null);
  const [wasteRatio, setWasteRatio] = useState<number>(0.15);
  const [replaceTargetMatId, setReplaceTargetMatId] = useState<string | null>(null);
  const [replaceScope, setReplaceScope] = useState<'all' | 'selected'>('all');
  const [showConsumeConfirm, setShowConsumeConfirm] = useState(false);
  const [consumeDraftCm2, setConsumeDraftCm2] = useState<Record<string, string>>({});
  const [consumingStock, setConsumingStock] = useState(false);
  const consumingStockRef = useRef(false);
  const consumeOperationRef = useRef('');
  const replaceUploadRef = useRef<{ sourceMatId: string; scope: 'all' | 'selected' } | null>(null);
  const [fabEdit, setFabEdit] = useState(false);
  const [createCfg, setCreateCfg] = useState<{ source: 'entry' | 'panel' } | null>(() => { const st = location.state as { fresh?: boolean; widthMm?: number } | null; return st?.fresh && !st.widthMm ? { source: 'entry' } : null; });
  const [fabQuery, setFabQuery] = useState('');
  const [matDetailId, setMatDetailId] = useState<string | null>(null);
  const [creatingFabric, setCreatingFabric] = useState(false);
  const [matDraft, setMatDraft] = useState<MatDraft | null>(null);
  const [matDeleting, setMatDeleting] = useState(false);
  const [matReplaceId, setMatReplaceId] = useState('');
  const [newFabricAreaCm2, setNewFabricAreaCm2] = useState('');
  const [newFabricProjectOnly, setNewFabricProjectOnly] = useState(false);
  const [savingFabric, setSavingFabric] = useState(false);
  const savingFabricRef = useRef(false);
  const fabricSaveScopeRef = useRef(0);
  const inventoryVersionRef = useRef(0);
  useEffect(() => {
    ++fabricSaveScopeRef.current;
    ++inventoryVersionRef.current;
    setWarehouseFabrics([]);
    setStockFabric(null);
    setShowConsumeConfirm(false);
    setConsumeDraftCm2({});
    setConsumingStock(false);
  }, [token]);
  useEffect(() => {
    ++fabricSaveScopeRef.current;
    return () => { ++fabricSaveScopeRef.current; };
  }, [location.key, location.pathname, location.search, project.id]);

  const pendingBaseFabricRef = useRef<string | null>((location.state as { baseFabricId?: string } | null)?.baseFabricId || null);
  const attachBaseFabric = async (doc: PatchworkProject, f: FabricItemLite) => {
    const catalogAsset = presetAsset(f);
    let assetId: string | undefined = catalogAsset?.assetId;
    if (f.image && !catalogAsset) {
      try { const blob = await (await fetch(f.image)).blob(); assetId = await putAsset(blob); } catch { /* 图片失败时退化为纯色布料 */ }
    }
    const seq = nextMatSeq(doc.materials);
    const sampleW = f.sampleWidthMm && f.sampleWidthMm > 0 ? f.sampleWidthMm : f.widthMm && f.widthMm > 0 ? f.widthMm : undefined;
    const createdMat: Material = {
      id: `M${seq}`,
      name: f.name,
      color: f.color || '#d9c8a9',
      category: f.category || undefined,
      inventoryFabricId: f.id,
      presetId: f.presetId || undefined,
      ...(catalogAsset ? { assetPath: catalogAsset.assetPath } : {}),
      ...(assetId ? { assetId, calibrated: Boolean(sampleW), sampleWidthMm: sampleW } : {}),
    };
    doc.materials.push(createdMat);
    doc.base = { materialId: createdMat.id, locked: true, includeInCutList: true };
  };
  useEffect(() => {
    const fid = pendingBaseFabricRef.current;
    if (!fid) return;
    pendingBaseFabricRef.current = null;
    void (async () => {
      const preset = findBuiltinFabric(fid);
      if (preset) {
        const cur = projectRef.current;
        if (!cur || cur.base.materialId) return;
        const next = { ...cur, materials: [...cur.materials], base: { ...cur.base } };
        await attachBaseFabric(next, preset);
        if (projectRef.current?.id === cur.id) setProject(next);
        return;
      }
      // 仓库列表没有挂载时自动加载，这里自包含地拉一次；先等 token 就绪
      for (let i = 0; i < 20 && !tokenRef.current; i++) await new Promise((r) => setTimeout(r, 250));
      const t = tokenRef.current;
      if (!t || !requestApi) return;
      let f: FabricItem | undefined;
      try {
        const payload = await requestApi<{ fabric: FabricItem }>(`/fabrics/${encodeURIComponent(fid)}`, {}, t);
        f = payload.fabric;
      } catch { return; }
      if (!f) return;
      const cur = projectRef.current;
      if (!cur || cur.base.materialId) return;
      const next: PatchworkProject = { ...cur, materials: [...cur.materials], base: { ...cur.base } };
      await attachBaseFabric(next, f);
      setProject(next);
      savedJson.current = JSON.stringify(docOf(next));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [fabTarget, setFabTarget] = useState<string | null>(null);
  const fabReturnRef = useRef(false);

  const openBaseSettings = () => {
    setBaseForm({ name: project.name, technique: project.technique, w: project.widthMm, h: project.heightMm, materialId: project.base.materialId, include: project.base.includeInCutList, locked: project.base.locked, scaleDesign: false });
    setPanel('base');
  };
  const loadWarehouseFabrics = async (t = tokenRef.current, showList = false) => {
    if (!requestApi || !t) return;
    const scope = fabricSaveScopeRef.current;
    const version = inventoryVersionRef.current;
    try {
      const payload = await requestApi<{ fabrics: FabricItem[] }>('/fabrics', {}, t);
      if (scope !== fabricSaveScopeRef.current || version !== inventoryVersionRef.current || t !== tokenRef.current) return;
      if (Array.isArray(payload.fabrics)) {
        setWarehouseFabrics(payload.fabrics);
        if (showList) setFabricPick(payload.fabrics);
      }
    } catch {
      if (scope === fabricSaveScopeRef.current && t === tokenRef.current && showList) toast('布料仓库读取失败，请稍后重试');
    }
  };
  const openFabricPicker = (target: 'base' | 'props' | 'editor') => {
    setFabricPickerTarget(target);
    setFabEdit(false);
    setFabQuery('');
    if (!catalogAccountId && tokenRef.current) void loadWarehouseFabrics(tokenRef.current, false);
    setMatDetailId(null);
    setMatDraft(null);
    setFabricPick(null);
    setPanel('fabrics');

  };
  useEffect(() => {
    if (panel === 'export' && tokenRef.current) {
      void loadWarehouseFabrics(tokenRef.current, false);
    }
    if (panel !== 'export') {
      setReplaceTargetMatId(null);
      setShowConsumeConfirm(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  useEffect(() => {
    if (panel !== 'export' || expTab !== 'preview') return undefined;
    let cancelled = false;
    void renderClean(900).then((b) => {
      if (cancelled || !b || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
      const nextUrl = URL.createObjectURL(b);
      setExpUrl((prev) => {
        if (prev && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(prev);
        return nextUrl;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, expTab, project]);

  useEffect(() => {
    if (!panel || panel === 'fill') return undefined;
    const hadModalOpen = typeof document !== 'undefined' && document.body?.classList?.contains('h5-modal-open');
    if (typeof document !== 'undefined') document.body?.classList?.add('h5-modal-open');
    return () => {
      if (typeof document !== 'undefined' && !hadModalOpen) document.body?.classList?.remove('h5-modal-open');
    };
  }, [panel]);

  useEffect(() => {
    if (creatingFabric || !panel || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (panel === 'import') cancelAnalysis();
      else if (panel === 'fabriccrop') cancelFabCrop();
      else if (panel === 'fabrics') { if (matDetailId) closeMatDetail(); else closeFabrics(); }
      else if (panel === 'props') closeProps();
      else setPanel(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, creatingFabric]);

  const toast = (text: string) => setMessage(text);
  useEffect(() => { if (!message) return; const t = setTimeout(() => setMessage(''), 3600); return () => clearTimeout(t); }, [message]);

  const selectedPieces = project.pieces.filter((p) => selectedIds.includes(p.id));
  const single = selectedPieces.length === 1 ? selectedPieces[0] : null;
  const dirty = loaded && JSON.stringify(docOf(project)) !== savedJson.current;

  /* ---------- 历史 ---------- */
  const commitDoc = (doc: PatchworkDocument, base?: PatchworkProject) => {
    const from = base ?? project;
    setPast((p) => [...p.slice(-79), cloneDocument(docOf(from))]);
    setFuture([]);
    setProject({ ...from, ...cloneDocument(doc) });
  };
  const commit = (change: (d: PatchworkDocument) => void) => {
    const doc = cloneDocument(docOf(project));
    change(doc);
    commitDoc(doc);
  };
  const commitFrom = (origDoc: PatchworkDocument) => {
    setPast((p) => [...p.slice(-79), cloneDocument(origDoc)]);
    setFuture([]);
  };
  const undo = () => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setFuture((f) => [...f, cloneDocument(docOf(project))]);
    setPast((p) => p.slice(0, -1));
    setProject((cur) => ({ ...cur, ...cloneDocument(prev) }));
    setSelectedIds([]); setNodeMode(false);
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[future.length - 1];
    setPast((p) => [...p, cloneDocument(docOf(project))]);
    setFuture((f) => f.slice(0, -1));
    setProject((cur) => ({ ...cur, ...cloneDocument(next) }));
    setSelectedIds([]); setNodeMode(false);
  };

  /* ---------- 初始加载：路由 id > 本次会话正在编辑的作品（刷新恢复）> 空白新画布；首页进入带 fresh 标记，必为新建 ---------- */
  useEffect(() => {
    let initial: PatchworkProject | null = null;
    const fresh = Boolean((location.state as { fresh?: boolean } | null)?.fresh);
    const wanted = params.projectId || (fresh ? null : readActive());
    if (wanted) {
      const raw = readDraft(wanted) as PatchworkProject | null;
      if (raw && raw.kind === 'patchwork' && Array.isArray(raw.pieces)) initial = { ...makeProject(), ...raw };
    }
    if (initial) {
      setProject(initial);
      savedJson.current = JSON.stringify(docOf(initial));
      writeActive(initial.id);
      if (params.projectId) {
        const mirror = readIndex().find((x) => x.cloudId === params.projectId);
        if (mirror && mirror.id === initial.id) setCloudId(params.projectId);
        toast('已打开拼布作品');
      }
      // 关键：无论从路由还是会话恢复打开，都按本地作品 id 把云端关联找回来，
      // 否则 cloudId 为空、每次保存都会新建一份云端作品（重复作品根源）。
      const own = readIndex().find((x) => x.id === initial.id);
      if (own?.cloudId) setCloudId(own.cloudId);
    } else if (params.projectId && requestApi) {
      // 从「我的作品」打开云端拼布：本机没有副本时登录后拉取云端内容。
      withToken((t) => { if (t) void openCloudProject({ id: params.projectId!, name: '', updatedAt: '', rows: 0, cols: 0 }, t); });
    }
    if (!initial && !params.projectId) {
      savedJson.current = JSON.stringify(docOf(project));
      writeActive(project.id);
    }
    setIndexList(readIndex());
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 草稿自动保存（恢复机制，不等于云端保存成功） */
  useEffect(() => {
    if (!loaded) return;
    if (!project.pieces.length && !project.guides.length && !project.reference) {
      // 全新空白画布不落草稿；已保存过的作品被清空后必须写回空状态，否则刷新读回旧草稿、布片复活。
      const known = Boolean(readDraft(project.id)) || readIndex().some((x) => x.id === project.id) || Boolean(cloudIdRef.current);
      if (!known) return;
    }
    const t = setTimeout(() => { saveDraft(project, project.id); }, 700);
    return () => clearTimeout(t);
  }, [project, loaded]);

  /* ---------- 图片资源加载 ---------- */
  useEffect(() => {
    const ids = new Set<string>();
    project.materials.forEach((m) => { if (m.assetId) ids.add(m.assetId); });
    const baseMat = project.materials.find((m) => m.id === project.base.materialId);
    if (baseMat?.assetId) ids.add(baseMat.assetId);
    if (project.reference) ids.add(project.reference.assetId);
    const pathFor = (id: string): string | undefined => {
      const m = project.materials.find((x) => x.assetId === id);
      if (m?.assetPath) return m.assetPath;
      if (project.reference?.assetId === id) return project.reference.assetPath;
      return undefined;
    };
    ids.forEach((id) => {
      if (imagesRef.current.has(id) || loadingImgs.current.has(id)) return;
      loadingImgs.current.add(id);
      void (async () => {
        try {
          let img = await loadImage(id);
          if (!img) {
            // 本机没有这张布图：图纸若带了云端地址就下载回本机素材库（换设备打开也不丢图）。
            const path = pathFor(id);
            const tk = tokenRef.current;
            if (path && tk) {
              const res = await fetch('/api/project-assets?path=' + encodeURIComponent(path), { headers: { Authorization: 'Bearer ' + tk } });
              if (res.ok) { await putAssetWithId(id, await res.blob()); img = await loadImage(id); if (img) window.dispatchEvent(new Event('pw-asset-ready')); }
            }
          }
          if (img) { imagesRef.current.set(id, img); setImgVersion((v) => v + 1); }
        } catch { /* 下载失败保持底色显示 */ } finally { loadingImgs.current.delete(id); }
      })();
    });
  }, [project, imgVersion]);

  /* ---------- 画布绘制 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preview = panel === 'import' && candidates
      ? candidates.filter((c) => !c.excluded).map((c) => ({ points: c.points, color: c.color, selected: c.chosen }))
      : undefined;
    drawScene(canvas, project, view, {
      selectedIds, draft: stroke, draftClosed: nearClose(),
      nodeMode, preview, previewStyle: panel === 'import' ? 'outline' : 'filled', images: imagesRef.current, showNumbers: 'selected',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, view, selectedIds, stroke, nodeMode, candidates, imgVersion, redrawTick, panel]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRedrawTick((t) => t + 1));
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  function nearClose() {
    if (stroke.length < 3 || !canvasRef.current) return false;
    const m = currentMetrics();
    const a = stroke[0], b = stroke[stroke.length - 1];
    return Math.hypot(a.x - b.x, a.y - b.y) * m.scale <= 10;
  }
  function currentMetrics() {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return metrics(rect.width || 300, rect.height || 300, project, view);
  }
  function toWorld(e: { clientX: number; clientY: number }): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }, currentMetrics());
  }
  function viewCenterWorld(): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return screenToWorld({ x: rect.width / 2, y: rect.height / 2 }, currentMetrics());
  }

  /* ---------- 手势 ---------- */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number; view: View } | null>(null);
  const drag = useRef<{ ids: string[]; start: Point; orig: PatchworkDocument; moved: boolean } | null>(null);
  const nodeDrag = useRef<{ pieceId: string; index: number; orig: PatchworkDocument } | null>(null);
  const xform = useRef<{ kind: 'scale' | 'rotate'; handle: string; pieceId: string; orig: PatchworkDocument; anchor: Point; center: Point; start: Point; startAngle: number; moved: boolean } | null>(null);
  function selectionHandles(piece: Piece, m: Metrics): Array<{ id: string; p: Point }> {
    const b = pointBounds(piece.points);
    const rotOff = 26 / m.scale;
    return [
      { id: 'rotate', p: { x: b.x + b.width / 2, y: b.y - rotOff } },
      { id: 'nw', p: { x: b.x, y: b.y } }, { id: 'n', p: { x: b.x + b.width / 2, y: b.y } }, { id: 'ne', p: { x: b.x + b.width, y: b.y } },
      { id: 'e', p: { x: b.x + b.width, y: b.y + b.height / 2 } }, { id: 'se', p: { x: b.x + b.width, y: b.y + b.height } },
      { id: 's', p: { x: b.x + b.width / 2, y: b.y + b.height } }, { id: 'sw', p: { x: b.x, y: b.y + b.height } },
      { id: 'w', p: { x: b.x, y: b.y + b.height / 2 } },
    ];
  }
  const drawing = useRef(false);
  const strokeRef = useRef<Point[]>([]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = canvasRef.current!.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view };
      if (drag.current) { const origDoc = drag.current.orig; drag.current = null; setProject((cur) => ({ ...cur, ...cloneDocument(origDoc) })); }
      if (xform.current) { const xo = xform.current.orig; xform.current = null; setProject((cur) => ({ ...cur, ...cloneDocument(xo) })); }
      nodeDrag.current = null;
      drawing.current = false;
      return;
    }
    if (!e.isPrimary) return;
    const w = toWorld(e);

    if (candidates && panel === 'import') {
      const hit = [...candidates].filter((c) => !c.excluded)
        .sort((x, y) => area(x.points) - area(y.points))
        .find((c) => pointInPolygon(w, c.points));
      if (hit) setCandidates((list) => list!.map((c) => (c === hit ? { ...c, chosen: !c.chosen } : c)));
      return;
    }

    if (tool === 'brush') {
      drawing.current = true;
      if (!strokeRef.current.length) strokeRef.current = [w];
      else strokeRef.current = [...strokeRef.current, w];
      setStroke([...strokeRef.current]);
      return;
    }

    if (tool === 'fill') {
      const id = hitTest(w, project.pieces);
      if (!id) return;
      const target = project.pieces.find((p) => p.id === id)!;
      if (fillPick) { setActiveMaterialId(target.materialId); setFillPick(false); toast(`已吸取 ${target.name} 的布料`); return; }
      commit((doc) => {
        doc.pieces.forEach((p) => {
          if (p.locked) return;
          if (fillScope === 'single' && p.id === id) p.materialId = activeMaterialId;
          if (fillScope === 'same' && p.materialId === target.materialId) p.materialId = activeMaterialId;
          if (fillScope === 'all') p.materialId = activeMaterialId;
        });
      });
      setSelectedIds([id]);
      return;
    }

    if (tool !== 'select') return;

    if (!nodeMode && single && !single.locked) {
      const m = currentMetrics();
      const hitH = selectionHandles(single, m).find((h) => Math.hypot((h.p.x - w.x) * m.scale, (h.p.y - w.y) * m.scale) <= 16);
      if (hitH) {
        const b = pointBounds(single.points);
        const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        const anchorMap: Record<string, Point> = {
          nw: { x: b.x + b.width, y: b.y + b.height }, n: { x: center.x, y: b.y + b.height }, ne: { x: b.x, y: b.y + b.height },
          e: { x: b.x, y: center.y }, se: { x: b.x, y: b.y }, s: { x: center.x, y: b.y },
          sw: { x: b.x + b.width, y: b.y }, w: { x: b.x + b.width, y: center.y },
        };
        xform.current = hitH.id === 'rotate'
          ? { kind: 'rotate', handle: 'rotate', pieceId: single.id, orig: cloneDocument(docOf(project)), anchor: center, center, start: w, startAngle: Math.atan2(w.y - center.y, w.x - center.x), moved: false }
          : { kind: 'scale', handle: hitH.id, pieceId: single.id, orig: cloneDocument(docOf(project)), anchor: anchorMap[hitH.id], center, start: w, startAngle: 0, moved: false };
        return;
      }
    }

    if (nodeMode && single) {
      const m = currentMetrics();
      const near = (p: Point) => Math.hypot((p.x - w.x) * m.scale, (p.y - w.y) * m.scale);
      let bestNode = -1, bestD = 14;
      single.points.forEach((p, i) => { const d = near(p); if (d < bestD) { bestD = d; bestNode = i; } });
      if (bestNode >= 0 && !single.locked) {
        setNodeIndex(bestNode);
        nodeDrag.current = { pieceId: single.id, index: bestNode, orig: cloneDocument(docOf(project)) };
        return;
      }
      // 点在边上：插入节点并立即拖动
      let insAt = -1, insPoint: Point | null = null, segD = 9;
      for (let i = 0; i < single.points.length; i++) {
        const a = single.points[i], b = single.points[(i + 1) % single.points.length];
        const abx = b.x - a.x, aby = b.y - a.y;
        const t = clamp(((w.x - a.x) * abx + (w.y - a.y) * aby) / (abx * abx + aby * aby || 1), 0, 1);
        const px = a.x + abx * t, py = a.y + aby * t;
        const d = Math.hypot((px - w.x) * m.scale, (py - w.y) * m.scale);
        if (d < segD) { segD = d; insAt = i + 1; insPoint = { x: px, y: py }; }
      }
      if (insAt > 0 && insPoint && !single.locked) {
        const orig = cloneDocument(docOf(project));
        const np = [...single.points]; np.splice(insAt, 0, insPoint);
        setProject((cur) => ({ ...cur, pieces: cur.pieces.map((p) => (p.id === single.id ? { ...p, points: np } : p)) }));
        setNodeIndex(insAt);
        nodeDrag.current = { pieceId: single.id, index: insAt, orig };
        return;
      }
      const id = hitTest(w, project.pieces);
      if (id !== single.id) { setNodeMode(false); setNodeIndex(null); setSelectedIds(id ? [id] : []); }
      return;
    }

    const id = hitTest(w, project.pieces);
    if (id) {
      const ids = selectedIds.includes(id) && selectedIds.length > 1 ? selectedIds : [id];
      setSelectedIds(ids);
      const lockedAny = project.pieces.some((p) => ids.includes(p.id) && p.locked);
      if (!lockedAny) drag.current = { ids, start: w, orig: cloneDocument(docOf(project)), moved: false };
    } else {
      setSelectedIds([]);
      drag.current = { ids: [], start: w, orig: cloneDocument(docOf(project)), moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const p0 = pinch.current;
      const zoom = clamp(p0.view.zoom * (dist / Math.max(20, p0.dist)), 0.2, 6);
      setView({ zoom, panX: p0.view.panX + ((a.x + b.x) / 2 - p0.cx), panY: p0.view.panY + ((a.y + b.y) / 2 - p0.cy) });
      return;
    }
    if (!e.isPrimary) return;
    const w = toWorld(e);
    if (xform.current) {
      const xf = xform.current;
      const origPiece = (xf.orig.pieces as Piece[]).find((p) => p.id === xf.pieceId);
      if (origPiece) {
        let np: Point[] | null = null;
        if (xf.kind === 'rotate') {
          const ang = Math.atan2(w.y - xf.center.y, w.x - xf.center.x) - xf.startAngle;
          if (Math.abs(ang) > 0.0005) {
            const cos = Math.cos(ang), sin = Math.sin(ang);
            np = origPiece.points.map((p) => ({ x: xf.center.x + (p.x - xf.center.x) * cos - (p.y - xf.center.y) * sin, y: xf.center.y + (p.x - xf.center.x) * sin + (p.y - xf.center.y) * cos }));
          }
        } else {
          const h = xf.handle;
          const ratio = (cur: number, a: number, s0: number) => { const d = s0 - a; return Math.abs(d) < 1e-6 ? 1 : clamp((cur - a) / d, 0.05, 20); };
          let fx = 1, fy = 1;
          if (h.length === 2) {
            const f = clamp(Math.hypot(w.x - xf.anchor.x, w.y - xf.anchor.y) / Math.max(1e-6, Math.hypot(xf.start.x - xf.anchor.x, xf.start.y - xf.anchor.y)), 0.05, 20);
            fx = f; fy = f;
          } else if (h === 'e' || h === 'w') fx = ratio(w.x, xf.anchor.x, xf.start.x);
          else fy = ratio(w.y, xf.anchor.y, xf.start.y);
          np = origPiece.points.map((p) => ({ x: xf.anchor.x + (p.x - xf.anchor.x) * fx, y: xf.anchor.y + (p.y - xf.anchor.y) * fy }));
        }
        if (np) {
          xf.moved = true;
          const targetId = xf.pieceId;
          const points = np;
          setProject((cur) => ({ ...cur, pieces: cur.pieces.map((p) => (p.id === targetId ? { ...p, points } : p)) }));
        }
      }
      return;
    }
    if (drawing.current && tool === 'brush') {
      const last = strokeRef.current[strokeRef.current.length - 1];
      const m = currentMetrics();
      if (!last || Math.hypot(w.x - last.x, w.y - last.y) * m.scale >= 2) {
        strokeRef.current = [...strokeRef.current, w];
        setStroke([...strokeRef.current]);
      }
      return;
    }
    if (nodeDrag.current) {
      const nd = nodeDrag.current;
      setProject((cur) => ({ ...cur, pieces: cur.pieces.map((p) => (p.id === nd.pieceId ? { ...p, points: p.points.map((pt, i) => (i === nd.index ? w : pt)) } : p)) }));
      return;
    }
    if (drag.current) {
      const d = drag.current;
      const dx = w.x - d.start.x, dy = w.y - d.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.01) d.moved = true;
      if (!d.ids.length) { setView((v) => ({ ...v, panX: v.panX + (e.movementX || 0), panY: v.panY + (e.movementY || 0) })); return; }
      const origPieces = new Map((d.orig.pieces as Piece[]).map((p) => [p.id, p]));
      setProject((cur) => ({ ...cur, pieces: cur.pieces.map((p) => (d.ids.includes(p.id) && origPieces.has(p.id) ? { ...p, points: origPieces.get(p.id)!.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) } : p)) }));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (xform.current) {
      const xf = xform.current; xform.current = null;
      if (xf.moved) commitFrom(xf.orig);
      return;
    }
    if (drawing.current) {
      drawing.current = false;
      const drawn = [...strokeRef.current];
      strokeRef.current = [];
      setStroke([]);
      if (drawn.length >= 2) finishStroke(drawn);
      return;
    }
    if (nodeDrag.current) { commitFrom(nodeDrag.current.orig); nodeDrag.current = null; return; }
    if (drag.current) {
      if (drag.current.moved && drag.current.ids.length) commitFrom(drag.current.orig);
      drag.current = null;
    }
  };

  /* ---------- 画笔：松手自动闭合生成 ---------- */
  const finishStroke = (raw: Point[]) => {
    if (raw.length < 3) return;
    // 闭合清理：画圈收尾常会越过起点一点点，截掉后半程绕回起点附近的点，避免闭合段与首段相交被误判自交
    let trimmed = raw;
    for (let i = Math.floor(raw.length / 2); i < raw.length; i += 1) {
      if (i >= 3 && Math.hypot(raw[i].x - raw[0].x, raw[i].y - raw[0].y) <= 4) { trimmed = raw.slice(0, i); break; }
    }
    const deduped = trimmed.filter((pt, i) => i === 0 || Math.hypot(pt.x - trimmed[i - 1].x, pt.y - trimmed[i - 1].y) > 0.5);
    const pts = simplifyPoints(deduped.length >= 3 ? deduped : trimmed, 0.3);
    const err = validatePiece(pts);
    if (err) { toast(err); return; }
    const piece = makePiece(pts, activeMaterialId, `布片 ${project.pieces.length + 1}`);
    if (project.technique === 'turned') piece.seamMm = 5;
    commit((doc) => { doc.pieces.push(piece); });
    setSelectedIds([piece.id]);
    // 保持画笔工具，可连续画下一片
  };

  /* ---------- 变换（选中布片） ---------- */
  const transformSelected = (fn: (p: Piece) => Piece) => {
    commit((doc) => {
      doc.pieces = doc.pieces.map((p) => (selectedIds.includes(p.id) && !p.locked ? fn(p) : p));
    });
  };
  // 直接点击底部布料：有选中布片就立即填充；否则只切换画笔/填布工具当前布料。
  const rotateSelected = (deg: number) => transformSelected((p) => ({ ...p, points: transformPoints(p.points, 'rotate', deg) }));
  const mirrorSelected = (axis: 'mirrorX' | 'mirrorY') => transformSelected((p) => ({ ...p, points: transformPoints(p.points, axis) }));
  const duplicateSelected = () => {
    const copies: Piece[] = [];
    commit((doc) => {
      selectedPieces.filter((p) => !p.locked).forEach((p) => {
        const copy: Piece = { ...p, id: uid(), name: `${p.name} 副本`, points: p.points.map((pt) => ({ x: pt.x + 10, y: pt.y + 10 })), texture: { ...p.texture } };
        doc.pieces.push(copy); copies.push(copy);
      });
    });
    if (copies.length) setSelectedIds(copies.map((c) => c.id));
  };
  const confirmClearCanvas = () => {
    const count = project.pieces.length;
    const guides = project.guides.length;
    const reference = Boolean(project.reference);
    if (!count && !guides && !reference && !stroke.length && !candidates?.length) return;
    openConfirm({
      title: '清空画布',
      message: `将清空当前画布的 ${count} 块布片、${guides} 条辅助线${reference ? '及参考图片' : ''}，同时取消未完成的绘制。底布尺寸和布料库会保留；当前草稿会自动更新，清空后可立即点击「撤销」恢复。`,
      confirmText: '确认清空',
      danger: true,
      onConfirm: () => {
        if (count || guides || reference) commit(clearCanvasContent);
        cancelAnalysis();
        drawing.current = false;
        drag.current = null;
        nodeDrag.current = null;
        xform.current = null;
        pointers.current.clear();
        pinch.current = null;
        strokeRef.current = [];
        setStroke([]);
        setSelectedIds([]);
        setNodeMode(false);
        setNodeIndex(null);
        setTool('select');
        toast('画布已清空，可点击顶部「撤销」恢复');
      },
    });
  };
  const deleteSelected = () => {
    if (!selectedIds.length) return;
    const ids = [...selectedIds];
    openConfirm({
      title: '删除布片',
      message: ids.length === 1 ? `确定删除「${selectedPieces[0]?.name ?? '布片'}」吗？删除后可通过撤销恢复。` : `确定删除选中的 ${ids.length} 块布片吗？删除后可通过撤销恢复。`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => {
        commit((doc) => { doc.pieces = doc.pieces.filter((p) => !ids.includes(p.id)); });
        setSelectedIds([]); setNodeMode(false);
      },
    });
  };
  const toggleLockSelected = () => {
    commit((doc) => { doc.pieces = doc.pieces.map((p) => (selectedIds.includes(p.id) ? { ...p, locked: !p.locked } : p)); });
  };
  const groupSelected = (group: boolean) => {
    const gid = group ? (selectedPieces.find((p) => p.groupId)?.groupId ?? uid()) : undefined;
    commit((doc) => { doc.pieces = doc.pieces.map((p) => (selectedIds.includes(p.id) ? { ...p, groupId: gid } : p)); });
  };
  const alignSelected = (mode: 'left' | 'cx' | 'right' | 'top' | 'cy' | 'bottom') => {
    if (selectedPieces.length < 2) return;
    const boxes = selectedPieces.map((p) => pointBounds(p.points));
    const minX = Math.min(...boxes.map((b) => b.x)), maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const minY = Math.min(...boxes.map((b) => b.y)), maxY = Math.max(...boxes.map((b) => b.y + b.height));
    commit((doc) => {
      doc.pieces = doc.pieces.map((p) => {
        if (!selectedIds.includes(p.id) || p.locked) return p;
        const b = pointBounds(p.points);
        let dx = 0, dy = 0;
        if (mode === 'left') dx = minX - b.x;
        if (mode === 'cx') dx = (minX + maxX) / 2 - (b.x + b.width / 2);
        if (mode === 'right') dx = maxX - (b.x + b.width);
        if (mode === 'top') dy = minY - b.y;
        if (mode === 'cy') dy = (minY + maxY) / 2 - (b.y + b.height / 2);
        if (mode === 'bottom') dy = maxY - (b.y + b.height);
        return { ...p, points: p.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) };
      });
    });
  };
  const mergeSelected = () => {
    const targets = selectedPieces.filter((p) => !p.locked);
    if (targets.length < 2) { toast('先选中至少两块未锁定布片'); return; }
    const merged = unionPolygons(targets.map((p) => p.points));
    if (!merged.length) { toast('合并失败：所选布片无法求并集'); return; }
    commit((doc) => {
      doc.pieces = doc.pieces.filter((p) => !targets.includes(p));
      const gid = merged.length > 1 ? uid() : undefined;
      merged.forEach((ring, i) => {
        const piece = makePiece(ring, targets[0].materialId, merged.length > 1 ? `${targets[0].name}·合并${i + 1}` : `${targets[0].name}·合并`);
        if (gid) piece.groupId = gid;
        doc.pieces.push(piece);
      });
    });
    toast(merged.length > 1 ? '不相邻区域不能伪装成单片，已保留为组合' : '已合并为一块布片');
  };
  const deleteNode = () => {
    if (!single || nodeIndex == null) return;
    if (single.points.length <= 3) { toast('布片至少保留 3 个节点'); return; }
    commit((doc) => {
      const p = doc.pieces.find((x) => x.id === single.id);
      if (p) p.points = p.points.filter((_, i) => i !== nodeIndex);
    });
    setNodeIndex(null);
  };

  /* ---------- 添加形状 ---------- */
  const placeSelectedShape = async (choice: ShapeChoice, options: ShapePlacement) => {
    const dialogVersion = shapeDialogVersion.current;
    const ids = project.materials.map((m) => m.id);
    const second = ids[(ids.indexOf(activeMaterialId) + 1) % ids.length] || activeMaterialId;
    try {
      if (choice.templateId) {
        const full = await shapeLibrary.resolveTemplate(choice.templateId);
        choice = { ...choice, polygons: [full.points] };
      }
      if (dialogVersion !== shapeDialogVersion.current || projectRef.current !== project) return;
      const pieces = placeShapePieces(choice, options, viewCenterWorld(), activeMaterialId, second);
      commit((doc) => { doc.pieces.push(...pieces); });
      if (choice.templateId) updateShapeTemplates(templates.map((t) => t.id === choice.templateId ? { ...t, lastUsedAt: Date.now() } : t));
      setSelectedIds(pieces.map((p) => p.id)); setTool('select'); setPanel(null);
    } catch (error) { toast(error instanceof Error ? error.message : '添加形状失败'); }
  };
  const saveAsTemplate = async () => {
    if (!single) return;
    if (await updateShapeTemplates([...templates, toShapeTemplate(single.name, single.points)])) toast('已存入「我的形状」');
  };

  /* ---------- 保存 / 打开 / 新建 ---------- */
  const renderClean = (widthPx: number): Promise<Blob | null> => new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') { resolve(null); return; }
    const c = document.createElement('canvas');
    const hPx = Math.max(60, Math.round((widthPx * project.heightMm) / project.widthMm));
    c.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;height:${hPx}px;`;
    document.body?.appendChild?.(c);
    const run = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn: FrameRequestCallback) => setTimeout(fn, 0);
    run(() => {
      try {
        drawScene(c, project, { zoom: 1, panX: 0, panY: 0 }, { selectedIds: [], draft: [], draftClosed: false, nodeMode: false, images: imagesRef.current, clean: true, showNumbers: false });
        if (typeof c.toBlob === 'function') {
          c.toBlob((b) => { c.remove?.(); resolve(b); }, 'image/png');
        } else {
          c.remove?.();
          resolve(null);
        }
      } catch {
        c.remove?.();
        resolve(null);
      }
    });
  });
  const addFabricMaterial = async (f: FabricItemLite) => {
    const scope = fabricSaveScopeRef.current;
    const existing = project.materials.find((m) => matchesMaterialFabric(m, f));
    if (existing) {
      pickMaterial(existing.id);
      toast(`已选用布料「${f.name}」`);
      return;
    }
    const catalogAsset = presetAsset(f);
    let assetId: string | undefined = catalogAsset?.assetId;
    if (f.image && !catalogAsset) {
      try { const blob = await (await fetch(f.image)).blob(); assetId = await putAsset(blob); } catch { /* 图片失败时退化为纯色布料 */ }
    }
    if (scope !== fabricSaveScopeRef.current) return;
    const holder: { mat: Material | null } = { mat: null };
    const pid = fabricPickerTarget === 'props' && single ? single.id : null;
    commit((doc) => {
      const already = doc.materials.find(m => matchesMaterialFabric(m, f));
      if (already) { holder.mat = already; if (pid) { const piece = doc.pieces.find(p => p.id === pid); if (piece) piece.materialId = already.id; } return; }
      // 编号按提交时的最新材料表计算，避免慢网络下连点两次生成同号材料
      const seq = nextMatSeq(doc.materials);
      const sampleW = f.sampleWidthMm && f.sampleWidthMm > 0 ? f.sampleWidthMm : f.widthMm && f.widthMm > 0 ? f.widthMm : undefined;
      const createdMat: Material = {
        id: `M${seq}`,
        name: f.name,
        color: f.color || '#d9c8a9',
        category: f.category || undefined,
        inventoryFabricId: f.id,
        presetId: f.presetId || undefined,
        ...(catalogAsset ? { assetPath: catalogAsset.assetPath } : {}),
        ...(assetId ? { assetId, calibrated: Boolean(sampleW), sampleWidthMm: sampleW } : {}),
      };
      holder.mat = createdMat;
      doc.materials.push(createdMat);
      if (pid) {
        const pc = doc.pieces.find((x) => x.id === pid);
        if (pc) pc.materialId = createdMat.id;
      }
    });
    if (!holder.mat) return;
    const pickedId = holder.mat.id;
    if (fabricPickerTarget === 'base') setBaseForm((cur) => cur ? { ...cur, materialId: pickedId } : cur);
    else setActiveMaterialId(pickedId);
    setFabricPick(null);
    closeFabrics();
    toast(`已选用布料「${f.name}」`);
  };
  const replaceWithWarehouseFabric = async (sourceMaterialId: string, f: FabricItemLite, scope: 'all' | 'selected') => {
    const catalogAsset = presetAsset(f);
    let assetId: string | undefined = catalogAsset?.assetId;
    const existing = project.materials.find((m) => matchesMaterialFabric(m, f));
    if (!existing && f.image && !catalogAsset) {
      try { const blob = await (await fetch(f.image)).blob(); assetId = await putAsset(blob); } catch { /* 退化为纯色 */ }
    }
    let replacedId = existing?.id || '';
    commit((doc) => {
      const existingMat = doc.materials.find((m) => matchesMaterialFabric(m, f));
      const targetMat: Material = existingMat ?? (() => {
        const seq = nextMatSeq(doc.materials);
        const sampleW = f.sampleWidthMm && f.sampleWidthMm > 0 ? f.sampleWidthMm : f.widthMm && f.widthMm > 0 ? f.widthMm : undefined;
        const created: Material = {
          id: `M${seq}`,
          name: f.name,
          color: f.color || '#d9c8a9',
          category: f.category || undefined,
          inventoryFabricId: f.id,
        presetId: f.presetId || undefined,
        ...(catalogAsset ? { assetPath: catalogAsset.assetPath } : {}),
          ...(assetId ? { assetId, calibrated: Boolean(sampleW), sampleWidthMm: sampleW } : {}),
        };
        doc.materials.push(created);
        return created;
      })();
      replacedId = targetMat.id;
      if (scope === 'selected' && selectedIds.length > 0) {
        doc.pieces.forEach((pc) => {
          if (selectedIds.includes(pc.id)) pc.materialId = targetMat.id;
        });
      } else {
        doc.pieces.forEach((pc) => {
          if (pc.materialId === sourceMaterialId) pc.materialId = targetMat.id;
        });
        if (doc.base.materialId === sourceMaterialId) doc.base.materialId = targetMat.id;
      }
    });
    if (replacedId && activeMaterialId === sourceMaterialId) setActiveMaterialId(replacedId);
    setReplaceTargetMatId(null);
    toast(scope === 'selected' && selectedIds.length > 0 ? `已将选中布片替换为「${f.name}」` : `已将同款布料全部替换为「${f.name}」`);
  };
  const openConsumeConfirm = () => {
    const reqs = computeProjectMaterialRequirements(project, warehouseFabrics, { includeHidden, wasteRatio });
    const draft: Record<string, string> = {};
    for (const r of reqs) {
      if (r.inventoryFabric && r.availableAreaMm2 !== null) {
        const id = r.inventoryFabric.id;
        draft[id] = String((Number(draft[id]) || 0) + r.requiredAreaMm2 / 100);
      }
    }
    if (Object.keys(draft).length === 0) {
      toast('请先将图纸布料绑定或替换为仓库中的布料');
      return;
    }
    consumeOperationRef.current = uid();
    setConsumeDraftCm2(draft);
    setShowConsumeConfirm(true);
  };
  const submitConsumeStock = () => {
    if (consumingStockRef.current) return;
    const items = Object.entries(consumeDraftCm2)
      .map(([fabricId, cm2Str]) => ({ fabricId, actualAreaMm2: Math.round((Number(cm2Str) || 0) * 100) }))
      .filter((item) => Number.isSafeInteger(item.actualAreaMm2) && item.actualAreaMm2 > 0);
    if (items.length === 0) {
      toast('请填写大于 0 的实际裁布面积');
      return;
    }
    withToken((authToken) => {
      if (!requestApi || !authToken) {
        toast('登录后才能扣减仓库库存');
        return;
      }
      if (consumingStockRef.current) return;
      consumingStockRef.current = true;
      setConsumingStock(true);
      const scope = fabricSaveScopeRef.current;
      const isCurrent = () => scope === fabricSaveScopeRef.current && authToken === tokenRef.current;
      void (async () => {
        try {
          const payload = await requestApi<{ fabrics: FabricItem[] }>('/fabrics/consume', {
            method: 'POST',
            body: JSON.stringify({
              operationId: consumeOperationRef.current || (consumeOperationRef.current = uid()),
              projectId: cloudIdRef.current || project.id,
              projectName: project.name,
              items,
            }),
          }, authToken);
          if (!isCurrent()) return;
          ++inventoryVersionRef.current;
          if (Array.isArray(payload.fabrics)) setWarehouseFabrics(payload.fabrics);
          consumeOperationRef.current = '';
          setShowConsumeConfirm(false);
          toast('已按实际裁片面积扣减布料库存');
        } catch (err) {
          if (isCurrent()) toast(err instanceof Error ? err.message : '库存扣减失败，请稍后重试');
        } finally {
          consumingStockRef.current = false;
          if (isCurrent()) setConsumingStock(false);
        }
      })();
    });
  };
  const refreshCloudList = async (t: string) => {
    if (!requestApi || !t) return;
    try {
      const payload = await requestApi<{ projects: CloudWork[] }>('/projects?kind=patchwork&page=1&pageSize=100', {}, t);
      if (Array.isArray(payload.projects)) setCloudList(payload.projects);
    } catch { /* 云端不可用时只显示本机作品 */ }
  };
  const savingRef = useRef(false);
  const doSave = async (authToken = '') => {
    if (savingRef.current) { toast('正在保存，请稍候'); return; }
    savingRef.current = true;
    try { await doSaveInner(authToken); } finally { savingRef.current = false; }
  };
  const doSaveInner = async (authToken = '') => {
    const saveScope = fabricSaveScopeRef.current;
    const isSaveCurrent = () => saveScope === fabricSaveScopeRef.current && projectRef.current?.id === project.id && (!authToken || authToken === tokenRef.current);
    let savedCloudId = cloudIdRef.current;
    const name = (saveName || project.name || '未命名拼布').trim();
    let coverBlob: Blob | null = null;
    let coverAssetId = project.coverAssetId;
    try {
      coverBlob = await renderClean(640);
      if (coverBlob) {
        const prevCover = project.coverAssetId;
        coverAssetId = await putAsset(coverBlob);
        if (prevCover && prevCover !== coverAssetId) void deleteAsset(prevCover);
      }
    } catch { /* 封面失败不阻塞保存 */ }
    const saved: PatchworkProject = { ...project, name, coverAssetId, revision: project.revision + 1 };
    // 保存是异步长流程（封面渲染 + 逐张布图上传需数秒）：期间用户可能继续编辑。
    // 只有界面仍是点击保存时的文档才把快照写回；否则快照只进草稿/云端，界面以最新编辑为准。
    let liveApplied: PatchworkProject | null = null;
    if (projectRef.current === project) { setProject(saved); liveApplied = saved; }
    saveDraft(saved, saved.id);
    let cloudOk = false;
    if (requestApi && authToken) {
      try {
        const personalPresets = await registerUsedPresetFabrics(saved, requestApi, authToken);
        if (personalPresets.length) {
          saved.materials = saved.materials.map(m => {
            const f = personalPresets.find(f => f.presetId === m.presetId);
            return f ? { ...m, inventoryFabricId: f.id } : m;
          });
          saveDraft(saved, saved.id);
          if (saveScope === fabricSaveScopeRef.current && authToken === tokenRef.current) {
            ++inventoryVersionRef.current;
            setWarehouseFabrics(cur => [...personalPresets, ...cur.filter(f => !personalPresets.some(p => p.id === f.id))]);
            const cur = projectRef.current;
            if (cur && cur.id === saved.id) {
              const merged = { ...cur, materials: cur.materials.map(m => {
                const f = personalPresets.find(f => f.presetId === m.presetId);
                return f ? { ...m, inventoryFabricId: f.id } : m;
              }) };
              if (cur === liveApplied) liveApplied = merged;
              setProject(merged);
            }
          }
        }
        // 布料图片云同步：把图纸引用到的本机布图上传云端、路径写回图纸，
        // 换任何设备打开时都能按路径把布图下载回来，不再只剩底色。
        const pathMap = new Map<string, string>();
        for (const m of saved.materials) {
          if (!m.assetId || m.assetPath) continue;
          try {
            const blob = await getAsset(m.assetId);
            if (!blob) continue;
            const dataUrl = await blobToDataUrl(blob);
            const up = await requestApi<{ sourceImagePath?: string }>('/uploads/projects', { method: 'POST', body: JSON.stringify({ images: [{ kind: 'source', filename: `fabric-${m.id}.png`, dataUrl }] }) }, authToken);
            if (up.sourceImagePath) pathMap.set(m.assetId, up.sourceImagePath);
          } catch { /* 单张布图上传失败不阻塞保存 */ }
        }
        let refPath: string | undefined;
        if (saved.reference?.assetId && !saved.reference.assetPath) {
          try {
            const blob = await getAsset(saved.reference.assetId);
            if (blob) {
              const dataUrl = await blobToDataUrl(blob);
              const up = await requestApi<{ sourceImagePath?: string }>('/uploads/projects', { method: 'POST', body: JSON.stringify({ images: [{ kind: 'source', filename: 'reference.png', dataUrl }] }) }, authToken);
              if (up.sourceImagePath) refPath = up.sourceImagePath;
            }
          } catch { /* 参考图上传失败不阻塞保存 */ }
        }
        if (pathMap.size || refPath) {
          Object.assign(saved, {
            materials: saved.materials.map((m) => (m.assetId && pathMap.get(m.assetId) ? { ...m, assetPath: pathMap.get(m.assetId) } : m)),
            reference: refPath && saved.reference ? { ...saved.reference, assetPath: refPath } : saved.reference,
          });
          saveDraft(saved, saved.id);
          // 云端路径只合并进当前文档，不覆盖保存期间用户的新编辑
          if (isSaveCurrent()) {
          const cur = projectRef.current || saved;
          const merged: PatchworkProject = {
            ...cur,
            materials: cur.materials.map((m) => { const sm = saved.materials.find((x) => x.id === m.id); return sm?.assetPath && !m.assetPath ? { ...m, assetPath: sm.assetPath } : m; }),
            reference: cur.reference && saved.reference?.assetPath && !cur.reference.assetPath ? { ...cur.reference, assetPath: saved.reference.assetPath } : cur.reference,
          };
          setProject(merged);
          liveApplied = merged;
          saveDraft(merged, merged.id);
          }
        }
        let thumbnailImagePath: string | undefined;
        if (coverBlob) {
          const dataUrl = await blobToDataUrl(coverBlob);
          const up = await requestApi<{ thumbnailImagePath?: string }>('/uploads/projects', { method: 'POST', body: JSON.stringify({ images: [{ kind: 'thumbnail', filename: 'patchwork-cover.png', dataUrl }] }) }, authToken);
          thumbnailImagePath = up.thumbnailImagePath;
        }
        const payload = { kind: 'patchwork', name, rows: Math.max(1, Math.round(saved.heightMm)), cols: Math.max(1, Math.round(saved.widthMm)), content: JSON.stringify(docOf(saved)), ...(thumbnailImagePath ? { thumbnailImagePath } : {}) };
        const existingCloudId = savedCloudId;
        try {
          if (existingCloudId) {
            await requestApi(`/projects/${encodeURIComponent(existingCloudId)}`, { method: 'PUT', body: JSON.stringify(payload) }, authToken);
          } else {
            const created = await requestApi<{ project: { id: string } }>('/projects', { method: 'POST', body: JSON.stringify(payload) }, authToken);
            savedCloudId = created.project.id;
            if (isSaveCurrent()) setCloudId(created.project.id);
          }
        } catch (err) {
          // 只有云端记录确实不存在（404）才允许新建；其他失败一律按保存失败处理，
          // 绝不能兜底新建——那正是同图纸反复保存生成一堆重复作品的来源。
          if (existingCloudId && (err as { status?: number })?.status === 404) {
            const created = await requestApi<{ project: { id: string } }>('/projects', { method: 'POST', body: JSON.stringify(payload) }, authToken);
            savedCloudId = created.project.id;
            if (isSaveCurrent()) setCloudId(created.project.id);
          } else throw err;
        }
        cloudOk = true;
      } catch { cloudOk = false; }
    }
    if (isSaveCurrent() && liveApplied && projectRef.current === liveApplied) savedJson.current = JSON.stringify(docOf(liveApplied));
    const entry: IndexEntry = { id: saved.id, name, updatedAt: Date.now(), widthMm: saved.widthMm, heightMm: saved.heightMm, technique: saved.technique, cloudId: savedCloudId || undefined };
    const list = [entry, ...readIndex().filter((x) => x.id !== saved.id)];
    writeIndex(list);
    if (!isSaveCurrent()) return;
    setIndexList(list);
    setPanel(null);
    toast(cloudOk ? '已保存到我的作品' : '已保存到本机作品');
    if (cloudOk) void refreshCloudList(authToken);
  };
  const applyProject = (raw: PatchworkProject): PatchworkProject => {
    const applied = { ...makeProject(), ...raw };
    setProject(applied);
    setPast([]); setFuture([]); setSelectedIds([]); setNodeMode(false); setCandidates(null);
    savedJson.current = JSON.stringify(docOf(applied));
    writeActive(applied.id);
    return applied;
  };
  const openProject = (id: string) => {
    const raw = readDraft(id) as PatchworkProject | null;
    if (!raw || raw.kind !== 'patchwork') { toast('作品数据不存在或已损坏'); return; }
    applyProject(raw);
    const entry = readIndex().find((x) => x.id === id);
    setCloudId(entry?.cloudId ?? null);
    setPanel(null);
    toast('已打开作品');
  };
  const openCloudProject = async (entry: CloudWork, t: string) => {
    const local = readIndex().find((x) => x.cloudId === entry.id);
    if (local) { openProject(local.id); return; }
    if (!requestApi || !t) { toast('需要登录后打开云端作品'); return; }
    try {
      const { project: detail } = await requestApi<{ project: { kind?: string; content?: string } }>(`/projects/${encodeURIComponent(entry.id)}`, {}, t);
      if (!detail || detail.kind !== 'patchwork' || !detail.content) { toast('作品数据不存在或已损坏'); return; }
      const raw = JSON.parse(detail.content) as PatchworkProject;
      if (!raw || !Array.isArray(raw.pieces)) { toast('作品数据不存在或已损坏'); return; }
      const applied = applyProject(raw);
      saveDraft(applied, applied.id);
      const idx: IndexEntry = { id: applied.id, name: applied.name, updatedAt: Date.now(), widthMm: applied.widthMm, heightMm: applied.heightMm, technique: applied.technique, cloudId: entry.id };
      const list = [idx, ...readIndex().filter((x) => x.id !== applied.id)];
      writeIndex(list); setIndexList(list);
      setCloudId(entry.id);
      setPanel(null);
      toast('已打开作品');
    } catch { toast('打开失败，请稍后重试'); }
  };
  const newProject = () => { setPanel(null); setCreateCfg({ source: 'panel' }); };
  const confirmCreate = (cfg: PatchworkCreateConfig) => {
    void (async () => {
    const fresh = makeProject();
    fresh.widthMm = cfg.widthMm;
    fresh.heightMm = cfg.heightMm;
    fresh.base = { materialId: '', locked: true, includeInCutList: false };
    if (cfg.baseFabricId) {
      let f = unifiedFabrics(warehouseFabrics).find((x) => x.id === cfg.baseFabricId);
      if (!f && requestApi && tokenRef.current) {
        try { f = (await requestApi<{fabric:FabricItem}>(`/fabrics/${encodeURIComponent(cfg.baseFabricId)}`, {}, tokenRef.current)).fabric; } catch { toast('底布读取失败，请重试'); return; }
      }
      if (f) await attachBaseFabric(fresh, f);
    }
    setProject(fresh);
    setPast([]); setFuture([]); setSelectedIds([]); setNodeMode(false); setCandidates(null);
    savedJson.current = JSON.stringify(docOf(fresh));
    writeActive(fresh.id);
    setCloudId(null);
    setPanel(null);
    setCreateCfg(null);
    })();
  };
  const cancelCreate = () => { const source = createCfg?.source; setCreateCfg(null); if (source === 'entry') navigate('/'); };
  const deleteProject = (id: string) => {
    try { localStorage.removeItem(`qiaoqiaole:patchwork:${id}`); } catch { /* 忽略 */ }
    const list = readIndex().filter((x) => x.id !== id);
    writeIndex(list); setIndexList(list);
  };
  const deleteCloudProject = async (entry: CloudWork, t: string) => {
    if (requestApi && t) {
      try { await requestApi(`/projects/${encodeURIComponent(entry.id)}`, { method: 'DELETE' }, t); }
      catch { toast('云端删除失败，请稍后重试'); return; }
    }
    const mirror = readIndex().find((x) => x.cloudId === entry.id);
    if (mirror) deleteProject(mirror.id);
    setCloudList((list) => list.filter((x) => x.id !== entry.id));
    if (cloudIdRef.current === entry.id) setCloudId(null);
    toast('已删除作品');
  };
  const leave = () => { if (dirty) setPanel('leave'); else navigate('/'); };

  /* ---------- 布料选择与编辑（新版） ---------- */
  const usageOf = (id: string) => project.pieces.filter((pc) => pc.materialId === id).length + (project.base.materialId === id ? 1 : 0);
  const closeFabrics = () => {
    if (savingFabricRef.current) return;
    setPanel(fabricPickerTarget === 'base' ? 'base' : fabricPickerTarget === 'props' ? 'props' : null);
    setMatDetailId(null);
    setMatDraft(null);
    setMatDeleting(false);
    setFabricPick(null);
  };
  const closeMatDetail = () => { if (savingFabricRef.current) return; setMatDetailId(null); setMatDraft(null); setMatDeleting(false); };
  const pickMaterial = (id: string) => {
    if (fabricPickerTarget === 'base') {
      setBaseForm((cur) => cur ? { ...cur, materialId: id } : cur);
    } else if (fabricPickerTarget === 'props') {
      if (single && single.materialId !== id) {
        const pid = single.id;
        commit((doc) => {
          const t = doc.pieces.find((x) => x.id === pid);
          if (t) t.materialId = id;
        });
      }
      setActiveMaterialId(id);
    } else {
      setActiveMaterialId(id);
      const targets = selectedPieces.filter((p) => !p.locked && p.materialId !== id);
      if (targets.length) {
        const ids = new Set(targets.map((p) => p.id));
        commit((doc) => { doc.pieces.forEach((p) => { if (ids.has(p.id)) p.materialId = id; }); });
      }
    }
    closeFabrics();
  };
  const openMatDetail = (id: string, override?: Material) => {
    const m = override || project.materials.find((x) => x.id === id);
    if (!m) return;
    setMatDetailId(id);
    setMatDraft({
      name: m.name,
      kind: m.assetId && !m.texturePattern ? 'image' : 'color',
      color: m.color,
      pattern: m.texturePattern || 'none',
      assetId: m.texturePattern ? undefined : m.assetId,
      sampleWidthMm: m.sampleWidthMm,
    });
    setMatDeleting(false);
    setMatReplaceId('');
  };
  const launchReplaceImage = () => { if (!matDetailId) return; setFabTarget(matDetailId); fabReturnRef.current = true; fabricFileRef.current?.click(); };
  const createMaterialDraft = () => {
    if (!savingFabricRef.current) setCreatingFabric(true);
  };
  const saveNewFabric = async ({ payload, projectOnly, texturePattern }: FabricCreateResult) => {
    const scope = fabricSaveScopeRef.current;
    let authToken = tokenRef.current;
    if (!projectOnly && !authToken && requireLogin) {
      await requireLogin((t) => { authToken = t; tokenRef.current = t; });
    }
    if (scope !== fabricSaveScopeRef.current) return;
    if (!projectOnly && (!requestApi || !authToken)) throw new Error('请先登录后保存到布料仓库');
    let assetId: string | undefined;
    if (payload.image) assetId = await putAsset(await (await fetch(payload.image)).blob());
    if (scope !== fabricSaveScopeRef.current) return;
    const fabric = projectOnly ? null : await createWarehouseFabric(requestApi, authToken, payload);
    if (scope !== fabricSaveScopeRef.current || (!projectOnly && tokenRef.current !== authToken)) return;
    if (fabric) {
      ++inventoryVersionRef.current;
      setWarehouseFabrics((cur) => [fabric, ...cur.filter((f) => f.id !== fabric.id)]);
    }
    const holder: { id?: string } = {};
    const pid = fabricPickerTarget === 'props' && single ? single.id : null;
    commit((doc) => {
      const id = `M${nextMatSeq(doc.materials)}`;
      holder.id = id;
      doc.materials.push({
        id, name: payload.name, color: payload.color, category: payload.category,
        assetId, sampleWidthMm: payload.sampleWidthMm || undefined,
        calibrated: Boolean(payload.sampleWidthMm), texturePattern,
        ...(fabric ? { inventoryFabricId: fabric.id } : { projectOnly: true }),
      });
      if (pid) { const pc = doc.pieces.find((p) => p.id === pid); if (pc) pc.materialId = id; }
    });
    if (fabricPickerTarget === 'base') setBaseForm((cur) => cur ? { ...cur, materialId: holder.id! } : cur);
    else setActiveMaterialId(holder.id!);
    setCreatingFabric(false);
    closeFabrics();
    toast(fabric ? '已保存到布料仓库并选用' : '已添加到本作品');
  };
  const saveMatDetail = async (authToken = tokenRef.current) => {
    if (savingFabricRef.current) return;
    const d = matDraft;
    if (!d || !matDetailId) { closeMatDetail(); return; }
    const existing = project.materials.find((x) => x.id === matDetailId);
    const m: Material = existing || { id: matDetailId, name: '新布料', color: d.color };
    if (d.kind === 'image' && !d.assetId) { toast('请先上传布料图片'); return; }
    savingFabricRef.current = true;
    setSavingFabric(true);
    const scope = fabricSaveScopeRef.current;
    const isCurrent = () => scope === fabricSaveScopeRef.current && (newFabricProjectOnly || Boolean(existing) || tokenRef.current === authToken);
    try {
      let assetId = m.assetId;
      let assetPath = m.assetPath;
      let sampleWidthMm = m.sampleWidthMm;
      let calibrated = m.calibrated;
      let texturePattern = m.texturePattern;
      if (d.kind === 'color') {
        if (d.pattern === 'none') {
          if (assetId && m.texturePattern) void deleteAsset(assetId);
          assetId = undefined; assetPath = undefined; sampleWidthMm = undefined; calibrated = undefined; texturePattern = undefined;
        } else if (m.texturePattern !== d.pattern || m.color !== d.color || !m.assetId) {
          const blob = await renderPatternTile(d.pattern, d.color);
          const newAsset = await putAsset(blob);
          if (assetId && m.texturePattern) void deleteAsset(assetId);
          assetId = newAsset; assetPath = undefined; sampleWidthMm = 64; calibrated = true; texturePattern = d.pattern;
        }
      } else {
        if (m.texturePattern && m.assetId && m.assetId !== d.assetId) void deleteAsset(m.assetId);
        assetId = d.assetId;
        assetPath = d.assetId === m.assetId ? m.assetPath : undefined;
        sampleWidthMm = d.sampleWidthMm && d.sampleWidthMm > 0 ? d.sampleWidthMm : undefined;
        calibrated = sampleWidthMm ? true : undefined;
        texturePattern = undefined;
      }
      const name = d.name.trim() || m.name;
      let inventoryFabricId = m.inventoryFabricId;
      if (!existing && !newFabricProjectOnly) {
        const blob = assetId ? await getAsset(assetId) : null;
        if (assetId && !blob) throw new Error('布料图片读取失败，请重新上传');
        const image = blob ? await blobToDataUrl(blob) : null;
        if (!isCurrent()) return;
        const fabric = await createEditorWarehouseFabric(requestApi, authToken, { name, color: d.color, image, sampleWidthMm, areaCm2: newFabricAreaCm2 });
        if (!isCurrent()) return;
        inventoryFabricId = fabric.id;
        ++inventoryVersionRef.current;
        setWarehouseFabrics((cur) => [fabric, ...cur.filter((f) => f.id !== fabric.id)]);
      }
      if (!isCurrent()) return;
      const pid = !existing && fabricPickerTarget === 'props' && single ? single.id : null;
      commit((doc) => {
        const t = doc.materials.find((x) => x.id === m.id);
        if (!t) doc.materials.push({ id: m.id, name, color: d.color, assetId, assetPath, sampleWidthMm, calibrated, texturePattern, inventoryFabricId, projectOnly: newFabricProjectOnly });
        if (t) { t.name = name; t.color = d.color; t.assetId = assetId; t.assetPath = assetPath; t.sampleWidthMm = sampleWidthMm; t.calibrated = calibrated; t.texturePattern = texturePattern; }
        if (pid) {
          const pc = doc.pieces.find((x) => x.id === pid);
          if (pc) pc.materialId = m.id;
        }
      });
      if (!existing) {
        if (fabricPickerTarget === 'base') setBaseForm((cur) => cur ? { ...cur, materialId: m.id } : cur);
        else setActiveMaterialId(m.id);
      }
      savingFabricRef.current = false;
      if (existing) closeMatDetail(); else closeFabrics();
      toast(existing ? '作品布料已保存' : newFabricProjectOnly ? '已添加到本作品' : '已保存到布料仓库并选用');
    } catch (error) {
      if (isCurrent()) toast(!existing && !newFabricProjectOnly ? '未保存到布料仓库，请重试：' + (error instanceof Error ? error.message : '保存失败') : '布料保存失败，请重试');
    } finally {
      savingFabricRef.current = false;
      if (scope === fabricSaveScopeRef.current) setSavingFabric(false);
    }
  };
  const startDeleteMat = () => {
    const m = project.materials.find((x) => x.id === matDetailId);
    if (!m) return;
    if (project.materials.length <= 1) { toast('至少保留一块布料'); return; }
    if (usageOf(m.id) === 0) {
      openConfirm({
        title: '删除布料', message: `确定删除布料「${m.name}」吗？`, confirmText: '删除', danger: true,
        onConfirm: () => {
          commit((doc) => { doc.materials = doc.materials.filter((x) => x.id !== m.id); });
          if (activeMaterialId === m.id) setActiveMaterialId(project.materials.find((x) => x.id !== m.id)?.id || '');
          closeMatDetail();
        },
      });
      return;
    }
    setMatReplaceId(project.materials.find((x) => x.id !== m.id)?.id || '');
    setMatDeleting(true);
  };
  const confirmDeleteMat = () => {
    const m = project.materials.find((x) => x.id === matDetailId);
    if (!m || !matReplaceId) return;
    const rep = project.materials.find((x) => x.id === matReplaceId);
    const refs = usageOf(m.id);
    openConfirm({
      title: '删除布料',
      message: `「${m.name}」正被 ${refs} 处使用，删除后将替换为「${rep?.name || matReplaceId}」。确定删除吗？`,
      confirmText: '删除', danger: true,
      onConfirm: () => {
        commit((doc) => {
          doc.pieces.forEach((pc) => { if (pc.materialId === m.id) pc.materialId = matReplaceId; });
          if (doc.base.materialId === m.id) doc.base.materialId = matReplaceId;
          doc.materials = doc.materials.filter((x) => x.id !== m.id);
        });
        if (activeMaterialId === m.id) setActiveMaterialId(matReplaceId);
        closeMatDetail();
        toast('已删除并替换布料');
      },
    });
  };

  /* ---------- 布料上传（选区 + 定标） ---------- */
  const fabAspect = fabSource ? (fabRect.w * fabSource.w) / Math.max(1, fabRect.h * fabSource.h) : 1;
  const exitFabCrop = () => {
    setFabSource((cur) => { if (cur) URL.revokeObjectURL(cur.url); return null; });
    fabImgRef.current = null;
    setFabTarget(null);
    const back = fabReturnRef.current;
    fabReturnRef.current = false;
    setPanel(back ? 'fabrics' : null);
  };
  const cancelFabCrop = () => { if (!savingFabricRef.current) exitFabCrop(); };
  const fabPoint = (e: React.PointerEvent) => {
    const rect = fabStageRef.current!.getBoundingClientRect();
    return { fx: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), fy: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) };
  };
  const onFabDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const handle = target.dataset.cropHandle;
    const { fx, fy } = fabPoint(e);
    const mode = handle || 'move';
    fabDragRef.current = { mode, startX: fx, startY: fy, orig: { ...fabRect } };
    fabStageRef.current?.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onFabMove = (e: React.PointerEvent) => {
    const drag = fabDragRef.current;
    if (!drag) return;
    const { fx, fy } = fabPoint(e);
    const dx = fx - drag.startX, dy = fy - drag.startY;
    const o = drag.orig;
    if (drag.mode === 'move') setFabRect(clampCropRect({ ...o, x: o.x + dx, y: o.y + dy }));
    else if (drag.mode === 'new') setFabRect(clampCropRect({ x: Math.min(o.x, fx), y: Math.min(o.y, fy), w: Math.abs(fx - o.x), h: Math.abs(fy - o.y) }));
    else if (drag.mode === 'se') setFabRect(clampCropRect({ ...o, w: o.w + dx, h: o.h + dy }));
    else if (drag.mode === 'nw') setFabRect(clampCropRect({ x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy }));
    else if (drag.mode === 'ne') setFabRect(clampCropRect({ ...o, y: o.y + dy, w: o.w + dx, h: o.h - dy }));
    else if (drag.mode === 'sw') setFabRect(clampCropRect({ ...o, x: o.x + dx, w: o.w - dx, h: o.h + dy }));
  };
  const onFabUp = () => { fabDragRef.current = null; };
  const confirmFabCrop = async (authToken = tokenRef.current) => {
    if (savingFabricRef.current) return;
    const img = fabImgRef.current;
    if (!img || !fabSource) return;
    if (!(fabW > 0)) { toast('请先填写选区的实际宽度'); return; }
    savingFabricRef.current = true;
    setSavingFabric(true);
    const scope = fabricSaveScopeRef.current;
    const isCurrent = () => scope === fabricSaveScopeRef.current && (Boolean(fabTarget) || newFabricProjectOnly || tokenRef.current === authToken);
    try {
      const sx = fabRect.x * img.naturalWidth, sy = fabRect.y * img.naturalHeight;
      const sw = Math.max(8, fabRect.w * img.naturalWidth), sh = Math.max(8, fabRect.h * img.naturalHeight);
      const scale = Math.min(1, 1024 / Math.max(sw, sh));
      const cv = document.createElement('canvas');
      cv.width = Math.max(8, Math.round(sw * scale)); cv.height = Math.max(8, Math.round(sh * scale));
      const ctx = cv.getContext('2d'); if (!ctx) { toast('图片处理失败'); return; }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
      let dominantColor = '#d9c8a9';
      try {
        const imgData = ctx.getImageData(0, 0, cv.width, cv.height);
        if (imgData?.data) dominantColor = extractDominantColorFromRgba(imgData.data);
      } catch { /* ignore */ }
      const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.88));
      if (!blob) { toast('图片处理失败'); return; }
      const assetId = await putAsset(blob);
      if (!isCurrent()) return;
      const wMm = Math.max(5, Math.round(fabW));
      if (fabTarget) {
        // 详情页「更换图片」：新图先写回正在编辑的草稿，保存详情后才正式生效
        setMatDraft((d) => (d ? { ...d, kind: 'image', color: dominantColor, assetId, sampleWidthMm: wMm } : d));
        exitFabCrop();
        toast('图片已更换，记得点保存');
        return;
      }
      let createdInventoryId: string | undefined;
      if (!newFabricProjectOnly) {
        const image = await blobToDataUrl(blob);
        if (!isCurrent()) return;
        const fabric = await createEditorWarehouseFabric(requestApi, authToken, {
          name: fabName.trim() || '新拍布料', color: dominantColor, image,
          sampleWidthMm: wMm, areaCm2: newFabricAreaCm2,
        });
        if (!isCurrent()) return;
        createdInventoryId = fabric.id;
        ++inventoryVersionRef.current;
        setWarehouseFabrics((cur) => [fabric, ...cur.filter((f) => f.id !== fabric.id)]);
      }
      if (!isCurrent()) return;
      const replaceCtx = replaceUploadRef.current;
      replaceUploadRef.current = null;
      const holder: { mat: Material | null } = { mat: null };
      const pid = fabricPickerTarget === 'props' && single ? single.id : null;
      commit((doc) => {
        const seq = nextMatSeq(doc.materials);
        const createdMat: Material = {
          id: `M${seq}`,
          name: fabName.trim() || `上传布料 ${seq}`,
          color: dominantColor,
          assetId,
          sampleWidthMm: wMm,
          calibrated: true,
          ...(createdInventoryId ? { inventoryFabricId: createdInventoryId } : { projectOnly: true }),
        };
        holder.mat = createdMat;
        doc.materials.push(createdMat);
        if (replaceCtx) {
          if (replaceCtx.scope === 'selected' && selectedIds.length > 0) {
            doc.pieces.forEach((pc) => { if (selectedIds.includes(pc.id)) pc.materialId = createdMat.id; });
          } else {
            doc.pieces.forEach((pc) => { if (pc.materialId === replaceCtx.sourceMatId) pc.materialId = createdMat.id; });
            if (doc.base.materialId === replaceCtx.sourceMatId) doc.base.materialId = createdMat.id;
          }
        } else if (pid) {
          const pc = doc.pieces.find((x) => x.id === pid);
          if (pc) pc.materialId = createdMat.id;
        }
      });
      if (!holder.mat) return;
      const mat = holder.mat;
      if (replaceCtx) {
        setActiveMaterialId(mat.id);
        setReplaceTargetMatId(null);
        setFabSource((cur) => { if (cur) URL.revokeObjectURL(cur.url); return null; });
        fabImgRef.current = null;
        setFabTarget(null);
        fabReturnRef.current = false;
        setPanel('export');
        setExpTab('materials');
        toast(`已上传并替换为「${mat.name}」`);
        return;
      }
      if (fabricPickerTarget === 'base') setBaseForm((cur) => cur ? { ...cur, materialId: mat.id } : cur);
      else setActiveMaterialId(mat.id);
      exitFabCrop();
      toast(createdInventoryId ? '已保存到布料仓库并选用，纹理比例已校准' : '已添加到本作品，纹理比例已校准');
    } catch (error) {
      if (isCurrent()) toast('未保存到布料仓库，请重试：' + (error instanceof Error ? error.message : '保存失败'));
    } finally {
      savingFabricRef.current = false;
      if (scope === fabricSaveScopeRef.current) setSavingFabric(false);
    }
  };

  /* ---------- 图片导入 ---------- */
  const getWorker = () => {
    if (!workerRef.current) workerRef.current = new Worker(new URL('./segmentation.worker.ts', import.meta.url), { type: 'module' });
    return workerRef.current;
  };
  const runAnalysis = (detailVal: 'simple' | 'standard' | 'fine') => {
    const a = analysisRef.current;
    if (!a) return;
    const reqId = ++requestRef.current;
    setAnalyzing(true);
    setCandidates(null);
    setCandStats(null);
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    const worker = getWorker();
    worker.onmessage = (evt: MessageEvent<SegmentResult & { error?: string }>) => {
      const data = evt.data;
      if (data.requestId !== requestRef.current || data.requestId !== reqId) return; // 丢弃旧参数结果
      setAnalyzing(false);
      if (data.error) { toast(`图片分析失败：${data.error}`); return; }
      let invalid = 0;
      const regions: Candidate[] = [];
      for (const p of data.polygons) {
        const points = p.points.map((pt) => ({ x: a.offsetX + pt.x / a.pxPerMm, y: a.offsetY + pt.y / a.pxPerMm }));
        if (validatePiece(points)) { invalid++; continue; }
        regions.push({ points, color: p.color, excluded: false, asGuide: false, chosen: false, grouped: false, hasHoles: p.hasHoles });
      }
      setDetectedMode(data.mode);
      setCandidates(regions);
      setCandStats({ ignored: data.ignored + invalid, tooMany: data.tooMany });
      if (!regions.length) toast('未发现足够大的封闭区域；可以调高精度再试');
      else if (data.tooMany) toast('轮廓较多，仅显示前 100 个；建议降低精度');
    };
    worker.onerror = () => {
      if (requestRef.current === reqId) { setAnalyzing(false); toast('图片处理失败，请换图重试'); }
    };
    // 只暴露「精度」给用户：模式自动判断，线条阈值由 Otsu 自动，最小布片按精度内置。
    const minMm = detailVal === 'simple' ? 12 : detailVal === 'fine' ? 6 : 9;
    worker.postMessage({
      requestId: reqId, rgba: a.rgba, width: a.width, height: a.height,
      mode: 'auto', detail: detailVal, lineThreshold: 0, pxPerMm: a.pxPerMm,
      minAreaPixels: Math.max(9, minMm * minMm * a.pxPerMm * a.pxPerMm),
    });
  };
  const clearImportSource = () => {
    setImportSource((cur) => { if (cur) URL.revokeObjectURL(cur.url); return null; });
    importImgRef.current = null;
    setImportStage('crop');
    setCropRect({ x: 0, y: 0, w: 1, h: 1 });
  };
  const cancelAnalysis = () => {
    requestRef.current++;
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    analysisRef.current = null;
    setAnalyzing(false); setCandidates(null); setCandStats(null);
    setImportName(''); setImportThumb(''); setPanel(importToShapesRef.current ? 'add' : null);
    importToShapesRef.current = false;
    clearImportSource();
  };
  const onImportFile = async (file: File) => {
    if (!/image\/(png|jpeg|webp)/.test(file.type)) { toast('仅支持 PNG / JPG / WebP 图片'); return; }
    if (file.size > 20 * 1024 * 1024) { toast('图片超过 20MB，请先压缩'); return; }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (importModeRef.current === 'reference') {
        const assetId = await putAsset(file);
        imagesRef.current.set(assetId, img);
        const s = Math.min(project.widthMm / img.naturalWidth, project.heightMm / img.naturalHeight);
        const wMm = img.naturalWidth * s, hMm = img.naturalHeight * s;
        commit((doc) => { doc.reference = { assetId, opacity: 0.5, x: (project.widthMm - wMm) / 2, y: (project.heightMm - hMm) / 2, width: wMm, height: hMm }; });
        cancelAnalysis();
        toast('已设为半透明参考图，用画笔描图即可');
        return;
      }
      // 先让用户框选导入区域，确认后才对选区做分区分析与预览。
      clearImportSource();
      importImgRef.current = img;
      setImportSource({ url, w: img.naturalWidth, h: img.naturalHeight });
      setCropRect({ x: 0, y: 0, w: 1, h: 1 });
      setImportStage('crop');
      setImportName(file.name);
      setImportThumb('');
      setCandidates(null); setCandStats(null); setAnalyzing(false);
      setPanel('import');
      return;
    } catch { toast('图片解码失败，请换一张图片'); URL.revokeObjectURL(url); }
  };
  const confirmCrop = () => {
    const img = importImgRef.current;
    if (!img) return;
    const sx = cropRect.x * img.naturalWidth, sy = cropRect.y * img.naturalHeight;
    const sw = Math.max(8, cropRect.w * img.naturalWidth), sh = Math.max(8, cropRect.h * img.naturalHeight);
    const fit = Math.min(project.widthMm / sw, project.heightMm / sh);
    const dispW = sw * fit, dispH = sh * fit;
    // 图片降采样到最多 640px，避免手机端对高分辨率照片做同步像素运算卡顿。
    const imageScale = Math.min(1, 640 / Math.max(sw, sh));
    const cw = Math.max(8, Math.round(sw * imageScale));
    const ch = Math.max(8, Math.round(sh * imageScale));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d', { willReadFrequently: true }); if (!ctx) { toast('图片解码失败'); return; }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch);
    analysisRef.current = {
      rgba: data.data, width: cw, height: ch, pxPerMm: Math.min(cw / dispW, ch / dispH),
      offsetX: (project.widthMm - dispW) / 2, offsetY: (project.heightMm - dispH) / 2,
    };
    setImportThumb(cv.toDataURL('image/jpeg', 0.8));
    setImportStage('preview');
    runAnalysis(detail);
  };
  const backToCrop = () => {
    requestRef.current++;
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    setAnalyzing(false); setCandidates(null); setCandStats(null);
    setImportStage('crop');
  };
  const cropPoint = (e: React.PointerEvent) => {
    const rect = cropStageRef.current!.getBoundingClientRect();
    return { fx: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), fy: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)), rect };
  };
  const onCropDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const handle = target.dataset.cropHandle;
    const { fx, fy } = cropPoint(e);
    let mode = 'new';
    if (handle) mode = handle;
    else if (target.closest('.pw-crop-rect')) mode = 'move';
    // 选区铺满整图时移动没有意义，此时在图内拖动直接重新框选。
    if (mode === 'move' && cropRect.w >= 0.999 && cropRect.h >= 0.999) mode = 'new';
    cropDragRef.current = { mode, startX: fx, startY: fy, orig: mode === 'new' ? { x: fx, y: fy, w: 0, h: 0 } : { ...cropRect } };
    cropStageRef.current?.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onCropMove = (e: React.PointerEvent) => {
    const drag = cropDragRef.current;
    if (!drag) return;
    const { fx, fy } = cropPoint(e);
    const dx = fx - drag.startX, dy = fy - drag.startY;
    const o = drag.orig;
    if (drag.mode === 'move') setCropRect(clampCropRect({ ...o, x: o.x + dx, y: o.y + dy }));
    else if (drag.mode === 'new') setCropRect(clampCropRect({ x: Math.min(o.x, fx), y: Math.min(o.y, fy), w: Math.abs(fx - o.x), h: Math.abs(fy - o.y) }));
    else if (drag.mode === 'se') setCropRect(clampCropRect({ ...o, w: o.w + dx, h: o.h + dy }));
    else if (drag.mode === 'nw') setCropRect(clampCropRect({ x: o.x + dx, y: o.y + dy, w: o.w - dx, h: o.h - dy }));
    else if (drag.mode === 'ne') setCropRect(clampCropRect({ ...o, y: o.y + dy, w: o.w + dx, h: o.h - dy }));
    else if (drag.mode === 'sw') setCropRect(clampCropRect({ ...o, x: o.x + dx, w: o.w - dx, h: o.h + dy }));
  };
  const onCropUp = () => { cropDragRef.current = null; };
  const setCropRatio = (ratio: number | null) => {
    if (!importSource) return;
    if (ratio === null) { setCropRect({ x: 0, y: 0, w: 1, h: 1 }); return; }
    const cxp = (cropRect.x + cropRect.w / 2) * importSource.w, cyp = (cropRect.y + cropRect.h / 2) * importSource.h;
    let pw = cropRect.w * importSource.w, ph = pw / ratio;
    if (ph > importSource.h) { ph = importSource.h; pw = ph * ratio; }
    if (pw > importSource.w) { pw = importSource.w; ph = pw / ratio; }
    const px = Math.min(importSource.w - pw, Math.max(0, cxp - pw / 2));
    const py = Math.min(importSource.h - ph, Math.max(0, cyp - ph / 2));
    setCropRect({ x: px / importSource.w, y: py / importSource.h, w: pw / importSource.w, h: ph / importSource.h });
  };
  const confirmImport = async () => {
    const dialogVersion = shapeDialogVersion.current;
    if (!candidates) return;
    const included = candidates.filter((c) => !c.excluded);
    if (!included.length) { toast('没有可导入的分区'); return; }
    if (importToShapesRef.current) {
      const shapes = included.filter((c) => !c.asGuide);
      if (!shapes.length) { toast('请选择至少一个形状轮廓'); return; }
      const name = importName.trim() || '导入形状';
      const additions = shapes.map((c, index) => toShapeTemplate(shapes.length > 1 ? `${name} ${index + 1}` : name, c.points));
      if (!await updateShapeTemplates([...templates, ...additions])) return;
      if (dialogVersion !== shapeDialogVersion.current) return;
      cancelAnalysis();
      toast(`已保存 ${additions.length} 个形状，可在「我的形状」中重复使用`);
      return;
    }
    commit((doc) => {
      const byColor = new Map<string, string>();
      doc.materials.forEach((m) => byColor.set(m.color.toLowerCase(), m.id));
      let seq = nextMatSeq(doc.materials) - 1;
      const matFor = (color: string) => {
        const key = color.toLowerCase();
        if (byColor.has(key)) return byColor.get(key)!;
        const id = `M${++seq}`;
        doc.materials.push({ id, name: `图布 ${color}`, color });
        byColor.set(key, id);
        return id;
      };
      let n = doc.pieces.length;
      included.forEach((c) => {
        if (c.asGuide) { doc.guides.push({ id: uid(), points: [...c.points, c.points[0]], visible: true }); return; }
        // 线稿使用浅色占位布，不把原图的黑色墨线当作填充色。
        const piece = makePiece(c.points, matFor(detectedMode === 'line' ? '#fdfcf8' : c.color), `线稿布片 ${++n}`);
        if (c.grouped) piece.groupId = 'import-group';
        if (project.technique === 'turned') piece.seamMm = 5;
        doc.pieces.push(piece);
      });
    });
    const count = included.filter((c) => !c.asGuide).length;
    analysisRef.current = null;
    setCandidates(null); setCandStats(null); setImportThumb(''); setImportName('');
    clearImportSource();
    setPanel(null); setTool('select'); setSelectedIds([]);
    toast(`已从图片生成 ${count} 块可编辑布片。点形状再点底部布料即可填充（一次撤销可回退）`);
  };
  const mergeCandidates = () => {
    if (!candidates) return;
    const chosen = candidates.filter((c) => c.chosen && !c.excluded);
    if (chosen.length < 2) { toast('先在画布点选或在列表勾选至少两个分区'); return; }
    const merged = unionPolygons(chosen.map((c) => c.points));
    if (!merged.length) { toast('合并失败'); return; }
    const rest = candidates.filter((c) => !chosen.includes(c));
    const gid = merged.length > 1;
    setCandidates([...rest, ...merged.map((ring) => ({ points: ring, color: chosen[0].color, excluded: false, asGuide: false, chosen: false, grouped: gid, hasHoles: false }))]);
    toast(gid ? '不相邻区域已保留为多片，导入后自动成组' : '已合并所选分区');
  };

  /* ---------- 导出 ---------- */
  const exportPng = async () => {
    const blob = await renderClean(1400);
    if (blob) { downloadBlob(blob, `${project.name || '拼布'}-预览.png`); toast('已导出预览 PNG'); }
  };
  const exportPdf = (paper: 'A4' | 'Letter', includeHidden: boolean) => {
    try {
      const blob = buildPatternPdf(project, paper, includeHidden);
      downloadBlob(blob, `${project.name || '拼布'}-原尺寸纸样.pdf`);
      toast('已导出原尺寸 PDF（打印时请选实际大小/100%，先量校准方框）');
    } catch (err) {
      toast(err instanceof Error ? err.message : '导出失败');
    }
  };

  /* ---------- 底布设置应用（取消即回滚整次预览） ---------- */
  const applyBase = () => {
    if (!baseForm) return;
    const sx = baseForm.w / project.widthMm, sy = baseForm.h / project.heightMm;
    let outCount = 0;
    commit((doc) => {
      doc.name = baseForm.name.trim() || doc.name;
      doc.technique = baseForm.technique;
      doc.widthMm = baseForm.w; doc.heightMm = baseForm.h;
      doc.base = { materialId: baseForm.materialId, locked: baseForm.locked, includeInCutList: baseForm.include };
      if (baseForm.scaleDesign) {
        doc.pieces.forEach((p) => { p.points = p.points.map((pt) => ({ x: pt.x * sx, y: pt.y * sy })); });
        doc.guides.forEach((g) => { g.points = g.points.map((pt) => ({ x: pt.x * sx, y: pt.y * sy })); });
        if (doc.reference) doc.reference = { ...doc.reference, x: doc.reference.x * sx, y: doc.reference.y * sy, width: doc.reference.width * sx, height: doc.reference.height * sy };
      }
      doc.pieces.forEach((p) => { const b = pointBounds(p.points); if (b.x < 0 || b.y < 0 || b.x + b.width > doc.widthMm || b.y + b.height > doc.heightMm) outCount++; });
    });
    setPanel(null);
    if (outCount) toast(`已应用设置；${outCount} 块布片超出底布边界，已保留（未自动裁剪）`);
    else toast('底布设置已应用');
  };

  const [geo, setGeo] = useState<{ x: number; y: number; w: number; h: number; angle: number; seam: number } | null>(null);
  const geoOrig = useRef<PatchworkDocument | null>(null);
  const nameOrig = useRef<PatchworkDocument | null>(null);
  useEffect(() => {
    if (panel === 'props' && single) {
      const b = pointBounds(single.points);
      setGeo({ x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), angle: 0, seam: single.seamMm });
      geoOrig.current = null;
    }
  }, [panel, single?.id]);
  const geoPreview = (g: { x: number; y: number; w: number; h: number; angle: number; seam: number }) => {
    if (!single) return;
    if (!geoOrig.current) geoOrig.current = cloneDocument(docOf(project));
    const origPiece = (geoOrig.current.pieces as Piece[]).find((p) => p.id === single.id);
    if (!origPiece) return;
    const ob = pointBounds(origPiece.points);
    let pts = origPiece.points.map((p) => ({ x: g.x + (p.x - ob.x) * (Math.max(1, g.w) / Math.max(0.01, ob.width)), y: g.y + (p.y - ob.y) * (Math.max(1, g.h) / Math.max(0.01, ob.height)) }));
    if (g.angle) pts = transformPoints(pts, 'rotate', g.angle);
    const pid = single.id;
    setProject((cur) => ({ ...cur, pieces: cur.pieces.map((p) => (p.id === pid ? { ...p, points: pts, seamMm: Math.max(0, g.seam) } : p)) }));
  };
  const geoChange = (patch: Partial<{ x: number; y: number; w: number; h: number; angle: number; seam: number }>) => {
    if (!geo) return;
    const next = { ...geo, ...patch };
    setGeo(next);
    geoPreview(next);
  };
  const geoCommit = () => {
    if (!geoOrig.current || !single) return;
    const orig = geoOrig.current;
    geoOrig.current = null;
    const err = validatePiece(single.points);
    if (err) {
      setProject((cur) => ({ ...cur, ...cloneDocument(orig) }));
      const op = (orig.pieces as Piece[]).find((p) => p.id === single.id);
      if (op) { const ob = pointBounds(op.points); setGeo({ x: +ob.x.toFixed(1), y: +ob.y.toFixed(1), w: +ob.width.toFixed(1), h: +ob.height.toFixed(1), angle: 0, seam: op.seamMm }); }
      toast(err + '，已还原');
      return;
    }
    commitFrom(orig);
  };
  const nameCommit = () => {
    const o = nameOrig.current;
    nameOrig.current = null;
    if (o && single && (o.pieces as Piece[]).find((p) => p.id === single.id)?.name !== single.name) {
      commitFrom(o);
    }
  };
  const flushPropsEdits = () => {
    nameCommit();
    geoCommit();
  };
  const closeProps = () => {
    flushPropsEdits();
    setPanel(null);
  };
  const flushTextureEdit = () => {
    if (textureOrig.current) {
      const o = textureOrig.current;
      textureOrig.current = null;
      commitFrom(o);
    }
  };
  useEffect(() => { if (panel !== 'fill' || tool !== 'fill') flushTextureEdit(); }, [panel, tool]);

  const issues = panel === 'export' ? planIssues(project) : [];
  const list = panel === 'export' ? cutList(project, includeHidden) : [];
  const activeMaterial = project.materials.find((m) => m.id === activeMaterialId);

  // 导入入口直接打开系统文件选择器；选完图片后才进入裁剪/线稿预览。
  const openShapeImport = () => {
    importToShapesRef.current = true;
    importModeRef.current = 'partition';
    if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); }
  };

  return (
    <main className="patchwork-page">
      <header className="patchwork-top canvas-topbar">
        <div className="topbar-left">
          <button type="button" className="top-icon-btn" aria-label="返回" onClick={leave}><ArrowLeft aria-hidden="true" /></button>
          <button type="button" className="patchwork-sizebtn" aria-label="作品尺寸" onClick={openBaseSettings}>{fmtCm(project.widthMm)} × {fmtCm(project.heightMm)} cm<ChevronDown aria-hidden="true" /></button>
        </div>
        <div className="topbar-center">
          <button type="button" className="top-icon-btn" aria-label="撤销" disabled={!past.length} onClick={undo}><Undo2 aria-hidden="true" /></button>
          <button type="button" className="top-icon-btn" aria-label="重做" disabled={!future.length} onClick={redo}><Redo2 aria-hidden="true" /></button>
        </div>
        <div className="topbar-right">
          <button type="button" className="patchwork-topbtn" aria-label="导出" onClick={() => setPanel('export')}><Download aria-hidden="true" /><span>导出</span></button>
          <button type="button" className="patchwork-savebtn" aria-label="保存" onClick={() => withToken(() => { setSaveName(project.name); setPanel('save'); })}><Check aria-hidden="true" /><span>保存</span></button>
        </div>
      </header>

      <div className="patchwork-work">
        <aside className="patchwork-rail">
          {([
            { name: 'select', label: '选择', Icon: MousePointer2 },
            { name: 'brush', label: '画笔', Icon: Pencil },
            { name: 'add', label: '添加', Icon: Shapes },
            { name: 'fill', label: '填布', Icon: PaintBucket },
            { name: 'layers', label: '图层', Icon: Layers },
          ] as const).map((t) => (
            <button key={t.name} aria-label={t.label} className={tool === t.name ? 'active' : ''} onClick={() => {
              if (panel === 'import') cancelAnalysis();
              setTool(t.name);
              if (t.name === 'add') setPanel('add');
              else if (t.name === 'layers') setPanel('layers');
              else if (t.name === 'fill') setPanel(null);
            }}><t.Icon /><span>{t.label}</span></button>
          ))}
          <button className="patchwork-clear-btn" aria-label="清空画布" title="清空画布（可撤销）"
            disabled={!project.pieces.length && !project.guides.length && !project.reference && !stroke.length && !candidates?.length}
            onClick={confirmClearCanvas}><Trash2 /><span>清空</span></button>
        </aside>

        <section className="patchwork-stage" ref={stageRef}>
          <canvas ref={canvasRef} aria-label="拼布编辑画布"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            onDoubleClick={(e) => {
              if (tool !== 'select') return;
              const id = hitTest(toWorld(e), project.pieces);
              const p = project.pieces.find((x) => x.id === id);
              if (p && !p.locked) { setSelectedIds([p.id]); setNodeMode(true); setNodeIndex(null); }
            }} />
          <div className="patchwork-zoom">
            <button aria-label="缩小" onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom - 0.15, 0.2, 6) }))}>−</button>
            <span>{Math.round(view.zoom * 100)}%</span>
            <button aria-label="放大" onClick={() => setView((v) => ({ ...v, zoom: clamp(v.zoom + 0.15, 0.2, 6) }))}>＋</button>
            <button aria-label="适应画布" onClick={() => setView({ zoom: 1, panX: 0, panY: 0 })}>适应</button>
          </div>

          {tool === 'brush' && (
            <div className="patchwork-hintpill pw-brushpill">
              <span>在画布上画一圈，松手自动生成布片</span>
            </div>
          )}
          {tool === 'fill' && (
            <div className="patchwork-fillbar">
              <span>选布片后点底部布料，或点画布直接填充</span>
              <button onClick={() => setPanel('fill')}>高级设置</button>
            </div>
          )}

          {nodeMode && single && (
            <div className="patchwork-floating">
              <strong>节点编辑 · {single.name}</strong>
              <button onClick={deleteNode}>删除节点</button>
              <span className="patchwork-hint">点边可加节点，拖动节点调整</span>
              <button className="primary" onClick={() => { setNodeMode(false); setNodeIndex(null); }}>完成</button>
            </div>
          )}

          {!nodeMode && selectedPieces.length > 0 && tool === 'select' && (() => {
            let posStyle: CSSProperties | undefined;
            if (single && canvasRef.current) {
              const m = currentMetrics();
              const b = pointBounds(single.points);
              const tl = worldToScreen({ x: b.x, y: b.y }, m);
              const br = worldToScreen({ x: b.x + b.width, y: b.y + b.height }, m);
              const cx = Math.min(Math.max((tl.x + br.x) / 2, 132), Math.max(132, m.width - 132));
              posStyle = tl.y - 84 >= 4
                ? { left: cx, top: tl.y - 84, transform: 'translateX(-50%)', bottom: 'auto' }
                : { left: cx, top: br.y + 14, transform: 'translateX(-50%)', bottom: 'auto' };
            }
            return (
              <div className="patchwork-floating patchwork-selbar" style={posStyle}>
                {single && <button aria-label="节点编辑" onClick={() => { if (!single.locked) { setNodeMode(true); setNodeIndex(null); } }}><Pencil /><span>节点</span></button>}
                <button aria-label="旋转90度" onClick={() => rotateSelected(90)}><RotateCw /><span>旋转</span></button>
                <button aria-label="水平镜像" onClick={() => mirrorSelected('mirrorX')}><FlipHorizontal2 /><span>镜像</span></button>
                <button aria-label="复制" onClick={duplicateSelected}><Copy /><span>复制</span></button>
                <button aria-label="删除" onClick={deleteSelected}><Trash2 /><span>删除</span></button>
                {single && <button aria-label="属性" onClick={() => setPanel('props')}><SlidersHorizontal /><span>属性</span></button>}
              </div>
            );
          })()}
        </section>
      </div>

      <footer className="patchwork-materials">
        <button className="pw-fab-open" aria-label="打开布料列表" onClick={() => openFabricPicker('editor')}>
          <span className="pw-fab-open-thumb"><Palette /></span>
          <span className="pw-label">布料</span>
        </button>
        <div className="pw-material-scroll" role="group" aria-label="当前与已用布料">
        {project.materials.filter((m) => usageOf(m.id) > 0 || m.id === activeMaterialId).map((m) => (
          <button key={m.id} className={`pw-material-item${activeMaterialId === m.id ? ' selected' : ''}`} aria-pressed={activeMaterialId === m.id}
            aria-label={`布料 ${m.id} ${m.name}`} title={`${m.id} · ${m.name}${m.assetId && !m.calibrated ? '（未校准，仅效果参考）' : ''}`}
            onClick={() => openFabricPicker('editor')}
            onContextMenu={(e) => { e.preventDefault(); setFabEdit(true); openMatDetail(m.id); setPanel('fabrics'); }}>
            <MatSwatch m={m} />
          </button>
        ))}
        </div>
      </footer>

      {stockFabric && <FabricStockDialog key={stockFabric.id} fabric={stockFabric} onClose={() => setStockFabric(null)} onSave={async stock => {
        const t = tokenRef.current;
        if (!t) throw new Error('请先登录后录入库存');
        const scope = fabricSaveScopeRef.current;
        const saved = await recordFabricStock(requestApi, t, stockFabric, stock);
        if (scope !== fabricSaveScopeRef.current || t !== tokenRef.current) return;
        ++inventoryVersionRef.current;
        setWarehouseFabrics(cur => [saved, ...cur.filter(f => f.id !== saved.id)]);
        commit(doc => { doc.materials.forEach(m => { if (matchesMaterialFabric(m, saved)) m.inventoryFabricId = saved.id; }); });
      }} />}
      {creatingFabric && <FabricCreateDialog allowProjectOnly onClose={() => setCreatingFabric(false)} onSave={saveNewFabric} />}
      {message && <button className="patchwork-toast" role="status" onClick={() => setMessage('')}>{message} ×</button>}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onImportFile(f); }} />
      <input ref={fabricFileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = '';
        if (!f) return;
        if (!fabTarget) { setNewFabricAreaCm2(''); setNewFabricProjectOnly(false); }
        void (async () => {
          // 先解码进「布料上传」弹窗：框选区域 + 设定区域实际大小后再生成布料（对应需求 F05 的裁剪+定标）。
          const url = URL.createObjectURL(f);
          try {
            const img = new Image();
            img.src = url;
            await img.decode();
            setFabSource((cur) => { if (cur) URL.revokeObjectURL(cur.url); return { url, w: img.naturalWidth, h: img.naturalHeight }; });
            fabImgRef.current = img;
            setFabRect({ x: 0, y: 0, w: 1, h: 1 });
            setFabName(`上传布料 ${nextMatSeq(project.materials)}`);
            setFabW(150);
            setPanel('fabriccrop');
          } catch { URL.revokeObjectURL(url); toast('图片解码失败，请换一张图片'); }
        })();
      }} />

      {createCfg && <PatchworkCreateDialog warehouseFabrics={warehouseFabrics} onCancel={cancelCreate} onConfirm={confirmCreate} />}

      {panel && (
        <div
          className={`patchwork-overlay ${(panel === 'fill' || panel === 'import') ? 'nonmodal' : ''}${(panel === 'import' && (importSource || candidates)) || (panel === 'fabriccrop' && fabSource) ? ' import-overlay' : ''}`}
          onClick={() => { if (panel === 'import') cancelAnalysis(); else if (panel === 'fabriccrop') cancelFabCrop(); else if (panel === 'fabrics') closeFabrics(); else if (panel === 'props') closeProps(); else setPanel(null); }}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <section
            role="dialog"
            aria-modal={panel !== 'fill'}
            aria-label={{ base: '底布与项目设置', add: '添加形状', fill: '填布', layers: '图层', fabrics: '选择布料', export: '图纸导出', import: '导入图片', save: '保存拼布', open: '我的拼布作品', props: '布片属性', leave: '离开编辑器', fabriccrop: '布料上传' }[panel]}
            className={`patchwork-panel${(panel === 'import' && (importSource || candidates)) || (panel === 'fabriccrop' && fabSource) ? ' importfull' : ''}${panel === 'fabrics' ? ' fabricsheet' : ''}${panel === 'add' ? ' addsheet' : ''}${panel === 'base' ? ' basesheet' : ''}${panel === 'props' ? ' propssheet' : ''}${panel === 'export' ? ' exportsheet' : ''}`}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {panel !== 'fabrics' && (
              <header>
                <strong>{{ base: '底布与项目设置', add: '添加形状', fill: '填布', layers: '图层', fabrics: '选择布料', export: '图纸导出', import: '导入图片', save: '保存拼布', open: '我的拼布作品', props: '布片属性', leave: '离开编辑器', fabriccrop: '布料上传' }[panel]}</strong>
                <button type="button" aria-label="关闭面板" onClick={() => panel === 'import' ? cancelAnalysis() : panel === 'fabriccrop' ? cancelFabCrop() : panel === 'props' ? closeProps() : setPanel(null)}><X /></button>
              </header>
            )}

            {panel === 'base' && baseForm && (
              <div className="patchwork-form pw-base-form">
                <div className="pw-grid pw-base-grid">
                  <label className="pw-span2">
                    <span>项目名称</span>
                    <input type="text" value={baseForm.name} placeholder="未命名拼布" onChange={(e) => setBaseForm((cur) => (cur ? { ...cur, name: e.target.value } : cur))} />
                  </label>
                  <label>
                    <span>底布宽度 (cm)</span>
                    <input type="number" min={2} max={300} step={1} value={baseForm.w / 10} onChange={(e) => setBaseForm((cur) => (cur ? { ...cur, w: Math.round((Number(e.target.value) || 2) * 10) } : cur))} />
                  </label>
                  <label>
                    <span>底布高度 (cm)</span>
                    <input type="number" min={2} max={300} step={1} value={baseForm.h / 10} onChange={(e) => setBaseForm((cur) => (cur ? { ...cur, h: Math.round((Number(e.target.value) || 2) * 10) } : cur))} />
                  </label>
                  <label className="pw-span2">
                    <span>创作工艺</span>
                    <select value={baseForm.technique} onChange={(e) => setBaseForm((cur) => (cur ? { ...cur, technique: e.target.value as Technique } : cur))}>
                      <option value="raw">贴布缝·毛边（默认）</option>
                      <option value="turned">贴布缝·折边</option>
                      <option value="pieced">几何拼接</option>
                    </select>
                  </label>
                  <div className="pw-span2 pw-base-mat-section">
                    <button type="button" className="pw-base-fabric-trigger" aria-label="选择底布布料" onClick={() => openFabricPicker('base')}>
                      <span className="pw-base-fabric-thumb">
                        {(() => {
                          const material = project.materials.find((m) => m.id === baseForm.materialId);
                          return material ? <MatSwatch m={material} /> : <Palette />;
                        })()}
                      </span>
                      <span className="pw-base-fabric-copy">
                        <strong>布料</strong>
                        <small>{project.materials.find((m) => m.id === baseForm.materialId)?.name || '请选择布料'}</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="pw-settings-card">
                  <label className="patchwork-check pw-setting-row">
                    <span className="pw-setting-copy">
                      <strong>底布参与制作</strong>
                      <small>计入裁片清单</small>
                    </span>
                    <input type="checkbox" className="patchwork-switch" aria-label="底布参与制作（计入裁片清单）" checked={baseForm.include} onChange={(e) => setBaseForm((cur) => (cur ? { ...cur, include: e.target.checked } : cur))} />
                  </label>
                  <label className="patchwork-check pw-setting-row">
                    <span className="pw-setting-copy">
                      <strong>锁定底布</strong>
                      <small>防止编辑时误触移动底布</small>
                    </span>
                    <input type="checkbox" className="patchwork-switch" aria-label="锁定底布" checked={baseForm.locked} onChange={(e) => setBaseForm((cur) => (cur ? { ...cur, locked: e.target.checked } : cur))} />
                  </label>
                  <label className="patchwork-check pw-setting-row">
                    <span className="pw-setting-copy">
                      <strong>改尺寸时同比缩放已有设计</strong>
                      <small>默认只改工作区</small>
                    </span>
                    <input type="checkbox" className="patchwork-switch" aria-label="改尺寸时同比缩放已有设计（默认只改工作区）" checked={baseForm.scaleDesign} onChange={(e) => setBaseForm((cur) => (cur ? { ...cur, scaleDesign: e.target.checked } : cur))} />
                  </label>
                </div>
                <div className="patchwork-actions pw-base-actions">
                  <button type="button" onClick={() => setPanel(null)}>取消</button>
                  <button type="button" className="primary" onClick={applyBase}>应用设置</button>
                </div>
              </div>
            )}

            {panel === 'fabriccrop' && fabSource && (
              <div className="patchwork-form patchwork-import">
                <div className="pw-crop">
                  <div className="pw-crop-areawrap pw-fab-areawrap">
                    <span className="pw-crop-tip">拖动框选纹理区域 · 拖四角缩放</span>
                    <div className="pw-crop-stage" ref={fabStageRef} style={{ aspectRatio: `${fabSource.w} / ${fabSource.h}`, width: `min(100%, calc((100dvh - ${fabTarget ? '11.4rem' : '15.6rem'}) * ${(fabSource.w / fabSource.h).toFixed(4)}))` }} onPointerDown={onFabDown} onPointerMove={onFabMove} onPointerUp={onFabUp} onPointerCancel={onFabUp}>
                      <img src={fabSource.url} alt="待上传布料照片，框选纹理区域" draggable={false} />
                      <div className="pw-crop-rect" style={{ left: `${fabRect.x * 100}%`, top: `${fabRect.y * 100}%`, width: `${fabRect.w * 100}%`, height: `${fabRect.h * 100}%` }}>
                        <span className="pw-crop-grid" />
                        <span className="pw-crop-handle nw" data-crop-handle="nw" />
                        <span className="pw-crop-handle ne" data-crop-handle="ne" />
                        <span className="pw-crop-handle sw" data-crop-handle="sw" />
                        <span className="pw-crop-handle se" data-crop-handle="se" />
                      </div>
                    </div>
                  </div>
                  <div className="pw-fab-bar">
                    <label>实际宽<input type="number" min={5} max={5000} value={Math.round(fabW) || ''} disabled={savingFabric} onChange={(e) => setFabW(Math.max(0, Number(e.target.value) || 0))} /><span>mm · 高约 {Math.round(fabW / fabAspect)} mm</span></label>
                    <button className="pw-fab-full" disabled={savingFabric} onClick={() => setFabRect({ x: 0, y: 0, w: 1, h: 1 })}>全图</button>
                  </div>
                  {!fabTarget && <div className="pw-fab-upload-stock">
                    <label className="pw-fab-field">实际库存面积（cm²，选填）<input type="number" min="0.01" step="any" aria-label="实际库存面积" value={newFabricAreaCm2} disabled={savingFabric || newFabricProjectOnly} onChange={(e) => setNewFabricAreaCm2(e.target.value)} placeholder="不填则记为数量待核实" /></label>
                    <label className="pw-fab-local-option"><input type="checkbox" aria-label="仅用于本作品" checked={newFabricProjectOnly} disabled={savingFabric} onChange={(e) => setNewFabricProjectOnly(e.target.checked)} />仅用于本作品（不加入布料仓库）</label>
                  </div>}
                  <div className="patchwork-import-footer">
                    <button disabled={savingFabric} onClick={cancelFabCrop}>取消</button>
                    <button className="primary" disabled={savingFabric} onClick={() => {
                      if (fabTarget || newFabricProjectOnly) void confirmFabCrop();
                      else withToken((t) => { void confirmFabCrop(t); });
                    }}><Check />{savingFabric ? '保存中…' : fabTarget ? '使用这张图' : '添加布料'}</button>
                  </div>
                </div>
              </div>
            )}

            {panel === 'import' && (importSource || candidates) && (
              <div className="patchwork-form patchwork-import">
                {(importSource || candidates) && (
                  <div className="patchwork-import-actions pw-import-topbar">
                    <button onClick={() => { importModeRef.current = 'partition'; fileRef.current?.click(); }}>
                      <Upload />换一张图片
                    </button>
                    <button onClick={() => { importModeRef.current = 'reference'; fileRef.current?.click(); }}>仅作为参考图</button>
                  </div>
                )}
                {importStage === 'crop' && importSource && (
                  <div className="pw-crop">
                    <p className="patchwork-hint">框选要导入的区域：拖动画框，拖选区移动，拖四角缩放。</p>
                    <div className="pw-crop-areawrap">
                      <div className="pw-crop-stage" ref={cropStageRef} style={{ aspectRatio: `${importSource.w} / ${importSource.h}`, width: `min(100%, calc((100dvh - 9.6rem) * ${(importSource.w / importSource.h).toFixed(4)}))` }} onPointerDown={onCropDown} onPointerMove={onCropMove} onPointerUp={onCropUp} onPointerCancel={onCropUp}>
                        <img src={importSource.url} alt="待导入图片，框选导入区域" draggable={false} />
                        <div className="pw-crop-rect" style={{ left: `${cropRect.x * 100}%`, top: `${cropRect.y * 100}%`, width: `${cropRect.w * 100}%`, height: `${cropRect.h * 100}%` }}>
                          <span className="pw-crop-grid" />
                          <span className="pw-crop-handle nw" data-crop-handle="nw" />
                          <span className="pw-crop-handle ne" data-crop-handle="ne" />
                          <span className="pw-crop-handle sw" data-crop-handle="sw" />
                          <span className="pw-crop-handle se" data-crop-handle="se" />
                        </div>
                      </div>
                    </div>
                    <div className="pw-crop-bar">
                      <div className="pw-crop-ratios">
                        <button onClick={() => setCropRatio(null)}>全图</button>
                        <button onClick={() => setCropRatio(1)}>1:1</button>
                        <button onClick={() => setCropRatio(4 / 3)}>4:3</button>
                        <button onClick={() => setCropRatio(3 / 4)}>3:4</button>
                      </div>
                      <span>选区 {Math.round(cropRect.w * importSource.w)}×{Math.round(cropRect.h * importSource.h)} px</span>
                    </div>
                    <div className="patchwork-import-footer">
                      <button onClick={cancelAnalysis}>取消</button>
                      <button className="primary" onClick={confirmCrop}><Eye />下一步：提取轮廓</button>
                    </div>
                  </div>
                )}
                {importStage === 'preview' && analysisRef.current && (
                  <div className="pw-preview">
                    <div className="patchwork-import-source">
                      {importThumb && <img src={importThumb} alt="导入图片选区缩略预览" />}
                      <div><strong>{importName}</strong><small>选区将按比例放入底布中央</small></div>
                      <button className="pw-crop-back" onClick={backToCrop}>重新选区</button>
                    </div>
                    <div className="patchwork-seg" aria-label="识别精度">
                      <button className={detail === 'simple' ? 'on' : ''} onClick={() => { setDetail('simple'); runAnalysis('simple'); }}>简洁</button>
                      <button className={detail === 'standard' ? 'on' : ''} onClick={() => { setDetail('standard'); runAnalysis('standard'); }}>标准</button>
                      <button className={detail === 'fine' ? 'on' : ''} onClick={() => { setDetail('fine'); runAnalysis('fine'); }}>精细</button>
                    </div>
                    {analyzing && <p className="patchwork-hint" role="status">正在识别封闭区域，请稍候…</p>}
                    {!analyzing && candidates && (
                      <>
                        <div className="pw-import-preview" style={{ aspectRatio: `${analysisRef.current.width} / ${analysisRef.current.height}`, width: `min(100%, calc((100dvh - 15.8rem) * ${(analysisRef.current.width / analysisRef.current.height).toFixed(4)}))` }}>
                          {importThumb && <img src={importThumb} alt="" draggable={false} />}
                          <svg viewBox={`0 0 ${analysisRef.current.width} ${analysisRef.current.height}`} preserveAspectRatio="none" aria-label="分区预览">
                            {candidates.map((c, i) => (
                              <polygon
                                key={i}
                                points={c.points.map((pt) => `${((pt.x - analysisRef.current!.offsetX) * analysisRef.current!.pxPerMm).toFixed(1)},${((pt.y - analysisRef.current!.offsetY) * analysisRef.current!.pxPerMm).toFixed(1)}`).join(' ')}
                                fill={c.excluded ? '#8a8a8a' : c.color}
                                fillOpacity={c.excluded ? 0.15 : c.asGuide ? 0.12 : 0.5}
                                stroke={c.chosen ? '#ff7847' : c.excluded ? '#8a8a8a' : '#ffffff'}
                                strokeWidth={c.chosen ? 3 : 1.4}
                                strokeDasharray={c.excluded ? '5 4' : undefined}
                                onClick={() => setCandidates((list) => list?.map((v, j) => j === i ? { ...v, chosen: !v.chosen } : v) || null)}
                              />
                            ))}
                          </svg>
                        </div>
                        <div className="patchwork-import-summary">
                          <strong>识别到 {candidates.filter((c) => !c.excluded).length} 个封闭区域</strong>
                          <span>{detectedMode === 'line' ? '已按线稿识别' : '已按色块识别'}{candStats?.ignored ? (' · 过滤 ' + candStats.ignored + ' 个背景/碎小区域') : ''}</span>
                        </div>
                        {candidates.length === 0 && <p className="patchwork-hint">该图片暂未识别到封闭图形。可以调高精度再试，或换一张轮廓更清晰的图片。</p>}
                        {candidates.some((c) => c.hasHoles && !c.excluded) && <p className="patchwork-warning">检测到带孔洞的区域：当前只生成外边界，内孔需导入后手动修整。</p>}
                        {candStats?.tooMany && <p className="patchwork-warning">区域过多，只展示面积最大的前 100 个。可降低精度。</p>}
                        <div className="patchwork-cands">
                          {candidates.map((c, i) => (
                            <div className={'patchwork-cand ' + (c.chosen ? 'chosen ' : '') + (c.excluded ? 'excluded' : '')} key={i}>
                              <button aria-label={'选择区域 ' + (i + 1)} onClick={() => setCandidates((list) => list?.map((v, j) => j === i ? { ...v, chosen: !v.chosen } : v) || null)}>
                                <span className="patchwork-cand-color" style={{ background: c.color }} />
                                区域 {i + 1}{c.hasHoles ? ' · 有内孔' : ''}
                              </button>
                              <button onClick={() => setCandidates((list) => list?.map((v, j) => j === i ? { ...v, asGuide: !v.asGuide } : v) || null)}>{c.asGuide ? '辅助线' : '布片'}</button>
                              <button onClick={() => setCandidates((list) => list?.map((v, j) => j === i ? { ...v, excluded: !v.excluded, chosen: false } : v) || null)}>{c.excluded ? '恢复' : '排除'}</button>
                            </div>
                          ))}
                        </div>
                        {importToShapesRef.current && <label className="pw-shape-import-name">形状名称<input aria-label="导入形状名称" value={importName} onChange={(e) => setImportName(e.target.value)} /></label>}
                        <div className="patchwork-import-footer">
                          <button onClick={cancelAnalysis}>取消</button>
                          <button onClick={mergeCandidates} disabled={candidates.filter((c) => c.chosen && !c.excluded).length < 2}>合并选中</button>
                          <button className="primary" disabled={shapeLibrary.saving || !candidates.some((c) => !c.excluded)} onClick={confirmImport}>
                            <Check />{importToShapesRef.current ? `保存 ${candidates.filter((c) => !c.excluded && !c.asGuide).length} 个到我的形状` : `生成 ${candidates.filter((c) => !c.excluded && !c.asGuide).length} 块布片`}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {panel === 'add' && (
              <AddShapePanel library={shapeLibrary} templates={templates} onTemplatesChange={updateShapeTemplates} onImport={openShapeImport}
                onPlace={placeSelectedShape} onCancel={() => setPanel(null)}
                defaultSeam={project.technique === 'turned' ? 5 : 0} />
            )}

            {panel === 'fill' && (
              <div className="patchwork-form">
                <div className="patchwork-seg">
                  <button className={fillScope === 'single' ? 'on' : ''} onClick={() => setFillScope('single')}>选中布片</button>
                  <button className={fillScope === 'same' ? 'on' : ''} onClick={() => setFillScope('same')}>同布料全部</button>
                  <button className={fillScope === 'all' ? 'on' : ''} onClick={() => setFillScope('all')}>全部布片</button>
                </div>
                <button className={`patchwork-chip ${fillPick ? 'on' : ''}`} onClick={() => setFillPick((v) => !v)}>吸取：点画布上的布片取它的布料</button>
                <p className="patchwork-hint">当前布料：{activeMaterialId}。点底部色板打开布料选择器，选中布片时在选择器里点布料即替换；这里的范围设置仅作用于填布工具点击画布时。</p>
                {single && !single.locked && (
                  <>
                    <h4>纹理变换 · {single.name}（只改布纹，不改轮廓）</h4>
                    <div className="pw-chiprow"><span>布纹旋转</span>{[0, 90, 180, 270].map((d) => (
                      <button key={d} className={`patchwork-chip ${single.texture.rotation === d ? 'on' : ''}`} onClick={() => { flushTextureEdit(); commit((doc) => { const t = doc.pieces.find((x) => x.id === single.id); if (t) t.texture.rotation = d; }); }}>{d}°</button>
                    ))}</div>
                    {([['scale', '纹理比例', 0.2, 3, 0.05], ['offsetX', '偏移 X mm', -50, 50, 1], ['offsetY', '偏移 Y mm', -50, 50, 1]] as const).map(([key, label, lo, hi, step]) => (
                      <label key={key}>{label}<input type="range" min={lo} max={hi} step={step} value={single.texture[key]}
                        onPointerDown={() => { if (!textureOrig.current) textureOrig.current = cloneDocument(docOf(project)); }}
                        onChange={(e) => { const v = Number(e.target.value); setProject((cur) => ({ ...cur, pieces: cur.pieces.map((p) => (p.id === single.id ? { ...p, texture: { ...p.texture, [key]: v } } : p)) })); }} />
                        <span>{single.texture[key]}</span></label>
                    ))}
                    {textureOrig.current && (
                      <div className="patchwork-actions">
                        <button onClick={() => { const o = textureOrig.current!; textureOrig.current = null; setProject((cur) => ({ ...cur, ...cloneDocument(o) })); }}>还原</button>
                        <button className="primary" onClick={() => { commitFrom(textureOrig.current!); textureOrig.current = null; }}>完成</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {panel === 'layers' && (
              <div className="patchwork-form">
                <div className="patchwork-layers">
                  {project.pieces.map((p, i) => ({ p, i })).reverse().map(({ p, i }) => (
                    <div key={p.id} className={selectedIds.includes(p.id) ? 'sel' : ''}>
                      <input type="checkbox" aria-label={`多选 ${p.name}`} checked={selectedIds.includes(p.id)}
                        onChange={() => setSelectedIds((ids) => (ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id]))} />
                      <PieceThumb p={p} mat={project.materials.find((m) => m.id === p.materialId)} />
                      <button className="patchwork-layer-name" onClick={() => { setSelectedIds([p.id]); setTool('select'); }}><b>P{i + 1}</b> {p.name}{p.groupId ? ' · 组' : ''}</button>
                      <button aria-label="上移图层" onClick={() => commit((doc) => { const i = doc.pieces.findIndex((x) => x.id === p.id); if (i < doc.pieces.length - 1) { const [it] = doc.pieces.splice(i, 1); doc.pieces.splice(i + 1, 0, it); } })}><ChevronUp /></button>
                      <button aria-label="下移图层" onClick={() => commit((doc) => { const i = doc.pieces.findIndex((x) => x.id === p.id); if (i > 0) { const [it] = doc.pieces.splice(i, 1); doc.pieces.splice(i - 1, 0, it); } })}><ChevronDown /></button>
                      <button aria-label="显隐" onClick={() => commit((doc) => { const t = doc.pieces.find((x) => x.id === p.id); if (t) t.visible = !t.visible; })}>{p.visible ? <Eye /> : <EyeOff />}</button>
                      <button aria-label="锁定" onClick={() => commit((doc) => { const t = doc.pieces.find((x) => x.id === p.id); if (t) t.locked = !t.locked; })}>{p.locked ? <Lock /> : <Unlock />}</button>
                    </div>
                  ))}
                  {project.pieces.length === 0 && <p className="patchwork-hint">还没有布片。用画笔或「添加」创建第一块。</p>}
                </div>
                {selectedIds.length >= 2 && (
                  <>
                    <div className="patchwork-actions">
                      <button onClick={() => groupSelected(true)}>组合</button>
                      <button onClick={() => groupSelected(false)}>解组</button>
                      <button onClick={mergeSelected}><Scissors />合并布片</button>
                    </div>
                    <div className="patchwork-actions">
                      <button onClick={() => alignSelected('left')}>左对齐</button><button onClick={() => alignSelected('cx')}>水平居中</button><button onClick={() => alignSelected('right')}>右对齐</button>
                      <button onClick={() => alignSelected('top')}>顶对齐</button><button onClick={() => alignSelected('cy')}>垂直居中</button><button onClick={() => alignSelected('bottom')}>底对齐</button>
                    </div>
                  </>
                )}
                <div className="patchwork-baseline">
                  <span className="pw-thumb-base" style={{ background: project.materials.find((m) => m.id === project.base.materialId)?.color || '#f2e6d2' }} />
                  <span className="patchwork-layer-name">底布</span>
                  <span className="patchwork-hint">{project.base.includeInCutList ? '参与制作' : '不参与制作'}</span>
                  <button aria-label="底布锁定" onClick={() => commit((doc) => { doc.base.locked = !doc.base.locked; })}>{project.base.locked ? <Lock /> : <Unlock />}</button>
                </div>
                {project.guides.length > 0 && <p className="patchwork-hint">辅助线 {project.guides.length} 条（不计入裁片清单）。</p>}
              </div>
            )}

            {panel === 'fabrics' && (
              <>
                <FabricPicker
                  materials={project.materials.filter(m => m.inventoryFabricId || m.presetId || m.projectOnly || m.assetId || m.id === project.base.materialId || project.pieces.some(piece => piece.materialId === m.id))}
                  selectedId={
                    fabricPickerTarget === 'base'
                      ? (baseForm ? baseForm.materialId : project.base.materialId)
                      : fabricPickerTarget === 'props'
                        ? (single?.materialId || activeMaterialId)
                        : activeMaterialId
                  }
                  editMode={fabEdit}
                  query={fabQuery}
                  onQueryChange={setFabQuery}
                  onSelect={pickMaterial}
                  onEditMaterial={openMatDetail}
                  onEditModeChange={setFabEdit}
                  onCreate={createMaterialDraft}
                  onClose={closeFabrics}
                  allowNone={fabricPickerTarget === 'base'}
                  warehouseFabrics={warehouseFabrics}
                  onSelectWarehouseFabric={(f) => void addFabricMaterial(f)}
                  onEditWarehouseFabric={f => withToken(() => setStockFabric(f))}
                  warehouseContent={fabricPick ? (
                    <div className="patchwork-works">
                      <button className="pw-fab-backlink" onClick={() => setFabricPick(null)}><ArrowLeft />返回布料列表</button>
                      {fabricPick.length === 0 && <p className="patchwork-hint">布料仓库还是空的。去底部「我的 → 布料仓库」先把囤的布登记进来。</p>}
                      {fabricPick.map((f) => (
                        <div className="patchwork-workrow" key={f.id}>
                          <button className="patchwork-workrow-main" onClick={() => void addFabricMaterial(f)}>
                            <strong>{f.name}</strong>
                            <small>{fabricSpecLabel(f)}</small>
                          </button>
                          {f.image ? <img className="patchwork-fabric-thumb" src={f.image} alt="" /> : <span className="patchwork-chip-color" style={{ background: f.color || '#d9c8a9' }} />}
                        </div>
                      ))}
                    </div>
                  ) : undefined}
                />
                {matDetailId && matDraft && (
                <div className="pw-fab-modal" role="presentation" onClick={closeMatDetail} onTouchStart={(e) => e.stopPropagation()}>
                  <div className="pw-fab-modal-panel" role="dialog" aria-modal="true" aria-label={project.materials.some((m) => m.id === matDetailId) ? '编辑布料' : '新增布料'} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
                <div className="pw-fab-detail" key={matDetailId}>
                  <header className="pw-fab-dhead">
                    <button className="pw-fab-back" disabled={savingFabric} onClick={closeMatDetail}><ArrowLeft />取消</button>
                    <strong>{project.materials.some((m) => m.id === matDetailId) ? '编辑布料' : '新增布料'}</strong>
                    <button className="pw-fab-save" disabled={savingFabric} onClick={() => {
                      if (project.materials.some((m) => m.id === matDetailId) || newFabricProjectOnly) return saveMatDetail();
                      withToken((t) => { void saveMatDetail(t); });
                    }}>{savingFabric ? '保存中…' : '保存'}</button>
                  </header>
                  <fieldset className="pw-fab-detail-body pw-fab-save-fields" disabled={savingFabric}>
                  <div className="pw-fab-preview">
                    {matDraft.kind === 'image'
                      ? (matDraft.assetId
                        ? <MatSwatch m={{ id: matDetailId, name: matDraft.name, color: matDraft.color, assetId: matDraft.assetId }} />
                        : <span className="pw-fab-preview-empty">还没有图案图片</span>)
                      : <PatternSwatch pattern={matDraft.pattern} color={matDraft.color} />}
                    <button className="pw-fab-replace" onClick={launchReplaceImage}><ImagePlus />更换图片</button>
                  </div>
                  <label className="pw-fab-field">布料名称<input value={matDraft.name} onChange={(e) => setMatDraft({ ...matDraft, name: e.target.value })} placeholder="给布料起个名字" /></label>
                  <div className="pw-fab-field"><span>布料类型</span>
                    <div className="pw-fab-seg">
                      <button className={matDraft.kind === 'color' ? 'on' : ''} onClick={() => setMatDraft({ ...matDraft, kind: 'color' })}>纯色</button>
                      <button className={matDraft.kind === 'image' ? 'on' : ''} onClick={() => { if (matDraft.assetId) setMatDraft({ ...matDraft, kind: 'image' }); else launchReplaceImage(); }}>图案布</button>
                    </div>
                  </div>
                  {matDraft.kind === 'color' && (
                    <>
                      <div className="pw-fab-field"><span>颜色</span>
                        <div className="pw-fab-colors">
                          {PRESET_COLORS.map((c) => (
                            <button key={c} style={{ background: c }} className={matDraft.color.toLowerCase() === c ? 'on' : ''} aria-label={`预设颜色 ${c}`} onClick={() => setMatDraft({ ...matDraft, color: c })} />
                          ))}
                        </div>
                        <div className="pw-fab-hexrow">
                          <input type="color" value={matDraft.color} onChange={(e) => setMatDraft({ ...matDraft, color: e.target.value })} aria-label="自定义颜色" />
                          <input value={matDraft.color} onChange={(e) => setMatDraft({ ...matDraft, color: e.target.value })} aria-label="颜色值" />
                        </div>
                      </div>
                      <div className="pw-fab-field"><span>纹理</span>
                        <div className="pw-fab-textures">
                          <button className={matDraft.pattern === 'none' ? 'on' : ''} onClick={() => setMatDraft({ ...matDraft, pattern: 'none' })}><PatternSwatch pattern="none" color={matDraft.color} /><em>无纹理</em></button>
                          {TEXTURE_PATTERNS.map((p) => (
                            <button key={p.id} className={matDraft.pattern === p.id ? 'on' : ''} onClick={() => setMatDraft({ ...matDraft, pattern: p.id })}><PatternSwatch pattern={p.id} color={matDraft.color} /><em>{p.name}</em></button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {matDraft.kind === 'image' && (
                    <label className="pw-fab-field">图案实际宽度 (mm，校准纹理比例)<input type="number" min={0} value={matDraft.sampleWidthMm ?? ''} onChange={(e) => setMatDraft({ ...matDraft, sampleWidthMm: Number(e.target.value) || undefined })} placeholder="如 150" /></label>
                  )}
                  {!project.materials.some((m) => m.id === matDetailId) && (
                    <>
                      <label className="pw-fab-field">实际库存面积（cm²，选填）
                        <input type="number" min="0.01" step="any" aria-label="实际库存面积" value={newFabricAreaCm2} disabled={newFabricProjectOnly} onChange={(e) => setNewFabricAreaCm2(e.target.value)} placeholder="不填则记为数量待核实" />
                      </label>
                      <label className="pw-fab-local-option"><input type="checkbox" aria-label="仅用于本作品" checked={newFabricProjectOnly} onChange={(e) => setNewFabricProjectOnly(e.target.checked)} />仅用于本作品（不加入布料仓库）</label>
                      <p className="pw-fab-usage">默认保存到「我的 → 布料仓库」。纹理校准宽度不作为库存尺寸。</p>
                    </>
                  )}
                  {(() => {
                    const material = project.materials.find(m => m.id === matDetailId);
                    const fabric = material && unifiedFabrics(warehouseFabrics).find(f => matchesMaterialFabric(material, f));
                    return fabric ? <button type="button" className="fabric-record-stock" onClick={() => withToken(() => setStockFabric(fabric))}>录入库存</button> : null;
                  })()}
                  <p className="pw-fab-usage">{project.materials.some((m) => m.id === matDetailId) ? `当前项目使用 ${usageOf(matDetailId)} 处，保存后同步更新这些图形。` : newFabricProjectOnly ? '保存后仅用于本作品，取消不会创建布料。' : '保存到仓库成功后，自动选用于当前作品。'}</p>
                  {matDeleting ? (
                    <div className="pw-fab-replacepick">
                      <span>这块布正被使用，先选择替代布料（{usageOf(matDetailId)} 处引用会改用它）：</span>
                      <div className="pw-fab-repgrid">
                        {project.materials.filter((x) => x.id !== matDetailId).map((x) => (
                          <button key={x.id} className={matReplaceId === x.id ? 'on' : ''} onClick={() => setMatReplaceId(x.id)}>
                            <MatSwatch m={x} /><em>{x.name}</em>
                          </button>
                        ))}
                      </div>
                      <div className="pw-fab-delactions">
                        <button onClick={() => setMatDeleting(false)}>取消</button>
                        <button className="danger" disabled={!matReplaceId} onClick={confirmDeleteMat}>替换并删除</button>
                      </div>
                    </div>
                  ) : (
                    project.materials.some((m) => m.id === matDetailId) && <button className="pw-fab-delete" onClick={startDeleteMat}><Trash2 />删除布料</button>
                  )}
                  </fieldset>
                </div>
                  </div>
                </div>
                )}
              </>
            )}

            {panel === 'export' && (
              <div className="patchwork-form pw-export-form">
                <div className="pw-tabs pw-tabs-3" role="tablist" aria-label="导出视图切换">
                  <button type="button" role="tab" aria-selected={expTab === 'list'} className={expTab === 'list' ? 'on' : ''} onClick={() => setExpTab('list')}>裁片清单</button>
                  <button type="button" role="tab" aria-selected={expTab === 'materials'} className={expTab === 'materials' ? 'on' : ''} onClick={() => setExpTab('materials')}>用料与配布</button>
                  <button type="button" role="tab" aria-selected={expTab === 'preview'} className={expTab === 'preview' ? 'on' : ''} onClick={() => setExpTab('preview')}>打印预览</button>
                </div>
                {expTab === 'preview' ? (
                  <div className="pw-export-body is-preview">
                    <div className="pw-export-preview-stage">
                      {expUrl ? <img className="pw-preview pw-export-preview-img" src={expUrl} alt="拼布预览图" /> : <p className="patchwork-hint">正在生成预览…</p>}
                    </div>
                    <p className="patchwork-hint pw-export-note">预览为效果图；真正打印请导出 PDF 并以 100% 打印、用 50×50mm 校准框核对。</p>
                  </div>
                ) : expTab === 'materials' ? (() => {
                  const reqs = computeProjectMaterialRequirements(project, warehouseFabrics, { includeHidden, wasteRatio });
                  const totalRequiredMm2 = reqs.reduce((sum, r) => sum + r.requiredAreaMm2, 0);
                  const pendingCount = reqs.filter((r) => r.status !== 'sufficient').length;
                  const linkedCount = reqs.filter((r) => Boolean(r.inventoryFabric)).length;
                  return (
                    <div className="pw-export-body pw-materials-body" aria-label="用料核算与智能配布">
                      <div className="pw-mat-summary-bar">
                        <div>
                          <strong>预计备料总面积：{formatCm2(totalRequiredMm2)} cm²</strong>
                          <small>
                            {pendingCount === 0
                              ? `共 ${reqs.length} 款布料，仓库余量全部充足`
                              : `${pendingCount} 款布料待配布或余量不足 · 原作花色已完整保留，不强制买同款`}
                          </small>
                        </div>
                        <div className="pw-waste-seg" role="group" aria-label="损耗预留比例">
                          {([0, 0.1, 0.15] as const).map((ratio) => (
                            <button
                              key={ratio}
                              type="button"
                              className={wasteRatio === ratio ? 'on' : ''}
                              onClick={() => setWasteRatio(ratio)}
                            >
                              损耗 {Math.round(ratio * 100)}%
                            </button>
                          ))}
                        </div>
                      </div>

                      {showConsumeConfirm ? (
                        <div className="pw-consume-card" role="region" aria-label="确认裁片扣减库存">
                          <div className="pw-consume-head">
                            <strong>核对实际裁布消耗 (cm²)</strong>
                            <button type="button" onClick={() => setShowConsumeConfirm(false)}>返回列表</button>
                          </div>
                          <p className="patchwork-hint">仅在您实际动剪刀裁布后确认扣减；导出 PDF 或预览图纸不会自动扣库存。</p>
                          <div className="pw-consume-list">
                            {reqs.filter((r) => Boolean(r.inventoryFabric)).map((r) => {
                              const inv = r.inventoryFabric!;
                              return (
                                <label key={inv.id} className="pw-consume-row">
                                  <span className="pw-consume-info">
                                    <strong>{inv.name}</strong>
                                    <small>预计 {formatCm2(r.requiredAreaMm2)} cm² · {fabricSpecLabel(inv)}</small>
                                  </span>
                                  <span className="pw-consume-input-wrap">
                                    <input
                                      type="number"
                                      min={0}
                                      step="1"
                                      aria-label={`扣减 ${inv.name} 面积 (cm²)`}
                                      value={consumeDraftCm2[inv.id] ?? ''}
                                      onChange={(e) => setConsumeDraftCm2((cur) => ({ ...cur, [inv.id]: e.target.value }))}
                                    />
                                    <em>cm²</em>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                          <div className="patchwork-actions">
                            <button type="button" onClick={() => setShowConsumeConfirm(false)}>取消</button>
                            <button type="button" className="primary" disabled={consumingStock} onClick={submitConsumeStock}>
                              {consumingStock ? '扣减中…' : '确认已裁剪并扣减库存'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pw-mat-req-list">
                          {reqs.map((req) => {
                            const isReplacing = replaceTargetMatId === req.material.id;
                            const badgeMap: Record<typeof req.status, { text: string; cls: string }> = {
                              sufficient: { text: '面积够用，排布待核实', cls: 'is-ok' },
                              unlinked: { text: req.material.presetId ? '未录入库存' : '原作花色 · 待配布', cls: 'is-unlinked' },
                              insufficient: { text: `差 ${formatCm2(req.shortageAreaMm2)} cm²`, cls: 'is-warn' },
                              missing: { text: '缺料 / 已用完', cls: 'is-out' },
                              unverified: { text: '未录入库存', cls: 'is-own' },
                            };
                            const badge = badgeMap[req.status];
                            const recs = isReplacing
                              ? recommendReplacementFabrics(req.material, req.requiredAreaMm2, warehouseFabrics)
                              : [];
                            return (
                              <div key={req.material.id} className={`pw-mat-req-card ${badge.cls}`}>
                                <div className="pw-mat-req-main">
                                  <MatSwatch m={req.material} />
                                  <div className="pw-mat-req-copy">
                                    <div className="pw-mat-req-title">
                                      <strong>{req.material.name}</strong>
                                      <span className={`pw-mat-status-pill ${badge.cls}`}>{badge.text}</span>
                                    </div>
                                    <small>
                                      {req.pieceCount > 0 ? `${req.pieceCount} 片裁片` : ''}{req.includesBase ? (req.pieceCount > 0 ? ' + 底布' : '底布') : ''} · 净 {formatCm2(req.netAreaMm2)} + 缝份 {formatCm2(req.seamAreaMm2)} + 损耗 {formatCm2(req.wasteAreaMm2)} = <strong>预计 {formatCm2(req.requiredAreaMm2)} cm²</strong>
                                    </small>
                                    {req.inventoryFabric ? (
                                      <small className="pw-mat-inv-meta">已绑仓库：{req.inventoryFabric.name}（{fabricSpecLabel(req.inventoryFabric)}）</small>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    className="pw-mat-replace-btn"
                                    aria-label={`换成我的布 ${req.material.name}`}
                                    onClick={() => {
                                      const next = isReplacing ? null : req.material.id;
                                      setReplaceTargetMatId(next);
                                      if (next && tokenRef.current && warehouseFabrics.length === 0) {
                                        void loadWarehouseFabrics(tokenRef.current, false);
                                      }
                                    }}
                                  >
                                    {isReplacing ? '收起' : req.status === 'sufficient' ? '更换配布' : '换成我的布'}
                                  </button>
                                </div>

                                {isReplacing && (
                                  <div className="pw-smart-replace-box" role="region" aria-label={`替换 ${req.material.name} 的候选布料`}>
                                    <div className="pw-replace-scope-row" role="radiogroup" aria-label="替换范围">
                                      <button
                                        type="button"
                                        className={replaceScope === 'all' ? 'on' : ''}
                                        onClick={() => setReplaceScope('all')}
                                      >
                                        替换全部同款布片（推荐）
                                      </button>
                                      <button
                                        type="button"
                                        className={replaceScope === 'selected' ? 'on' : ''}
                                        disabled={selectedIds.length === 0}
                                        onClick={() => setReplaceScope('selected')}
                                      >
                                        仅当前选中布片 ({selectedIds.length})
                                      </button>
                                    </div>

                                    {recs.length === 0 ? (
                                      <p className="patchwork-hint">
                                        {tokenRef.current
                                          ? '你的布料仓库暂无可用布料，可直接拍照上传手头现有的布。'
                                          : '登录后可按库存余量与相近色系智能推荐仓库中的布料，也可直接拍照上传手头新布。'}
                                      </p>
                                    ) : (
                                      <div className="pw-rec-list">
                                        {recs.slice(0, 6).map((cand) => (
                                          <div key={cand.fabric.id} className="pw-rec-item">
                                            {cand.fabric.image
                                              ? <img className="pw-rec-thumb" src={cand.fabric.image} alt="" />
                                              : <span className="pw-rec-thumb" style={{ background: cand.fabric.color || '#d9c8a9' }} />}
                                            <div className="pw-rec-copy">
                                              <div className="pw-rec-tags">
                                                <strong>{cand.fabric.name}</strong>
                                                <em className={cand.isEnough ? 'ok' : 'warn'}>{cand.stockTag}</em>
                                                <em>{cand.colorTag}</em>
                                              </div>
                                              <small>{fabricSpecLabel(cand.fabric)}</small>
                                            </div>
                                            <button
                                              type="button"
                                              className="pw-rec-pick-btn"
                                              aria-label={`选用 ${cand.fabric.name} 替换`}
                                              onClick={() => void replaceWithWarehouseFabric(req.material.id, cand.fabric, replaceScope)}
                                            >
                                              选用替换
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    <div className="pw-replace-upload-row">
                                      <button
                                        type="button"
                                        className="pw-replace-upload-btn"
                                        onClick={() => {
                                          replaceUploadRef.current = { sourceMatId: req.material.id, scope: replaceScope };
                                          fabricFileRef.current?.click();
                                        }}
                                      >
                                        <Upload aria-hidden="true" />+ 拍照上传手头新布并替换（自动入库）
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {reqs.length === 0 && <p className="patchwork-hint">画布上还没有布片，添加布片后会自动核算每款布料的用料面积。</p>}
                        </div>
                      )}

                      {!showConsumeConfirm && linkedCount > 0 && (
                        <div className="pw-consume-trigger-bar">
                          <span>已绑定 {linkedCount} 款仓库布料</span>
                          <button type="button" className="pw-consume-open-btn" onClick={openConsumeConfirm}>
                            <Scissors aria-hidden="true" />已裁剪，扣减仓库库存
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className="pw-export-body">
                    {issues.length > 0
                      ? <div className="patchwork-issues">{issues.map((t, i) => <div key={i}>· {t}</div>)}</div>
                      : <div className="patchwork-ok">导出前校验通过：{list.length} 片可裁布片（相同裁片已合并计数）。</div>}
                    <div className="pw-grid pw-base-grid">
                      <label>
                        <span>创作工艺</span>
                        <select value={project.technique} onChange={(e) => commit((doc) => { doc.technique = e.target.value as Technique; })}>
                          <option value="raw">贴布缝 · 毛边（缝份 0）</option>
                          <option value="turned">贴布缝 · 折边（带折边量）</option>
                          <option value="pieced">几何拼接（等距外扩 7mm 参考）</option>
                        </select>
                      </label>
                      <label>
                        <span>打印纸张</span>
                        <select value={paper} onChange={(e) => setPaper(e.target.value as 'A4' | 'Letter')}>
                          <option value="A4">A4 · 100% 打印 · 含校准方框</option>
                          <option value="Letter">Letter · 100% 打印 · 含校准方框</option>
                        </select>
                      </label>
                    </div>
                    <div className="pw-settings-card">
                      <label className="pw-setting-row">
                        <span className="pw-setting-copy">
                          <strong>清单与 PDF 包含隐藏布片</strong>
                          <small>关闭后仅导出当前可见的布片图层</small>
                        </span>
                        <input type="checkbox" className="patchwork-switch" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} />
                      </label>
                    </div>
                    <div className="pw-cutlist">
                      {(() => {
                        const groups = new Map<string, { p: Piece; count: number; idx: number }>();
                        project.pieces.forEach((p, idx) => {
                          if (!includeHidden && !p.visible) return;
                          const b = pointBounds(p.points);
                          const sig = `${p.materialId}|${p.seamMm}|` + p.points.map((pt) => `${Math.round((pt.x - b.x) * 2) / 2},${Math.round((pt.y - b.y) * 2) / 2}`).join(';');
                          const g = groups.get(sig);
                          if (g) g.count++; else groups.set(sig, { p, count: 1, idx });
                        });
                        return [...groups.values()].map(({ p, count, idx }) => {
                          const b = pointBounds(p.points);
                          return (
                            <div className="pw-cutrow" key={p.id}>
                              <PieceThumb p={p} mat={project.materials.find((m) => m.id === p.materialId)} />
                              <span className="pw-cutname"><b>P{idx + 1}</b> {p.name}</span>
                              <span className="patchwork-hint">{p.materialId} · {Math.round(b.width)}×{Math.round(b.height)}mm</span>
                              <span className="pw-count">× {count}</span>
                            </div>
                          );
                        });
                      })()}
                      {project.base.includeInCutList && (
                        <div className="pw-cutrow">
                          <span className="pw-thumb-base" style={{ background: project.materials.find((m) => m.id === project.base.materialId)?.color || '#f2e6d2' }} />
                          <span className="pw-cutname">底布</span>
                          <span className="patchwork-hint">{fmtCm(project.widthMm)} × {fmtCm(project.heightMm)} cm</span>
                          <span className="pw-count">× 1</span>
                        </div>
                      )}
                      {list.length === 0 && <p className="patchwork-hint">画布上还没有布片，先画或添加几片。</p>}
                    </div>
                  </div>
                )}
                <div className="patchwork-actions pw-export-footer">
                  <button type="button" onClick={exportPng}><Download aria-hidden="true" />{expTab === 'preview' ? '下载 PNG' : '预览 PNG'}</button>
                  <button type="button" className="primary pw-exportbtn" onClick={() => exportPdf(paper, includeHidden)}>导出 PDF</button>
                </div>
              </div>
            )}
            {panel === 'props' && single && geo && (
              <div className="patchwork-form pw-base-form pw-props">
                <div className="pw-grid pw-base-grid">
                  <label className="pw-span2">
                    <span>名称</span>
                    <input
                      type="text"
                      value={single.name}
                      placeholder="未命名布片"
                      onFocus={() => { if (!nameOrig.current) nameOrig.current = cloneDocument(docOf(project)); }}
                      onChange={(e) => { const v = e.target.value; const pid = single.id; setProject((cur) => ({ ...cur, pieces: cur.pieces.map((p) => (p.id === pid ? { ...p, name: v } : p)) })); }}
                      onBlur={nameCommit}
                    />
                  </label>
                  <div className="pw-span2 pw-base-mat-section">
                    <button
                      type="button"
                      className="pw-base-fabric-trigger"
                      aria-label="选择布片布料"
                      onClick={() => { flushPropsEdits(); openFabricPicker('props'); }}
                    >
                      <span className="pw-base-fabric-thumb">
                        {(() => {
                          const material = project.materials.find((m) => m.id === single.materialId);
                          return material ? <MatSwatch m={material} /> : <Palette />;
                        })()}
                      </span>
                      <span className="pw-base-fabric-copy">
                        <strong>布料</strong>
                        <small>{project.materials.find((m) => m.id === single.materialId)?.name || '请选择布料'}</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </div>
                  <label>
                    <span>X (mm)</span>
                    <input type="number" step="0.5" value={geo.x} onChange={(e) => geoChange({ x: Number(e.target.value) || 0 })} onBlur={geoCommit} />
                  </label>
                  <label>
                    <span>Y (mm)</span>
                    <input type="number" step="0.5" value={geo.y} onChange={(e) => geoChange({ y: Number(e.target.value) || 0 })} onBlur={geoCommit} />
                  </label>
                  <label>
                    <span>宽 (mm)</span>
                    <input type="number" step="0.5" min={1} value={geo.w} onChange={(e) => geoChange({ w: Number(e.target.value) || 0 })} onBlur={geoCommit} />
                  </label>
                  <label>
                    <span>高 (mm)</span>
                    <input type="number" step="0.5" min={1} value={geo.h} onChange={(e) => geoChange({ h: Number(e.target.value) || 0 })} onBlur={geoCommit} />
                  </label>
                  <label>
                    <span>再旋转 (°)</span>
                    <input type="number" step="1" value={geo.angle} onChange={(e) => geoChange({ angle: Number(e.target.value) || 0 })} onBlur={geoCommit} />
                  </label>
                  <label>
                    <span>缝份 (mm)</span>
                    <input type="number" step="0.5" min={0} value={geo.seam} onChange={(e) => geoChange({ seam: Number(e.target.value) || 0 })} onBlur={geoCommit} />
                  </label>
                </div>
                <p className="patchwork-hint pw-props-hint">改完即生效，数字以毫米为准、就是实际裁布尺寸；每个字段记一条撤销。</p>
                <div className="patchwork-actions pw-base-actions pw-props-actions">
                  <button type="button" className="pw-widebtn" onClick={() => { flushPropsEdits(); void saveAsTemplate(); }}>
                    <Shapes aria-hidden="true" />存为我的形状
                  </button>
                  <button type="button" className="primary" onClick={closeProps}>完成</button>
                </div>
              </div>
            )}
            {panel === 'save' && (
              <div className="patchwork-form">
                <label>作品名称<input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="未命名拼布" /></label>
                <p className="patchwork-hint">保存到「我的作品」，可从「我的作品」页打开继续编辑。</p>
                <div className="patchwork-actions">
                  <button onClick={() => setPanel(null)}>取消</button>
                  <button className="primary" onClick={() => void doSave(tokenRef.current)}>保存作品</button>
                </div>
              </div>
            )}

            {panel === 'open' && (
              <div className="patchwork-form">
                <button className="patchwork-chip" onClick={newProject}>+ 新建画布</button>
                {cloudList.length === 0 && indexList.length === 0 && <p className="patchwork-hint">还没有保存的作品。在画布上创作后，点右上角「保存」就会出现在这里。</p>}
                <div className="patchwork-works">
                  {cloudList.map((e) => (
                    <div className="patchwork-workrow" key={'cloud-' + e.id}>
                      <button className="patchwork-workrow-main" onClick={() => withToken((t) => void openCloudProject(e, t))}>
                        <strong>{e.name}</strong>
                        <small>{fmtCm(e.cols)} × {fmtCm(e.rows)} cm · 云端 · {new Date(e.updatedAt).toLocaleDateString('zh-CN')}</small>
                      </button>
                      <button className="patchwork-workrow-del" aria-label={'删除作品 ' + e.name} onClick={() => openConfirm({ title: '删除作品', message: `确定删除作品「${e.name}」吗？云端与本机副本都会删除，无法恢复。`, confirmText: '删除', danger: true, onConfirm: () => void deleteCloudProject(e, tokenRef.current) })}><Trash2 /></button>
                    </div>
                  ))}
                  {indexList.filter((e) => !e.cloudId || !cloudList.some((c) => c.id === e.cloudId)).map((e) => (
                    <div className="patchwork-workrow" key={e.id}>
                      <button className="patchwork-workrow-main" onClick={() => openProject(e.id)}>
                        <strong>{e.name}</strong>
                        <small>{fmtCm(e.widthMm)} × {fmtCm(e.heightMm)} cm · {{ raw: '毛边', turned: '折边', pieced: '拼接' }[e.technique]} · 本机 · {new Date(e.updatedAt).toLocaleDateString('zh-CN')}</small>
                      </button>
                      <button className="patchwork-workrow-del" aria-label={'删除作品 ' + e.name} onClick={() => openConfirm({ title: '删除作品', message: e.cloudId ? `确定删除「${e.name}」的本机副本吗？云端作品仍会保留。` : `确定删除作品「${e.name}」吗？删除后无法恢复。`, confirmText: '删除', danger: true, onConfirm: () => deleteProject(e.id) })}><Trash2 /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {panel === 'leave' && (
              <div className="patchwork-form">
                <p>当前作品有未保存的改动。</p>
                <div className="patchwork-actions">
                  <button className="primary" onClick={() => withToken((t) => { void doSave(t).then(() => navigate('/')); })}>保存并离开</button>
                  <button className="danger" onClick={() => navigate('/')}>舍弃离开</button>
                  <button onClick={() => setPanel(null)}>继续编辑</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
