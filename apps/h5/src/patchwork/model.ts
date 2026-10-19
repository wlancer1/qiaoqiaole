import { newPatchworkId } from './ids';

/** 拼布的所有几何数据以毫米为单位，和拼豆格子完全独立。 */
export type Point = { x: number; y: number };
export type Technique = 'raw' | 'turned' | 'pieced';
export type Shape = 'rect' | 'circle' | 'triangle' | 'diamond' | 'hexagon' | 'petal' | 'leaf' | 'star';
export type TextureTransform = { scale: number; rotation: number; offsetX: number; offsetY: number };
export type Material = { id: string; name: string; color: string; assetId?: string; assetPath?: string; sampleWidthMm?: number; calibrated?: boolean };
export type Piece = { id: string; name: string; points: Point[]; materialId: string; locked: boolean; visible: boolean; groupId?: string; seamMm: number; texture: TextureTransform };
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
export function hitTest(p: Point, pieces: Piece[]) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const piece = pieces[i]; if (!piece.visible || piece.locked) continue;
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
    const issue = validatePiece(piece.points);
    if (issue) issues.push(`${piece.name}：${issue}`);
    if (project.technique === 'turned' && piece.seamMm > 0 && isConcave(piece.points)) issues.push(`${piece.name}：复杂凹角尚未验证折边偏移，禁止原尺寸导出`);
    if (project.technique === 'pieced' && piece.points.length > 6) issues.push(`${piece.name}：拼接工艺仅支持已验证的规则直线布片`);
  }
  if (project.technique === 'pieced' && project.pieces.length > 0) issues.push('拼接模式的空隙、重叠与缝边匹配尚未校验，暂不可导出原尺寸纸样');
  return issues;
}
