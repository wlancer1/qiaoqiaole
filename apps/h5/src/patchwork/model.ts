import { newPatchworkId } from './ids';
import type { StitchStyle, OutlineStitch, ShapePaint } from './stitches';

/** 拼布的所有几何数据以毫米为单位，和拼豆格子完全独立。 */
export type Point = { x: number; y: number };
export type Technique = 'raw' | 'turned' | 'pieced';
export type Shape =
  | 'rect' | 'circle' | 'triangle' | 'diamond' | 'hexagon' | 'petal' | 'leaf' | 'star'
  | 'rounded-rect' | 'right-triangle' | 'trapezoid' | 'parallelogram'
  | 'pentagon' | 'octagon' | 'half-hexagon' | 'kite'
  | 'semicircle' | 'quarter-circle' | 'sector' | 'arch'
  | 'arrow' | 'chevron' | 'house' | 'cross'
  | 'heart' | 'flower' | 'teardrop' | 'crescent'
  | 'oval' | 'cloud' | 'butterfly' | 'bow-tie' | 'tulip' | 'maple-leaf'
  | 'shell' | 'wave' | 'fish' | 'shield' | 'bookmark' | 'four-leaf'
  | 'scalene-triangle' | 'right-trapezoid' | 'heptagon' | 'decagon' | 'dodecagon'
  | 'l-shape' | 't-shape' | 'half-ring' | 'quarter-ring';
export type TextureTransform = { scale: number; rotation: number; offsetX: number; offsetY: number };
export type Material = {
  /** Explicit virtual material, excluded from real inventory. */
  projectOnly?: boolean;
  id: string;
  name: string;
  color: string;
  category?: string;
  inventoryFabricId?: string;
  presetId?: string;
  assetId?: string;
  assetPath?: string;
  sampleWidthMm?: number;
  calibrated?: boolean;
  texturePattern?: 'linen' | 'check' | 'stripe' | 'dot';
};
export type Piece = { stitch?: StitchStyle; outlineStitch?: OutlineStitch; paint?: ShapePaint; id: string; name: string; points: Point[]; materialId: string; locked: boolean; visible: boolean; groupId?: string; seamMm: number; texture: TextureTransform };
export type Guide = { id: string; points: Point[]; visible: boolean };
export type Reference = { assetId: string; assetPath?: string; opacity: number; x: number; y: number; width: number; height: number };
export type PatchworkProject = { schemaVersion: 1; id: string; kind: 'patchwork'; name: string; revision: number; technique: Technique; widthMm: number; heightMm: number; base: { materialId: string; locked: boolean; includeInCutList: boolean }; materials: Material[]; pieces: Piece[]; guides: Guide[]; reference?: Reference; coverAssetId?: string };
export type PatchworkDocument = Pick<PatchworkProject, 'name' | 'technique' | 'widthMm' | 'heightMm' | 'base' | 'materials' | 'pieces' | 'guides' | 'reference'>;
export const textureIdentity = (): TextureTransform => ({ scale: 1, rotation: 0, offsetX: 0, offsetY: 0 });
export const builtinMaterials: Material[] = [
  { id: 'A', name: '亚麻米白', color: '#f2e6d2' }, { id: 'B', name: '樱花粉', color: '#dc93a0' },
  { id: 'C', name: '鼠尾草绿', color: '#8eaaa0' }, { id: 'D', name: '雾霾蓝', color: '#7e9fbb' },
  { id: 'E', name: '杏仁黄', color: '#ebbf72' }, { id: 'F', name: '奶油紫', color: '#a99bc8' },
  { id: 'G', name: '暖橙', color: '#db8f61' }, { id: 'H', name: '深海蓝', color: '#42647f' },
];
export function makeProject(): PatchworkProject {
  return { schemaVersion: 1, id: newPatchworkId(), kind: 'patchwork', name: '未命名拼布', revision: 0, technique: 'raw', widthMm: 400, heightMm: 400,
    base: { materialId: 'A', locked: true, includeInCutList: true }, materials: builtinMaterials.map((m) => ({ ...m })), pieces: [], guides: [] };
}
export const cloneDocument = (d: PatchworkDocument): PatchworkDocument => JSON.parse(JSON.stringify(d)) as PatchworkDocument;
/** 清空画布内容，但保留底布、尺寸、材料和作品设置；调用方负责记录撤销历史。 */
export function clearCanvasContent(doc: PatchworkDocument): void {
  doc.pieces = [];
  doc.guides = [];
  doc.reference = undefined;
}
export function pointBounds(points: Point[]) {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
  const x = Math.min(...xs); const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
export function area(points: Point[]) {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
}
function cross(a: Point, b: Point, c: Point) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function onSegment(a: Point, b: Point, p: Point) { return Math.min(a.x, b.x) - 1e-8 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-8 && Math.min(a.y, b.y) - 1e-8 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-8; }
function segmentCross(a: Point, b: Point, c: Point, d: Point) {
  const a1 = cross(a, b, c), a2 = cross(a, b, d), b1 = cross(c, d, a), b2 = cross(c, d, b);
  if ((a1 > 1e-8 && a2 < -1e-8 || a1 < -1e-8 && a2 > 1e-8) && (b1 > 1e-8 && b2 < -1e-8 || b1 < -1e-8 && b2 > 1e-8)) return true;
  return (Math.abs(a1) < 1e-8 && onSegment(a, b, c)) || (Math.abs(a2) < 1e-8 && onSegment(a, b, d)) || (Math.abs(b1) < 1e-8 && onSegment(c, d, a)) || (Math.abs(b2) < 1e-8 && onSegment(c, d, b));
}
export function selfIntersects(points: Point[]) {
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (j === i + 1 || i === 0 && j === points.length - 1) continue;
    if (segmentCross(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])) return true;
  }
  return false;
}
export function validatePiece(points: Point[]) {
  if (points.length < 3) return '轮廓未闭合：请继续绘制或确认连接首尾';
  if (area(points) < .1) return '布片面积过小，无法生成有效裁片';
  if (selfIntersects(points)) return '轮廓发生自交，请修改交叉节点后重试';
  return '';
}
export function pointInPolygon(p: Point, points: Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
/** Sewing layers have their own sequence, so P numbers still match the cutting list. */
export function pieceLabel(pieces: Piece[], piece: Piece): string {
  const sequence = pieces.filter(p => Boolean(p.stitch) === Boolean(piece.stitch));
  return `${piece.stitch ? 'S' : 'P'}${sequence.findIndex(p => p.id === piece.id) + 1}`;
}
export function distanceToPath(p: Point, points: Point[]) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}
export function hitTest(p: Point, pieces: Piece[], tolerance = 5) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const piece = pieces[i]; if (!piece.visible || piece.locked) continue;
    if (piece.stitch) { if (distanceToPath(p, piece.points) <= tolerance) return piece.id; continue; }
    const b = pointBounds(piece.points);
    if (p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height && pointInPolygon(p, piece.points)) return piece.id;
  }
  return null;
}
export function transformPoints(points: Point[], type: 'mirrorX' | 'mirrorY' | 'rotate', degrees = 90) {
  const b = pointBounds(points); const cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = degrees * Math.PI / 180;
  return points.map((p) => { const dx = p.x - cx, dy = p.y - cy;
    if (type === 'mirrorX') return { x: cx - dx, y: p.y };
    if (type === 'mirrorY') return { x: p.x, y: cy - dy };
    return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
  });
}
export function makeShape(shape: Shape, width: number, height: number, cx: number, cy: number): Point[] {
  const x = cx - width / 2, y = cy - height / 2;
  const scale = (coords: number[][]) => coords.map(([px, py]) => ({ x: x + px * width, y: y + py * height }));
  if (shape === 'rect') return scale([[0,0],[1,0],[1,1],[0,1]]);
  if (shape === 'triangle') return scale([[.5,0],[1,1],[0,1]]);
  if (shape === 'diamond') return scale([[.5,0],[1,.5],[.5,1],[0,.5]]);
  if (shape === 'hexagon') return scale([[.25,0],[.75,0],[1,.5],[.75,1],[.25,1],[0,.5]]);

  // 单片裁片：返回可编辑的闭合多边形，避免用多片叠合/带孔图形制造无效裁剪轮廓。
  // 曲线用足够密的直线段近似，边界归一化后 width/height 始终对应实际外接框。
  const normalized = (coords: number[][]): Point[] => {
    const xs = coords.map((pt) => pt[0]), ys = coords.map((pt) => pt[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const spanX = Math.max(...xs) - minX, spanY = Math.max(...ys) - minY;
    return scale(coords.map(([px, py]) => [(px - minX) / spanX, (py - minY) / spanY]));
  };
  const arc = (steps: number, point: (t: number) => number[]): number[][] =>
    Array.from({ length: steps + 1 }, (_, i) => point(i / steps));
  const regular = (sides: number) => normalized(Array.from({ length: sides }, (_, i) => {
    const rad = -Math.PI / 2 + i * Math.PI * 2 / sides;
    return [Math.cos(rad), Math.sin(rad)];
  }));

  if (shape === 'rounded-rect') return scale(([
    [.78, .22, -Math.PI / 2], [.78, .78, 0], [.22, .78, Math.PI / 2], [.22, .22, Math.PI],
  ] as Array<[number, number, number]>).flatMap(([px, py, angle]) =>
    arc(7, (t) => [px + .22 * Math.cos(angle + t * Math.PI / 2), py + .22 * Math.sin(angle + t * Math.PI / 2)]
  )));
  if (shape === 'right-triangle') return scale([[0,0],[1,1],[0,1]]);
  if (shape === 'trapezoid') return scale([[.26,0],[.74,0],[1,1],[0,1]]);
  if (shape === 'parallelogram') return scale([[.28,0],[1,0],[.72,1],[0,1]]);
  if (shape === 'kite') return scale([[.5,0],[1,.37],[.5,1],[0,.37]]);
  if (shape === 'half-hexagon') return scale([[0,0],[.72,0],[1,.5],[.72,1],[0,1]]);
  if (shape === 'scalene-triangle') return scale([[.25,0],[1,1],[0,1]]);
  if (shape === 'right-trapezoid') return scale([[0,0],[.6,0],[1,1],[0,1]]);
  if (shape === 'heptagon') return regular(7);
  if (shape === 'decagon') return regular(10);
  if (shape === 'dodecagon') return regular(12);
  if (shape === 'l-shape') return scale([[0,0],[.35,0],[.35,.65],[1,.65],[1,1],[0,1]]);
  if (shape === 't-shape') return scale([[0,0],[1,0],[1,.35],[.675,.35],[.675,1],[.325,1],[.325,.35],[0,.35]]);
  // 开口圆环沿外弧前进、内弧返回，形成无孔且不自交的单片裁片。
  if (shape === 'half-ring' || shape === 'quarter-ring') {
    const sweep = shape === 'half-ring' ? Math.PI : Math.PI / 2;
    return normalized([
      ...arc(36, (t) => [Math.cos(t * sweep), -Math.sin(t * sweep)]),
      ...arc(36, (t) => [.55 * Math.cos((1 - t) * sweep), -.55 * Math.sin((1 - t) * sweep)]),
    ]);
  }
  if (shape === 'pentagon') return regular(5);
  if (shape === 'octagon') return regular(8);
  if (shape === 'oval') return normalized(arc(63, (t) => [Math.cos(t * Math.PI * 2), Math.sin(t * Math.PI * 2)]).slice(0, -1));
  if (shape === 'semicircle') return normalized([
    ...arc(36, (t) => [Math.cos(Math.PI * (1 - t)), -Math.sin(Math.PI * t)]),
  ]);
  if (shape === 'quarter-circle') return normalized([
    [0, 0], ...arc(24, (t) => [Math.cos(t * Math.PI / 2), Math.sin(t * Math.PI / 2)]),
  ]);
  if (shape === 'sector') return normalized([
    [0, 0], ...arc(32, (t) => [Math.cos(-.85 * Math.PI + t * .7 * Math.PI), Math.sin(-.85 * Math.PI + t * .7 * Math.PI)]),
  ]);
  if (shape === 'arch') return normalized([
    [0,1], [1,1], [1,.5], ...arc(36, (t) => [.5 + .5 * Math.cos(Math.PI * t), .5 - .5 * Math.sin(Math.PI * t)]).slice(1),
  ]);
  if (shape === 'arrow') return scale([[0,.32],[.56,.32],[.56,0],[1,.5],[.56,1],[.56,.68],[0,.68]]);
  if (shape === 'chevron') return scale([[0,0],[.53,.5],[0,1],[.38,1],[1,.5],[.38,0]]);
  if (shape === 'house') return scale([[0,.42],[.5,0],[1,.42],[1,1],[0,1]]);
  if (shape === 'cross') return scale([[.33,0],[.67,0],[.67,.33],[1,.33],[1,.67],[.67,.67],[.67,1],[.33,1],[.33,.67],[0,.67],[0,.33],[.33,.33]]);
  if (shape === 'heart') return normalized(Array.from({ length: 96 }, (_, i) => {
    const t = i * 2 * Math.PI / 96;
    return [16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
  }));
  if (shape === 'flower') return normalized(Array.from({ length: 96 }, (_, i) => {
    const t = i * 2 * Math.PI / 96, r = .32 + .17 * Math.cos(6 * t);
    return [Math.cos(t) * r, Math.sin(t) * r];
  }));
  if (shape === 'four-leaf') return normalized(Array.from({ length: 96 }, (_, i) => {
    const t = i * 2 * Math.PI / 96, r = .19 + .29 * Math.abs(Math.cos(2 * t));
    return [Math.cos(t) * r, Math.sin(t) * r];
  }));
  if (shape === 'teardrop') {
    const ts = Array.from({ length: 49 }, (_, i) => i / 48);
    const profile = (t: number) => Math.pow(Math.sin(Math.PI * t), .72) * (1.25 - .5 * t);
    return normalized([...ts.map((t) => [profile(t), t]), ...ts.slice(1, -1).reverse().map((t) => [-profile(t), t])]);
  }
  if (shape === 'crescent') return normalized([
    ...arc(48, (t) => [Math.cos(-Math.PI / 2 - t * Math.PI), Math.sin(-Math.PI / 2 - t * Math.PI)]),
    ...arc(47, (t) => [.55 + .32 * Math.sin(Math.PI * t), 1 - 2 * t]).slice(1, -1),
  ]);
  if (shape === 'cloud') return normalized([
    [0,.63], ...arc(56, (t) => [t, .35 - .22 * Math.abs(Math.sin(3 * Math.PI * t))]),
    [1,.63], [.88,.85], [.12,.85],
  ]);
  if (shape === 'wave') return normalized([
    ...arc(48, (t) => [t, .24 + .14 * Math.cos(4 * Math.PI * t)]),
    [1,1], [0,1],
  ]);
  if (shape === 'butterfly') return scale([
    [.5,.12],[.3,.04],[0,.12],[.07,.42],[0,.69],[.2,.92],[.5,.65],
    [.8,.92],[1,.69],[.93,.42],[1,.12],[.7,.04],
  ]);
  if (shape === 'bow-tie') return scale([[0,.1],[.48,.38],[.52,.38],[1,.1],[1,.9],[.52,.62],[.48,.62],[0,.9]]);
  if (shape === 'tulip') return scale([
    [.5,0],[.69,.20],[.92,.11],[.89,.5],[.76,.68],[.58,.74],[.55,1],[.45,1],
    [.42,.74],[.24,.68],[.11,.5],[.08,.11],[.31,.2],
  ]);
  if (shape === 'maple-leaf') return scale([
    [.5,0],[.62,.2],[.77,.10],[.76,.30],[.96,.29],[.82,.47],[1,.62],[.72,.65],
    [.74,.82],[.56,.76],[.55,1],[.45,1],[.44,.76],[.26,.82],[.28,.65],[0,.62],
    [.18,.47],[.04,.29],[.24,.30],[.23,.10],[.38,.20],
  ]);
  if (shape === 'shell') return normalized([
    [.20,1],[.80,1], ...arc(48, (t) => [1 - t, .83 - .70 * Math.sin(Math.PI * t) + .042 * Math.sin(10 * Math.PI * t)]),
  ]);
  if (shape === 'fish') return scale([
    [0,.5],[.22,.27],[.48,.12],[.77,.23],[1,.08],[.89,.50],
    [1,.92],[.77,.77],[.48,.88],[.22,.73],
  ]);
  if (shape === 'shield') return scale([[.5,0],[1,.18],[.94,.72],[.5,1],[.06,.72],[0,.18]]);
  if (shape === 'bookmark') return scale([[0,0],[1,0],[1,1],[.5,.72],[0,1]]);

  if (shape === 'petal' || shape === 'leaf') {
    // 纵向轮廓：花瓣上尖下圆（水滴），叶片两头尖、中间鼓（透镜）；旧公式画出来是沙漏/横向杏仁，已弃用
    const profile = (t: number) => (shape === 'leaf' ? Math.pow(Math.sin(Math.PI * t), 0.9) : Math.pow(Math.sin(Math.PI * Math.pow(t, 1.3)), 0.75));
    const steps = 18;
    const ts: number[] = [];
    for (let k = 0; k <= steps; k += 1) ts.push(k / steps);
    // 花瓣峰值在 t=(1/2)^(1/1.3)≈0.587，等距采样恰好错过，不补峰值点外框宽度会差约 0.3%
    if (shape === 'petal') { ts.push(Math.pow(0.5, 1 / 1.3)); ts.sort((a, b) => a - b); }
    const pts: Point[] = [];
    for (const t of ts) pts.push({ x: cx + (width / 2) * profile(t), y: cy - height / 2 + height * t });
    for (let i = ts.length - 2; i >= 1; i -= 1) { const t = ts[i]; pts.push({ x: cx - (width / 2) * profile(t), y: cy - height / 2 + height * t }); }
    return pts;
  }
  if (shape === 'star') return Array.from({ length: 10 }, (_, i) => {
    const t = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .23 : .5;
    return { x: cx + Math.cos(t) * width * r, y: cy + Math.sin(t) * height * r };
  });
  return Array.from({ length: 48 }, (_, i) => { const t = i * 2 * Math.PI / 48; return { x: cx + Math.cos(t) * width / 2, y: cy + Math.sin(t) * height / 2 }; });
}
export function makePiece(points: Point[], materialId = 'B', name = '新布片'): Piece {
  return { id: newPatchworkId(), name, points, materialId, locked: false, visible: true, seamMm: 0, texture: textureIdentity() };
}
export function simplifyPoints(points: Point[], threshold: number) {
  if (points.length < 4) return points;
  const result: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], q = result[result.length - 1];
    if (Math.hypot(p.x - q.x, p.y - q.y) >= threshold) result.push(p);
  }
  result.push(points[points.length - 1]);
  return result;
}
export function isConcave(points: Point[]) {
  let positive = false, negative = false;
  for (let i = 0; i < points.length; i++) {
    const v = cross(points[i], points[(i + 1) % points.length], points[(i + 2) % points.length]);
    if (v > 1e-6) positive = true; if (v < -1e-6) negative = true;
  }
  return positive && negative;
}
export function exportIssues(project: PatchworkProject) {
  const issues: string[] = [];
  for (const piece of project.pieces) {
    if (piece.stitch) continue;
    const issue = validatePiece(piece.points);
    if (issue) issues.push(`${piece.name}：${issue}`);
    if (project.technique === 'turned' && piece.seamMm > 0 && isConcave(piece.points)) issues.push(`${piece.name}：复杂凹角尚未验证折边偏移，禁止原尺寸导出`);
    if (project.technique === 'pieced' && piece.points.length > 6) issues.push(`${piece.name}：拼接工艺仅支持已验证的规则直线布片`);
  }
  if (project.technique === 'pieced' && project.pieces.some(p => !p.stitch)) issues.push('拼接模式的空隙、重叠与缝边匹配尚未校验，暂不可导出原尺寸纸样');
  return issues;
}
