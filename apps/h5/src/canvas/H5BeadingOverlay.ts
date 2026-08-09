import {
  visibleGridRange,
  viewportGridBoundary,
  type CanvasCell,
  type ViewportArtboard,
} from './H5CanvasRenderer';

export type H5CanvasOverlay = {
  currentColorCode: string | null;
  highlightEnabled: boolean;
  markedCellIndexes: readonly number[];
  completedColorCodes: readonly string[];
};

export type DrawViewportBeadingOverlayOptions = H5CanvasOverlay & {
  viewportWidth: number;
  viewportHeight: number;
  artboard: ViewportArtboard;
  rows: number;
  cols: number;
  renderScale: number;
  cells: readonly CanvasCell[];
  getCode: (color: string) => string;
};

const DIM_COLOR = 'rgba(12, 18, 28, 0.66)';
const CURRENT_COLOR = '#18d8ff';
const COMPLETED_CHECK_COLOR = 'rgba(255, 255, 255, 0.45)';
const MARKED_CHECK_COLOR = '#ffffff';

export type PreparedBeadingOverlay = H5CanvasOverlay & {
  markedCellIndexSet: ReadonlySet<number>;
  completedColorCodeSet: ReadonlySet<string>;
};

const markedCellIndexSets = new WeakMap<readonly number[], ReadonlySet<number>>();
const completedColorCodeSets = new WeakMap<readonly string[], ReadonlySet<string>>();

export function prepareBeadingOverlay(overlay: H5CanvasOverlay): PreparedBeadingOverlay {
  let markedCellIndexSet = markedCellIndexSets.get(overlay.markedCellIndexes);
  if (!markedCellIndexSet) {
    markedCellIndexSet = new Set(overlay.markedCellIndexes);
    markedCellIndexSets.set(overlay.markedCellIndexes, markedCellIndexSet);
  }
  let completedColorCodeSet = completedColorCodeSets.get(overlay.completedColorCodes);
  if (!completedColorCodeSet) {
    completedColorCodeSet = new Set(overlay.completedColorCodes);
    completedColorCodeSets.set(overlay.completedColorCodes, completedColorCodeSet);
  }
  return { ...overlay, markedCellIndexSet, completedColorCodeSet };
}

export function drawViewportBeadingOverlay(
  context: CanvasRenderingContext2D,
  options: DrawViewportBeadingOverlayOptions,
): void {
  const { viewportWidth, viewportHeight, rows, cols } = options;
  context.save();
  try {
    context.clearRect(0, 0, viewportWidth, viewportHeight);

    const range = visibleGridRange(options.artboard, viewportWidth, viewportHeight, rows, cols);
    if (range.rowStart >= range.rowEnd || range.colStart >= range.colEnd) return;

    const prepared = prepareBeadingOverlay(options);
    const highlighting = options.highlightEnabled && options.currentColorCode !== null;

    for (let row = range.rowStart; row < range.rowEnd; row += 1) {
      for (let col = range.colStart; col < range.colEnd; col += 1) {
        const index = row * cols + col;
        const cell = options.cells[index];
        if (!cell || cell.transparent) continue;

        const code = options.getCode(cell.color);
        const bounds = cellBounds(col, row, options);
        if (highlighting) {
          if (code === options.currentColorCode) drawCurrentOutline(context, bounds);
          else {
            context.fillStyle = DIM_COLOR;
            context.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);
          }
        }

        if (prepared.markedCellIndexSet.has(index)) drawCheck(context, bounds, MARKED_CHECK_COLOR, 1.5);
        else if (prepared.completedColorCodeSet.has(code)) drawCheck(context, bounds, COMPLETED_CHECK_COLOR, 1);
      }
    }
  } finally {
    context.restore();
  }
}

type CellBounds = { left: number; top: number; width: number; height: number };

function cellBounds(
  col: number,
  row: number,
  options: DrawViewportBeadingOverlayOptions,
): CellBounds {
  const { artboard, cols, rows, renderScale } = options;
  const left = viewportGridBoundary(col, artboard.left, artboard.width, cols, renderScale);
  const right = viewportGridBoundary(col + 1, artboard.left, artboard.width, cols, renderScale);
  const top = viewportGridBoundary(row, artboard.top, artboard.height, rows, renderScale);
  const bottom = viewportGridBoundary(row + 1, artboard.top, artboard.height, rows, renderScale);
  return { left, top, width: right - left, height: bottom - top };
}

function drawCurrentOutline(context: CanvasRenderingContext2D, bounds: CellBounds): void {
  const lineWidth = Math.max(1.5, Math.min(2.5, Math.min(bounds.width, bounds.height) * 0.075));
  const inset = lineWidth / 2;
  context.strokeStyle = CURRENT_COLOR;
  context.lineWidth = lineWidth;
  context.strokeRect(
    bounds.left + inset,
    bounds.top + inset,
    Math.max(0, bounds.width - lineWidth),
    Math.max(0, bounds.height - lineWidth),
  );
}

function drawCheck(
  context: CanvasRenderingContext2D,
  bounds: CellBounds,
  color: string,
  lineWidth: number,
): void {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.moveTo(bounds.left + bounds.width * 0.22, bounds.top + bounds.height * 0.52);
  context.lineTo(bounds.left + bounds.width * 0.43, bounds.top + bounds.height * 0.72);
  context.lineTo(bounds.left + bounds.width * 0.79, bounds.top + bounds.height * 0.3);
  context.stroke();
}
