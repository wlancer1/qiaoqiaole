import type { ProjectApiRequest } from '../projects/projectApi';
import type { FabricItem } from './fabricInventory';

export async function createEditorWarehouseFabric(
 request: ProjectApiRequest | undefined,
 token: string,
 input: { name: string; color: string; image?: string | null; sampleWidthMm?: number; areaCm2: string },
): Promise<FabricItem> {
 if (!request || !token) throw new Error('请先登录后保存到布料仓库');
 if (input.image && input.image.length > 400000) throw new Error('布料图片过大，请缩小图片后重试');
 const area = input.areaCm2.trim() === '' ? null : Number(input.areaCm2);
 if (area !== null && (!Number.isFinite(area) || area <= 0 || !Number.isSafeInteger(Math.round(area * 100)) || Math.round(area * 100) < 1)) throw new Error('实际库存面积必须大于 0');
 const result = await request<{ fabric: FabricItem }>('/fabrics', {
  method: 'POST',
  body: JSON.stringify({
   name: input.name, color: input.color, image: input.image || null,
   sampleWidthMm: input.sampleWidthMm ?? null,
   stockMode: area === null ? 'own' : 'area',
   widthMm: null, heightMm: null, quantity: 1,
   availableAreaMm2: area === null ? null : Math.round(area * 100),
  }),
 }, token);
 if (!result.fabric?.id) throw new Error('仓库未返回保存结果，请核实后重试');
 return result.fabric;
}
