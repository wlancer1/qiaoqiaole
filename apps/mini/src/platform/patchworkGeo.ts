import type { PwPoint } from './patchworkStore'

/** 多边形面积（mm²，shoelace）。 */
export function polygonAreaMm2(points: PwPoint[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function pointInPolygon(point: PwPoint, polygon: PwPoint[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    const intersect = yi > point.y !== yj > point.y
      && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function polygonCentroid(points: PwPoint[]): PwPoint {
  const n = Math.max(1, points.length)
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  }
}

/** 画笔轨迹简化：去掉过近的点，减少抖动锯齿。 */
export function simplifyStroke(points: PwPoint[], minDistMm: number): PwPoint[] {
  const out: PwPoint[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minDistMm) out.push(p)
  }
  if (points.length && out.length && out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1])
  }
  return out
}
