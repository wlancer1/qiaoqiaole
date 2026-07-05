import type { Cell, Settings } from './types';

type Vec3 = [number, number, number];

export type Triangle = [Vec3, Vec3, Vec3];

export type ModelPart = {
  name: string;
  color?: string;
  triangles: Triangle[];
};

export function buildModelParts(cells: Cell[], rows: number, cols: number, settings: Settings): ModelPart[] {
  const parts: ModelPart[] = [];
  const solidCells = cells.filter((cell) => !cell.transparent);

  for (const cell of solidCells) {
    const centerX = cell.x * settings.cellSize + settings.cellSize / 2;
    const centerY = cell.y * settings.cellSize + settings.cellSize / 2;
    parts.push({
      name: `peg-${cell.x}-${cell.y}`,
      color: cell.color,
      triangles: hollowSquareRing(centerX, centerY, settings),
    });
  }

  return parts;
}

export function serializeAsciiStl(name: string, parts: ModelPart[]): string {
  const lines = [`solid ${sanitizeName(name)}`];

  for (const part of parts) {
    lines.push(`  // ${part.name}${part.color ? ` ${part.color}` : ''}`);
    for (const triangle of part.triangles) {
      const normal = normalOf(triangle);
      lines.push(`  facet normal ${format(normal[0])} ${format(normal[1])} ${format(normal[2])}`);
      lines.push('    outer loop');
      for (const vertex of triangle) {
        lines.push(`      vertex ${format(vertex[0])} ${format(vertex[1])} ${format(vertex[2])}`);
      }
      lines.push('    endloop');
      lines.push('  endfacet');
    }
  }

  lines.push(`endsolid ${sanitizeName(name)}`);
  return `${lines.join('\n')}\n`;
}

export function estimateMaterialCm3(parts: ModelPart[]): number {
  let volume = 0;
  for (const part of parts) {
    for (const triangle of part.triangles) {
      volume += signedTriangleVolume(triangle);
    }
  }
  return Math.abs(volume) / 1000;
}

function cuboid(x: number, y: number, z: number, width: number, depth: number, height: number): Triangle[] {
  const p000: Vec3 = [x, y, z];
  const p100: Vec3 = [x + width, y, z];
  const p110: Vec3 = [x + width, y + depth, z];
  const p010: Vec3 = [x, y + depth, z];
  const p001: Vec3 = [x, y, z + height];
  const p101: Vec3 = [x + width, y, z + height];
  const p111: Vec3 = [x + width, y + depth, z + height];
  const p011: Vec3 = [x, y + depth, z + height];

  return [
    [p000, p010, p110], [p000, p110, p100],
    [p001, p101, p111], [p001, p111, p011],
    [p000, p100, p101], [p000, p101, p001],
    [p010, p011, p111], [p010, p111, p110],
    [p000, p001, p011], [p000, p011, p010],
    [p100, p110, p111], [p100, p111, p101],
  ];
}

function hollowSquareRing(cx: number, cy: number, settings: Settings): Triangle[] {
  const outer = settings.cellSize;
  const thickness = Math.min(settings.wallThickness, outer / 2);
  const left = cx - outer / 2;
  const top = cy - outer / 2;
  const inner = Math.max(0, outer - thickness * 2);

  if (inner <= 0) {
    return cuboid(left, top, 0, outer, outer, settings.pegHeight);
  }

  return [
    ...cuboid(left, top, 0, outer, thickness, settings.pegHeight),
    ...cuboid(left, top + outer - thickness, 0, outer, thickness, settings.pegHeight),
    ...cuboid(left, top + thickness, 0, thickness, inner, settings.pegHeight),
    ...cuboid(left + outer - thickness, top + thickness, 0, thickness, inner, settings.pegHeight),
  ];
}

function normalOf([a, b, c]: Triangle): Vec3 {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross: Vec3 = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const length = Math.hypot(cross[0], cross[1], cross[2]) || 1;
  return [cross[0] / length, cross[1] / length, cross[2] / length];
}

function signedTriangleVolume([a, b, c]: Triangle): number {
  return (
    a[0] * b[1] * c[2] +
    b[0] * c[1] * a[2] +
    c[0] * a[1] * b[2] -
    a[0] * c[1] * b[2] -
    b[0] * a[1] * c[2] -
    c[0] * b[1] * a[2]
  ) / 6;
}

function format(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : '0.00000';
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'model';
}
