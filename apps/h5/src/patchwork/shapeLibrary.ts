import { makePiece, makeShape, pointBounds, type Point, type Piece, type Shape } from './model';
import { newPatchworkId } from './ids';

export const SHAPE_TEMPLATES_KEY = 'qiaoqiaole:patchwork:templates';
export type ShapeTemplate = { id: string; name: string; points: Point[]; favorite?: boolean; lastUsedAt?: number; remote?: boolean };
export type ShapeCategory = 'mine' | 'base' | 'flora' | 'combo';
export type BaseShapeGroup = 'geometry' | 'curve' | 'flora' | 'decor';
export type ShapeChoice = { id: string; name: string; category: ShapeCategory; group?: BaseShapeGroup; polygons: Point[][]; templateId?: string };
export type ShapePlacement = { width: number; height: number; seam: number; rotation: number };

export function readShapeTemplates(): ShapeTemplate[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SHAPE_TEMPLATES_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const templates = raw.filter((t) => t && typeof t.name === 'string' && Array.isArray(t.points) && t.points.length >= 3 && t.points.every((p: Point) => p && Number.isFinite(p.x) && Number.isFinite(p.y)))
      .map((t) => ({ id: typeof t.id === 'string' && !/^legacy-\d+$/.test(t.id) ? t.id : newPatchworkId(), name: t.name, points: t.points, favorite: Boolean(t.favorite), lastUsedAt: Number(t.lastUsedAt) || 0 }));
    // Give old browser-only entries durable IDs before they can be migrated.
    if (templates.some((t, i) => t.id !== raw[i]?.id)) {
      try { localStorage.setItem(SHAPE_TEMPLATES_KEY, JSON.stringify(templates)); } catch { /* Saving reports storage errors to the user. */ }
    }
    return templates;
  } catch { return []; }
}

export function toShapeTemplate(name: string, points: Point[]): ShapeTemplate {
  const b = pointBounds(points);
  return { id: newPatchworkId(), name, points: points.map((p) => ({ x: p.x - b.x, y: p.y - b.y })) };
}

/** 内置裁片只保存形状定义，不写进“我的形状”或用户服务端。 */
export const BASE_SHAPE_GROUPS: Array<{ id: BaseShapeGroup; label: string }> = [
  { id: 'geometry', label: '几何裁片' },
  { id: 'curve', label: '圆弧曲线' },
  { id: 'flora', label: '花叶植物' },
  { id: 'decor', label: '装饰造型' },
];
type BuiltinShape = { id: string; name: string; shape: Shape; group: BaseShapeGroup; width?: number; height?: number };
const BASE_SHAPES: BuiltinShape[] = [
  // 常用几何裁片
  { id: 'rect', name: '正方形', shape: 'rect', group: 'geometry' },
  { id: 'rectangle', name: '长方形', shape: 'rect', group: 'geometry', width: 140, height: 80 },
  { id: 'triangle', name: '三角形', shape: 'triangle', group: 'geometry' },
  { id: 'right-triangle', name: '直角三角形', shape: 'right-triangle', group: 'geometry' },
  { id: 'trapezoid', name: '梯形', shape: 'trapezoid', group: 'geometry' },
  { id: 'parallelogram', name: '平行四边形', shape: 'parallelogram', group: 'geometry' },
  { id: 'diamond', name: '菱形', shape: 'diamond', group: 'geometry' },
  { id: 'kite', name: '风筝形', shape: 'kite', group: 'geometry' },
  { id: 'pentagon', name: '五边形', shape: 'pentagon', group: 'geometry' },
  { id: 'hexagon', name: '六边形', shape: 'hexagon', group: 'geometry' },
  { id: 'half-hexagon', name: '半六边形', shape: 'half-hexagon', group: 'geometry' },
  { id: 'octagon', name: '八边形', shape: 'octagon', group: 'geometry' },
  { id: 'cross', name: '十字形', shape: 'cross', group: 'geometry' },
  { id: 'house', name: '屋顶形', shape: 'house', group: 'geometry' },
  { id: 'shield', name: '盾牌形', shape: 'shield', group: 'geometry' },
  { id: 'bookmark', name: '旗帜形', shape: 'bookmark', group: 'geometry' },
  { id: 'equilateral-triangle', name: '等边三角形', shape: 'triangle', group: 'geometry', width: 100, height: 50 * Math.sqrt(3) },
  { id: 'scalene-triangle', name: '不等边三角形', shape: 'scalene-triangle', group: 'geometry', width: 120, height: 90 },
  { id: 'right-trapezoid', name: '直角梯形', shape: 'right-trapezoid', group: 'geometry' },
  { id: 'slim-diamond', name: '细长菱形', shape: 'diamond', group: 'geometry', width: 60, height: 140 },
  { id: 'strip', name: '长条形', shape: 'rect', group: 'geometry', width: 160, height: 40 },
  { id: 'heptagon', name: '七边形', shape: 'heptagon', group: 'geometry' },
  { id: 'decagon', name: '十边形', shape: 'decagon', group: 'geometry' },
  { id: 'dodecagon', name: '十二边形', shape: 'dodecagon', group: 'geometry' },
  { id: 'l-shape', name: 'L形', shape: 'l-shape', group: 'geometry' },
  { id: 't-shape', name: 'T形', shape: 't-shape', group: 'geometry' },
  // 弧线和拼布贝壳、扇形等
  { id: 'circle', name: '圆形', shape: 'circle', group: 'curve' },
  { id: 'oval', name: '椭圆形', shape: 'oval', group: 'curve', width: 140, height: 85 },
  { id: 'rounded-rect', name: '圆角矩形', shape: 'rounded-rect', group: 'curve', width: 140, height: 90 },
  { id: 'semicircle', name: '半圆形', shape: 'semicircle', group: 'curve', width: 140, height: 75 },
  { id: 'quarter-circle', name: '四分之一圆', shape: 'quarter-circle', group: 'curve' },
  { id: 'sector', name: '扇形', shape: 'sector', group: 'curve' },
  { id: 'arch', name: '拱门形', shape: 'arch', group: 'curve' },
  { id: 'crescent', name: '月牙形', shape: 'crescent', group: 'curve' },
  { id: 'shell', name: '贝壳形', shape: 'shell', group: 'curve' },
  { id: 'cloud', name: '云朵形', shape: 'cloud', group: 'curve', width: 140, height: 85 },
  { id: 'wave', name: '波浪形', shape: 'wave', group: 'curve', width: 140, height: 80 },
  { id: 'half-ring', name: '半圆环', shape: 'half-ring', group: 'curve', width: 140, height: 70 },
  { id: 'quarter-ring', name: '四分之一圆环', shape: 'quarter-ring', group: 'curve' },
  // 花叶剪裁
  { id: 'leaf', name: '叶片', shape: 'leaf', group: 'flora' },
  { id: 'petal', name: '花瓣', shape: 'petal', group: 'flora' },
  { id: 'flower', name: '六瓣花', shape: 'flower', group: 'flora' },
  { id: 'four-leaf', name: '四叶花', shape: 'four-leaf', group: 'flora' },
  { id: 'tulip', name: '郁金香', shape: 'tulip', group: 'flora' },
  { id: 'maple-leaf', name: '枫叶', shape: 'maple-leaf', group: 'flora' },
  { id: 'teardrop', name: '水滴形', shape: 'teardrop', group: 'flora' },
  // 适合贴布、布艺拼贴的独立装饰形状
  { id: 'star', name: '五角星', shape: 'star', group: 'decor' },
  { id: 'heart', name: '爱心', shape: 'heart', group: 'decor' },
  { id: 'arrow', name: '箭头', shape: 'arrow', group: 'decor' },
  { id: 'chevron', name: 'V形条', shape: 'chevron', group: 'decor' },
  { id: 'bow-tie', name: '蝴蝶结', shape: 'bow-tie', group: 'decor' },
  { id: 'butterfly', name: '蝴蝶', shape: 'butterfly', group: 'decor' },
  { id: 'fish', name: '小鱼', shape: 'fish', group: 'decor' },
];

export function shapeChoices(category: ShapeCategory, templates: ShapeTemplate[]): ShapeChoice[] {
  if (category === 'mine') return templates.map((t) => ({ id: t.id, templateId: t.id, name: t.name, category, polygons: [t.points] }));
  if (category === 'combo') {
    const p = (x: number, y: number) => ({ x, y });
    return [
      { id: 'quad', name: '四方拼块', category, polygons: [[p(0, 0), p(50, 0), p(50, 50), p(0, 50)], [p(50, 0), p(100, 0), p(100, 50), p(50, 50)], [p(0, 50), p(50, 50), p(50, 100), p(0, 100)], [p(50, 50), p(100, 50), p(100, 100), p(50, 100)]] },
      { id: 'pinwheel', name: '风车组合', category, polygons: [0, 1, 2, 3].map((i) => [p(50, 50), p(100, 0), p(100, 50)].map((pt) => { const r = i * Math.PI / 2, x = pt.x - 50, y = pt.y - 50; return p(50 + x * Math.cos(r) - y * Math.sin(r), 50 + x * Math.sin(r) + y * Math.cos(r)); })) },
      { id: 'half', name: '半方三角', category, polygons: [[p(0, 0), p(100, 0), p(0, 100)], [p(100, 0), p(100, 100), p(0, 100)]] },
    ];
  }
  if (category === 'flora') return BASE_SHAPES.filter((item) => item.group === 'flora').map((item) => ({
    id: item.id, name: item.name, category, group: item.group,
    polygons: [makeShape(item.shape, item.width ?? 100, item.height ?? 100, (item.width ?? 100) / 2, (item.height ?? 100) / 2)],
  }));
  return BASE_SHAPES.map((item) => ({
    id: item.id, name: item.name, category, group: item.group,
    polygons: [makeShape(item.shape, item.width ?? 100, item.height ?? 100, (item.width ?? 100) / 2, (item.height ?? 100) / 2)],
  }));
}

export function validShapePlacement(value: ShapePlacement): boolean {
  return Number.isFinite(value.width) && value.width >= 5 && value.width <= 2000 && Number.isFinite(value.height) && value.height >= 5 && value.height <= 2000 && Number.isFinite(value.seam) && value.seam >= 0 && value.seam <= 50 && Number.isFinite(value.rotation);
}

export function placeShapePieces(choice: ShapeChoice, options: ShapePlacement, center: Point, materialId: string, secondMaterialId = materialId): Piece[] {
  if (!validShapePlacement(options)) throw new Error('宽高需为 5–2000 mm，缝份需为 0–50 mm');
  const bounds = pointBounds(choice.polygons.flat());
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error('形状轮廓无效');
  const groupId = choice.polygons.length > 1 ? newPatchworkId() : undefined;
  const r = options.rotation * Math.PI / 180;
  return choice.polygons.map((polygon, index) => {
    const points = polygon.map((pt) => {
      const x = (pt.x - bounds.x) * options.width / bounds.width - options.width / 2;
      const y = (pt.y - bounds.y) * options.height / bounds.height - options.height / 2;
      return { x: center.x + x * Math.cos(r) - y * Math.sin(r), y: center.y + x * Math.sin(r) + y * Math.cos(r) };
    });
    const piece = makePiece(points, index % 2 ? secondMaterialId : materialId, choice.polygons.length > 1 ? `${choice.name} ${index + 1}` : choice.name);
    return { ...piece, seamMm: options.seam, ...(groupId ? { groupId } : {}) };
  });
}
