/* 程序化布纹：纯色布料可选的内置纹理（亚麻/格纹/条纹/波点）。
   选中纹理后把一枚 240px 的平铺图渲染成素材图存入素材库，画布按 sampleWidthMm=64 平铺，
   与照片布走同一条纹理管线；SVG 预览与 canvas 渲染共用同一套几何，保证所见即所得。 */

export type TexturePatternId = 'linen' | 'check' | 'stripe' | 'dot';

export const TEXTURE_PATTERNS: Array<{ id: TexturePatternId; name: string }> = [
  { id: 'linen', name: '亚麻纹' },
  { id: 'check', name: '格纹' },
  { id: 'stripe', name: '条纹' },
  { id: 'dot', name: '波点' },
];

/** 按系数提亮（f>1）或压暗（f<1）一个 #rrggbb 颜色，返回 rgb() 字符串。 */
export function shadeColor(hexColor: string, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hexColor.trim());
  if (!m) return hexColor;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

const TILE = 240; // px，一枚平铺图对应的实际宽度由素材 sampleWidthMm 决定（64mm）

/** 把纹理平铺图渲染为 Blob（JPEG）。 */
export async function renderPatternTile(pattern: TexturePatternId, color: string): Promise<Blob> {
  const cv = document.createElement('canvas');
  cv.width = TILE; cv.height = TILE;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE, TILE);
  if (pattern === 'linen') {
    for (let i = 0; i < TILE; i += 5) {
      ctx.fillStyle = i % 10 === 0 ? 'rgba(0,0,0,0.055)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, i, TILE, 1.4);
      ctx.fillStyle = i % 10 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.045)';
      ctx.fillRect(i, 0, 1.4, TILE);
    }
  } else if (pattern === 'check') {
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    for (let i = 0; i < TILE; i += 120) { ctx.fillRect(i, 0, 60, TILE); ctx.fillRect(0, i, TILE, 60); }
  } else if (pattern === 'stripe') {
    ctx.fillStyle = shadeColor(color, 0.8);
    for (let i = 0; i < TILE; i += 48) ctx.fillRect(i, 0, 20, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 24; i < TILE; i += 48) ctx.fillRect(i, 0, 4, TILE);
  } else {
    ctx.fillStyle = shadeColor(color, 1.22);
    const step = 60, r = 10;
    for (let row = 0; row * step < TILE + step; row++) {
      for (let col = 0; col * step < TILE + step; col++) {
        const x = col * step + (row % 2 ? step / 2 : 0);
        const y = row * step;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  return new Promise<Blob>((resolve, reject) => {
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error('纹理生成失败'))), 'image/jpeg', 0.9);
  });
}
