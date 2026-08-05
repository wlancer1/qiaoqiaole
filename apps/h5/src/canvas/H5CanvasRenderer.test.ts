import { describe, expect, it } from 'vitest';

import {
  MAX_CANVAS_BACKING_AREA,
  MAX_CANVAS_BACKING_DIMENSION,
  canvasRenderMetrics,
  configureCanvas,
  drawCodeLayer,
  drawColorLayer,
  drawGridLayer,
  drawViewportCodeLayer,
  drawViewportColorLayer,
  drawViewportGridLayer,
  visibleGridRange,
  viewportGridBoundary,
} from './H5CanvasRenderer';

type RecordedOperation = { name: string; args: unknown[]; fillStyle?: string; lineWidth?: number; font?: string };

function recordingContext() {
  const operations: RecordedOperation[] = [];
  const context = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    clearRect(...args: unknown[]) { operations.push({ name: 'clearRect', args }); },
    fillRect(...args: unknown[]) { operations.push({ name: 'fillRect', args, fillStyle: this.fillStyle }); },
    fillText(...args: unknown[]) { operations.push({ name: 'fillText', args, fillStyle: this.fillStyle, font: this.font }); },
    beginPath(...args: unknown[]) { operations.push({ name: 'beginPath', args }); },
    moveTo(...args: unknown[]) { operations.push({ name: 'moveTo', args }); },
    lineTo(...args: unknown[]) { operations.push({ name: 'lineTo', args }); },
    stroke(...args: unknown[]) { operations.push({ name: 'stroke', args, lineWidth: this.lineWidth }); },
    strokeRect(...args: unknown[]) { operations.push({ name: 'strokeRect', args, lineWidth: this.lineWidth }); },
    setTransform(...args: unknown[]) { operations.push({ name: 'setTransform', args }); },
  };

  return { context: context as unknown as CanvasRenderingContext2D, operations };
}

describe('visibleGridRange', () => {
  const artboard = { left: 20, top: 10, width: 100, height: 80 };

  it('returns every row and column for a centered artboard', () => {
    expect(visibleGridRange(artboard, 160, 120, 4, 5)).toEqual({
      rowStart: 0,
      rowEnd: 4,
      colStart: 0,
      colEnd: 5,
    });
  });

  it.each([
    [{ left: -20, top: 10, width: 100, height: 80 }, 80, 120, { rowStart: 0, rowEnd: 4, colStart: 1, colEnd: 5 }],
    [{ left: 20, top: 10, width: 100, height: 80 }, 80, 120, { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 3 }],
    [{ left: 20, top: -20, width: 100, height: 80 }, 160, 60, { rowStart: 1, rowEnd: 4, colStart: 0, colEnd: 5 }],
    [{ left: 20, top: 40, width: 100, height: 80 }, 160, 80, { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 5 }],
  ])('clips a partially visible artboard to half-open grid ranges', (position, viewportWidth, viewportHeight, expected) => {
    expect(visibleGridRange(position, viewportWidth, viewportHeight, 4, 5)).toEqual(expected);
  });

  it.each([
    { left: 160, top: 0, width: 100, height: 80 },
    { left: -100, top: 0, width: 100, height: 80 },
    { left: 0, top: 120, width: 100, height: 80 },
    { left: 0, top: -80, width: 100, height: 80 },
  ])('returns an empty range for an artboard fully outside the viewport', (position) => {
    expect(visibleGridRange(position, 160, 120, 4, 5)).toEqual({
      rowStart: 0,
      rowEnd: 0,
      colStart: 0,
      colEnd: 0,
    });
  });

  it('clamps the range to valid row and column indices', () => {
    expect(visibleGridRange({ left: -1_000, top: -1_000, width: 2_000, height: 2_000 }, 100, 100, 4, 5)).toEqual({
      rowStart: 2,
      rowEnd: 3,
      colStart: 2,
      colEnd: 3,
    });
  });

  it('does not include the cell beginning at a terminal viewport boundary', () => {
    expect(visibleGridRange({ left: -20, top: 0, width: 100, height: 80 }, 20, 80, 4, 5)).toEqual({
      rowStart: 0,
      rowEnd: 4,
      colStart: 1,
      colEnd: 2,
    });
  });
});

describe('viewportGridBoundary', () => {
  it('offsets grid coordinates into the viewport and aligns them to backing pixels', () => {
    expect(viewportGridBoundary(1, 5.2, 20, 3, 2)).toBe(12);
    expect(viewportGridBoundary(0, 5.2, 20, 3, 2)).toBe(5);
    expect(viewportGridBoundary(3, 5.2, 20, 3, 2)).toBe(25);
  });
});

describe('viewport draw passes', () => {
  const viewportGeometry = {
    viewportWidth: 40,
    viewportHeight: 40,
    artboard: { left: -20, top: -20, width: 100, height: 80 },
    rows: 4,
    cols: 5,
    renderScale: 2,
  };

  function trackedDenseCells(accessed: number[]) {
    const cells = Array.from({ length: 20 }, (_, index) => ({
      x: index % 5,
      y: Math.floor(index / 5),
      color: `color-${index}`,
      transparent: false,
    }));
    return new Proxy(cells, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) accessed.push(Number(property));
        return Reflect.get(target, property, receiver);
      },
    });
  }

  it('indexes and paints only visible row-major cells in the color layer', () => {
    const accessed: number[] = [];
    const { context, operations } = recordingContext();

    drawViewportColorLayer(context, { ...viewportGeometry, cells: trackedDenseCells(accessed) });

    expect(accessed).toEqual([6, 7, 11, 12]);
    expect(operations[0]).toEqual({ name: 'clearRect', args: [0, 0, 40, 40] });
    expect(operations.filter((operation) => operation.name === 'fillRect' && operation.fillStyle?.startsWith('color-'))).toEqual([
      { name: 'fillRect', args: [0, 0, 20, 20], fillStyle: 'color-6' },
      { name: 'fillRect', args: [20, 0, 20, 20], fillStyle: 'color-7' },
      { name: 'fillRect', args: [0, 20, 20, 20], fillStyle: 'color-11' },
      { name: 'fillRect', args: [20, 20, 20, 20], fillStyle: 'color-12' },
    ]);
  });

  it('indexes only visible row-major cells and sizes labels from displayed cells', () => {
    const accessed: number[] = [];
    const { context, operations } = recordingContext();

    drawViewportCodeLayer(context, {
      ...viewportGeometry,
      cells: trackedDenseCells(accessed),
      visible: true,
      getCode: (_, cell) => `A${cell.x}`,
      getTextColor: () => '#123456',
    });

    expect(accessed).toEqual([6, 7, 11, 12]);
    expect(operations.find((operation) => operation.name === 'fillText')).toEqual({
      name: 'fillText',
      args: ['A1', 10, 10, 18],
      fillStyle: '#123456',
      font: '600 10.4px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    });
  });

  it('uses the same backing-aligned boundaries and a constant CSS-pixel grid width', () => {
    const colorRecording = recordingContext();
    const codeRecording = recordingContext();
    const gridRecording = recordingContext();
    const geometry = {
      viewportWidth: 30,
      viewportHeight: 20,
      artboard: { left: 5.2, top: 2.2, width: 20, height: 12 },
      rows: 1,
      cols: 3,
      renderScale: 2,
    };
    const cells = Array.from({ length: 3 }, (_, x) => ({ x, y: 0, color: `color-${x}` }));

    drawViewportColorLayer(colorRecording.context, { ...geometry, cells });
    drawViewportCodeLayer(codeRecording.context, {
      ...geometry,
      cells,
      visible: true,
      getCode: () => 'A1',
      getTextColor: () => '#000000',
    });
    drawViewportGridLayer(gridRecording.context, geometry);

    const firstOpaqueFill = colorRecording.operations.find(
      (operation) => operation.name === 'fillRect' && operation.fillStyle === 'color-0',
    );
    const firstLabel = codeRecording.operations.find((operation) => operation.name === 'fillText');
    expect(firstOpaqueFill).toEqual({ name: 'fillRect', args: [5, 2, 7, 12], fillStyle: 'color-0' });
    expect(firstLabel?.args.slice(1)).toEqual([8.5, 8, 6.3]);
    expect(gridRecording.operations).toContainEqual({ name: 'moveTo', args: [12, 2] });
    expect(gridRecording.operations).toContainEqual({ name: 'lineTo', args: [12, 14] });
    expect(gridRecording.operations).toContainEqual({ name: 'stroke', args: [], lineWidth: 0.75 });
  });

  it('only clears when the artboard is fully offscreen', () => {
    const offscreen = {
      ...viewportGeometry,
      artboard: { left: 50, top: 50, width: 100, height: 80 },
    };
    const cells = Array.from({ length: 20 }, (_, index) => ({
      x: index % 5,
      y: Math.floor(index / 5),
      color: '#ffffff',
    }));
    const recordings = [recordingContext(), recordingContext(), recordingContext()];

    drawViewportColorLayer(recordings[0].context, { ...offscreen, cells });
    drawViewportCodeLayer(recordings[1].context, {
      ...offscreen,
      cells,
      visible: true,
      getCode: () => 'A1',
      getTextColor: () => '#000000',
    });
    drawViewportGridLayer(recordings[2].context, offscreen);

    for (const recording of recordings) {
      expect(recording.operations).toEqual([{ name: 'clearRect', args: [0, 0, 40, 40] }]);
    }
  });
});

describe('canvasRenderMetrics', () => {
  it('uses DPR and zoom for backing-store density', () => {
    expect(canvasRenderMetrics(320, 180, 2, 1.5)).toEqual({
      logicalWidth: 320,
      logicalHeight: 180,
      renderScale: 3,
      backingWidth: 960,
      backingHeight: 540,
    });
  });

  it('keeps the render scale at least one when zoomed out', () => {
    expect(canvasRenderMetrics(320, 180, 2, 0.2)).toMatchObject({
      renderScale: 1,
      backingWidth: 320,
      backingHeight: 180,
    });
  });

  it('caps high-density backing stores by dimension and area', () => {
    const metrics = canvasRenderMetrics(379, 898, 2, 12);

    expect(metrics.backingWidth).toBeLessThanOrEqual(MAX_CANVAS_BACKING_DIMENSION);
    expect(metrics.backingHeight).toBeLessThanOrEqual(MAX_CANVAS_BACKING_DIMENSION);
    expect(3 * metrics.backingWidth * metrics.backingHeight).toBeLessThanOrEqual(MAX_CANVAS_BACKING_AREA);
    expect(metrics.renderScale).toBeLessThan(24);
  });

  it.each([
    [14, 57_344],
    [57_344, 14],
  ])('allows density below one for an extreme %d × %d logical aspect ratio', (width, height) => {
    const metrics = canvasRenderMetrics(width, height, 2, 12);

    expect(metrics.renderScale).toBeLessThan(1);
    expect(metrics.backingWidth).toBeGreaterThanOrEqual(1);
    expect(metrics.backingHeight).toBeGreaterThanOrEqual(1);
    expect(metrics.backingWidth).toBeLessThanOrEqual(MAX_CANVAS_BACKING_DIMENSION);
    expect(metrics.backingHeight).toBeLessThanOrEqual(MAX_CANVAS_BACKING_DIMENSION);
    expect(3 * metrics.backingWidth * metrics.backingHeight).toBeLessThanOrEqual(MAX_CANVAS_BACKING_AREA);
  });

  it('returns an empty backing store for invalid logical sizes', () => {
    expect(canvasRenderMetrics(0, 180, 2, 1)).toMatchObject({ backingWidth: 0, backingHeight: 0, renderScale: 1 });
    expect(canvasRenderMetrics(Number.NaN, 180, 2, 1)).toMatchObject({ backingWidth: 0, backingHeight: 0, renderScale: 1 });
  });
});

describe('configureCanvas', () => {
  it('applies identical backing metrics and transforms to every layer', () => {
    const metrics = canvasRenderMetrics(120, 80, 2, 1.5);
    const layers = Array.from({ length: 3 }, () => {
      const recording = recordingContext();
      const canvas = {
        width: 0,
        height: 0,
        style: { width: '', height: '' },
        getContext: () => recording.context,
      } as unknown as HTMLCanvasElement;
      configureCanvas(canvas, metrics);
      return { canvas, operations: recording.operations };
    });

    for (const layer of layers) {
      expect(layer.canvas.width).toBe(360);
      expect(layer.canvas.height).toBe(240);
      expect(layer.canvas.style.width).toBe('120px');
      expect(layer.canvas.style.height).toBe('80px');
      expect(layer.operations).toContainEqual({ name: 'setTransform', args: [3, 0, 0, 3, 0, 0] });
    }
  });
});

describe('drawColorLayer', () => {
  it('clears, paints the checkerboard, then fills only opaque cells', () => {
    const { context, operations } = recordingContext();

    drawColorLayer(context, {
      width: 20,
      height: 10,
      rows: 1,
      cols: 2,
      renderScale: 1,
      cells: [
        { x: 0, y: 0, color: '#ff0000', transparent: false },
        { x: 1, y: 0, color: '#00ff00', transparent: true },
      ],
    });

    expect(operations[0]).toEqual({ name: 'clearRect', args: [0, 0, 20, 10] });
    expect(operations.filter((operation) => operation.name === 'fillRect')).toEqual([
      { name: 'fillRect', args: [0, 0, 10, 10], fillStyle: '#ffffff' },
      { name: 'fillRect', args: [10, 0, 10, 10], fillStyle: '#cfcfcf' },
      { name: 'fillRect', args: [0, 0, 10, 10], fillStyle: '#ff0000' },
    ]);
  });
});

describe('drawCodeLayer', () => {
  it('clears without drawing labels when codes are hidden', () => {
    const { context, operations } = recordingContext();

    drawCodeLayer(context, {
      width: 20,
      height: 10,
      rows: 1,
      cols: 2,
      renderScale: 1,
      cells: [{ x: 0, y: 0, color: '#000000', transparent: false }],
      visible: false,
      getCode: () => 'A1',
      getTextColor: () => '#ffffff',
    });

    expect(operations).toEqual([{ name: 'clearRect', args: [0, 0, 20, 10] }]);
  });

  it('centers visible labels and uses the provided readable text color', () => {
    const { context, operations } = recordingContext();

    drawCodeLayer(context, {
      width: 20,
      height: 10,
      rows: 1,
      cols: 2,
      renderScale: 1,
      cells: [
        { x: 0, y: 0, color: '#000000', transparent: false },
        { x: 1, y: 0, color: '#ffffff', transparent: false },
      ],
      visible: true,
      getCode: (color) => color === '#000000' ? 'A1' : 'B12',
      getTextColor: (color) => color === '#000000' ? '#ffffff' : '#000000',
    });

    expect(operations.filter((operation) => operation.name === 'fillText')).toEqual([
      { name: 'fillText', args: ['A1', 5, 5, 9], fillStyle: '#ffffff', font: '600 5.2px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
      { name: 'fillText', args: ['B12', 15, 5, 9], fillStyle: '#000000', font: '600 5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
    ]);
    expect(context.textAlign).toBe('center');
    expect(context.textBaseline).toBe('middle');
  });
});

describe('drawGridLayer', () => {
  it('draws cell boundaries and an inset border at a non-scaling logical width', () => {
    const { context, operations } = recordingContext();

    drawGridLayer(context, { width: 20, height: 10, rows: 1, cols: 2, zoom: 3, renderScale: 1 });

    expect(operations[0]).toEqual({ name: 'clearRect', args: [0, 0, 20, 10] });
    expect(operations).toContainEqual({ name: 'moveTo', args: [10, 0] });
    expect(operations).toContainEqual({ name: 'lineTo', args: [10, 10] });
    expect(operations).toContainEqual({ name: 'stroke', args: [], lineWidth: 0.25 });
    expect(operations).toContainEqual({
      name: 'strokeRect',
      args: [0.125, 0.125, 19.75, 9.75],
      lineWidth: 0.25,
    });
  });

  it('aligns vertical and horizontal interior boundaries to backing pixels', () => {
    const { context, operations } = recordingContext();

    drawGridLayer(context, {
      width: 20,
      height: 10,
      rows: 3,
      cols: 3,
      zoom: 3,
      renderScale: 2,
    });

    expect(operations).toContainEqual({ name: 'moveTo', args: [6.5, 0] });
    expect(operations).toContainEqual({ name: 'lineTo', args: [6.5, 10] });
    expect(operations).toContainEqual({ name: 'moveTo', args: [0, 3.5] });
    expect(operations).toContainEqual({ name: 'lineTo', args: [20, 3.5] });
    expect(operations).toContainEqual({
      name: 'strokeRect',
      args: [0.125, 0.125, 19.75, 9.75],
      lineWidth: 0.25,
    });
  });
});

describe('shared snapped cell geometry', () => {
  it('aligns color edges, code centers, and grid boundaries for fractional cells', () => {
    const colorRecording = recordingContext();
    const codeRecording = recordingContext();
    const gridRecording = recordingContext();
    const geometry = { width: 20, height: 10, rows: 1, cols: 3, renderScale: 2 };
    const cells = [{ x: 0, y: 0, color: '#ff0000', transparent: false }];

    drawColorLayer(colorRecording.context, { ...geometry, cells });
    drawCodeLayer(codeRecording.context, {
      ...geometry,
      cells,
      visible: true,
      getCode: () => 'A1',
      getTextColor: () => '#ffffff',
    });
    drawGridLayer(gridRecording.context, { ...geometry, zoom: 3 });

    const opaqueFill = colorRecording.operations.filter((operation) => operation.name === 'fillRect').at(-1);
    const label = codeRecording.operations.find((operation) => operation.name === 'fillText');
    const firstGridBoundary = gridRecording.operations.find(
      (operation) => operation.name === 'moveTo' && operation.args[0] !== 0,
    );

    expect(opaqueFill).toEqual({ name: 'fillRect', args: [0, 0, 6.5, 10], fillStyle: '#ff0000' });
    expect(label).toEqual({
      name: 'fillText',
      args: ['A1', 3.25, 5, 5.8500000000000005],
      fillStyle: '#ffffff',
      font: '600 3.38px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    });
    expect(firstGridBoundary).toEqual({ name: 'moveTo', args: [6.5, 0] });
  });
});
