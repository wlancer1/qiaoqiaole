export const MAX_CANVAS_BACKING_DIMENSION = 4096;
export const MAX_CANVAS_BACKING_AREA = 16_777_216;
export const CANVAS_LAYER_COUNT = 4;

export type CanvasRenderMetrics = {
  logicalWidth: number;
  logicalHeight: number;
  renderScale: number;
  backingWidth: number;
  backingHeight: number;
};

export type CanvasCell = {
  x: number;
  y: number;
  color: string;
  transparent?: boolean;
};

export type ViewportArtboard = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type VisibleGridRange = {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
};

const EMPTY_VISIBLE_GRID_RANGE: VisibleGridRange = {
  rowStart: 0,
  rowEnd: 0,
  colStart: 0,
  colEnd: 0,
};

export function visibleGridRange(
  artboard: ViewportArtboard,
  viewportWidth: number,
  viewportHeight: number,
  rows: number,
  cols: number,
): VisibleGridRange {
  if (!validGrid(artboard.width, artboard.height, rows, cols)
    || !Number.isFinite(artboard.left)
    || !Number.isFinite(artboard.top)
    || !Number.isFinite(viewportWidth)
    || !Number.isFinite(viewportHeight)
    || viewportWidth <= 0
    || viewportHeight <= 0) {
    return EMPTY_VISIBLE_GRID_RANGE;
  }

  const columns = visibleAxisRange(artboard.left, artboard.width, viewportWidth, cols);
  const rowRange = visibleAxisRange(artboard.top, artboard.height, viewportHeight, rows);
  if (columns.start === columns.end || rowRange.start === rowRange.end) {
    return EMPTY_VISIBLE_GRID_RANGE;
  }

  return {
    rowStart: rowRange.start,
    rowEnd: rowRange.end,
    colStart: columns.start,
    colEnd: columns.end,
  };
}

export function viewportGridBoundary(
  index: number,
  origin: number,
  size: number,
  count: number,
  renderScale: number,
): number {
  return alignToBackingPixel(origin + (index * size) / count, safeRenderScale(renderScale));
}

type LayerGeometry = {
  width: number;
  height: number;
  rows: number;
  cols: number;
  renderScale: number;
};

type CellLayerOptions = LayerGeometry & {
  cells: readonly CanvasCell[];
};

type ViewportLayerGeometry = {
  viewportWidth: number;
  viewportHeight: number;
  artboard: ViewportArtboard;
  rows: number;
  cols: number;
  renderScale: number;
};

type ViewportCellLayerOptions = ViewportLayerGeometry & {
  cells: readonly CanvasCell[];
};

export type DrawViewportColorLayerOptions = ViewportCellLayerOptions & {
  checkerLight?: string;
  checkerDark?: string;
};

export type DrawViewportCodeLayerOptions = ViewportCellLayerOptions & {
  visible: boolean;
  getCode: (color: string, cell: CanvasCell) => string;
  getTextColor: (color: string, cell: CanvasCell) => string;
};

export type DrawViewportGridLayerOptions = ViewportLayerGeometry & {
  visible: boolean;
  strokeStyle?: string;
};

export type DrawColorLayerOptions = CellLayerOptions & {
  checkerLight?: string;
  checkerDark?: string;
};

export type DrawCodeLayerOptions = CellLayerOptions & {
  visible: boolean;
  getCode: (color: string) => string;
  getTextColor: (color: string) => string;
};

export type DrawGridLayerOptions = LayerGeometry & {
  zoom: number;
  strokeStyle?: string;
};

export function canvasRenderMetrics(
  width: number,
  height: number,
  dpr: number,
  zoom: number,
): CanvasRenderMetrics {
  const logicalWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const logicalHeight = Number.isFinite(height) && height > 0 ? height : 0;

  if (logicalWidth === 0 || logicalHeight === 0) {
    return {
      logicalWidth,
      logicalHeight,
      renderScale: 1,
      backingWidth: 0,
      backingHeight: 0,
    };
  }

  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const requestedScale = Math.max(1, safeDpr * safeZoom);
  const renderScale = Math.max(Number.MIN_VALUE, Math.min(
    requestedScale,
    MAX_CANVAS_BACKING_DIMENSION / logicalWidth,
    MAX_CANVAS_BACKING_DIMENSION / logicalHeight,
    Math.sqrt(MAX_CANVAS_BACKING_AREA / (CANVAS_LAYER_COUNT * logicalWidth * logicalHeight)),
  ));

  return {
    logicalWidth,
    logicalHeight,
    renderScale,
    backingWidth: Math.max(1, Math.floor(logicalWidth * renderScale)),
    backingHeight: Math.max(1, Math.floor(logicalHeight * renderScale)),
  };
}

export function configureCanvas(
  canvas: HTMLCanvasElement,
  metrics: CanvasRenderMetrics,
): CanvasRenderingContext2D | null {
  canvas.width = metrics.backingWidth;
  canvas.height = metrics.backingHeight;
  canvas.style.width = `${metrics.logicalWidth}px`;
  canvas.style.height = `${metrics.logicalHeight}px`;

  const context = canvas.getContext('2d');
  context?.setTransform(metrics.renderScale, 0, 0, metrics.renderScale, 0, 0);
  return context;
}

export function drawViewportColorLayer(
  context: CanvasRenderingContext2D,
  options: DrawViewportColorLayerOptions,
): void {
  const { viewportWidth, viewportHeight, rows, cols, cells } = options;
  context.clearRect(0, 0, viewportWidth, viewportHeight);
  const range = visibleGridRange(options.artboard, viewportWidth, viewportHeight, rows, cols);
  if (!hasVisibleCells(range)) return;

  const checkerLight = options.checkerLight ?? '#ffffff';
  const checkerDark = options.checkerDark ?? '#cfcfcf';
  for (let row = range.rowStart; row < range.rowEnd; row += 1) {
    for (let col = range.colStart; col < range.colEnd; col += 1) {
      const bounds = viewportCellBounds(col, row, options);
      context.fillStyle = (row + col) % 2 === 0 ? checkerLight : checkerDark;
      context.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);

      const cell = cells[row * cols + col];
      if (!cell || cell.transparent) continue;
      context.fillStyle = cell.color;
      context.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    }
  }
}

export function drawViewportCodeLayer(
  context: CanvasRenderingContext2D,
  options: DrawViewportCodeLayerOptions,
): void {
  const { viewportWidth, viewportHeight, rows, cols, cells } = options;
  context.clearRect(0, 0, viewportWidth, viewportHeight);
  if (!options.visible) return;
  const range = visibleGridRange(options.artboard, viewportWidth, viewportHeight, rows, cols);
  if (!hasVisibleCells(range)) return;

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let row = range.rowStart; row < range.rowEnd; row += 1) {
    for (let col = range.colStart; col < range.colEnd; col += 1) {
      const cell = cells[row * cols + col];
      if (!cell || cell.transparent) continue;
      const bounds = viewportCellBounds(col, row, options);
      const code = options.getCode(cell.color, cell);
      const baseFontSize = Math.min(bounds.right - bounds.left, bounds.bottom - bounds.top);
      const fontSize = baseFontSize * (code.length >= 3 ? 0.5 : 0.52);
      context.fillStyle = options.getTextColor(cell.color, cell);
      context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      context.fillText(
        code,
        (bounds.left + bounds.right) / 2,
        (bounds.top + bounds.bottom) / 2,
        (bounds.right - bounds.left) * 0.9,
      );
    }
  }
}

export function drawViewportGridLayer(
  context: CanvasRenderingContext2D,
  options: DrawViewportGridLayerOptions,
): void {
  const { viewportWidth, viewportHeight, rows, cols } = options;
  context.clearRect(0, 0, viewportWidth, viewportHeight);
  if (!options.visible) return;
  const range = visibleGridRange(options.artboard, viewportWidth, viewportHeight, rows, cols);
  if (!hasVisibleCells(range)) return;

  const { artboard, renderScale } = options;
  const top = viewportGridBoundary(range.rowStart, artboard.top, artboard.height, rows, renderScale);
  const bottom = viewportGridBoundary(range.rowEnd, artboard.top, artboard.height, rows, renderScale);
  const left = viewportGridBoundary(range.colStart, artboard.left, artboard.width, cols, renderScale);
  const right = viewportGridBoundary(range.colEnd, artboard.left, artboard.width, cols, renderScale);

  context.strokeStyle = options.strokeStyle ?? 'rgba(18, 70, 69, 0.58)';
  context.lineWidth = 0.75;
  context.beginPath();
  for (let col = range.colStart; col <= range.colEnd; col += 1) {
    const x = viewportGridBoundary(col, artboard.left, artboard.width, cols, renderScale);
    context.moveTo(x, top);
    context.lineTo(x, bottom);
  }
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    const y = viewportGridBoundary(row, artboard.top, artboard.height, rows, renderScale);
    context.moveTo(left, y);
    context.lineTo(right, y);
  }
  context.stroke();
}

export function drawColorLayer(
  context: CanvasRenderingContext2D,
  options: DrawColorLayerOptions,
): void {
  const { width, height, rows, cols, cells } = options;
  context.clearRect(0, 0, width, height);
  if (!validGrid(width, height, rows, cols)) return;

  const renderScale = safeRenderScale(options.renderScale);
  const checkerLight = options.checkerLight ?? '#ffffff';
  const checkerDark = options.checkerDark ?? '#cfcfcf';

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const bounds = cellBounds(col, row, width, height, cols, rows, renderScale);
      context.fillStyle = (row + col) % 2 === 0 ? checkerLight : checkerDark;
      context.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    }
  }

  for (const cell of cells) {
    if (cell.transparent || !cellInsideGrid(cell, rows, cols)) continue;
    const bounds = cellBounds(cell.x, cell.y, width, height, cols, rows, renderScale);
    context.fillStyle = cell.color;
    context.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
  }
}

export function drawCodeLayer(
  context: CanvasRenderingContext2D,
  options: DrawCodeLayerOptions,
): void {
  const { width, height, rows, cols, cells } = options;
  context.clearRect(0, 0, width, height);
  if (!options.visible || !validGrid(width, height, rows, cols)) return;

  const renderScale = safeRenderScale(options.renderScale);
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (const cell of cells) {
    if (cell.transparent || !cellInsideGrid(cell, rows, cols)) continue;
    const bounds = cellBounds(cell.x, cell.y, width, height, cols, rows, renderScale);
    const code = options.getCode(cell.color);
    const baseFontSize = Math.min(bounds.right - bounds.left, bounds.bottom - bounds.top);
    const fontSize = baseFontSize * (code.length >= 3 ? 0.5 : 0.52);
    context.fillStyle = options.getTextColor(cell.color);
    context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.fillText(
      code,
      (bounds.left + bounds.right) / 2,
      (bounds.top + bounds.bottom) / 2,
      (bounds.right - bounds.left) * 0.9,
    );
  }
}

export function drawGridLayer(
  context: CanvasRenderingContext2D,
  options: DrawGridLayerOptions,
): void {
  const { width, height, rows, cols } = options;
  context.clearRect(0, 0, width, height);
  if (!validGrid(width, height, rows, cols)) return;

  const safeZoom = Number.isFinite(options.zoom) && options.zoom > 0 ? options.zoom : 1;
  const renderScale = safeRenderScale(options.renderScale);
  const lineWidth = 0.75 / safeZoom;

  context.strokeStyle = options.strokeStyle ?? 'rgba(18, 70, 69, 0.58)';
  context.lineWidth = lineWidth;
  context.beginPath();
  for (let col = 1; col < cols; col += 1) {
    const x = cellBoundary(col, width, cols, renderScale);
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  for (let row = 1; row < rows; row += 1) {
    const y = cellBoundary(row, height, rows, renderScale);
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.stroke();

  const inset = lineWidth / 2;
  context.strokeRect(inset, inset, width - lineWidth, height - lineWidth);
}

function cellBounds(
  col: number,
  row: number,
  width: number,
  height: number,
  cols: number,
  rows: number,
  renderScale: number,
) {
  return {
    left: cellBoundary(col, width, cols, renderScale),
    right: cellBoundary(col + 1, width, cols, renderScale),
    top: cellBoundary(row, height, rows, renderScale),
    bottom: cellBoundary(row + 1, height, rows, renderScale),
  };
}

function viewportCellBounds(
  col: number,
  row: number,
  options: ViewportLayerGeometry,
) {
  const { artboard, rows, cols, renderScale } = options;
  return {
    left: viewportGridBoundary(col, artboard.left, artboard.width, cols, renderScale),
    right: viewportGridBoundary(col + 1, artboard.left, artboard.width, cols, renderScale),
    top: viewportGridBoundary(row, artboard.top, artboard.height, rows, renderScale),
    bottom: viewportGridBoundary(row + 1, artboard.top, artboard.height, rows, renderScale),
  };
}

function hasVisibleCells(range: VisibleGridRange): boolean {
  return range.rowStart < range.rowEnd && range.colStart < range.colEnd;
}

function visibleAxisRange(origin: number, size: number, viewportSize: number, count: number) {
  const intersectionStart = Math.max(0, origin);
  const intersectionEnd = Math.min(viewportSize, origin + size);
  if (intersectionStart >= intersectionEnd) return { start: 0, end: 0 };

  const cellSize = size / count;
  const start = Math.max(0, Math.min(count, Math.floor((intersectionStart - origin) / cellSize)));
  const end = Math.max(start, Math.min(count, Math.ceil((intersectionEnd - origin) / cellSize)));
  return { start, end };
}

function cellBoundary(index: number, size: number, count: number, renderScale: number): number {
  if (index === 0) return 0;
  if (index === count) return size;
  return alignToBackingPixel((index * size) / count, renderScale);
}

function alignToBackingPixel(coordinate: number, renderScale: number): number {
  return Math.round(coordinate * renderScale) / renderScale;
}

function safeRenderScale(renderScale: number): number {
  return Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
}

function validGrid(width: number, height: number, rows: number, cols: number): boolean {
  return Number.isFinite(width)
    && Number.isFinite(height)
    && Number.isInteger(rows)
    && Number.isInteger(cols)
    && width > 0
    && height > 0
    && rows > 0
    && cols > 0;
}

function cellInsideGrid(cell: CanvasCell, rows: number, cols: number): boolean {
  return Number.isInteger(cell.x)
    && Number.isInteger(cell.y)
    && cell.x >= 0
    && cell.x < cols
    && cell.y >= 0
    && cell.y < rows;
}
