import { makePiece, makeShape, pointBounds, type Point, type Piece, type Shape } from './model';
import { newPatchworkId } from './ids';

export const SHAPE_TEMPLATES_KEY = 'qiaoqiaole:patchwork:templates';
export type ShapeTemplate = { id: string; name: string; points: Point[]; favorite?: boolean; lastUsedAt?: number; remote?: boolean };
export type ShapeCategory = 'mine' | 'base' | 'flora' | 'combo';
export type ShapeChoice = { id: string; name: string; category: ShapeCategory; polygons: Point[][]; templateId?: string };
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
  const shapes: Array<[Shape, string]> = category === 'flora'
    ? [['petal', '花瓣'], ['leaf', '叶片'], ['star', '星形']]
    : [['rect', '正方形'], ['circle', '圆形'], ['triangle', '三角形'], ['diamond', '菱形'], ['hexagon', '六边形']];
  return shapes.map(([shape, name]) => ({ id: shape, name, category, polygons: [makeShape(shape, 100, 100, 50, 50)] }));
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
