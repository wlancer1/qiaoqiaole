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

describe('方案A 新管线', () => {
  it('auto 模式把黑白线稿识别为线稿', () => {
    const img = picture();
    for (const [l, t, r, b] of [[10, 10, 54, 74], [65, 15, 108, 65]]) {
      img.rect(l, t, r, t + 3, 0, 0, 0);
      img.rect(l, b - 3, r, b, 0, 0, 0);
      img.rect(l, t, l + 3, b, 0, 0, 0);
      img.rect(r - 3, t, r, b, 0, 0, 0);
    }
    const result = analyzeSegments({ requestId: 7, rgba: img.data, width: img.w, height: img.h, mode: 'auto', detail: 'standard', lineThreshold: 0, minAreaPixels: 80 });
    expect(result.mode).toBe('line');
    expect(result.polygons).toHaveLength(2);
  });

  it('彩色照片：色数受控、碎斑被归属而不是丢弃', () => {
    const img = picture(160, 120);
    // 蓝天底 + 红色大圆 + 几颗绿色碎斑（在圆内）
    img.rect(0, 0, 160, 120, 70, 130, 215);
    for (let y = 30; y < 90; y++) for (let x = 50; x < 110; x++) {
      if (Math.hypot(x - 80, y - 60) < 28) { const i = (y * 160 + x) * 4; img.data[i] = 214; img.data[i + 1] = 84; img.data[i + 2] = 72; }
    }
    for (const [sx, sy] of [[74, 52], [86, 66], [80, 44]]) img.rect(sx, sy, sx + 2, sy + 2, 40, 200, 90);
    const result = analyzeSegments({ requestId: 8, rgba: img.data, width: 160, height: 120, mode: 'color', detail: 'standard', lineThreshold: 0, minAreaPixels: 60, pxPerMm: 2 });
    const colors = new Set(result.polygons.map((p) => p.color));
    expect(colors.size).toBeLessThanOrEqual(18);
    // 没有任何一块是碎斑的绿色
    expect(result.polygons.some((p) => p.color.toLowerCase() === '#28c85a')).toBe(false);
    // 圆被完整识别：最大块面积接近圆面积
    const biggest = Math.max(...result.polygons.map((p) => p.pixels));
    expect(biggest).toBeGreaterThan(2000);
    result.polygons.forEach((p) => expect(validatePiece(p.points)).toBe(''));
  });

  it('圆形轮廓平滑且面积不走样', () => {
    const img = picture(140, 140);
    img.rect(0, 0, 140, 140, 240, 240, 240);
    for (let y = 20; y < 120; y++) for (let x = 20; x < 120; x++) {
      if (Math.hypot(x - 70, y - 70) < 42) { const i = (y * 140 + x) * 4; img.data[i] = 60; img.data[i + 1] = 90; img.data[i + 2] = 160; }
    }
    const result = analyzeSegments({ requestId: 9, rgba: img.data, width: 140, height: 140, mode: 'color', detail: 'standard', lineThreshold: 0, minAreaPixels: 60, pxPerMm: 2 });
    expect(result.polygons.length).toBeGreaterThanOrEqual(1);
    const circle = result.polygons[0];
    const rs = circle.points.map((q) => Math.hypot(q.x - 70, q.y - 70));
    const rMin = Math.min(...rs), rMax = Math.max(...rs);
    // 半径偏差收窄（旧管线阶梯圆常见 >15% 偏差）
    expect(rMax - rMin).toBeLessThan(42 * 0.16);
    expect(circle.points.length).toBeGreaterThanOrEqual(14);
  });
});

describe('紧凑小片过滤', () => {
  it('大区域里的小方块残片不单独成片', () => {
    const img = picture(160, 120);
    img.rect(0, 0, 160, 120, 70, 130, 215);
    for (let y = 30; y < 90; y++) for (let x = 50; x < 110; x++) {
      if (Math.hypot(x - 80, y - 60) < 28) { const i = (y * 160 + x) * 4; img.data[i] = 214; img.data[i + 1] = 84; img.data[i + 2] = 72; }
    }
    // 两块 6×6 的浅色小方块（在蓝天区域，离圆较远）
    img.rect(16, 14, 22, 20, 245, 240, 200);
    img.rect(132, 96, 138, 102, 245, 240, 200);
    const result = analyzeSegments({ requestId: 11, rgba: img.data, width: 160, height: 120, mode: 'color', detail: 'standard', lineThreshold: 0, minAreaPixels: 30, pxPerMm: 1 });
    // 只剩圆片（背景按规则过滤，小方块并入/丢弃）
    expect(result.polygons).toHaveLength(1);
    expect(result.polygons[0].pixels).toBeGreaterThan(2000);
  });
});
