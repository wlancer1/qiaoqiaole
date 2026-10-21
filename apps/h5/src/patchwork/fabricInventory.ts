import { outwardOffset } from './export';
import { area, validatePiece, type Material, type PatchworkProject, type Piece, type Point } from './model';

export type FabricStockMode = 'size' | 'area' | 'own';

export const FABRIC_CATEGORIES = ['棉布', '亚麻', '格纹', '条纹', '波点', '碎花', '其他'] as const;
export type FabricCategory = (typeof FABRIC_CATEGORIES)[number];

export const FABRIC_STATUS_FILTERS = ['全部', '未录入库存', '有库存', '库存不足', '已用完'] as const;
export type FabricStatusFilter = (typeof FABRIC_STATUS_FILTERS)[number];

export type FabricItem = {
  presetId?: string | null;
  id: string;
  name: string;
  color: string | null;
  category?: string | null;
  stockMode?: FabricStockMode;
  sampleWidthMm?: number | null;
  image: string | null;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number;
  availableAreaMm2?: number | null;
  note: string | null;
  updatedAt: string;
};

export type FabricTransaction = {
  id: string;
  operationId: string;
  fabricId: string;
  projectId: string | null;
  projectName: string | null;
  consumedAreaMm2: number;
  createdAt: string;
};

export type FabricRequirementStatus = 'sufficient' | 'insufficient' | 'missing' | 'unverified' | 'unlinked';

export type MaterialRequirement = {
  material: Material;
  pieceIds: string[];
  pieceCount: number;
  includesBase: boolean;
  netAreaMm2: number;
  seamAreaMm2: number;
  cutAreaMm2: number;
  wasteAreaMm2: number;
  requiredAreaMm2: number;
  estimatedAreaMm2: number;
  availableAreaMm2: number | null;
  shortageAreaMm2: number;
  inventoryFabric: FabricItem | null;
  linkedFabric: FabricItem | null;
  status: FabricRequirementStatus;
  geometryError?: string;
};

export type RecommendedFabric = {
  fabric: FabricItem;
  availableAreaMm2: number | null;
  isEnough: boolean;
  enough: boolean;
  colorDist: number;
  stockTag: string;
  colorTag: string;
  reasonTag: string;
};

/** 1 cm² = 100 mm² */
export function mm2ToCm2(mm2: number): number {
  return Math.round(mm2 / 100);
}

export function formatCm2(mm2: number): string {
  if (!Number.isFinite(mm2)) return '0';
  return String(Math.max(0, Math.round(mm2 / 100)));
}

export function formatAreaCm2(mm2: number | null | undefined): string {
  if (mm2 === null || mm2 === undefined || !Number.isFinite(mm2)) return '数量待核实';
  return `${mm2ToCm2(mm2).toLocaleString('zh-CN')} cm²`;
}

/** 计算仓库布料的当前可用面积（mm²）；仅记录拥有（own）时返回 null。 */
export function fabricAvailableAreaMm2(fabric: Pick<FabricItem, 'stockMode' | 'availableAreaMm2' | 'widthMm' | 'heightMm' | 'quantity'>): number | null {
  if (fabric.stockMode === 'own') return null;
  if (fabric.quantity <= 0) return 0;
  if (typeof fabric.availableAreaMm2 === 'number' && Number.isFinite(fabric.availableAreaMm2)) {
    return Math.max(0, Math.round(fabric.availableAreaMm2));
  }
  if (fabric.widthMm && fabric.heightMm && fabric.widthMm > 0 && fabric.heightMm > 0) {
    return Math.max(0, Math.round(fabric.widthMm * fabric.heightMm * fabric.quantity));
  }
  return null;
}

/** 仓库筛选用的四态库存归类：有库存 / 库存不足（< 500 cm²）/ 已用完 */
export function fabricStockFilterCategory(fabric: FabricItem): '未录入库存' | '有库存' | '库存不足' | '已用完' {
  const avail = fabricAvailableAreaMm2(fabric);
  if (avail === null) return '未录入库存';
  if (avail === 0 || fabric.quantity <= 0) return '已用完';
  if (avail !== null && avail < 50_000) return '库存不足';
  return '有库存';
}

/** 仓库卡片角标文案与样式 */
export function fabricBadgeInfo(fabric: FabricItem): { label: string; tone: 'ok' | 'warn' | 'own' | 'out' } {
  const avail = fabricAvailableAreaMm2(fabric);
  if (avail === null) return { label: '未录入库存', tone: 'own' };
  if (avail === 0 || fabric.quantity <= 0) return { label: '已用完', tone: 'out' };
  if (avail < 50_000) return { label: '余量偏低', tone: 'warn' };
  return { label: '库存充足', tone: 'ok' };
}

const cmText = (mm: number) => String(Number((mm / 10).toFixed(1)));

export function fabricSpecLabel(fabric: FabricItem): string {
  const avail = fabricAvailableAreaMm2(fabric);
  if (avail === null) return '未录入库存';
  if (avail === 0 || fabric.quantity <= 0) {
    return fabric.widthMm && fabric.heightMm ? `${cmText(fabric.widthMm)}×${cmText(fabric.heightMm)}cm · 已用完` : '库存 0 cm²';
  }
  if (fabric.stockMode === 'own' || avail === null) return '未录入库存';
  const cm2 = formatCm2(avail);
  if (fabric.widthMm && fabric.heightMm) {
    return `${cmText(fabric.widthMm)}×${cmText(fabric.heightMm)}cm · 余 ${cm2} cm²`;
  }
  return `余量 ${cm2} cm²`;
}

/** 多边形周长（mm） */
export function polygonPerimeterMm(points: Point[]): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

/** 计算单个布片的净面积与含缝份裁片面积（mm²） */
export function pieceAreasMm2(piece: Piece, technique: PatchworkProject['technique']): {
  netAreaMm2: number;
  cutAreaMm2: number;
  seamAreaMm2: number;
  netMm2: number;
  seamMm2: number;
  error?: string;
} {
  const issue = validatePiece(piece.points);
  if (issue) return { netAreaMm2: 0, cutAreaMm2: 0, seamAreaMm2: 0, netMm2: 0, seamMm2: 0, error: issue };
  const net = Math.round(area(piece.points));
  const seamMm = piece.seamMm > 0 ? piece.seamMm : technique === 'pieced' ? 7 : technique === 'turned' ? 5 : 0;
  if (seamMm <= 0) {
    return { netAreaMm2: net, cutAreaMm2: net, seamAreaMm2: 0, netMm2: net, seamMm2: 0 };
  }
  const perim = polygonPerimeterMm(piece.points);
  const approxSeam = Math.round((perim * seamMm + Math.PI * seamMm * seamMm) / 100) * 100;
  try {
    const offsetPts = outwardOffset(piece.points, seamMm);
    const offsetArea = Math.round(area(offsetPts));
    if (Number.isFinite(offsetArea) && offsetArea >= net) {
      const seamArea = Math.round((offsetArea - net) / 100) * 100;
      return {
        netAreaMm2: net,
        cutAreaMm2: net + seamArea,
        seamAreaMm2: seamArea,
        netMm2: net,
        seamMm2: seamArea,
      };
    }
  } catch {
    /* 尖角或复杂凹多边形外扩失败时使用周长包络面积公式保底 */
  }
  return {
    netAreaMm2: net,
    cutAreaMm2: net + approxSeam,
    seamAreaMm2: approxSeam,
    netMm2: net,
    seamMm2: approxSeam,
  };
}

/** 计算项目的完整用料需求与库存状态 */
export function computeProjectMaterialRequirements(
  project: PatchworkProject,
  myFabrics: FabricItem[],
  options?: { wasteRate?: number; wasteRatio?: number; includeHidden?: boolean; includeBase?: boolean },
): MaterialRequirement[] {
  const wasteRate = Math.max(0, options?.wasteRatio ?? options?.wasteRate ?? 0.15);
  const includeHidden = options?.includeHidden ?? false;
  const includeBase = options?.includeBase ?? project.base.includeInCutList;
  const fabricById = new Map(myFabrics.map((f) => [f.id, f]));

  const buckets = new Map<string, {
    material: Material;
    pieceIds: string[];
    pieceCount: number;
    includesBase: boolean;
    netAreaMm2: number;
    cutAreaMm2: number;
    errors: string[];
  }>();

  const ensureBucket = (materialId: string) => {
    const existing = buckets.get(materialId);
    if (existing) return existing;
    const mat = project.materials.find((m) => m.id === materialId) || {
      id: materialId,
      name: `未命名布料 ${materialId}`,
      color: '#cccccc',
    };
    const created = {
      material: mat,
      pieceIds: [] as string[],
      pieceCount: 0,
      includesBase: false,
      netAreaMm2: 0,
      cutAreaMm2: 0,
      errors: [] as string[],
    };
    buckets.set(materialId, created);
    return created;
  };

  for (const piece of project.pieces) {
    if (!includeHidden && !piece.visible) continue;
    const bucket = ensureBucket(piece.materialId);
    bucket.pieceIds.push(piece.id);
    bucket.pieceCount += 1;
    const { netAreaMm2, cutAreaMm2, error } = pieceAreasMm2(piece, project.technique);
    if (error) {
      bucket.errors.push(`${piece.name}：${error}`);
    } else {
      bucket.netAreaMm2 += netAreaMm2;
      bucket.cutAreaMm2 += cutAreaMm2;
    }
  }

  if (includeBase && project.base.materialId && project.widthMm > 0 && project.heightMm > 0) {
    const baseBucket = ensureBucket(project.base.materialId);
    baseBucket.includesBase = true;
    const baseArea = Math.round(project.widthMm * project.heightMm);
    baseBucket.netAreaMm2 += baseArea;
    baseBucket.cutAreaMm2 += baseArea;
  }

  const results: MaterialRequirement[] = [];
  for (const b of buckets.values()) {
    const seamAreaMm2 = Math.max(0, b.cutAreaMm2 - b.netAreaMm2);
    const wasteAreaMm2 = Math.round(b.cutAreaMm2 * wasteRate);
    const requiredAreaMm2 = b.cutAreaMm2 + wasteAreaMm2;

    const linkedFabric = b.material.inventoryFabricId
      ? (fabricById.get(b.material.inventoryFabricId) ?? myFabrics.find(f => b.material.presetId && f.presetId === b.material.presetId) ?? null)
      : (myFabrics.find(f => b.material.presetId && f.presetId === b.material.presetId) ?? null);

    let status: FabricRequirementStatus;
    let availableAreaMm2: number | null = null;
    let shortageAreaMm2 = 0;

    if (!linkedFabric) {
      status = 'unlinked';
    } else {
      availableAreaMm2 = fabricAvailableAreaMm2(linkedFabric);
      if (availableAreaMm2 === null) {
        status = 'unverified';
      } else if (availableAreaMm2 === 0 || linkedFabric.quantity <= 0) {
        status = 'missing';
        shortageAreaMm2 = requiredAreaMm2;
      } else if (availableAreaMm2 === null || linkedFabric.stockMode === 'own') {
        status = 'unverified';
      } else if (availableAreaMm2 < requiredAreaMm2) {
        status = 'insufficient';
        shortageAreaMm2 = Math.max(0, requiredAreaMm2 - availableAreaMm2);
      } else {
        status = 'sufficient';
      }
    }

    results.push({
      material: b.material,
      pieceIds: b.pieceIds,
      pieceCount: b.pieceCount,
      includesBase: b.includesBase,
      netAreaMm2: b.netAreaMm2,
      seamAreaMm2,
      cutAreaMm2: b.cutAreaMm2,
      wasteAreaMm2,
      requiredAreaMm2,
      estimatedAreaMm2: requiredAreaMm2,
      availableAreaMm2,
      shortageAreaMm2,
      inventoryFabric: linkedFabric,
      linkedFabric,
      status,
      geometryError: b.errors.length > 0 ? b.errors[0] : undefined,
    });
  }

  return results;
}

function parseHexRgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex) return null;
  const clean = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  }
  return null;
}

/** 感知加权 RGB 色差（越小越相近） */
export function colorDistance(hexA: string | null | undefined, hexB: string | null | undefined): number {
  const a = parseHexRgb(hexA);
  const b = parseHexRgb(hexB);
  if (!a || !b) return 999;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

/** 从 Canvas 像素数据提取代表主色（#rrggbb） */
export function extractDominantColorFromRgba(data: ArrayLike<number>): string {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  const step = Math.max(4, Math.floor(data.length / (4 * 400)) * 4);
  for (let i = 0; i + 3 < data.length; i += step) {
    const a = data[i + 3];
    if (a < 128) continue;
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
    count += 1;
  }
  if (count === 0) return '#d98a9e';
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n / count))).toString(16).padStart(2, '0');
  return `#${toHex(rSum)}${toHex(gSum)}${toHex(bSum)}`;
}

/**
 * 为「他作待配布」或「缺料/库存不足」材料智能推荐当前用户仓库中的可用布料：
 * 1. 自动排除已用完（0 库存）布料；
 * 2. 优先排「库存够裁（或待核实）」的布料；
 * 3. 同材质分类、主色色差最小的排在最前。
 */
export function recommendReplacementFabrics(
  targetMaterial: Pick<Material, 'color' | 'category' | 'inventoryFabricId'>,
  requiredAreaMm2: number,
  myFabrics: FabricItem[],
): RecommendedFabric[] {
  const candidates: RecommendedFabric[] = [];
  for (const fabric of myFabrics) {
    const avail = fabricAvailableAreaMm2(fabric);
    if (avail === 0 || fabric.quantity <= 0) continue;
    const isEnough = avail === null || avail >= requiredAreaMm2;
    const colorDist = colorDistance(targetMaterial.color, fabric.color);
    const sameCat = Boolean(targetMaterial.category && fabric.category && targetMaterial.category === fabric.category);

    const stockTag = !isEnough ? '余量偏紧' : avail === null ? '面积待核实' : '库存够用';
    const colorTag = colorDist < 120 ? '同色系推荐' : colorDist < 240 ? '邻近色系' : '撞色替换';
    const reasonTag = `${stockTag} · ${colorTag}`;

    candidates.push({
      fabric,
      availableAreaMm2: avail,
      isEnough,
      enough: isEnough,
      colorDist: sameCat ? colorDist * 0.75 : colorDist,
      stockTag,
      colorTag,
      reasonTag,
    });
  }

  return candidates.sort((a, b) => {
    if (a.isEnough !== b.isEnough) return a.isEnough ? -1 : 1;
    return a.colorDist - b.colorDist;
  });
}
