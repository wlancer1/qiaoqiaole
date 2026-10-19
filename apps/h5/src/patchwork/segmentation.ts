/** 图片 -> 可编辑的封闭布片轮廓。纯像素算法，供 Worker 与测试复用。
 *  彩色管线：轻微降噪 -> Lab 空间 k-means 量化（色数受控）-> 连通域标记
 *  -> 碎斑按最长共享边归属邻居（不丢弃）-> 边缘描摹 -> 按毫米容差的
 *  Douglas-Peucker 简化 -> 保留尖角的 Chaikin 平滑。
 *  线稿管线：灰度阈值（可 Otsu 自动）+ Sobel 描线 + 形态学闭运算（原有）。 */
export type SegmentMode = 'line' | 'color';
export type Detail = 'simple' | 'standard' | 'fine';
export type SegmentPoint = { x: number; y: number };
export type Segment = { points: SegmentPoint[]; color: string; pixels: number; hasHoles: boolean };
export type SegmentRequest = {
  requestId: number; rgba: Uint8ClampedArray; width: number; height: number;
  mode: SegmentMode | 'auto'; detail: Detail; lineThreshold: number; minAreaPixels: number;
  /** 每毫米像素数（按导入显示尺寸换算）；给出时简化容差按毫米计算。 */
  pxPerMm?: number;
};
export type SegmentResult = { requestId: number; polygons: Segment[]; ignored: number; tooMany: boolean; mode: SegmentMode };

const MAX_SEGMENTS = 100;
const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const hex = (n: number) => clampByte(n).toString(16).padStart(2, '0');

/** 简化容差：优先按毫米（贴合真实裁布尺寸），无 pxPerMm 时退回像素档位。 */
function tolerancePx(detail: Detail, pxPerMm?: number): number {
  if (pxPerMm && pxPerMm > 0) {
    const mm = detail === 'simple' ? 0.6 : detail === 'fine' ? 0.25 : 0.4;
    return Math.max(0.7, Math.min(8, mm * pxPerMm));
  }
  return detail === 'simple' ? 3 : detail === 'fine' ? 0.8 : 1.5;
}

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
  if (output.length > 720) return output.filter((_, i) => i % Math.ceil(output.length / 720) === 0);
  return output;
}

/** 保留尖角的 Chaikin 平滑一轮：转角大的顶点原样保留，其余边做 1/4-3/4 切角，
 *  把像素阶梯变成平缓曲线；之后用更小的容差再简化一次，去掉冗余节点。 */
function smoothRing(points: SegmentPoint[], tolerance: number): SegmentPoint[] {
  const n = points.length;
  if (n < 5) return points;
  const corner = points.map((p, i) => {
    const a = points[(i + n - 1) % n], b = points[(i + 1) % n];
    const v1x = p.x - a.x, v1y = p.y - a.y, v2x = b.x - p.x, v2y = b.y - p.y;
    const l1 = Math.hypot(v1x, v1y) || 1, l2 = Math.hypot(v2x, v2y) || 1;
    return (v1x * v2x + v1y * v2y) / (l1 * l2) < 0.45;
  });
  if (corner.every((c) => c)) return points;
  const out: SegmentPoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i], q = points[(i + 1) % n];
    out.push(corner[i] ? p : { x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 });
    out.push(corner[(i + 1) % n] ? q : { x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
  }
  const ded = out.filter((p, i) => {
    const q = out[(i + 1) % out.length];
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-6;
  });
  if (ded.length < 4) return points;
  return simplify(ded, tolerance * 0.45);
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
  const outer = rings[0] ? smoothRing(simplify(rings[0], tolerance), tolerance) : [];
  return { points: outer, hasHoles: rings.length > 1 };
}

function makeLineMask(rgba: Uint8ClampedArray, w: number, h: number, threshold: number): Uint8Array {
  const size = w * h;
  const gray = new Uint8Array(size);
  let whites = 0, opaque = 0;
  for (let i = 0; i < size; i++) {
    const at = i * 4, a = rgba[at + 3] / 255;
    const v = Math.round((rgba[at] * a + 255 * (1 - a)) * 0.299 + (rgba[at + 1] * a + 255 * (1 - a)) * 0.587 + (rgba[at + 2] * a + 255 * (1 - a)) * 0.114);
    gray[i] = v;
    if (a > 0.1) { opaque++; if (v > 235) whites++; }
  }
  const drawing = opaque > 0 && whites / opaque > 0.55;
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

/** 自动判断线稿还是彩色：近白底 + 适量深色线条 -> 线稿。 */
function detectMode(rgba: Uint8ClampedArray, w: number, h: number): SegmentMode {
  let white = 0, dark = 0, n = 0;
  for (let i = 0; i < w * h; i += 4) {
    const at = i * 4, a = rgba[at + 3] / 255;
    if (a < 0.1) continue;
    const r = rgba[at] * a + 255 * (1 - a), g = rgba[at + 1] * a + 255 * (1 - a), b = rgba[at + 2] * a + 255 * (1 - a);
    const v = 0.299 * r + 0.587 * g + 0.114 * b;
    n++;
    if (v > 238) white++;
    else if (v < 80) dark++;
  }
  if (!n) return 'color';
  const wr = white / n, dr = dark / n;
  return wr > 0.5 && dr > 0.015 && dr < 0.5 ? 'line' : 'color';
}

/** Otsu 自动阈值（线稿模式未给阈值时）。 */
function otsuThreshold(rgba: Uint8ClampedArray, w: number, h: number): number {
  const hist = new Float64Array(256);
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    const at = i * 4, a = rgba[at + 3] / 255;
    const v = Math.round((rgba[at] * a + 255 * (1 - a)) * 0.299 + (rgba[at + 1] * a + 255 * (1 - a)) * 0.587 + (rgba[at + 2] * a + 255 * (1 - a)) * 0.114);
    hist[v]++; total++;
  }
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = -1, threshold = 170;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; threshold = i; }
  }
  return Math.max(90, Math.min(220, threshold));
}

// ---- Lab 颜色量化 ----
type Lab = { l: number; a: number; b: number };
function rgbToLab(r: number, g: number, b: number): Lab {
  const f = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g2 = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = g2(x); y = g2(y); z = g2(z);
  return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}
function labToHex(lab: Lab): string {
  const y = (lab.l + 16) / 116, x = y + lab.a / 500, z = y - lab.b / 200;
  const f = (t: number) => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
  const X = f(x) * 0.95047, Y = lab.l > 7.9996 ? Math.pow(y, 3) : lab.l / 903.3, Z = f(z) * 1.08883;
  const R = X * 3.2406 - Y * 1.5372 - Z * 0.4986, G = -X * 0.9689 + Y * 1.8758 + Z * 0.0415, B = X * 0.0557 - Y * 0.204 + Z * 1.057;
  const c = (v: number) => { v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return clampByte(v * 255); };
  return `#${hex(c(R))}${hex(c(G))}${hex(c(B))}`;
}

/** median-cut 播种 + Lloyd 迭代，在 Lab 空间把像素桶聚成 K 个色心。 */
function buildPalette(buckets: Array<{ lab: Lab; count: number }>, k: number): Lab[] {
  if (!buckets.length) return [];
  if (buckets.length <= k) return buckets.map((b) => b.lab);
  type Box = { items: Array<{ lab: Lab; count: number }> };
  let boxes: Box[] = [{ items: buckets }];
  while (boxes.length < k) {
    let bi = -1, bestRange = -1, bestCh = 0;
    boxes.forEach((box, i) => {
      if (box.items.length < 2) return;
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      box.items.forEach(({ lab }) => { const v = [lab.l, lab.a, lab.b]; for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], v[c]); mx[c] = Math.max(mx[c], v[c]); } });
      for (let c = 0; c < 3; c++) if (mx[c] - mn[c] > bestRange) { bestRange = mx[c] - mn[c]; bi = i; bestCh = c; }
    });
    if (bi < 0 || bestRange <= 0.01) break;
    const box = boxes.splice(bi, 1)[0];
    const key = (lab: Lab) => (bestCh === 0 ? lab.l : bestCh === 1 ? lab.a : lab.b);
    const sorted = [...box.items].sort((p, q) => key(p.lab) - key(q.lab));
    const total = sorted.reduce((s, x) => s + x.count, 0);
    let acc = 0, split = 0;
    while (split < sorted.length - 2 && acc + sorted[split].count < total / 2) { acc += sorted[split].count; split++; }
    boxes.push({ items: sorted.slice(0, split + 1) }, { items: sorted.slice(split + 1) });
  }
  let centroids = boxes.map((box) => {
    let l = 0, a = 0, b = 0, n = 0;
    box.items.forEach(({ lab, count }) => { l += lab.l * count; a += lab.a * count; b += lab.b * count; n += count; });
    return n ? { l: l / n, a: a / n, b: b / n } : box.items[0].lab;
  });
  for (let iter = 0; iter < 8; iter++) {
    const sums = centroids.map(() => ({ l: 0, a: 0, b: 0, n: 0 }));
    for (const { lab, count } of buckets) {
      let bi = 0, bd = Infinity;
      centroids.forEach((c, i) => { const d = (lab.l - c.l) ** 2 + (lab.a - c.a) ** 2 + (lab.b - c.b) ** 2; if (d < bd) { bd = d; bi = i; } });
      const s = sums[bi]; s.l += lab.l * count; s.a += lab.a * count; s.b += lab.b * count; s.n += count;
    }
    centroids = centroids.map((c, i) => (sums[i].n ? { l: sums[i].l / sums[i].n, a: sums[i].a / sums[i].n, b: sums[i].b / sums[i].n } : c));
  }
  return centroids;
}

type Comp = { id: number; pixels: number[]; palette: number; size: number; border: boolean; alive: boolean; perim?: number };

function analyzeColor(rgba: Uint8ClampedArray, w: number, h: number, detail: Detail, minAreaPixels: number, tolPx: number, pxPerMm?: number) {
  const size = w * h;
  // 合成到白底 + 3×3 盒式模糊降噪
  const cr = new Float32Array(size), cg = new Float32Array(size), cb = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const at = i * 4, a = rgba[at + 3] / 255;
    cr[i] = rgba[at] * a + 255 * (1 - a); cg[i] = rgba[at + 1] * a + 255 * (1 - a); cb[i] = rgba[at + 2] * a + 255 * (1 - a);
  }
  const blur = (src: Float32Array) => {
    const out = new Float32Array(size);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        s += src[yy * w + xx]; n++;
      }
      out[y * w + x] = s / n;
    }
    return out;
  };
  const br = blur(blur(cr)), bg = blur(blur(cg)), bb = blur(blur(cb));
  // 16 级/通道分桶（降噪后的均值色）-> Lab 桶
  const bucketOf = new Int32Array(size);
  const bucketMap = new Map<number, { lab: Lab; count: number }>();
  for (let i = 0; i < size; i++) {
    if (rgba[i * 4 + 3] / 255 < 0.1) { bucketOf[i] = -1; continue; }
    const key = ((br[i] >> 4) << 8) | ((bg[i] >> 4) << 4) | (bb[i] >> 4);
    bucketOf[i] = key;
    const hit = bucketMap.get(key);
    if (hit) hit.count++;
    else bucketMap.set(key, { lab: { l: 0, a: 0, b: 0 }, count: 1 });
  }
  bucketMap.forEach((v, key) => {
    const r = ((key >> 8) & 15) * 16 + 8, g = ((key >> 4) & 15) * 16 + 8, b = (key & 15) * 16 + 8;
    v.lab = rgbToLab(r, g, b);
  });
  const K = detail === 'simple' ? 10 : detail === 'fine' ? 28 : 18;
  const palette = buildPalette([...bucketMap.values()], Math.min(K, bucketMap.size));
  const bucketPalette = new Map<number, number>();
  bucketMap.forEach((v, key) => {
    let bi = 0, bd = Infinity;
    palette.forEach((c, i) => { const d = (v.lab.l - c.l) ** 2 + (v.lab.a - c.a) ** 2 + (v.lab.b - c.b) ** 2; if (d < bd) { bd = d; bi = i; } });
    bucketPalette.set(key, bi);
  });
  const keys = new Int32Array(size);
  for (let i = 0; i < size; i++) keys[i] = bucketOf[i] < 0 ? -1 : (bucketPalette.get(bucketOf[i]) ?? 0);
  // 3×3 多数滤波：邻居中另一色占比过半则改判，压平量化边界的像素级抖动
  const cleaned = new Int32Array(keys);
  const neigh = new Int32Array(9);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, self = keys[i];
    if (self < 0) continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const v = keys[i + dy * w + dx];
      if (v >= 0) neigh[n++] = v;
    }
    let bestV = self, bestC = 0;
    for (let a = 0; a < n; a++) {
      let c = 0;
      for (let b = 0; b < n; b++) if (neigh[b] === neigh[a]) c++;
      if (c > bestC) { bestC = c; bestV = neigh[a]; }
    }
    if (bestV !== self && bestC >= 3 && bestC * 2 > n) cleaned[i] = bestV;
  }
  keys.set(cleaned);
  // 连通域标记（4 连通，按色板索引）
  const labels = new Int32Array(size).fill(-1);
  const comps: Comp[] = [];
  const queue = new Int32Array(size);
  for (let start = 0; start < size; start++) {
    if (labels[start] !== -1 || keys[start] < 0) continue;
    const id = comps.length, target = keys[start];
    let head = 0, tail = 1; queue[0] = start; labels[start] = id;
    const pixels: number[] = [];
    let border = false;
    while (head < tail) {
      const i = queue[head++], x = i % w, y = Math.floor(i / w);
      pixels.push(i);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      if (x > 0 && labels[i - 1] === -1 && keys[i - 1] === target) { labels[i - 1] = id; queue[tail++] = i - 1; }
      if (x < w - 1 && labels[i + 1] === -1 && keys[i + 1] === target) { labels[i + 1] = id; queue[tail++] = i + 1; }
      if (y > 0 && labels[i - w] === -1 && keys[i - w] === target) { labels[i - w] = id; queue[tail++] = i - w; }
      if (y < h - 1 && labels[i + w] === -1 && keys[i + w] === target) { labels[i + w] = id; queue[tail++] = i + w; }
    }
    comps.push({ id, pixels, palette: target, size: pixels.length, border, alive: true });
  }
  for (const c of comps) {
    let n = 0;
    for (const i of c.pixels) { const x = i % w, y = Math.floor(i / w); if (x === 0 || y === 0 || x === w - 1 || y === h - 1) n++; }
    c.perim = n;
  }
  // 区域合并：先并「边界膜」（无内芯的薄片，多为量化在硬边留下的过渡圈），
  // 再按尺寸把碎斑并入共享边最长的邻居；只有贴边的大块才视为背景、不得吞并。
  const minArea = Math.max(9, minAreaPixels || Math.round(size * 0.0004));
  let ignored = 0;
  const byId = new Map(comps.map((c) => [c.id, c]));
  const isBackgroundLike = (c: Comp) => c.border && c.size > size * 0.25;
  const mergeIntoNeighbor = (comp: Comp, opts: { allowBg?: boolean; excludeIds?: Set<number> } = {}): boolean => {
    const borders = new Map<number, number>();
    for (const i of comp.pixels) {
      const x = i % w, y = Math.floor(i / w);
      const ns = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const n of ns) {
        if (n < 0) continue;
        const lb = labels[n];
        if (lb >= 0 && lb !== comp.id) borders.set(lb, (borders.get(lb) || 0) + 1);
      }
    }
    const pool = [...borders.entries()]
      .map(([id, len]) => ({ comp: byId.get(id)!, len }))
      .filter((e) => e.comp?.alive && (opts.allowBg || !isBackgroundLike(e.comp)) && !(opts.excludeIds && opts.excludeIds.has(e.comp.id)));
    if (!pool.length) return false;
    pool.sort((p, q) => q.len - p.len || (
      Math.hypot(palette[comp.palette].l - palette[p.comp.palette].l, palette[comp.palette].a - palette[p.comp.palette].a, palette[comp.palette].b - palette[p.comp.palette].b) -
      Math.hypot(palette[comp.palette].l - palette[q.comp.palette].l, palette[comp.palette].a - palette[q.comp.palette].a, palette[comp.palette].b - palette[q.comp.palette].b)
    ));
    const target = pool[0].comp;
    for (const i of comp.pixels) labels[i] = target.id;
    target.pixels = target.pixels.concat(comp.pixels);
    target.size += comp.size;
    target.border = target.border || comp.border;
    target.perim = (target.perim || 0) + (comp.perim || 0);
    comp.alive = false;
    return true;
  };
  // 边界膜判定（三轮腐蚀后无残留 = 宽度 <=6px 的薄片）先整批算好：
  // 合并时优先并入实心邻居，避免相邻过渡带互并成一条活下来的假长条。
  const filmIds = new Set<number>();
  for (const comp of comps) {
    if (!comp.alive || comp.size > Math.max(4 * minArea, 6000)) continue;
    let level = new Set(comp.pixels);
    for (let round = 0; round < 3 && level.size; round++) {
      const prev = level;
      level = new Set();
      for (const i of prev) {
        const x = i % w, y = Math.floor(i / w);
        if (x > 0 && x < w - 1 && y > 0 && y < h - 1 && prev.has(i - 1) && prev.has(i + 1) && prev.has(i - w) && prev.has(i + w)) level.add(i);
      }
    }
    if (level.size === 0) filmIds.add(comp.id);
  }
  for (const comp of comps) {
    if (!comp.alive || !filmIds.has(comp.id)) continue;
    if (!mergeIntoNeighbor(comp, { excludeIds: filmIds }) && !mergeIntoNeighbor(comp, { allowBg: true, excludeIds: filmIds }) && !mergeIntoNeighbor(comp)) { comp.alive = false; ignored++; }
  }
  const sorted = [...comps].sort((a, b) => a.size - b.size);
  for (const comp of sorted) {
    if (!comp.alive || comp.size >= minArea) continue;
    if (!mergeIntoNeighbor(comp) && !mergeIntoNeighbor(comp, { allowBg: true })) { comp.alive = false; ignored++; }
  }
  // 紧凑小片：长宽都小于阈值的成片多半是噪点/光晕残片，布上不需要，并入邻居
  const compactMm = detail === 'simple' ? 24 : detail === 'fine' ? 14 : 18;
  const compactPx = pxPerMm && pxPerMm > 0 ? compactMm * pxPerMm : Math.sqrt(minArea) * 2;
  for (const comp of comps) {
    if (!comp.alive) continue;
    let mnx = w, mxx = -1, mny = h, mxy = -1;
    for (const i of comp.pixels) {
      const x = i % w, y = Math.floor(i / w);
      if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
    if (comp.size < compactPx * compactPx && Math.max(mxx - mnx + 1, mxy - mny + 1) < compactPx) {
      // 并入邻居（背景类也可）；四周是透明区、无处可并的独立小片保留，避免误删分离的合法布片
      mergeIntoNeighbor(comp) || mergeIntoNeighbor(comp, { allowBg: true });
    }
  }
  // 发射轮廓
  const polygons: Segment[] = [];
  for (const comp of comps) {
    if (!comp.alive) continue;
    if (comp.border && comp.size > size * 0.38 && (comp.perim || 0) >= 0.6 * (2 * w + 2 * h - 4)) { ignored++; continue; }
    const arr = Int32Array.from(comp.pixels);
    const traced = traceRegion(arr, arr.length, labels, comp.id, w, h, tolPx);
    if (traced.points.length < 3) { ignored++; continue; }
    polygons.push({ points: traced.points, color: labToHex(palette[comp.palette]), pixels: comp.size, hasHoles: traced.hasHoles });
  }
  polygons.sort((a, b) => b.pixels - a.pixels);
  return { polygons, ignored };
}

export function analyzeSegments(input: SegmentRequest): SegmentResult {
  const { requestId, rgba, width: w, height: h, detail, minAreaPixels } = input;
  if (w < 8 || h < 8 || w * h * 4 !== rgba.length || w * h > 900_000) {
    return { requestId, polygons: [], ignored: 0, tooMany: false, mode: input.mode === 'line' ? 'line' : 'color' };
  }
  const mode: SegmentMode = input.mode === 'auto' ? detectMode(rgba, w, h) : input.mode;
  const tolPx = tolerancePx(detail, input.pxPerMm);
  if (mode === 'color') {
    const { polygons, ignored } = analyzeColor(rgba, w, h, detail, minAreaPixels, tolPx, input.pxPerMm);
    return { requestId, polygons: polygons.slice(0, MAX_SEGMENTS), ignored: ignored + Math.max(0, polygons.length - MAX_SEGMENTS), tooMany: polygons.length > MAX_SEGMENTS, mode };
  }
  // 线稿管线（原有流程 + 新容差/平滑）
  const size = w * h;
  const threshold = input.lineThreshold > 0 ? input.lineThreshold : otsuThreshold(rgba, w, h);
  const lineMask = makeLineMask(rgba, w, h, threshold);
  const keys = new Int32Array(size);
  for (let i = 0; i < size; i++) keys[i] = lineMask[i] ? 1 : 0;
  const labels = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  const polygons: Segment[] = [];
  let ignored = 0, regionId = 0;
  const processKey = (key: number, isDarkSilhouette: boolean) => {
    for (let start = 0; start < size; start++) {
      if (labels[start] !== -1 || keys[start] < 0) continue;
      if (keys[start] !== key) continue;
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
      const skip = tail < Math.max(4, minAreaPixels) || (!isDarkSilhouette && touchesBorder) ||
        (isDarkSilhouette && density < 0.42);
      if (skip) { ignored++; continue; }
      const pixelsCopy = queue.slice(0, tail);
      const traced = traceRegion(pixelsCopy, tail, labels, label, w, h, Math.min(tolPx, 3));
      if (traced.points.length < 3) { ignored++; continue; }
      polygons.push({ points: traced.points, color: '#fdfcf8', pixels: tail, hasHoles: traced.hasHoles });
    }
  };
  processKey(0, false);
  processKey(1, true);
  polygons.sort((a, b) => b.pixels - a.pixels);
  return { requestId, polygons: polygons.slice(0, MAX_SEGMENTS), ignored: ignored + Math.max(0, polygons.length - MAX_SEGMENTS), tooMany: polygons.length > MAX_SEGMENTS, mode };
}
