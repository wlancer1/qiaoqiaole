import { describe, expect, it } from 'vitest';

import {
  canvasLayerInvalidation,
  type CanvasLayerSnapshot,
} from './H5CanvasLayers';

const cells = [{ x: 0, y: 0, color: '#ffffff', transparent: false }];
const getCode = (color: string) => color;
const getTextColor = () => '#000000';

function snapshot(overrides: Partial<CanvasLayerSnapshot> = {}): CanvasLayerSnapshot {
  return {
    cells,
    rows: 32,
    cols: 32,
    canvasScale: 1,
    codesVisible: false,
    getCode,
    getTextColor,
    logicalWidth: 320,
    logicalHeight: 320,
    dpr: 2,
    fontRevision: 0,
    ...overrides,
  };
}

describe('canvasLayerInvalidation', () => {
  it.each([
    ['cells', { cells: [...cells] }],
    ['getCode', { getCode: () => 'A1' }],
    ['getTextColor', { getTextColor: () => '#ffffff' }],
  ] as const)('redraws color and code only when %s changes', (_name, change) => {
    expect(canvasLayerInvalidation(snapshot(), snapshot(change))).toEqual({
      configure: false,
      color: true,
      code: true,
      grid: false,
    });
  });

  it.each([
    ['visibility', { codesVisible: true }],
    ['font readiness', { fontRevision: 1 }],
  ] as const)('redraws only code for %s changes', (_name, change) => {
    expect(canvasLayerInvalidation(snapshot(), snapshot(change))).toEqual({
      configure: false,
      color: false,
      code: true,
      grid: false,
    });
  });

  it.each([
    ['rows', { rows: 24 }],
    ['cols', { cols: 24 }],
  ] as const)('redraws every layer without reallocating for %s changes', (_name, change) => {
    expect(canvasLayerInvalidation(snapshot(), snapshot(change))).toEqual({
      configure: false,
      color: true,
      code: true,
      grid: true,
    });
  });

  it.each([
    ['logical width', { logicalWidth: 300 }],
    ['logical height', { logicalHeight: 300 }],
    ['DPR', { dpr: 3 }],
    ['zoom', { canvasScale: 2 }],
  ] as const)('reconfigures and redraws every layer for %s changes', (_name, change) => {
    expect(canvasLayerInvalidation(snapshot(), snapshot(change))).toEqual({
      configure: true,
      color: true,
      code: true,
      grid: true,
    });
  });
});
