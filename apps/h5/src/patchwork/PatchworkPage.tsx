import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Settings, Undo2, Redo2, Save, Upload, Download, MousePointer2, Pencil, Shapes,
  PaintBucket, Layers, Trash2, Copy, Lock, Unlock, Eye, EyeOff, RotateCw, FlipHorizontal2,
  FlipVertical2, X, Plus, Check, ChevronUp, ChevronDown, FolderOpen, RefreshCw, Scissors,
  Square, Circle, Triangle, Diamond, Hexagon, Star, Flower2, Leaf, LayoutGrid, SlidersHorizontal,
} from 'lucide-react';
import {
  area, cloneDocument, hitTest, isConcave, makePiece, makeProject, makeShape, pointBounds,
  pointInPolygon, simplifyPoints, selfIntersects, transformPoints, validatePiece,
  type Guide, type Material, type PatchworkDocument, type PatchworkProject, type Piece,
  type Point, type Shape, type Technique,
} from './model';
import { drawScene, metrics, screenToWorld, worldToScreen, type Metrics, type View } from './canvas';
import { buildPatternPdf, cutList, downloadBlob, planIssues } from './export';
import { getAsset, latestDraftId, loadImage, putAsset, readDraft, saveDraft } from './assets';
import { useAppOverlay } from '../app/overlays/AppOverlayContext';
import { newPatchworkId } from './ids';
import type { SegmentMode, SegmentResult } from './segmentation';
import './patchwork.css';

/* 拼布编辑器：几何一律毫米；历史以“一次完整手势 = 一条记录”为粒度（AC02）。 */

type Tool = 'select' | 'brush' | 'add' | 'fill' | 'layers';
type Panel = 'base' | 'add' | 'fill' | 'layers' | 'materials' | 'export' | 'import' | 'save' | 'open' | 'props' | 'leave' | null;
type Candidate = { points: Point[]; color: string; excluded: boolean; asGuide: boolean; chosen: boolean; grouped: boolean; hasHoles: boolean };
type Analysis = { rgba: Uint8ClampedArray; width: number; height: number; pxPerMm: number; offsetX: number; offsetY: number };

const TECHNIQUE_LABEL: Record<Technique, string> = { raw: '贴布缝·毛边', turned: '贴布缝·折边', pieced: '几何拼接' };
const INDEX_KEY = 'qiaoqiaole:patchwork:index';
const TEMPLATES_KEY = 'qiaoqiaole:patchwork:templates';
const uid = () => newPatchworkId();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type IndexEntry = { id: string; name: string; updatedAt: number; widthMm: number; heightMm: number; technique: Technique };
function readIndex(): IndexEntry[] { try { return JSON.parse(localStorage.getItem(INDEX_KEY) || '[]') as IndexEntry[]; } catch { return []; } }
function writeIndex(list: IndexEntry[]) { try { localStorage.setItem(INDEX_KEY, JSON.stringify(list.slice(0, 60))); } catch { /* 存储满时忽略索引 */ } }
type Template = { name: string; points: Point[] };
function readTemplates(): Template[] { try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]') as Template[]; } catch { return []; } }

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
function MatSwatch({ m }: { m: Material }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    if (m.assetId) {
      void getAsset(m.assetId).then((b) => { if (b && live) setUrl(URL.createObjectURL(b)); });
    }
    return () => { live = false; };
  }, [m.assetId]);
  if (url) return <span className="pw-swatch"><img src={url} alt="" /></span>;
  return <span className="pw-swatch" style={{ background: m.color }}>{m.assetId ? '布' : ''}</span>;
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

export function PatchworkPage() {
  const navigate = useNavigate();
  const { openConfirm } = useAppOverlay();
  const params = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fabricFileRef = useRef<HTMLInputElement>(null);
  const importModeRef = useRef<'partition' | 'reference'>('partition');
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const loadingImgs = useRef(new Set<string>());
  const savedJson = useRef('');
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const analysisRef = useRef<Analysis | null>(null);
  const textureOrig = useRef<PatchworkDocument | null>(null);

  const [project, setProject] = useState<PatchworkProject>(() => makeProject());
  const [loaded, setLoaded] = useState(false);
  const [past, setPast] = useState<PatchworkDocument[]>([]);
  const [future, setFuture] = useState<PatchworkDocument[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [panel, setPanel] = useState<Panel>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMaterialId, setActiveMaterialId] = useState('B');
  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 });
  const [message, setMessage] = useState('');
  const [imgVersion, setImgVersion] = useState(0);
  const [nodeMode, setNodeMode] = useState(false);
  const [nodeIndex, setNodeIndex] = useState<number | null>(null);
  const [brushMode, setBrushMode] = useState<'piece' | 'guide'>('piece');
  const [brushSmooth, setBrushSmooth] = useState(true);
  const [stroke, setStroke] = useState<Point[]>([]);
  const [pending, setPending] = useState<{ points: Point[]; closePreview: boolean } | null>(null);
  const [fillScope, setFillScope] = useState<'single' | 'same' | 'all'>('single');
  const [fillPick, setFillPick] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [candStats, setCandStats] = useState<{ ignored: number; tooMany: boolean } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detail, setDetail] = useState<'simple' | 'standard' | 'fine'>('standard');
  const [minMm, setMinMm] = useState(5);
  const [segmentMode, setSegmentMode] = useState<SegmentMode>('line');
  const [lineThreshold, setLineThreshold] = useState(170);
  const [importThumb, setImportThumb] = useState('');
  const [importName, setImportName] = useState('');
  const [saveName, setSaveName] = useState('');
  const [indexList, setIndexList] = useState<IndexEntry[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [redrawTick, setRedrawTick] = useState(0);
  const [baseForm, setBaseForm] = useState<{ name: string; technique: Technique; w: number; h: number; materialId: string; include: boolean; locked: boolean; scaleDesign: boolean } | null>(null);
  const [shapeW, setShapeW] = useState(120);
  const [shapeH, setShapeH] = useState(120);
  const [paper, setPaper] = useState<'A4' | 'Letter'>('A4');
  const [includeHidden, setIncludeHidden] = useState(true);
  const [addTab, setAddTab] = useState<'base' | 'flora' | 'combo' | 'mine'>('base');
  const [expTab, setExpTab] = useState<'list' | 'preview'>('list');
  const [expUrl, setExpUrl] = useState('');
  const [dlgMode, setDlgMode] = useState<'piece' | 'guide'>('piece');
  const [dlgSnap, setDlgSnap] = useState(true);
  const [editingMat, setEditingMat] = useState<string | null>(null);
  const [replaceWith, setReplaceWith] = useState<string>('');

  useEffect(() => {
    if (panel === 'base') {
      setBaseForm({ name: project.name, technique: project.technique, w: project.widthMm, h: project.heightMm, materialId: project.base.materialId, include: project.base.includeInCutList, locked: project.base.locked, scaleDesign: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel === 'base']);

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

  /* ---------- 初始加载：路由 id > 最近草稿 > 空白 ---------- */
  useEffect(() => {
    let initial: PatchworkProject | null = null;
    const wanted = params.projectId || latestDraftId();
    if (wanted) {
      const raw = readDraft(wanted) as PatchworkProject | null;
      if (raw && raw.kind === 'patchwork' && Array.isArray(raw.pieces)) initial = { ...makeProject(), ...raw };
    }
    if (initial) {
      setProject(initial);
      savedJson.current = JSON.stringify(docOf(initial));
      if (params.projectId) toast('已打开拼布作品');
      else toast('已恢复本地草稿，可在「作品」中新建或打开其他作品');
    } else {
      savedJson.current = JSON.stringify(docOf(makeProject()));
    }
    setIndexList(readIndex());
    setTemplates(readTemplates());
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 草稿自动保存（恢复机制，不等于云端保存成功） */
  useEffect(() => {
    if (!loaded) return;
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
    ids.forEach((id) => {
      if (imagesRef.current.has(id) || loadingImgs.current.has(id)) return;
      loadingImgs.current.add(id);
      loadImage(id).then((img) => {
        loadingImgs.current.delete(id);
        if (img) { imagesRef.current.set(id, img); setImgVersion((v) => v + 1); }
      }).catch(() => loadingImgs.current.delete(id));
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
      selectedIds, draft: pending ? pending.points : stroke, draftClosed: pending ? pending.closePreview : nearClose(),
      nodeMode, preview, previewStyle: panel === 'import' ? 'outline' : 'filled', images: imagesRef.current, showNumbers: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, view, selectedIds, stroke, pending, nodeMode, candidates, imgVersion, redrawTick, panel]);

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
      if (pending) return;
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
      if (strokeRef.current.length >= 2) setPending({ points: [...strokeRef.current], closePreview: nearClose() || dlgSnap });
      strokeRef.current = [];
      setStroke([]);
      return;
    }
    if (nodeDrag.current) { commitFrom(nodeDrag.current.orig); nodeDrag.current = null; return; }
    if (drag.current) {
      if (drag.current.moved && drag.current.ids.length) commitFrom(drag.current.orig);
      drag.current = null;
    }
  };

  /* ---------- 画笔确认 ---------- */
  const finishPending = (asGuide: boolean) => {
    if (!pending) return;
    const raw = pending.points;
    if (asGuide) {
      if (raw.length < 2) { toast('辅助线至少需要两个点'); return; }
      commit((doc) => { doc.guides.push({ id: uid(), points: raw, visible: true } as Guide); });
      setPending(null);
      toast('已添加辅助线（不计入裁片）');
      return;
    }
    const pts = brushSmooth ? simplifyPoints(raw, 0.3) : raw;
    const m = currentMetrics();
    const endGap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) * m.scale;
    if (!pending.closePreview && endGap > 10) {
      setPending({ points: raw, closePreview: true });
      toast('轮廓未闭合：已显示首尾连接段，确认无误后再点「生成布片」');
      return;
    }
    const err = validatePiece(pts);
    if (err) { toast(err); return; }
    const piece = makePiece(pts, activeMaterialId, `布片 ${project.pieces.length + 1}`);
    if (project.technique === 'turned') piece.seamMm = 5;
    commit((doc) => { doc.pieces.push(piece); });
    setSelectedIds([piece.id]);
    setPending(null);
    setTool('select');
  };

  /* ---------- 变换（选中布片） ---------- */
  const transformSelected = (fn: (p: Piece) => Piece) => {
    commit((doc) => {
      doc.pieces = doc.pieces.map((p) => (selectedIds.includes(p.id) && !p.locked ? fn(p) : p));
    });
  };
  // 直接点击底部布料：有选中布片就立即填充；否则只切换画笔/填布工具当前布料。
  const selectMaterial = (materialId: string) => {
    setActiveMaterialId(materialId);
    const targets = selectedPieces.filter((p) => !p.locked && p.materialId !== materialId);
    if (!targets.length) return;
    const ids = new Set(targets.map((p) => p.id));
    commit((doc) => {
      doc.pieces.forEach((p) => { if (ids.has(p.id)) p.materialId = materialId; });
    });
  };
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

  /* ---------- 添加布片 ---------- */
  const addShape = (shape: Shape, w: number, h: number, label: string) => {
    const c = viewCenterWorld();
    const piece = makePiece(makeShape(shape, w, h, c.x, c.y), activeMaterialId, label);
    if (project.technique === 'turned') piece.seamMm = 5;
    commit((doc) => { doc.pieces.push(piece); });
    setSelectedIds([piece.id]); setTool('select'); setPanel(null);
  };
  const addCombo = (kind: 'quad' | 'pinwheel' | 'half', size: number) => {
    const c = viewCenterWorld();
    const gid = uid();
    const half = size / 2;
    const made: Piece[] = [];
    const mk = (points: Point[], mi: string, name: string) => { const p = makePiece(points, mi, name); p.groupId = gid; made.push(p); };
    const matIds = project.materials.map((m) => m.id);
    const nextMat = matIds[(matIds.indexOf(activeMaterialId) + 1) % matIds.length] || activeMaterialId;
    if (kind === 'quad') {
      const cells: Array<[number, number, string]> = [[-1, -1, activeMaterialId], [0, -1, nextMat], [-1, 0, nextMat], [0, 0, activeMaterialId]];
      cells.forEach(([gx, gy, mi], i) => mk([
        { x: c.x + gx * half, y: c.y + gy * half }, { x: c.x + (gx + 1) * half, y: c.y + gy * half },
        { x: c.x + (gx + 1) * half, y: c.y + (gy + 1) * half }, { x: c.x + gx * half, y: c.y + (gy + 1) * half },
      ], mi, `四方块 ${i + 1}`));
    } else if (kind === 'pinwheel') {
      for (let i = 0; i < 4; i++) {
        const rot = (base: Point[]) => transformPoints(base, 'rotate', i * 90);
        mk(rot([{ x: c.x, y: c.y }, { x: c.x + half, y: c.y - half }, { x: c.x + half, y: c.y }]), i % 2 ? nextMat : activeMaterialId, `风车 ${i + 1}`);
      }
    } else {
      mk([{ x: c.x - half, y: c.y - half }, { x: c.x + half, y: c.y - half }, { x: c.x - half, y: c.y + half }], activeMaterialId, '半方三角 A');
      mk([{ x: c.x + half, y: c.y - half }, { x: c.x + half, y: c.y + half }, { x: c.x - half, y: c.y + half }], nextMat, '半方三角 B');
    }
    commit((doc) => { doc.pieces.push(...made); });
    setSelectedIds(made.map((p) => p.id)); setTool('select'); setPanel(null);
  };
  const addTemplate = (t: Template, w: number, h: number) => {
    const b = pointBounds(t.points);
    const c = viewCenterWorld();
    const sx = w / Math.max(1, b.width), sy = h / Math.max(1, b.height);
    const pts = t.points.map((p) => ({ x: c.x - w / 2 + (p.x - b.x) * sx, y: c.y - h / 2 + (p.y - b.y) * sy }));
    const piece = makePiece(pts, activeMaterialId, t.name);
    commit((doc) => { doc.pieces.push(piece); });
    setSelectedIds([piece.id]); setTool('select'); setPanel(null);
  };
  const saveAsTemplate = () => {
    if (!single) return;
    const b = pointBounds(single.points);
    const t: Template = { name: single.name, points: single.points.map((p) => ({ x: p.x - b.x, y: p.y - b.y })) };
    const next = [...templates, t].slice(-24);
    setTemplates(next);
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next)); } catch { /* 忽略 */ }
    toast('已存入「我的布片」');
  };

  /* ---------- 保存 / 打开 / 新建 ---------- */
  const renderClean = (widthPx: number): Promise<Blob | null> => new Promise((resolve) => {
    const c = document.createElement('canvas');
    const hPx = Math.max(60, Math.round((widthPx * project.heightMm) / project.widthMm));
    c.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthPx}px;height:${hPx}px;`;
    document.body.appendChild(c);
    requestAnimationFrame(() => {
      drawScene(c, project, { zoom: 1, panX: 0, panY: 0 }, { selectedIds: [], draft: [], draftClosed: false, nodeMode: false, images: imagesRef.current, clean: true, showNumbers: true });
      c.toBlob((b) => { document.body.removeChild(c); resolve(b); }, 'image/png');
    });
  });
  const doSave = async () => {
    const name = (saveName || project.name || '未命名拼布').trim();
    let coverAssetId = project.coverAssetId;
    try {
      const blob = await renderClean(640);
      if (blob) coverAssetId = await putAsset(blob);
    } catch { /* 封面失败不阻塞保存 */ }
    const saved: PatchworkProject = { ...project, name, coverAssetId, revision: project.revision + 1 };
    setProject(saved);
    saveDraft(saved, saved.id);
    savedJson.current = JSON.stringify(docOf(saved));
    const entry: IndexEntry = { id: saved.id, name, updatedAt: Date.now(), widthMm: saved.widthMm, heightMm: saved.heightMm, technique: saved.technique };
    const list = [entry, ...readIndex().filter((x) => x.id !== saved.id)];
    writeIndex(list); setIndexList(list);
    setPanel(null);
    toast('已保存到本地作品（云端保存待 API 支持拼布类型）');
  };
  const openProject = (id: string) => {
    const raw = readDraft(id) as PatchworkProject | null;
    if (!raw || raw.kind !== 'patchwork') { toast('作品数据不存在或已损坏'); return; }
    setProject({ ...makeProject(), ...raw });
    setPast([]); setFuture([]); setSelectedIds([]); setNodeMode(false); setCandidates(null);
    savedJson.current = JSON.stringify(docOf({ ...makeProject(), ...raw }));
    setPanel(null);
    toast('已打开作品');
  };
  const newProject = () => {
    const fresh = makeProject();
    setProject(fresh);
    setPast([]); setFuture([]); setSelectedIds([]); setNodeMode(false); setCandidates(null);
    savedJson.current = JSON.stringify(docOf(fresh));
    setPanel(null);
  };
  const deleteProject = (id: string) => {
    try { localStorage.removeItem(`qiaoqiaole:patchwork:${id}`); } catch { /* 忽略 */ }
    const list = readIndex().filter((x) => x.id !== id);
    writeIndex(list); setIndexList(list);
  };
  const leave = () => { if (dirty) setPanel('leave'); else navigate('/'); };

  /* ---------- 图片导入 ---------- */
  const getWorker = () => {
    if (!workerRef.current) workerRef.current = new Worker(new URL('./segmentation.worker.ts', import.meta.url), { type: 'module' });
    return workerRef.current;
  };
  const runAnalysis = (mode: SegmentMode, detailVal: 'simple' | 'standard' | 'fine', minMmVal: number, threshold: number) => {
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
      setCandidates(regions);
      setCandStats({ ignored: data.ignored + invalid, tooMany: data.tooMany });
      if (!regions.length) toast('未发现足够大的封闭区域；可切换「色块分区」、调高线条阈值或减小最小尺寸');
      else if (data.tooMany) toast('轮廓较多，仅显示前 100 个；建议降低精细度');
    };
    worker.onerror = () => {
      if (requestRef.current === reqId) { setAnalyzing(false); toast('图片处理失败，请换图重试'); }
    };
    worker.postMessage({
      requestId: reqId, rgba: a.rgba, width: a.width, height: a.height,
      mode, detail: detailVal, lineThreshold: threshold,
      minAreaPixels: Math.max(9, minMmVal * minMmVal * a.pxPerMm * a.pxPerMm),
    });
  };
  const cancelAnalysis = () => {
    requestRef.current++;
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    analysisRef.current = null;
    setAnalyzing(false); setCandidates(null); setCandStats(null);
    setImportName(''); setImportThumb(''); setPanel(null);
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
      const s = Math.min(project.widthMm / img.naturalWidth, project.heightMm / img.naturalHeight);
      const dispW = img.naturalWidth * s, dispH = img.naturalHeight * s;
      // 图片降采样到最多 640px，避免手机端对高分辨率照片做同步像素运算卡顿。
      const imageScale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
      const cw = Math.max(8, Math.round(img.naturalWidth * imageScale));
      const ch = Math.max(8, Math.round(img.naturalHeight * imageScale));
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const ctx = cv.getContext('2d', { willReadFrequently: true }); if (!ctx) { toast('图片解码失败'); return; }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      const data = ctx.getImageData(0, 0, cw, ch);
      analysisRef.current = {
        rgba: data.data, width: cw, height: ch, pxPerMm: Math.min(cw / dispW, ch / dispH),
        offsetX: (project.widthMm - dispW) / 2, offsetY: (project.heightMm - dispH) / 2,
      };
      setImportName(file.name);
      setImportThumb(cv.toDataURL('image/jpeg', 0.8));
      setPanel('import');
      runAnalysis(segmentMode, detail, minMm, lineThreshold);
    } catch { toast('图片解码失败，请换一张图片'); }
    finally { URL.revokeObjectURL(url); }
  };
  const confirmImport = () => {
    if (!candidates) return;
    const included = candidates.filter((c) => !c.excluded);
    if (!included.length) { toast('没有可导入的分区'); return; }
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
        const piece = makePiece(c.points, matFor(segmentMode === 'line' ? '#fdfcf8' : c.color), `线稿布片 ${++n}`);
        if (c.grouped) piece.groupId = 'import-group';
        if (project.technique === 'turned') piece.seamMm = 5;
        doc.pieces.push(piece);
      });
    });
    const count = included.filter((c) => !c.asGuide).length;
    analysisRef.current = null;
    setCandidates(null); setCandStats(null); setImportThumb(''); setImportName('');
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

  const openImportChooser = () => { setPanel('import'); };

  return (
    <main className="patchwork-page">
      <header className="patchwork-top canvas-topbar">
        <div className="topbar-left">
          <button className="top-icon-btn" aria-label="返回" onClick={leave}><ArrowLeft /></button>
          <button className="top-icon-btn" aria-label="底布与项目设置" onClick={() => setPanel('base')}><Settings /></button>
        </div>
        <div className="topbar-center">
          <button className="patchwork-sizebtn" aria-label="作品尺寸" onClick={() => setPanel('base')}>{fmtCm(project.widthMm)} × {fmtCm(project.heightMm)} cm<ChevronDown /></button>
          <button className="top-icon-btn" aria-label="撤销" disabled={!past.length} onClick={undo}><Undo2 /></button>
          <button className="top-icon-btn" aria-label="重做" disabled={!future.length} onClick={redo}><Redo2 /></button>
        </div>
        <div className="topbar-right">
          <button className="patchwork-topbtn" aria-label="导入图片" onClick={openImportChooser}><Upload /><span>导入</span></button>
          <button className="patchwork-topbtn" aria-label="导出" onClick={() => setPanel('export')}><Download /><span>导出</span></button>
          <button className="patchwork-topbtn" aria-label="我的拼布作品" onClick={() => { setIndexList(readIndex()); setPanel('open'); }}><FolderOpen /><span>作品</span></button>
          <button className="patchwork-savebtn" aria-label="保存" onClick={() => { setSaveName(project.name); setPanel('save'); }}><Check />保存</button>
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

          {tool === 'brush' && !pending && (
            <div className="patchwork-hintpill">在画布上画一圈，松手后确认生成</div>
          )}
          {tool === 'fill' && !pending && (
            <div className="patchwork-fillbar">
              <span>选布片后点底部布料，或点画布直接填充</span>
              <button onClick={() => setPanel('fill')}>高级设置</button>
            </div>
          )}

          {pending && (
            <div className="patchwork-dlg" role="dialog" aria-label="闭合轮廓">
              <header><strong>闭合轮廓</strong>
                <button aria-label="取消绘制" onClick={() => setPending(null)}><X /></button>
              </header>
              <label className="pw-radio"><input type="radio" name="dlgmode" checked={dlgMode === 'piece'} onChange={() => setDlgMode('piece')} />生成布片</label>
              <label className="pw-radio"><input type="radio" name="dlgmode" checked={dlgMode === 'guide'} onChange={() => setDlgMode('guide')} />辅助线</label>
              <div className="pw-switchrow"><span>吸附闭合<small>确认时连接首尾成闭合轮廓</small></span>
                <input type="checkbox" className="patchwork-switch" checked={dlgSnap} onChange={(e) => { setDlgSnap(e.target.checked); setPending((p) => (p ? { ...p, closePreview: e.target.checked } : p)); }} />
              </div>
              <div className="pw-switchrow"><span>平滑轮廓<small>生成时简化节点、保留拐角</small></span>
                <input type="checkbox" className="patchwork-switch" checked={brushSmooth} onChange={(e) => setBrushSmooth(e.target.checked)} />
              </div>
              <div className="patchwork-actions">
                <button onClick={() => { strokeRef.current = pending.points; setPending(null); toast('继续在画布上补画'); }}>继续绘制</button>
                <button onClick={() => setPending(null)}>取消</button>
                <button className="primary" onClick={() => finishPending(dlgMode === 'guide')}>确认</button>
              </div>
            </div>
          )}

          {!pending && nodeMode && single && (
            <div className="patchwork-floating">
              <strong>节点编辑 · {single.name}</strong>
              <button onClick={deleteNode}>删除节点</button>
              <span className="patchwork-hint">点边可加节点，拖动节点调整</span>
              <button className="primary" onClick={() => { setNodeMode(false); setNodeIndex(null); }}>完成</button>
            </div>
          )}

          {!pending && !nodeMode && selectedPieces.length > 0 && tool === 'select' && (() => {
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
        {project.materials.map((m) => (
          <button key={m.id} className={activeMaterialId === m.id ? 'selected' : ''}
            aria-label={`布料 ${m.id} ${m.name}`} title={`${m.id} · ${m.name}${m.assetId && !m.calibrated ? '（未校准，仅效果参考）' : ''}`}
            onClick={() => selectMaterial(m.id)}
            onContextMenu={(e) => { e.preventDefault(); setEditingMat(m.id); setPanel('materials'); }}>
            <MatSwatch m={m} />
            <span className="pw-label">{m.id}</span>
          </button>
        ))}
        <button className="pw-addtile" aria-label="管理布料" onClick={() => setPanel('materials')}>
          <span className="pw-swatch pw-dashed"><Plus /></span>
          <span className="pw-label">添加</span>
        </button>
        <span className="patchwork-count">{project.pieces.length} 片</span>
      </footer>

      {message && <button className="patchwork-toast" role="status" onClick={() => setMessage('')}>{message} ×</button>}

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onImportFile(f); }} />
      <input ref={fabricFileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
        const f = e.target.files?.[0]; e.target.value = '';
        if (!f) return;
        void (async () => {
          const assetId = await putAsset(f);
          const seq = nextMatSeq(project.materials);
          const mat: Material = { id: `M${seq}`, name: `上传布料 ${seq}`, color: '#d9c8a9', assetId, calibrated: false };
          commit((doc) => { doc.materials.push(mat); });
          setActiveMaterialId(mat.id); setEditingMat(mat.id); setPanel('materials');
          toast('布料照片已上传，请设置样本实际宽度完成校准');
        })();
      }} />

      {panel && (
        <div className={`patchwork-overlay ${(panel === 'fill' || panel === 'import') ? 'nonmodal' : ''}`} onClick={() => setPanel(null)}>
          <section role="dialog" aria-modal={panel !== 'import' && panel !== 'fill'} className="patchwork-panel" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>{{ base: '底布与项目设置', add: '添加布片', fill: '填布', layers: '图层', materials: '项目布料', export: '图纸导出', import: '导入图片', save: '保存拼布', open: '我的拼布作品', props: '布片属性', leave: '离开编辑器' }[panel]}</strong>
              <button aria-label="关闭面板" onClick={() => panel === 'import' ? cancelAnalysis() : setPanel(null)}><X /></button>
            </header>

            {panel === 'base' && baseForm && (
              <div className="patchwork-form">
                <label>项目名称<input value={baseForm.name} onChange={(e) => setBaseForm({ ...baseForm, name: e.target.value })} /></label>
                <label>创作工艺<select value={baseForm.technique} onChange={(e) => setBaseForm({ ...baseForm, technique: e.target.value as Technique })}>
                  <option value="raw">贴布缝·毛边（默认）</option><option value="turned">贴布缝·折边</option><option value="pieced">几何拼接</option>
                </select></label>
                <label>底布宽度 (cm)<input type="number" min={2} max={300} step={1} value={baseForm.w / 10} onChange={(e) => setBaseForm({ ...baseForm, w: Math.round((Number(e.target.value) || 2) * 10) })} /></label>
                <label>底布高度 (cm)<input type="number" min={2} max={300} step={1} value={baseForm.h / 10} onChange={(e) => setBaseForm({ ...baseForm, h: Math.round((Number(e.target.value) || 2) * 10) })} /></label>
                <label>底布材料<select value={baseForm.materialId} onChange={(e) => setBaseForm({ ...baseForm, materialId: e.target.value })}>
                  {project.materials.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
                </select></label>
                <label className="patchwork-check"><input type="checkbox" className="patchwork-switch" checked={baseForm.include} onChange={(e) => setBaseForm({ ...baseForm, include: e.target.checked })} />底布参与制作（计入裁片清单）</label>
                <label className="patchwork-check"><input type="checkbox" className="patchwork-switch" checked={baseForm.locked} onChange={(e) => setBaseForm({ ...baseForm, locked: e.target.checked })} />锁定底布</label>
                <label className="patchwork-check"><input type="checkbox" checked={baseForm.scaleDesign} onChange={(e) => setBaseForm({ ...baseForm, scaleDesign: e.target.checked })} />改尺寸时同比缩放已有设计（默认只改工作区）</label>
                <div className="patchwork-actions"><button onClick={() => setPanel(null)}>取消</button><button className="primary" onClick={applyBase}>应用设置</button></div>
              </div>
            )}

            {panel === 'import' && (
              <div className="patchwork-form patchwork-import">
                <p className="patchwork-hint">上传插画、黑白线稿或照片，自动提取封闭轮廓。确认后生成可选中、可编辑、可填布的 Canvas 布片。</p>
                <div className="patchwork-import-actions">
                  <button className="primary" onClick={() => { importModeRef.current = 'partition'; fileRef.current?.click(); }}>
                    <Upload />{importName ? '换一张图片' : '选择图片生成线稿'}
                  </button>
                  <button onClick={() => { importModeRef.current = 'reference'; fileRef.current?.click(); }}>仅作为参考图</button>
                </div>
                {analysisRef.current && (
                  <>
                    <div className="patchwork-import-source">
                      {importThumb && <img src={importThumb} alt="导入图片原图缩略预览" />}
                      <div><strong>{importName}</strong><small>已按比例放入底布中央，可在画布上预览线稿</small></div>
                    </div>
                    <div className="patchwork-seg" aria-label="轮廓识别方式">
                      <button className={segmentMode === 'line' ? 'on' : ''} onClick={() => { setSegmentMode('line'); runAnalysis('line', detail, minMm, lineThreshold); }}>轮廓线稿</button>
                      <button className={segmentMode === 'color' ? 'on' : ''} onClick={() => { setSegmentMode('color'); runAnalysis('color', detail, minMm, lineThreshold); }}>色块分区</button>
                    </div>
                    <div className="patchwork-import-config">
                      <label>轮廓细节
                        <select value={detail} onChange={(e) => {
                          const value = e.target.value as typeof detail;
                          setDetail(value); runAnalysis(segmentMode, value, minMm, lineThreshold);
                        }}>
                          <option value="simple">简洁</option><option value="standard">标准</option><option value="fine">精细</option>
                        </select>
                      </label>
                      <label>最小布片 (mm)
                        <input type="number" min={1} max={80} value={minMm} onChange={(e) => setMinMm(clamp(Number(e.target.value) || 1, 1, 80))} />
                      </label>
                    </div>
                    {segmentMode === 'line' && (
                      <label className="patchwork-threshold">
                        <span>线条敏感度 <strong>{lineThreshold}</strong></span>
                        <input type="range" min={90} max={220} step={5} value={lineThreshold}
                          onChange={(e) => setLineThreshold(Number(e.target.value))}
                          onPointerUp={(e) => runAnalysis(segmentMode, detail, minMm, Number((e.target as HTMLInputElement).value))}
                          onKeyUp={(e) => runAnalysis(segmentMode, detail, minMm, Number((e.target as HTMLInputElement).value))} />
                      </label>
                    )}
                    <button className="patchwork-chip" onClick={() => runAnalysis(segmentMode, detail, minMm, lineThreshold)} disabled={analyzing}>
                      <RefreshCw />{analyzing ? '正在识别轮廓…' : '按当前参数重新识别'}
                    </button>
                    {analyzing && <p className="patchwork-hint" role="status">正在识别封闭区域，请稍候…</p>}
                    {!analyzing && candidates && (
                      <>
                        <div className="patchwork-import-summary">
                          <strong>识别到 {candidates.filter((c) => !c.excluded).length} 个封闭区域</strong>
                          <span>{candStats?.ignored ? ('过滤 ' + candStats.ignored + ' 个背景/小区域') : '可点击画布或列表选择区域'}</span>
                        </div>
                        {candidates.length === 0 && <p className="patchwork-hint">该图片暂未识别到封闭图形。黑白线稿可提高敏感度、减小最小布片；照片建议试试「色块分区」。</p>}
                        {candidates.some((c) => c.hasHoles && !c.excluded) && <p className="patchwork-warning">检测到带孔洞的区域：当前只生成外边界，内孔需导入后手动修整。</p>}
                        {candStats?.tooMany && <p className="patchwork-warning">区域过多，只展示面积最大的前 100 个。可降低细节精度。</p>}
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
                        <p className="patchwork-hint">画布显示的是轮廓预览。导入后点击某个布片，再选底部布料即可直接填充。</p>
                        <div className="patchwork-import-footer">
                          <button onClick={cancelAnalysis}>取消</button>
                          <button onClick={mergeCandidates} disabled={candidates.filter((c) => c.chosen && !c.excluded).length < 2}>合并选中</button>
                          <button className="primary" disabled={!candidates.some((c) => !c.excluded)} onClick={confirmImport}>
                            <Check />生成 {candidates.filter((c) => !c.excluded && !c.asGuide).length} 块布片
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {panel === 'add' && (
              <div className="patchwork-form">
                <div className="patchwork-row">
                  <label>宽 (mm)<input type="number" min={5} max={2000} value={shapeW} onChange={(e) => setShapeW(Number(e.target.value) || 5)} /></label>
                  <label>高 (mm)<input type="number" min={5} max={2000} value={shapeH} onChange={(e) => setShapeH(Number(e.target.value) || 5)} /></label>
                </div>
                <div className="pw-tabs">
                  {([['base', '基础形状'], ['flora', '花叶'], ['combo', '组合拼块'], ['mine', '我的布片']] as const).map(([k, label]) => (
                    <button key={k} className={addTab === k ? 'on' : ''} onClick={() => setAddTab(k)}>{label}</button>
                  ))}
                </div>
                {addTab === 'base' && (
                  <div className="patchwork-shapes">
                    {([['rect', '正方形', Square], ['circle', '圆形', Circle], ['triangle', '三角形', Triangle], ['diamond', '菱形', Diamond], ['hexagon', '六边形', Hexagon]] as Array<[Shape, string, typeof Square]>).map(([s2, label, Icon]) => (
                      <button key={s2} onClick={() => addShape(s2, shapeW, shapeH, label)}><Icon className="pw-glyph" /><span>{label}</span><small>{s2 === 'circle' ? `Ø${shapeW}` : `${shapeW}×${shapeH}`} mm</small></button>
                    ))}
                  </div>
                )}
                {addTab === 'flora' && (
                  <div className="patchwork-shapes">
                    {([['petal', '花瓣', Flower2], ['leaf', '叶片', Leaf], ['star', '星形', Star]] as Array<[Shape, string, typeof Flower2]>).map(([s2, label, Icon]) => (
                      <button key={s2} onClick={() => addShape(s2, shapeW, shapeH, label)}><Icon className="pw-glyph" /><span>{label}</span><small>{shapeW}×{shapeH} mm</small></button>
                    ))}
                  </div>
                )}
                {addTab === 'combo' && (
                  <>
                    <div className="patchwork-shapes">
                      <button onClick={() => addCombo('quad', Math.min(shapeW, shapeH))}><LayoutGrid className="pw-glyph" /><span>四方拼块</span><small>4 片 · 自动成组</small></button>
                      <button onClick={() => addCombo('pinwheel', Math.min(shapeW, shapeH))}><RefreshCw className="pw-glyph" /><span>风车组合</span><small>4 片 · 自动成组</small></button>
                      <button onClick={() => addCombo('half', Math.min(shapeW, shapeH))}><Triangle className="pw-glyph" /><span>半方三角</span><small>2 片 · 自动成组</small></button>
                    </div>
                    <p className="patchwork-hint">组合块保留子布片，解组后可逐片编辑。</p>
                  </>
                )}
                {addTab === 'mine' && (
                  <>
                    {templates.length === 0 && <p className="patchwork-hint">选中布片后在「属性」里点“存为我的布片”，会保存在这里。</p>}
                    <div className="patchwork-shapes">
                      {templates.map((t, i) => <button key={i} onClick={() => addTemplate(t, shapeW, shapeH)}><Shapes className="pw-glyph" /><span>{t.name}</span><small>按上方宽高放入</small></button>)}
                    </div>
                  </>
                )}
              </div>
            )}

            {panel === 'fill' && (
              <div className="patchwork-form">
                <div className="patchwork-seg">
                  <button className={fillScope === 'single' ? 'on' : ''} onClick={() => setFillScope('single')}>选中布片</button>
                  <button className={fillScope === 'same' ? 'on' : ''} onClick={() => setFillScope('same')}>同布料全部</button>
                  <button className={fillScope === 'all' ? 'on' : ''} onClick={() => setFillScope('all')}>全部布片</button>
                </div>
                <button className={`patchwork-chip ${fillPick ? 'on' : ''}`} onClick={() => setFillPick((v) => !v)}>吸取：点画布上的布片取它的布料</button>
                <p className="patchwork-hint">当前布料：{activeMaterialId}。选中布片后点底部布料会立即替换；这里的范围设置仅作用于填布工具点击画布时。</p>
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
                      <svg className="pw-thumb" viewBox="0 0 24 24" aria-hidden="true"><polygon points={thumbPoints(p)} fill={project.materials.find((m) => m.id === p.materialId)?.color || '#ccc'} stroke="rgba(0,0,0,.15)" /></svg>
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

            {panel === 'materials' && (
              <div className="patchwork-form">
                {project.materials.map((m) => {
                  const refs = project.pieces.filter((p) => p.materialId === m.id).length + (project.base.materialId === m.id ? 1 : 0);
                  const editing = editingMat === m.id;
                  return (
                    <div key={m.id} className="patchwork-matrow">
                      <span className="patchwork-chip-color" style={{ background: m.color }} />
                      <button className="patchwork-layer-name" onClick={() => setActiveMaterialId(m.id)}>{m.id} · {m.name}</button>
                      <span className="patchwork-hint">{m.assetId ? (m.calibrated ? '已校准' : '未校准·仅效果参考') : '纯色'} · 引用 {refs}</span>
                      <button onClick={() => { setEditingMat(editing ? null : m.id); setReplaceWith(project.materials.find((x) => x.id !== m.id)?.id || ''); }}>{editing ? '收起' : '编辑'}</button>
                      {editing && (
                        <div className="patchwork-matedit">
                          <label>名称<input defaultValue={m.name} id={`mat-name-${m.id}`} /></label>
                          {!m.assetId && <label>颜色<input type="color" defaultValue={m.color} id={`mat-color-${m.id}`} /></label>}
                          {m.assetId && <label>样本实际宽度 (mm，校准用)<input type="number" min={0} defaultValue={m.sampleWidthMm || 0} id={`mat-sample-${m.id}`} /></label>}
                          <div className="patchwork-actions">
                            <button className="primary" onClick={() => {
                              const name = (document.getElementById(`mat-name-${m.id}`) as HTMLInputElement)?.value || m.name;
                              const colorEl = document.getElementById(`mat-color-${m.id}`) as HTMLInputElement | null;
                              const sampleEl = document.getElementById(`mat-sample-${m.id}`) as HTMLInputElement | null;
                              commit((doc) => { const t = doc.materials.find((x) => x.id === m.id); if (t) { t.name = name; if (colorEl) t.color = colorEl.value; if (sampleEl) { const v = Number(sampleEl.value); t.sampleWidthMm = v > 0 ? v : undefined; t.calibrated = v > 0; } } });
                              setEditingMat(null);
                            }}>保存布料</button>
                          </div>
                          {refs > 0 && (
                            <label>被引用时删除需替换为<select value={replaceWith} onChange={(e) => setReplaceWith(e.target.value)}>
                              {project.materials.filter((x) => x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{x.id} · {x.name}</option>)}
                            </select></label>
                          )}
                          <button className="danger" onClick={() => {
                            if (refs > 0 && !replaceWith) { toast('该布料仍被引用，请先选择替换布料'); return; }
                            openConfirm({
                              title: '删除布料',
                              message: refs > 0 ? `「${m.id} · ${m.name}」正被 ${refs} 处引用，删除后将替换为「${replaceWith}」。确定删除吗？` : `确定删除布料「${m.id} · ${m.name}」吗？`,
                              confirmText: '删除',
                              danger: true,
                              onConfirm: () => {
                                commit((doc) => {
                                  if (refs > 0) { doc.pieces.forEach((p) => { if (p.materialId === m.id) p.materialId = replaceWith; }); if (doc.base.materialId === m.id) doc.base.materialId = replaceWith; }
                                  doc.materials = doc.materials.filter((x) => x.id !== m.id);
                                });
                                if (activeMaterialId === m.id) setActiveMaterialId(replaceWith || 'A');
                                setEditingMat(null);
                              },
                            });
                          }}>删除布料</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="patchwork-actions">
                  <button onClick={() => {
                    const seq = nextMatSeq(project.materials);
                    const mat: Material = { id: `M${seq}`, name: `新布料 ${seq}`, color: '#b7c9a8' };
                    commit((doc) => { doc.materials.push(mat); });
                    setActiveMaterialId(mat.id); setEditingMat(mat.id);
                  }}><Plus />新增纯色布料</button>
                  <button onClick={() => fabricFileRef.current?.click()}><Upload />上传布料照片</button>
                </div>
                <p className="patchwork-hint">布料编号（A/B/C…）用于材料清单，布片编号用于几何，两者分开。长按底部布料块也可直接编辑。</p>
              </div>
            )}

            {panel === 'export' && (
              <div className="patchwork-form">
                <div className="pw-tabs">
                  <button className={expTab === 'list' ? 'on' : ''} onClick={() => setExpTab('list')}>裁片清单</button>
                  <button className={expTab === 'preview' ? 'on' : ''} onClick={() => { setExpTab('preview'); void renderClean(900).then((b) => { if (b) setExpUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(b); }); }); }}>打印预览</button>
                </div>
                {expTab === 'preview' ? (
                  <>
                    {expUrl ? <img className="pw-preview" src={expUrl} alt="拼布预览图" /> : <p className="patchwork-hint">正在生成预览…</p>}
                    <p className="patchwork-hint">预览为效果图；真正打印请导出 PDF 并以 100% 打印、用 50×50mm 校准框核对。</p>
                    <div className="patchwork-actions">
                      <button onClick={exportPng}><Download />下载 PNG</button>
                    </div>
                  </>
                ) : (
                  <>
                    {issues.length > 0
                      ? <div className="patchwork-issues">{issues.map((t, i) => <div key={i}>· {t}</div>)}</div>
                      : <div className="patchwork-ok">导出前校验通过：{list.length} 片可裁布片（相同裁片已合并计数）。</div>}
                    <label>工艺<select value={project.technique} onChange={(e) => commit((doc) => { doc.technique = e.target.value as Technique; })}>
                      <option value="raw">贴布缝 · 毛边（缝份 0）</option>
                      <option value="turned">贴布缝 · 折边（带折边量）</option>
                      <option value="pieced">几何拼接（等距外扩 7mm 参考）</option>
                    </select></label>
                    <label className="patchwork-check"><input type="checkbox" className="patchwork-switch" checked={includeHidden} onChange={(e) => setIncludeHidden(e.target.checked)} />清单与 PDF 包含隐藏布片</label>
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
                              <svg className="pw-thumb" viewBox="0 0 24 24" aria-hidden="true"><polygon points={thumbPoints(p)} fill={project.materials.find((m) => m.id === p.materialId)?.color || '#ccc'} stroke="rgba(0,0,0,.15)" /></svg>
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
                    <label>纸张<select value={paper} onChange={(e) => setPaper(e.target.value as 'A4' | 'Letter')}>
                      <option value="A4">A4 · 100% 打印 · 含校准方框</option>
                      <option value="Letter">Letter · 100% 打印 · 含校准方框</option>
                    </select></label>
                    <button className="primary pw-exportbtn" onClick={() => exportPdf(paper, includeHidden)}>导出 PDF</button>
                    <div className="patchwork-actions">
                      <button onClick={exportPng}><Download />预览 PNG</button>
                    </div>
                  </>
                )}
              </div>
            )}
            {panel === 'props' && single && geo && (
              <div className="patchwork-form pw-props">
                <div className="pw-grid">
                  <label className="pw-span2">名称<input value={single.name}
                    onFocus={() => { if (!nameOrig.current) nameOrig.current = cloneDocument(docOf(project)); }}
                    onChange={(e) => { const v = e.target.value; const pid = single.id; setProject((cur) => ({ ...cur, pieces: cur.pieces.map((p) => (p.id === pid ? { ...p, name: v } : p)) })); }}
                    onBlur={() => { const o = nameOrig.current; nameOrig.current = null; if (o && (o.pieces as Piece[]).find((p) => p.id === single.id)?.name !== single.name) commitFrom(o); }} /></label>
                  <label className="pw-span2">布料<select value={single.materialId} onChange={(e) => { geoCommit(); const mid = e.target.value; commit((doc) => { const t = doc.pieces.find((x) => x.id === single.id); if (t) t.materialId = mid; }); }}>
                    {project.materials.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
                  </select></label>
                  <label>X (mm)<input type="number" step="0.5" value={geo.x} onChange={(e) => geoChange({ x: Number(e.target.value) || 0 })} onBlur={geoCommit} /></label>
                  <label>Y (mm)<input type="number" step="0.5" value={geo.y} onChange={(e) => geoChange({ y: Number(e.target.value) || 0 })} onBlur={geoCommit} /></label>
                  <label>宽 (mm)<input type="number" step="0.5" min={1} value={geo.w} onChange={(e) => geoChange({ w: Number(e.target.value) || 0 })} onBlur={geoCommit} /></label>
                  <label>高 (mm)<input type="number" step="0.5" min={1} value={geo.h} onChange={(e) => geoChange({ h: Number(e.target.value) || 0 })} onBlur={geoCommit} /></label>
                  <label>再旋转 (°)<input type="number" step="1" value={geo.angle} onChange={(e) => geoChange({ angle: Number(e.target.value) || 0 })} onBlur={geoCommit} /></label>
                  <label>缝份 (mm)<input type="number" step="0.5" min={0} value={geo.seam} onChange={(e) => geoChange({ seam: Number(e.target.value) || 0 })} onBlur={geoCommit} /></label>
                </div>
                <p className="patchwork-hint">改完即生效，数字以毫米为准、就是实际裁布尺寸；每个字段记一条撤销。</p>
                <button type="button" className="pw-widebtn" onClick={saveAsTemplate}>存为我的布片</button>
              </div>
            )}
            {panel === 'leave' && (
              <div className="patchwork-form">
                <p>当前作品有未保存的改动（本地草稿已自动保留）。</p>
                <div className="patchwork-actions">
                  <button className="primary" onClick={() => { void doSave().then(() => navigate('/')); }}>保存并离开</button>
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
