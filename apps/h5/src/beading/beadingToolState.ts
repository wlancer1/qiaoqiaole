export type InteractionMode = 'pan' | 'mark' | 'revise';
export type ActivePanel = null | 'search' | 'more';
export type SortMode = 'canvas' | 'remaining' | 'code';

export type BeadingToolState = {
  interactionMode: InteractionMode;
  activePanel: ActivePanel;
  highlightEnabled: boolean;
  locked: boolean;
  focusMode: boolean;
  codesVisible: boolean;
  gridVisible: boolean;
  sortMode: SortMode;
  markedCellIndexes: number[];
};

export type BeadingToolAction =
  | { type: 'toggle-mode'; mode: 'mark' | 'revise' }
  | { type: 'set-panel'; panel: ActivePanel }
  | { type: 'toggle-highlight' }
  | { type: 'toggle-lock' }
  | { type: 'toggle-focus' }
  | { type: 'toggle-codes' }
  | { type: 'toggle-grid' }
  | { type: 'set-sort'; sortMode: SortMode }
  | { type: 'set-marks'; indexes: number[]; cellCount: number }
  | { type: 'reset' };

export type SortableBeadingRequirement = { colorCode: string; required: number };
export type SortableBeadingCell = { color: string; transparent?: boolean };

export function createBeadingToolState(): BeadingToolState {
  return {
    interactionMode: 'pan',
    activePanel: null,
    highlightEnabled: true,
    locked: false,
    focusMode: false,
    codesVisible: true,
    gridVisible: true,
    sortMode: 'canvas',
    markedCellIndexes: [],
  };
}

function normalizeMarkedCellIndexes(indexes: number[], cellCount: number): number[] {
  return [...new Set(indexes.filter((index) => Number.isInteger(index) && index >= 0 && index < cellCount))]
    .sort((left, right) => left - right);
}

export type CellRectangle = { left: number; top: number; width: number; height: number };

export function cellIndexFromPoint(
  rect: CellRectangle,
  clientX: number,
  clientY: number,
  rows: number,
  cols: number,
): number | null {
  if (rect.width <= 0 || rect.height <= 0 || !Number.isInteger(rows) || rows <= 0 || !Number.isInteger(cols) || cols <= 0) {
    return null;
  }
  const relativeX = clientX - rect.left;
  const relativeY = clientY - rect.top;
  if (relativeX < 0 || relativeY < 0 || relativeX >= rect.width || relativeY >= rect.height) return null;
  const col = Math.floor(relativeX / rect.width * cols);
  const row = Math.floor(relativeY / rect.height * rows);
  return row * cols + col;
}

export function toggleMarkedCell(indexes: number[], index: number, cellCount: number): number[] {
  const normalized = normalizeMarkedCellIndexes(indexes, cellCount);
  if (!Number.isInteger(index) || index < 0 || index >= cellCount) return normalized;
  return normalizeMarkedCellIndexes(
    normalized.includes(index) ? normalized.filter((markedIndex) => markedIndex !== index) : [...normalized, index],
    cellCount,
  );
}

export function reviseMarkedCell(indexes: number[], index: number, cellCount: number): number[] {
  const normalized = normalizeMarkedCellIndexes(indexes, cellCount);
  if (!Number.isInteger(index) || index < 0 || index >= cellCount || !normalized.includes(index)) return normalized;
  return normalized.filter((markedIndex) => markedIndex !== index);
}

export function remainingRequirement(required: number, completed: boolean): number {
  return completed ? 0 : required;
}

export function sortBeadingRequirements<T extends SortableBeadingRequirement>(
  requirements: readonly T[],
  cells: readonly SortableBeadingCell[],
  getCode: (color: string) => string,
  completed: readonly string[],
  mode: SortMode,
): T[] {
  const indexed = requirements.map((requirement, index) => ({ requirement, index }));

  if (mode === 'canvas') {
    const firstCellIndex = new Map<string, number>();
    cells.forEach((cell, index) => {
      if (!cell.transparent) {
        const code = getCode(cell.color);
        if (!firstCellIndex.has(code)) firstCellIndex.set(code, index);
      }
    });
    indexed.sort((left, right) => {
      const leftPosition = firstCellIndex.get(left.requirement.colorCode) ?? Number.POSITIVE_INFINITY;
      const rightPosition = firstCellIndex.get(right.requirement.colorCode) ?? Number.POSITIVE_INFINITY;
      return leftPosition - rightPosition || left.index - right.index;
    });
  } else if (mode === 'remaining') {
    const completedCodes = new Set(completed);
    indexed.sort((left, right) => {
      const leftRemaining = remainingRequirement(left.requirement.required, completedCodes.has(left.requirement.colorCode));
      const rightRemaining = remainingRequirement(right.requirement.required, completedCodes.has(right.requirement.colorCode));
      return rightRemaining - leftRemaining || left.index - right.index;
    });
  } else {
    const collator = new Intl.Collator('zh-CN', { numeric: true });
    indexed.sort((left, right) => collator.compare(left.requirement.colorCode, right.requirement.colorCode) || left.index - right.index);
  }

  return indexed.map(({ requirement }) => requirement);
}

export function beadingToolReducer(state: BeadingToolState, action: BeadingToolAction): BeadingToolState {
  switch (action.type) {
    case 'toggle-mode':
      return { ...state, interactionMode: state.interactionMode === action.mode ? 'pan' : action.mode };
    case 'set-panel':
      return { ...state, activePanel: action.panel };
    case 'toggle-highlight':
      return { ...state, highlightEnabled: !state.highlightEnabled };
    case 'toggle-lock':
      return { ...state, locked: !state.locked };
    case 'toggle-focus':
      return { ...state, focusMode: !state.focusMode };
    case 'toggle-codes':
      return { ...state, codesVisible: !state.codesVisible };
    case 'toggle-grid':
      return { ...state, gridVisible: !state.gridVisible };
    case 'set-sort':
      return { ...state, sortMode: action.sortMode };
    case 'set-marks':
      return { ...state, markedCellIndexes: normalizeMarkedCellIndexes(action.indexes, action.cellCount) };
    case 'reset':
      return createBeadingToolState();
  }
}
