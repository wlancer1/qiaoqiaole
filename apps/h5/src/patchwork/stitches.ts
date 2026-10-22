import { distanceToPath, area, pointInPolygon, selfIntersects, type Point } from './model';
import { outwardOffset } from './export';

export type StitchStyle = { kind: 'running' | 'backstitch' | 'blanket'; color: string; widthMm: number; lengthMm: number; gapMm: number };
export type OutlineStitch = StitchStyle & { insetMm: number };
export type ShapePaint = { fill: 'solid' | 'fabric' | 'none'; color: string; border: boolean; borderColor: string; borderWidthMm: number };
export const defaultStitch: StitchStyle = { kind: 'running', color: '#f7f2e6', widthMm: .6, lengthMm: 3, gapMm: 2 };
export const defaultShapePaint: ShapePaint = { fill: 'solid', color: '#dca1aa', border: false, borderColor: '#637082', borderWidthMm: .6 };
export const stitchNames = { running: '平针', backstitch: '回针', blanket: '锁边针' };
export const threadColors = ['#f7f2e6', '#66717e', '#d692a0', '#96b19d', '#7fa2c4'];
export function pathLength(points: Point[]) { return points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0); }
export function outlinePoints(points: Point[], inset: number): Point[] {
  if (!inset) return points;
  const result = outwardOffset(points, -inset);
  if (area(result) >= area(points) || area(result) < .1 || selfIntersects(result) || result.some(p => !pointInPolygon(p, points) || distanceToPath(p,[...points,points[0]]) < inset - .01)) throw new Error('布片太小或凹角过深，请减小距边距离');
  return result;
}
/** Dash positions use continuous arc length, including corners; coordinates remain physical mm. */
export function stitchSegments(points: Point[], style: StitchStyle, closed = false): Point[][] {
  const pts = closed && points.length > 2 ? [...points, points[0]] : points;
  if (pts.length < 2) return [];
  const length = Math.max(.2, style.lengthMm), gap = Math.max(.2, style.gapMm);
  const period = length + gap;
  const result: Point[][] = [];
  let travelled = 0;
  if (style.kind !== 'running') result.push(pts);
  const signed = points.reduce((a,p,i) => { const q=points[(i+1)%points.length]; return a+p.x*q.y-q.x*p.y; },0);
  const direction = !closed || signed >= 0 ? 1 : -1;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i-1], b = pts[i], dx = b.x-a.x, dy = b.y-a.y, d = Math.hypot(dx,dy);
    if (d < 1e-8) continue;
    const at = (t:number): Point => ({x:a.x+dx*t/d,y:a.y+dy*t/d});
    if (style.kind === 'running') {
      let pos = 0;
      while(pos < d - 1e-8) {
        const phase = (travelled + pos) % period;
        const visible = phase < length - 1e-8;
        const step = Math.min(d-pos, visible ? length-phase : period-phase);
        if (step < 1e-8) {pos += 1e-7; continue;}
        if (visible) result.push([at(pos), at(pos+step)]);
        pos += step;
      }
    } else if (style.kind === 'blanket') {
      const spacing = length + gap;
      for (let t = Math.ceil((travelled + 1e-8)/spacing)*spacing-travelled; t <= d; t += spacing) {
        const p=at(t); result.push([p,{x:p.x-direction*dy/d*length,y:p.y+direction*dx/d*length}]);
      }
    }
    travelled += d;
  }
  return result;
}
