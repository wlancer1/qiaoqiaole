import type { Cell } from '@qiaoqiaole/core';

export type ProjectPayload = {
  name: string;
  rows: number;
  cols: number;
};

export function serializeProjectCells(cells: Cell[]): string {
  return JSON.stringify(cells.map((cell) => ({
    x: cell.x,
    y: cell.y,
    color: cell.color,
    transparent: Boolean(cell.transparent),
  })));
}

export function parseProjectCells(snapshot: string | undefined, rows: number, cols: number): Cell[] | null {
  if (!snapshot) return null;
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!Array.isArray(parsed)) return null;
    const cells = parsed.map((cell) => {
      if (!cell || typeof cell !== 'object') return null;
      const value = cell as Record<string, unknown>;
      const x = Number(value.x);
      const y = Number(value.y);
      const color = String(value.color || '');
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= cols || y < 0 || y >= rows || !color) return null;
      return { x, y, color, transparent: Boolean(value.transparent) } satisfies Cell;
    });
    return cells.every(Boolean) && cells.length === rows * cols ? cells as Cell[] : null;
  } catch {
    return null;
  }
}

export function normalizeProjectPayload(name: unknown, rows: unknown, cols: unknown): ProjectPayload | null {
  const normalizedName = String(name ?? '').trim().slice(0, 30);
  const normalizedRows = typeof rows === 'number' || typeof rows === 'string' ? Number(rows) : Number.NaN;
  const normalizedCols = typeof cols === 'number' || typeof cols === 'string' ? Number(cols) : Number.NaN;
  if (
    !normalizedName
    || !Number.isInteger(normalizedRows)
    || !Number.isInteger(normalizedCols)
    || normalizedRows < 1
    || normalizedCols < 1
  ) return null;
  return { name: normalizedName, rows: normalizedRows, cols: normalizedCols };
}
