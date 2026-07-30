export const MAX_CANVAS_BACKING_DIMENSION = 4096;
export const MAX_CANVAS_BACKING_AREA = 16_777_216;

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

type LayerGeometry = {
  width: number;
  height: number;
  rows: number;
  cols: number;
};

type CellLayerOptions = LayerGeometry & {
  cells: readonly CanvasCell[];
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
  renderScale: number;
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
  const renderScale = Math.max(1, Math.min(
    safeDpr * safeZoom,
    MAX_CANVAS_BACKING_DIMENSION / logicalWidth,
    MAX_CANVAS_BACKING_DIMENSION / logicalHeight,
    Math.sqrt(MAX_CANVAS_BACKING_AREA / (logicalWidth * logicalHeight)),
  ));

  return {
    logicalWidth,
    logicalHeight,
    renderScale,
    backingWidth: Math.floor(logicalWidth * renderScale),
    backingHeight: Math.floor(logicalHeight * renderScale),
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

export function drawColorLayer(
  context: CanvasRenderingContext2D,
  options: DrawColorLayerOptions,
): void {
  const { width, height, rows, cols, cells } = options;
  context.clearRect(0, 0, width, height);
  if (!validGrid(width, height, rows, cols)) return;

  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const checkerLight = options.checkerLight ?? '#ffffff';
  const checkerDark = options.checkerDark ?? '#cfcfcf';

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      context.fillStyle = (row + col) % 2 === 0 ? checkerLight : checkerDark;
      context.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
    }
  }

  for (const cell of cells) {
    if (cell.transparent || !cellInsideGrid(cell, rows, cols)) continue;
    context.fillStyle = cell.color;
    context.fillRect(cell.x * cellWidth, cell.y * cellHeight, cellWidth, cellHeight);
  }
}

export function drawCodeLayer(
  context: CanvasRenderingContext2D,
  options: DrawCodeLayerOptions,
): void {
  const { width, height, rows, cols, cells } = options;
  context.clearRect(0, 0, width, height);
  if (!options.visible || !validGrid(width, height, rows, cols)) return;

  const cellWidth = width / cols;
  const cellHeight = height / rows;
  const baseFontSize = Math.min(cellWidth, cellHeight);
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (const cell of cells) {
    if (cell.transparent || !cellInsideGrid(cell, rows, cols)) continue;
    const code = options.getCode(cell.color);
    const fontSize = baseFontSize * (code.length >= 3 ? 0.5 : 0.52);
    context.fillStyle = options.getTextColor(cell.color);
    context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    context.fillText(
      code,
      (cell.x + 0.5) * cellWidth,
      (cell.y + 0.5) * cellHeight,
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
  const renderScale = Number.isFinite(options.renderScale) && options.renderScale > 0
    ? options.renderScale
    : 1;
  const lineWidth = 0.75 / safeZoom;
  const cellWidth = width / cols;
  const cellHeight = height / rows;

  context.strokeStyle = options.strokeStyle ?? 'rgba(18, 70, 69, 0.58)';
  context.lineWidth = lineWidth;
  context.beginPath();
  for (let col = 1; col < cols; col += 1) {
    const x = alignToBackingPixel(col * cellWidth, renderScale);
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  for (let row = 1; row < rows; row += 1) {
    const y = alignToBackingPixel(row * cellHeight, renderScale);
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.stroke();

  const inset = lineWidth / 2;
  context.strokeRect(inset, inset, width - lineWidth, height - lineWidth);
}

function alignToBackingPixel(coordinate: number, renderScale: number): number {
  return Math.round(coordinate * renderScale) / renderScale;
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
