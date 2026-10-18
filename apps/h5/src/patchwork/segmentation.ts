/** 图片 -> 可编辑的封闭布片轮廓。纯像素算法，供 Worker 与测试复用。 */
export type SegmentMode = 'line' | 'color';
export type Detail = 'simple' | 'standard' | 'fine';
export type SegmentPoint = { x: number; y: number };
export type Segment = { points: SegmentPoint[]; color: string; pixels: number; hasHoles: boolean };
export type SegmentRequest = {
  requestId: number; rgba: Uint8ClampedArray; width: number; height: number;
  mode: SegmentMode; detail: Detail; lineThreshold: number; minAreaPixels: number;
};
export type SegmentResult = { requestId: number; polygons: Segment[]; ignored: number; tooMany: boolean };

const MAX_SEGMENTS = 100;
const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const hex = (n: number) => clampByte(n).toString(16).padStart(2, '0');

function simplify(points: SegmentPoint[], tolerance: number): SegmentPoint[] {
  if (points.length <= 3) return points;
  // 先删去网格轮廓中的共线点；保留真实拐角。
  const corners = points.filter((p, i) => {
    const a = points[(i + points.length - 1) % points.length];
    const b = points[(i + 1) % points.length];
    return (p.x - a.x) * (b.y - p.y) !== (p.y - a.y) * (b.x - p.x);
  });
  if (corners.length <= 3) return corners;
  const distSq = (a: SegmentPoint, b: SegmentPoint) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  let far = 1;
  for (let i = 2; i < corners.length; i++) if (distSq(corners[0], corners[i]) > distSq(corners[0], corners[far])) far = i;
  const rdp = (pts: SegmentPoint[]): SegmentPoint[] => {
    if (pts.length <= 2) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let max = 0, index = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length;
      if (d > max) { max = d; index = i; }
    }
    if (max <= tolerance || index < 0) return [a, b];
    return [...rdp(pts.slice(0, index + 1)).slice(0, -1), ...rdp(pts.slice(index))];
  };
  const first = rdp(corners.slice(0, far + 1));
  const second = rdp([...corners.slice(far), corners[0]]);
  const output = [...first.slice(0, -1), ...second.slice(0, -1)];
  // 极复杂图像控制节点上限，避免将数万节点直接发给编辑器。
  if (output.length > 360) return output.filter((_, i) => i % Math.ceil(output.length / 360) === 0);
  return output;
}

function traceRegion(pixels: Int32Array, count: number, labels: Int32Array, label: number, w: number, h: number, tolerance: number) {
  const stride = w + 1;
  const edges = new Map<number, number[]>();
  const put = (a: number, b: number) => {
    const list = edges.get(a) || []; list.push(b); edges.set(a, list);
  };
  for (let j = 0; j < count; j++) {
    const i = pixels[j], x = i % w, y = Math.floor(i / w), a = y * stride + x;
    if (y === 0 || labels[i - w] !== label) put(a, a + 1);
    if (x === w - 1 || labels[i + 1] !== label) put(a + 1, a + stride + 1);
    if (y === h - 1 || labels[i + w] !== label) put(a + stride + 1, a + stride);
    if (x === 0 || labels[i - 1] !== label) put(a + stride, a);
  }
  const rings: SegmentPoint[][] = [];
  while (edges.size) {
    const start = edges.keys().next().value as number;
    let current = start;
    const ring: SegmentPoint[] = [];
    for (let j = 0; j < Math.max(12, count * 4 + 8); j++) {
      ring.push({ x: current % stride, y: Math.floor(current / stride) });
      const list = edges.get(current);
      if (!list?.length) break;
      const next = list.pop()!;
      if (!list.length) edges.delete(current);
      current = next;
      if (current === start) break;
    }
    if (ring.length >= 3 && current === start) rings.push(ring);
  }
  const ringArea = (r: SegmentPoint[]) => Math.abs(r.reduce((v, p, i) => {
    const n = r[(i + 1) % r.length]; return v + p.x * n.y - n.x * p.y;
  }, 0));
  rings.sort((a, b) => ringArea(b) - ringArea(a));
  return { points: rings[0] ? simplify(rings[0], tolerance) : [], hasHoles: rings.length > 1 };
}

function makeLineMask(rgba: Uint8ClampedArray, w: number, h: number, threshold: number): Uint8Array {
  const size = w * h;
  const gray = new Uint8Array(size);
  let whites = 0, opaque = 0;
  for (let i = 0; i < size; i++) {
    const at = i * 4, a = rgba[at + 3] / 255;
    const lum = (rgba[at] * .299 + rgba[at + 1] * .587 + rgba[at + 2] * .114) * a + 255 * (1 - a);
    gray[i] = Math.round(lum);
    if (lum > 215) whites++;
    if (a > .4) opaque++;
  }
  // 白底手绘/扫描稿：直接找墨线；照片：用灰度梯度近似提取轮廓。
  const drawing = whites / size > .37 || opaque / size < .65;
  const mask = new Uint8Array(size);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (drawing) {
      mask[i] = gray[i] < threshold ? 1 : 0;
    } else {
      const gx = -gray[i - w - 1] + gray[i - w + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + w - 1] + gray[i + w + 1];
      const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
      mask[i] = Math.hypot(gx, gy) >= Math.max(95, (235 - threshold) * 2.5) ? 1 : 0;
    }
  }
  // 3×3 形态学闭运算，弥合 1–2px 的线条断点，便于封闭区域识别。
  const dilated = new Uint8Array(size);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    let any = false;
    for (let dy = -1; dy <= 1 && !any; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (mask[i + dy * w + dx]) { any = true; break; }
    }
    dilated[i] = any ? 1 : 0;
  }
  const closed = new Uint8Array(size);
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const i = y * w + x;
    let all = true;
    for (let dy = -1; dy <= 1 && all; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dilated[i + dy * w + dx]) { all = false; break; }
    }
    closed[i] = all ? 1 : 0;
  }
  return closed;
}

export function analyzeSegments(input: SegmentRequest): SegmentResult {
  const { requestId, rgba, width: w, height: h, mode, detail, minAreaPixels } = input;
  if (w < 8 || h < 8 || w * h * 4 !== rgba.length || w * h > 900_000) {
    return { requestId, polygons: [], ignored: 0, tooMany: false };
  }
  const size = w * h, lineMask = mode === 'line' ? makeLineMask(rgba, w, h, input.lineThreshold) : null;
  const step = detail === 'simple' ? 92 : detail === 'fine' ? 32 : 56;
  const keys = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    if (lineMask) { keys[i] = lineMask[i] ? 1 : 0; continue; }
    const at = i * 4, a = rgba[at + 3] / 255;
    if (a < .1) { keys[i] = -1; continue; }
    const r = Math.min(255, Math.round((rgba[at] * a + 255 * (1 - a)) / step) * step);
    const g = Math.min(255, Math.round((rgba[at + 1] * a + 255 * (1 - a)) / step) * step);
    const b = Math.min(255, Math.round((rgba[at + 2] * a + 255 * (1 - a)) / step) * step);
    keys[i] = (r << 16) | (g << 8) | b;
  }
  const labels = new Int32Array(size); labels.fill(-1);
  const queue = new Int32Array(size);
  const polygons: Segment[] = [];
  let ignored = 0, regionId = 0;
  const processKey = (key: number, isDarkSilhouette: boolean) => {
    for (let start = 0; start < size; start++) {
      if (labels[start] !== -1 || keys[start] < 0) continue;
      if (lineMask && keys[start] !== key) continue;
      const target = keys[start], label = regionId++;
      let head = 0, tail = 1; queue[0] = start; labels[start] = label;
      let touchesBorder = false, minX = w, minY = h, maxX = 0, maxY = 0;
      let rSum = 0, gSum = 0, bSum = 0;
      while (head < tail) {
        const i = queue[head++], x = i % w, y = Math.floor(i / w), at = i * 4;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
        minX = Math.min(x, minX); minY = Math.min(y, minY); maxX = Math.max(x, maxX); maxY = Math.max(y, maxY);
        rSum += rgba[at]; gSum += rgba[at + 1]; bSum += rgba[at + 2];
        const neighbors = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const n of neighbors) if (n >= 0 && labels[n] === -1 && keys[n] === target) { labels[n] = label; queue[tail++] = n; }
      }
      const density = tail / ((maxX - minX + 1) * (maxY - minY + 1));
      const skip = tail < Math.max(4, minAreaPixels) || (mode === 'line' && !isDarkSilhouette && touchesBorder) ||
        (isDarkSilhouette && density < .42) ||
        (mode === 'color' && touchesBorder && tail > size * .38);
      if (skip) { ignored++; continue; }
      const traced = traceRegion(queue, tail, labels, label, w, h, detail === 'simple' ? 3 : detail === 'fine' ? .8 : 1.5);
      if (traced.points.length < 3) { ignored++; continue; }
      const color = mode === 'line' ? '#fdfcf8' : `#${hex(rSum / tail)}${hex(gSum / tail)}${hex(bSum / tail)}`;
      polygons.push({ points: traced.points, color, pixels: tail, hasHoles: traced.hasHoles });
    }
  };
  if (lineMask) {
    processKey(0, false);
    // 已标记的非墨线内部留白不参与第二次分析。
    processKey(1, true);
  } else processKey(0, false);
  polygons.sort((a, b) => b.pixels - a.pixels);
  return { requestId, polygons: polygons.slice(0, MAX_SEGMENTS), ignored: ignored + Math.max(0, polygons.length - MAX_SEGMENTS), tooMany: polygons.length > MAX_SEGMENTS };
}
