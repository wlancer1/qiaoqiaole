import { extractDominantColorFromRgba } from '../patchwork/fabricInventory';
export type FabricCropRect = { x: number; y: number; w: number; h: number };
export function clampFabricCrop(rect: FabricCropRect, minSize = .02): FabricCropRect {
 const min = Math.max(.02, Math.min(.5, minSize));
 const w = Math.min(1, Math.max(min, rect.w)); const h = Math.min(1, Math.max(min, rect.h));
 return { x: Math.max(0, Math.min(1 - w, rect.x)), y: Math.max(0, Math.min(1 - h, rect.y)), w, h };
}
export function fitFabricCropAspect(
 rect: FabricCropRect,
 imageWidth: number,
 imageHeight: number,
 targetPixelAspect: number,
 fillScale = .88,
): FabricCropRect {
 if (!(imageWidth > 0 && imageHeight > 0) || !(targetPixelAspect > 0 && Number.isFinite(targetPixelAspect))) {
  return clampFabricCrop(rect, .12);
 }
 const normAspect = Math.max(.05, Math.min(20, targetPixelAspect * (imageHeight / imageWidth)));
 const maxW = normAspect >= 1 ? 1 : normAspect;
 const maxH = normAspect >= 1 ? 1 / normAspect : 1;
 const scale = Math.max(.18, Math.min(1, fillScale));
 const w = maxW * scale;
 const h = maxH * scale;
 const cx = rect.x + rect.w / 2;
 const cy = rect.y + rect.h / 2;
 return {
  x: Math.max(0, Math.min(1 - w, cx - w / 2)),
  y: Math.max(0, Math.min(1 - h, cy - h / 2)),
  w,
  h,
 };
}
export function resizeFabricCropRect(
 start: FabricCropRect,
 mode: string,
 dx: number,
 dy: number,
 options?: { imageWidth?: number; imageHeight?: number; lockPixelAspect?: number | null; minSize?: number },
): FabricCropRect {
 const minSize = options?.minSize ?? .12;
 if (mode === 'move') return clampFabricCrop({ ...start, x: start.x + dx, y: start.y + dy }, minSize);
 const lockAspect = options?.lockPixelAspect;
 const imgW = options?.imageWidth ?? 1;
 const imgH = options?.imageHeight ?? 1;
 if (lockAspect && lockAspect > 0 && imgW > 0 && imgH > 0) {
  const normAspect = Math.max(.05, Math.min(20, lockAspect * (imgH / imgW)));
  const maxOverallW = normAspect >= 1 ? 1 : normAspect;
  const minW = Math.min(maxOverallW, Math.max(minSize, minSize * normAspect));
  const anchorRight = mode.includes('w');
  const anchorBottom = mode.includes('n');
  const ax = anchorRight ? start.x + start.w : start.x;
  const ay = anchorBottom ? start.y + start.h : start.y;
  const rawW = mode.includes('w') ? start.w - dx : mode.includes('e') ? start.w + dx : start.w;
  const rawH = mode.includes('n') ? start.h - dy : mode.includes('s') ? start.h + dy : start.h;
  const desiredW = !mode.includes('e') && !mode.includes('w')
   ? rawH * normAspect
   : !mode.includes('n') && !mode.includes('s')
    ? rawW
    : (rawW + rawH * normAspect) / 2;
  const availW = anchorRight ? ax : 1 - ax;
  const availH = anchorBottom ? ay : 1 - ay;
  const boundW = Math.min(availW, availH * normAspect);
  const w = Math.max(Math.min(minW, boundW), Math.min(boundW, desiredW));
  const h = w / normAspect;
  const x = anchorRight ? ax - w : ax;
  const y = anchorBottom ? ay - h : ay;
  return clampFabricCrop({ x, y, w, h }, .02);
 }
 const left = mode.includes('w') ? Math.max(0, Math.min(start.x + start.w - minSize, start.x + dx)) : start.x;
 const top = mode.includes('n') ? Math.max(0, Math.min(start.y + start.h - minSize, start.y + dy)) : start.y;
 const right = mode.includes('e') ? Math.min(1, Math.max(start.x + minSize, start.x + start.w + dx)) : start.x + start.w;
 const bottom = mode.includes('s') ? Math.min(1, Math.max(start.y + minSize, start.y + start.h + dy)) : start.y + start.h;
 return clampFabricCrop({ x: left, y: top, w: right - left, h: bottom - top }, minSize);
}
export function fabricCropPixels(width: number, height: number, rect: FabricCropRect) {
 if (!(width > 0 && height > 0)) throw new Error('图片尺寸无效');
 const r = clampFabricCrop(rect);
 const x = Math.min(width - 1, Math.round(r.x * width)); const y = Math.min(height - 1, Math.round(r.y * height));
 return { x, y, width: Math.max(1, Math.min(width - x, Math.round(r.w * width))), height: Math.max(1, Math.min(height - y, Math.round(r.h * height))) };
}
export function cropFabricPhoto(image: HTMLImageElement, rect: FabricCropRect) {
 const source = fabricCropPixels(image.naturalWidth, image.naturalHeight, rect);
 const canvas = document.createElement('canvas'); let scale = Math.min(1, 768 / Math.max(source.width, source.height));
 let dataUrl = ''; let color = '#d9c8a9';
 for (let attempt = 0; attempt < 8; attempt++) {
  canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('图片处理失败，请重新选择');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  color = extractDominantColorFromRgba(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  dataUrl = canvas.toDataURL('image/jpeg', .82);
  if (dataUrl.length <= 390000) return { image: dataUrl, color };
  scale *= .75;
 }
 throw new Error('图片过大，请缩小截取区域后重试');
}
export const fabricBlobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
 const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(blob);
});
