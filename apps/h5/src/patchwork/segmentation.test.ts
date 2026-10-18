import { describe, expect, it } from 'vitest';
import { analyzeSegments, type SegmentMode } from './segmentation';
import { validatePiece } from './model';

function picture(w = 120, h = 90) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i * 4] = 255; data[i * 4 + 1] = 255; data[i * 4 + 2] = 255; data[i * 4 + 3] = 255; }
  const pixel = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b;
  };
  const rect = (left: number, top: number, right: number, bottom: number, r: number, g: number, b: number) => {
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) pixel(x, y, r, g, b);
  };
  return { data, rect, w, h };
}
function process(img: ReturnType<typeof picture>, mode: SegmentMode, detail: 'simple' | 'standard' | 'fine' = 'standard') {
  return analyzeSegments({ requestId: 42, rgba: img.data, width: img.w, height: img.h, mode, detail, lineThreshold: 170, minAreaPixels: 80 });
}

describe('图片转拼布线稿识别', () => {
  it('黑白闭合线稿识别为真正可填充的封闭多边形', () => {
    const img = picture();
    // 两个不相接的黑色矩形边框，各自包围白色区域。
    for (const [l, t, r, b] of [[10, 10, 54, 74], [65, 15, 108, 65]]) {
      img.rect(l, t, r, t + 3, 0, 0, 0);
      img.rect(l, b - 3, r, b, 0, 0, 0);
      img.rect(l, t, l + 3, b, 0, 0, 0);
      img.rect(r - 3, t, r, b, 0, 0, 0);
    }
    const result = process(img, 'line');
    expect(result.requestId).toBe(42);
    expect(result.polygons).toHaveLength(2);
    result.polygons.forEach(({ points }) => {
      expect(points.length).toBeGreaterThanOrEqual(4);
      expect(validatePiece(points)).toBe('');
    });
  });

  it('黑色实心剪影同样能识别为单个布片', () => {
    const img = picture();
    img.rect(20, 20, 70, 68, 0, 0, 0);
    const result = process(img, 'line');
    expect(result.polygons).toHaveLength(1);
    expect(validatePiece(result.polygons[0].points)).toBe('');
  });

  it('彩色插画按色块提取轮廓，过滤整张白色背景', () => {
    const img = picture();
    img.rect(10, 10, 52, 72, 30, 60, 220);
    img.rect(63, 16, 108, 67, 60, 195, 90);
    const result = process(img, 'color');
    expect(result.polygons).toHaveLength(2);
    result.polygons.forEach((v) => expect(validatePiece(v.points)).toBe(''));
  });

  it('最小面积阈值过滤细碎噪声', () => {
    const img = picture();
    img.rect(20, 20, 22, 22, 0, 0, 0);
    expect(process(img, 'line').polygons).toHaveLength(0);
  });
});
