import {
  buildCellsFromSamples,
  MARD_221_COLORS,
  MARD_221_HEX,
  nearestPaletteColor,
  type Cell,
} from '@qiaoqiaole/core';
import type { XhsExtractedImage } from '../shared/h5Types';

const API_BASE = '/api';
const EMPTY_COLOR = '#ffffff';
const MAX_AUTO_GRID_SIDE = 120;
const MAX_IMAGE_SIDE = 4096;
const WHITE_BEAD_COLOR = nearestPaletteColor(255, 255, 255, MARD_221_HEX);

export function yieldToBrowser(delay = 0): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

export async function loadImageData(file: File): Promise<ImageData> {
  const imageUrl = URL.createObjectURL(file);
  try {
    return await loadImageDataFromUrl(imageUrl);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function createThumbnailDataUrl(imageUrl: string, maxSide = 640): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Failed to load thumbnail source'));
    element.src = imageUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unsupported');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.82);
}

export function createBeadThumbnailCanvas(cells: Cell[], rows: number, cols: number): HTMLCanvasElement {
  const cellSize = Math.max(8, Math.min(24, Math.floor(640 / Math.max(rows, cols))));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, cols * cellSize);
  canvas.height = Math.max(1, rows * cellSize);
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  context.fillStyle = '#edf5ff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const cell of cells) {
    if (cell.transparent) continue;
    context.fillStyle = cell.color;
    context.fillRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
  }
  return canvas;
}

export async function loadImageDataFromUrl(imageUrl: string): Promise<ImageData> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas unsupported');
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export function extractUrlFromText(text: string): string {
  const match = String(text || '').match(/https?:\/\/[^\s"'<>。，“”！？；：）》】]+/i);
  return match?.[0]?.replace(/[.,!?;:)\]}。！？；：）》】]+$/g, '') ?? '';
}

export function isSupportedXiaohongshuUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'xhslink.cn') return parsed.port === '';
    return hostname === 'xiaohongshu.com' || hostname.endsWith('.xiaohongshu.com') || hostname === 'xhslink.com' || hostname.endsWith('.xhslink.com');
  } catch {
    return false;
  }
}

export function xhsPreviewSrc(image: XhsExtractedImage): string {
  if (image.imageDataUrl) return image.imageDataUrl;
  if (!image.imageUrl) return '';
  return `${API_BASE}/xiaohongshu/proxy?url=${encodeURIComponent(image.imageUrl)}`;
}

export function safeImageFilename(filename: string, type: string): string {
  const base = filename
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'xiaohongshu-drawing';
  const extension = type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : 'png';
  return `${base}.${extension}`;
}

export function imageDataToUrl(imageData: ImageData, type = 'image/webp', quality = 0.86): string {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL(type, quality);
}

export function colorCodeOf(hex: string): string {
  const normalized = normalizeHexForPalette(hex);
  const exact = MARD_221_COLORS.find((color) => color.hex.toLowerCase() === normalized);
  if (exact) return exact.code;
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const nearest = nearestPaletteColor(r, g, b, MARD_221_HEX);
  return MARD_221_COLORS.find((color) => color.hex.toLowerCase() === nearest)?.code ?? hex;
}

export function colorCodeTextColor(hex: string): '#000000' | '#ffffff' {
  const normalized = normalizeHexForPalette(hex);
  const relativeChannel = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const red = relativeChannel(Number.parseInt(normalized.slice(1, 3), 16));
  const green = relativeChannel(Number.parseInt(normalized.slice(3, 5), 16));
  const blue = relativeChannel(Number.parseInt(normalized.slice(5, 7), 16));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

export function sameCells(left: Cell[], right: Cell[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftCell = left[index];
    const rightCell = right[index];
    if (
      leftCell.x !== rightCell.x ||
      leftCell.y !== rightCell.y ||
      leftCell.transparent !== rightCell.transparent ||
      leftCell.color.toLowerCase() !== rightCell.color.toLowerCase()
    ) {
      return false;
    }
  }
  return true;
}

export function createBeadPatternCanvas(cells: Cell[], rows: number, cols: number): HTMLCanvasElement {
  const cellSize = Math.max(24, cols > 80 || rows > 80 ? 28 : cols > 50 || rows > 50 ? 34 : 44);
  const headerSize = cellSize;
  const margin = 28;
  const titleHeight = 68;
  const legendGap = 24;
  const legendSwatch = 54;
  const legendItemWidth = 74;
  const legendItemHeight = 82;
  const legendColumns = Math.max(1, Math.floor(((cols + 2) * cellSize) / legendItemWidth));
  const stats = beadPatternStats(cells);
  const legendRows = Math.max(1, Math.ceil(stats.length / legendColumns));
  const gridWidth = (cols + 2) * cellSize;
  const gridHeight = (rows + 2) * cellSize;
  const width = margin * 2 + gridWidth;
  const height = margin * 2 + titleHeight + gridHeight + legendGap + legendRows * legendItemHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return canvas;

  context.fillStyle = '#f2f2f2';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(margin, margin + titleHeight - 12, gridWidth, gridHeight + legendGap + legendRows * legendItemHeight);

  context.fillStyle = '#151515';
  context.font = '700 34px system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('导出拼豆图纸', width / 2, margin + 28);

  const gridX = margin;
  const gridY = margin + titleHeight;
  const headerFill = '#858bdc';
  const headerText = '#111111';
  const cellFontSize = Math.max(9, Math.floor(cellSize * 0.34));
  const headerFontSize = Math.max(10, Math.floor(cellSize * 0.36));

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 1;
  context.strokeStyle = '#1b1b1b';

  for (let y = 0; y < rows + 2; y += 1) {
    for (let x = 0; x < cols + 2; x += 1) {
      const px = gridX + x * cellSize;
      const py = gridY + y * cellSize;
      const isHeader = y === 0 || y === rows + 1 || x === 0 || x === cols + 1;
      context.fillStyle = isHeader ? headerFill : '#ffffff';

      if (!isHeader) {
        const cell = cells[(y - 1) * cols + (x - 1)];
        context.fillStyle = patternCellColor(cell);
      }
      context.fillRect(px, py, cellSize, cellSize);
      context.strokeRect(px, py, cellSize, cellSize);

      let label = '';
      if (isHeader) {
        if ((y === 0 || y === rows + 1) && x > 0 && x <= cols) label = String(x);
        if ((x === 0 || x === cols + 1) && y > 0 && y <= rows) label = String(y);
        context.fillStyle = headerText;
        context.font = `700 ${headerFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      } else {
        const cell = cells[(y - 1) * cols + (x - 1)];
        const color = patternCellColor(cell);
        label = colorCodeOf(color);
        context.fillStyle = readableTextColor(color);
        context.font = `700 ${cellFontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      }
      if (label) context.fillText(label, px + cellSize / 2, py + cellSize / 2);
    }
  }

  context.strokeStyle = '#000000';
  context.lineWidth = 4;
  for (let x = 0; x <= cols + 2; x += 5) {
    const px = gridX + x * cellSize;
    context.beginPath();
    context.moveTo(px, gridY);
    context.lineTo(px, gridY + gridHeight);
    context.stroke();
  }
  for (let y = 0; y <= rows + 2; y += 5) {
    const py = gridY + y * cellSize;
    context.beginPath();
    context.moveTo(gridX, py);
    context.lineTo(gridX + gridWidth, py);
    context.stroke();
  }
  context.strokeRect(gridX, gridY, gridWidth, gridHeight);

  const legendX = margin;
  const legendY = gridY + gridHeight + legendGap;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  stats.forEach((item, index) => {
    const x = legendX + (index % legendColumns) * legendItemWidth;
    const y = legendY + Math.floor(index / legendColumns) * legendItemHeight;
    roundRect(context, x + 3, y, legendSwatch, legendSwatch, 10);
    context.fillStyle = item.color;
    context.fill();
    context.strokeStyle = '#555555';
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = readableTextColor(item.color);
    context.font = '700 17px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText(item.code, x + 3 + legendSwatch / 2, y + legendSwatch / 2);
    context.fillStyle = '#111111';
    context.font = '700 21px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.fillText(String(item.count), x + 3 + legendSwatch / 2, y + legendSwatch + 22);
  });

  return canvas;
}

export function beadPatternStats(cells: Cell[]): Array<{ code: string; color: string; count: number }> {
  const counts = new Map<string, { code: string; color: string; count: number }>();
  for (const cell of cells) {
    const color = patternCellColor(cell);
    const code = colorCodeOf(color);
    const key = `${code}:${color.toLowerCase()}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { code, color, count: 1 });
    }
  }
  return [...counts.values()].sort((left, right) => {
    return left.code.localeCompare(right.code, 'en', { numeric: true });
  });
}

export function patternCellColor(cell: Cell | undefined): string {
  if (!cell || cell.transparent) return WHITE_BEAD_COLOR;
  return normalizeHexForPalette(cell.color);
}

export function normalizeHexForPalette(hex: string): string {
  const normalized = hex.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : WHITE_BEAD_COLOR;
}

export function readableTextColor(hex: string): string {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? '#151515' : '#ffffff';
}

export function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function normalizeGridSize(value: number | ''): number {
  return Math.max(2, Math.min(MAX_AUTO_GRID_SIDE, Math.round(Number(value)) || 32));
}

export function parseGridSizeInput(value: string): number | '' {
  if (value === '') return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : '';
}

export function resizeCells(oldCells: Cell[], oldRows: number, oldCols: number, newRows: number, newCols: number): Cell[] {
  const result: Cell[] = [];
  for (let y = 0; y < newRows; y++) {
    for (let x = 0; x < newCols; x++) {
      const existing = oldCells.find((c) => c.x === x && c.y === y);
      if (existing) {
        result.push(existing);
      } else {
        result.push({ x, y, color: EMPTY_COLOR, transparent: true });
      }
    }
  }
  return result;
}
