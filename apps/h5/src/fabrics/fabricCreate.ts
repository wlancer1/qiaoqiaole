import type { ProjectApiRequest } from '../projects/projectApi';
import type { FabricItem, FabricStockMode } from '../patchwork/fabricInventory';
import type { TexturePatternId } from '../patchwork/textures';
export type FabricCreatePayload = { name: string; color: string; category: string; image: string | null; sampleWidthMm: number | null; stockMode: FabricStockMode; widthMm: number | null; heightMm: number | null; quantity: number; availableAreaMm2: number | null; note: string | null };
export type FabricCreateResult = { payload: FabricCreatePayload; projectOnly: boolean; texturePattern?: TexturePatternId };
export async function createWarehouseFabric(request: ProjectApiRequest | undefined, token: string, payload: FabricCreatePayload): Promise<FabricItem> {
 if(!request||!token)throw new Error('请先登录后保存到布料仓库');
 const response=await request<{fabric:FabricItem}>('/fabrics',{method:'POST',body:JSON.stringify(payload)},token);
 if(!response.fabric?.id)throw new Error('未获取到仓库保存结果，请核实后重试');
 return response.fabric;
}
