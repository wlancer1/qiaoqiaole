import { describe, expect, it } from 'vitest';
import { makePiece, makeProject } from './model';
import {
  computeProjectMaterialRequirements,
  extractDominantColorFromRgba,
  fabricAvailableAreaMm2,
  fabricBadgeInfo,
  fabricStockFilterCategory,
  pieceAreasMm2,
  recommendReplacementFabrics,
  type FabricItem,
} from './fabricInventory';

const sampleFabric = (overrides: Partial<FabricItem> = {}): FabricItem => ({
  id: 'fab-1',
  name: '樱花粉纯棉',
  color: '#e89bb0',
  category: '棉布',
  stockMode: 'size',
  image: null,
  widthMm: 500,
  heightMm: 400,
  quantity: 1,
  availableAreaMm2: 200_000,
  note: null,
  updatedAt: '2026-10-19T12:00:00.000Z',
  ...overrides,
});

describe('fabricInventory', () => {
  it('computes available area and status categories across size, area, and own modes', () => {
    const sufficient = sampleFabric({ availableAreaMm2: 180_000 });
    expect(fabricAvailableAreaMm2(sufficient)).toBe(180_000);
    expect(fabricStockFilterCategory(sufficient)).toBe('有库存');
    expect(fabricBadgeInfo(sufficient)).toEqual({ label: '库存充足', tone: 'ok' });

    const low = sampleFabric({ id: 'fab-low', availableAreaMm2: 12_000 });
    expect(fabricStockFilterCategory(low)).toBe('库存不足');
    expect(fabricBadgeInfo(low)).toEqual({ label: '余量偏低', tone: 'warn' });

    const depleted = sampleFabric({ id: 'fab-zero', quantity: 0, availableAreaMm2: 0 });
    expect(fabricStockFilterCategory(depleted)).toBe('已用完');
    expect(fabricBadgeInfo(depleted)).toEqual({ label: '已用完', tone: 'out' });

    const ownMode = sampleFabric({ id: 'fab-own', stockMode: 'own', widthMm: null, heightMm: null, availableAreaMm2: null, quantity: 1 });
    expect(fabricAvailableAreaMm2(ownMode)).toBeNull();
    expect(fabricStockFilterCategory(ownMode)).toBe('未录入库存');
    expect(fabricBadgeInfo(ownMode)).toEqual({ label: '未录入库存', tone: 'own' });
  });

  it('computes net, seam, waste, and availability status for project materials including unlinked designer fabrics', () => {
    const project = makeProject();
    // 100x100mm square = 10,000 mm2 net area
    const piece1 = makePiece(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
      'M1',
      '中心方块',
    );
    piece1.seamMm = 5;
    project.pieces = [piece1];
    // Link M2 to a warehouse fabric with low stock, keep M1 unlinked (like another designer's pattern)
    const piece2 = makePiece(
      [{ x: 120, y: 0 }, { x: 220, y: 0 }, { x: 220, y: 100 }, { x: 120, y: 100 }],
      'M2',
      '边框块',
    );
    project.pieces.push(piece2);
    project.materials.push({ id: 'M2', name: '鼠尾草绿亚麻', color: '#9db98a', inventoryFabricId: 'fab-short' });

    const areas = pieceAreasMm2(piece1, 'turned');
    expect(areas.netMm2).toBe(10_000);
    expect(areas.seamMm2).toBe(2_100); // 400*5 + pi*25 ≈ 2078.5 -> rounded to 100s = 2100

    const warehouse = [
      sampleFabric({ id: 'fab-short', name: '鼠尾草绿亚麻', color: '#9db98a', availableAreaMm2: 5_000 }),
    ];
    const reqs = computeProjectMaterialRequirements(project, warehouse, { wasteRatio: 0.15 });
    const reqM1 = reqs.find((r) => r.material.id === 'M1')!;
    const reqM2 = reqs.find((r) => r.material.id === 'M2')!;

    expect(reqM1.status).toBe('unlinked');
    expect(reqM1.pieceCount).toBe(1);
    expect(reqM2.status).toBe('insufficient');
    expect(reqM2.shortageAreaMm2).toBeGreaterThan(5_000);
  });

  it('recommends replacement fabrics prioritized by sufficient stock then color similarity and excludes depleted stock', () => {
    const targetMaterial = { id: 'M1', name: '原作复古红', color: '#d9534f', category: '棉布' };
    const warehouse: FabricItem[] = [
      sampleFabric({ id: 'depleted-exact', name: '用完的同色布', color: '#d9534f', quantity: 0, availableAreaMm2: 0 }),
      sampleFabric({ id: 'enough-far', name: '深海蓝帆布', color: '#1e3a8a', category: '其他', availableAreaMm2: 90_000 }),
      sampleFabric({ id: 'enough-close', name: '玫瑰红碎花棉', color: '#df625c', category: '棉布', availableAreaMm2: 80_000 }),
      sampleFabric({ id: 'tight-close', name: '珊瑚红小布头', color: '#da5852', category: '棉布', availableAreaMm2: 10_000 }),
    ];

    const recommendations = recommendReplacementFabrics(targetMaterial, 30_000, warehouse);
    expect(recommendations.map((r) => r.fabric.id)).toEqual([
      'enough-close',
      'enough-far',
      'tight-close',
    ]);
    expect(recommendations[0].isEnough).toBe(true);
    expect(recommendations[0].colorTag).toBe('同色系推荐');
    expect(recommendations[2].isEnough).toBe(false);
  });

  it('extracts dominant hex color from RGBA pixel buffer', () => {
    const rgba = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < 16; i++) {
      rgba[i * 4] = 210;
      rgba[i * 4 + 1] = 90;
      rgba[i * 4 + 2] = 110;
      rgba[i * 4 + 3] = 255;
    }
    expect(extractDominantColorFromRgba(rgba)).toBe('#d25a6e');
  });
});
