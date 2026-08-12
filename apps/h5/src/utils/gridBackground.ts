import type { Cell } from '@qiaoqiaole/core';

const EMPTY_COLOR = '#ffffff';

export function removeGridEdgeBackground(cells: Cell[], rows: number, cols: number): Cell[] {
  const safeRows = Math.max(0, Math.floor(rows));
  const safeCols = Math.max(0, Math.floor(cols));
  if (safeRows === 0 || safeCols === 0) return cells.map((cell) => ({ ...cell }));

  const byKey = new Map<string, Cell>(cells.map((cell) => [`${cell.x}:${cell.y}`, cell]));
  const backgroundColor = dominantEdgeColor(cells, safeRows, safeCols);
  if (!backgroundColor) return cells.map((cell) => ({ ...cell }));

  const visited = new Set<string>();
  const queue: Array<{ x: number; y: number }> = [];
  for (let x = 0; x < safeCols; x += 1) {
    queue.push({ x, y: 0 }, { x, y: safeRows - 1 });
  }
  for (let y = 1; y < safeRows - 1; y += 1) {
    queue.push({ x: 0, y }, { x: safeCols - 1, y });
  }

  while (queue.length > 0) {
    const point = queue.shift()!;
    const key = `${point.x}:${point.y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const cell = byKey.get(key);
    if (!cell || cell.transparent || cell.color.toLowerCase() !== backgroundColor) continue;
    for (const next of [{ x: point.x - 1, y: point.y }, { x: point.x + 1, y: point.y }, { x: point.x, y: point.y - 1 }, { x: point.x, y: point.y + 1 }]) {
      if (next.x >= 0 && next.x < safeCols && next.y >= 0 && next.y < safeRows) queue.push(next);
    }
  }

  return cells.map((cell) => visited.has(`${cell.x}:${cell.y}`) && cell.color.toLowerCase() === backgroundColor
    ? { ...cell, color: EMPTY_COLOR, transparent: true }
    : { ...cell });
}

function dominantEdgeColor(cells: Cell[], rows: number, cols: number): string | null {
  const counts = new Map<string, number>();
  for (const cell of cells) {
    if (cell.transparent || (cell.x !== 0 && cell.x !== cols - 1 && cell.y !== 0 && cell.y !== rows - 1)) continue;
    const color = cell.color.toLowerCase();
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  const [color, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const edgeCount = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return color && count / Math.max(1, edgeCount) > 0.5 ? color : null;
}
