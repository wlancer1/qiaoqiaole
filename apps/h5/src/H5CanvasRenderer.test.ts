import { describe, expect, it } from 'vitest';

import {
  MAX_CANVAS_BACKING_AREA,
  MAX_CANVAS_BACKING_DIMENSION,
  canvasRenderMetrics,
  configureCanvas,
  drawCodeLayer,
  drawColorLayer,
  drawGridLayer,
} from './H5CanvasRenderer';

type RecordedOperation = { name: string; args: unknown[]; fillStyle?: string; lineWidth?: number };

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
    fillText(...args: unknown[]) { operations.push({ name: 'fillText', args, fillStyle: this.fillStyle }); },
    beginPath(...args: unknown[]) { operations.push({ name: 'beginPath', args }); },
    moveTo(...args: unknown[]) { operations.push({ name: 'moveTo', args }); },
    lineTo(...args: unknown[]) { operations.push({ name: 'lineTo', args }); },
    stroke(...args: unknown[]) { operations.push({ name: 'stroke', args, lineWidth: this.lineWidth }); },
    strokeRect(...args: unknown[]) { operations.push({ name: 'strokeRect', args, lineWidth: this.lineWidth }); },
    setTransform(...args: unknown[]) { operations.push({ name: 'setTransform', args }); },
  };

  return { context: context as unknown as CanvasRenderingContext2D, operations };
}

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
      { name: 'fillText', args: ['A1', 5, 5], fillStyle: '#ffffff' },
      { name: 'fillText', args: ['B12', 15, 5], fillStyle: '#000000' },
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
    expect(label).toEqual({ name: 'fillText', args: ['A1', 3.25, 5], fillStyle: '#ffffff' });
    expect(firstGridBoundary).toEqual({ name: 'moveTo', args: [6.5, 0] });
  });
});
