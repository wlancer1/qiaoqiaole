type PaletteColor = { code: string; hex: string };
type PaletteCell = { color: string; transparent?: boolean };

export function filterPaletteByQuery(
  palette: readonly PaletteColor[],
  rawQuery: string,
): PaletteColor[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [...palette];

  return palette.filter((color) => color.code.toLowerCase().includes(query)
    || color.hex.toLowerCase().includes(query));
}

export function filterPaletteByUsage(
  palette: readonly PaletteColor[],
  cells: readonly PaletteCell[],
  rawQuery: string,
): PaletteColor[] {
  const counts = new Map<string, number>();
  for (const cell of cells) {
    if (cell.transparent) continue;
    const normalized = cell.color.toLowerCase();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  const orderedPalette = palette
    .map((color, index) => ({ color, index, count: counts.get(color.hex.toLowerCase()) ?? 0 }))
    .sort((left, right) => {
      if ((left.count > 0) !== (right.count > 0)) return left.count > 0 ? -1 : 1;
      if (left.count > 0 && left.count !== right.count) return right.count - left.count;
      return left.index - right.index;
    })
    .map(({ color }) => color);

  return filterPaletteByQuery(orderedPalette, rawQuery);
}
