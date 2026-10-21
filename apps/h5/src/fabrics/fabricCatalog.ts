import presets from '../../../api/src/fabricPresets.json';
import type { Material, PatchworkProject } from '../patchwork/model';
import type { FabricItem } from '../patchwork/fabricInventory';
export type FabricCatalogRequest = <T>(path: string, init: RequestInit, token: string) => Promise<T>;

/** Stable catalog IDs are shared by all projects; personal stock IDs remain account-owned. */
export const builtinFabrics: FabricItem[] = presets.map((preset) => ({
 ...preset, id: `preset:${preset.id}`, presetId: preset.id,
 stockMode: 'own', widthMm: null, heightMm: null, quantity: 1,
 availableAreaMm2: null, note: null, updatedAt: '',
}));
export const findBuiltinFabric = (id: string) => builtinFabrics.find((f) => f.id === id || f.presetId === id);
export const isCatalogFabric = (fabric: FabricItem) => Boolean(fabric.presetId && fabric.id === `preset:${fabric.presetId}`);
export const matchesMaterialFabric = (material: Material, fabric: FabricItem) =>
 material.inventoryFabricId === fabric.id || Boolean(material.presetId && material.presetId === fabric.presetId);
export function unifiedFabrics(personal: FabricItem[]): FabricItem[] {
 const ownedPresets = new Set(personal.map((f) => f.presetId).filter(Boolean));
 return [...personal, ...builtinFabrics.filter((f) => !ownedPresets.has(f.presetId))];
}
export function presetAsset(fabric: FabricItem): { assetId: string; assetPath: string } | undefined {
 const preset = fabric.presetId && findBuiltinFabric(fabric.presetId);
 return preset && preset.image && fabric.image === preset.image
  ? { assetId: `preset-asset:${preset.presetId}`, assetPath: preset.image } : undefined;
}
export function presetAssetUrl(assetId: string): string | undefined {
 if (!assetId.startsWith('preset-asset:')) return undefined;
 const preset = findBuiltinFabric(assetId.slice('preset-asset:'.length));
 return preset?.image || undefined;
}
export async function ensurePersonalFabric(request: FabricCatalogRequest | undefined, token: string, fabric: FabricItem): Promise<FabricItem> {
 if (!request || !token) throw new Error('请先登录后录入库存');
 if (!isCatalogFabric(fabric)) return fabric;
 const { fabric: saved } = await request<{ fabric: FabricItem }>(`/fabrics/presets/${encodeURIComponent(fabric.presetId!)}`, { method: 'POST' }, token);
 if (!saved?.id) throw new Error('布料保存失败，请重试');
 return saved;
}
/** Only materials actually used in the saved design become personal records. No stock is deducted. */
export async function registerUsedPresetFabrics(project: PatchworkProject, request: FabricCatalogRequest, token: string) {
 const used = new Set(project.pieces.map((p) => p.materialId));
 if (project.base.materialId) used.add(project.base.materialId);
 const records: FabricItem[] = [];
 const ids = new Set(project.materials.filter((m) => used.has(m.id) && m.presetId).map((m) => m.presetId!));
 for (const id of ids) {
  const preset = findBuiltinFabric(id);
  if (preset) records.push(await ensurePersonalFabric(request, token, preset));
 }
 return records;
}
