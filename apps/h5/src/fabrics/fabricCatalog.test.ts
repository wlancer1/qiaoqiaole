import { describe, expect, it, vi } from 'vitest';
import { builtinFabrics, unifiedFabrics, ensurePersonalFabric, matchesMaterialFabric, registerUsedPresetFabrics } from './fabricCatalog';
import { makeProject, makePiece } from '../patchwork/model';
import { fabricAvailableAreaMm2, fabricBadgeInfo, fabricStockFilterCategory } from '../patchwork/fabricInventory';

describe('unified fabric catalog', () => {
 it('offers 16 stable repeatable designs with unknown stock, not zero or sufficient stock', () => {
  expect(builtinFabrics).toHaveLength(16);
  expect(new Set(builtinFabrics.map(f => f.id)).size).toBe(16);
  for (const f of builtinFabrics) {
   expect(f.image).toMatch(/^\/fabric-presets\/.*\.svg$/);
   expect(f.sampleWidthMm).toBeGreaterThan(0);
   expect(fabricAvailableAreaMm2(f)).toBeNull();
   expect(fabricBadgeInfo(f).label).toBe('未录入库存');
   expect(fabricStockFilterCategory(f)).toBe('未录入库存');
  }
 });
 it('puts personal fabrics first and keeps a preset visible only once after stock is recorded', () => {
  const personal = { ...builtinFabrics[0], id: 'personal-1', stockMode: 'size' as const, widthMm: 500, heightMm: 400, availableAreaMm2: 200000 };
  expect(unifiedFabrics([personal])).toHaveLength(16);
  expect(unifiedFabrics([personal])[0]).toBe(personal);
  expect(matchesMaterialFabric({ id: 'M1', name: '', color: '', presetId: personal.presetId, inventoryFabricId: builtinFabrics[0].id }, personal)).toBe(true);
 });
 it('registers only used presets when saving and never deducts inventory', async () => {
  const project = makeProject(); project.base.materialId = '';
  project.materials = builtinFabrics.slice(0,2).map((f,i) => ({ id: `M${i}`, name: f.name, color: f.color!, presetId: f.presetId }));
  project.pieces = [makePiece([{x:0,y:0},{x:10,y:0},{x:0,y:10}], 'M0')];
  const request = vi.fn(async () => ({ fabric: { ...builtinFabrics[0], id: 'personal-1' } }));
  const records = await registerUsedPresetFabrics(project, request as any, 'token');
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe('/fabrics/presets/ivory');
  expect(records[0].id).toBe('personal-1');
  await ensurePersonalFabric(request as any, 'token', records[0]);
  expect(request).toHaveBeenCalledTimes(1);
 });
});
