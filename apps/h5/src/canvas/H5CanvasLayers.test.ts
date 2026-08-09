import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { H5CanvasLayers, canvasLayerInvalidation } from './H5CanvasLayers';
import type { H5CanvasOverlay } from './H5BeadingOverlay';
import {
  CANVAS_LAYER_COUNT,
  MAX_CANVAS_BACKING_AREA,
  canvasRenderMetrics,
} from './H5CanvasRenderer';

vi.mock('react-zoom-pan-pinch', () => ({ useTransformEffect: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const cells = [{ x: 0, y: 0, color: '#ffffff', transparent: false }];
const getCode = (color: string) => color;
const getTextColor = () => '#000000';
const overlay: H5CanvasOverlay = {
  currentColorCode: null,
  highlightEnabled: false,
  markedCellIndexes: [],
  completedColorCodes: [],
};

type ViewportCanvasLayerSnapshot = {
  cells: readonly typeof cells[number][];
  rows: number;
  cols: number;
  codesVisible: boolean;
  getCode: typeof getCode;
  getTextColor: typeof getTextColor;
  overlay: H5CanvasOverlay;
  gridVisible: boolean;
  viewportWidth: number;
  viewportHeight: number;
  artboard: { left: number; top: number; width: number; height: number };
  dpr: number;
  fontRevision: number;
};

type ViewportInvalidation = (
  previous: ViewportCanvasLayerSnapshot | null,
  next: ViewportCanvasLayerSnapshot,
) => ReturnType<typeof canvasLayerInvalidation>;

// This adapter describes the next public snapshot contract while production is deliberately RED.
const invalidateViewport = canvasLayerInvalidation as unknown as ViewportInvalidation;

function snapshot(
  overrides: Partial<ViewportCanvasLayerSnapshot> = {},
): ViewportCanvasLayerSnapshot {
  return {
    cells,
    rows: 32,
    cols: 32,
    codesVisible: false,
    getCode,
    getTextColor,
    overlay,
    gridVisible: true,
    viewportWidth: 390,
    viewportHeight: 640,
    artboard: { left: 16, top: 24, width: 358, height: 358 },
    dpr: 3,
    fontRevision: 0,
    ...overrides,
  };
}

describe('canvasLayerInvalidation viewport contract', () => {
  it('redraws color, code, and overlay when cells change', () => {
    expect(invalidateViewport(snapshot(), snapshot({ cells: [...cells] }))).toEqual({
      configure: false,
      color: true,
      code: true,
      grid: false,
      overlay: true,
    });
  });

  it('redraws code and overlay when getCode changes', () => {
    expect(invalidateViewport(snapshot(), snapshot({ getCode: () => 'A1' }))).toEqual({
      configure: false,
      color: false,
      code: true,
      grid: false,
      overlay: true,
    });
  });

  it('redraws only code when getTextColor changes', () => {
    expect(invalidateViewport(snapshot(), snapshot({ getTextColor: () => '#ffffff' }))).toEqual({
      configure: false,
      color: false,
      code: true,
      grid: false,
      overlay: false,
    });
  });

  it.each([
    ['visibility', { codesVisible: true }],
    ['font readiness', { fontRevision: 1 }],
  ] as const)('redraws only code for %s changes', (_name, change) => {
    expect(invalidateViewport(snapshot(), snapshot(change))).toEqual({
      configure: false,
      color: false,
      code: true,
      grid: false,
      overlay: false,
    });
  });

  it.each([
    ['current color', { ...overlay, currentColorCode: 'A1' }],
    ['highlight visibility', { ...overlay, highlightEnabled: true }],
    ['marked cells', { ...overlay, markedCellIndexes: [0] }],
    ['completed colors', { ...overlay, completedColorCodes: ['A1'] }],
  ] as const)('redraws only overlay for %s changes', (_name, nextOverlay) => {
    expect(invalidateViewport(snapshot(), snapshot({ overlay: nextOverlay }))).toEqual({
      configure: false,
      color: false,
      code: false,
      grid: false,
      overlay: true,
    });
  });

  it('redraws only grid when grid visibility changes', () => {
    expect(invalidateViewport(snapshot(), snapshot({ gridVisible: false }))).toEqual({
      configure: false,
      color: false,
      code: false,
      grid: true,
      overlay: false,
    });
  });

  it.each([
    ['rows', { rows: 24 }],
    ['cols', { cols: 24 }],
  ] as const)('redraws every layer without reallocating for %s changes', (_name, change) => {
    expect(invalidateViewport(snapshot(), snapshot(change))).toEqual({
      configure: false,
      color: true,
      code: true,
      grid: true,
      overlay: true,
    });
  });

  it.each([
    ['pan', { artboard: { left: -120, top: 40, width: 358, height: 358 } }],
    ['zoom', { artboard: { left: -700, top: -650, width: 4296, height: 4296 } }],
  ] as const)('redraws every layer without reallocating for a camera %s', (_name, change) => {
    expect(invalidateViewport(snapshot(), snapshot(change))).toEqual({
      configure: false,
      color: true,
      code: true,
      grid: true,
      overlay: true,
    });
  });

  it.each([
    ['viewport width', { viewportWidth: 430 }],
    ['viewport height', { viewportHeight: 720 }],
    ['DPR', { dpr: 2 }],
  ] as const)('reconfigures and redraws every layer for %s changes', (_name, change) => {
    expect(invalidateViewport(snapshot(), snapshot(change))).toEqual({
      configure: true,
      color: true,
      code: true,
      grid: true,
      overlay: true,
    });
  });
});

type FunctionNode = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration;

function isFunctionNode(node: ts.Node): node is FunctionNode {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);
}

function visit(node: ts.Node, callback: (current: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function visitExecutedBody(root: FunctionNode, callback: (current: ts.Node) => void): void {
  const walk = (node: ts.Node) => {
    callback(node);
    ts.forEachChild(node, (child) => {
      if (isFunctionNode(child)) return;
      walk(child);
    });
  };
  callback(root);
  if (root.body) walk(root.body);
}

function calledName(node: ts.CallExpression): string | null {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return null;
}

function isStringArgument(node: ts.Node | undefined, value: string): boolean {
  return Boolean(node && ts.isStringLiteralLike(node) && node.text === value);
}

function returnedFunction(factory: FunctionNode): FunctionNode | undefined {
  if (ts.isArrowFunction(factory) && isFunctionNode(factory.body)) return factory.body;
  if (!factory.body || !ts.isBlock(factory.body)) return undefined;
  for (const statement of factory.body.statements) {
    if (ts.isReturnStatement(statement) && statement.expression && isFunctionNode(statement.expression)) {
      return statement.expression;
    }
  }
  return undefined;
}

function hookFunction(node: ts.Node | undefined): FunctionNode | undefined {
  if (!node || !ts.isCallExpression(node)) return undefined;
  const hook = calledName(node);
  const firstArgument = node.arguments[0];
  if (!firstArgument || !isFunctionNode(firstArgument)) return undefined;
  if (hook === 'useCallback') return firstArgument;
  if (hook === 'useMemo') return returnedFunction(firstArgument) ?? firstArgument;
  return undefined;
}

function schedulingStructure(source: string) {
  const sourceFile = ts.createSourceFile(
    'H5CanvasLayers.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const functions = new Map<string, FunctionNode>();
  const memoizedCallbacks = new Set<string>();
  const calls: ts.CallExpression[] = [];

  visit(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (isFunctionNode(node.initializer)) {
        functions.set(node.name.text, node.initializer);
      }
      const stableFunction = hookFunction(node.initializer);
      if (stableFunction) functions.set(node.name.text, stableFunction);
      if (
        ts.isCallExpression(node.initializer)
        && ['useCallback', 'useMemo'].includes(calledName(node.initializer) ?? '')
      ) {
        memoizedCallbacks.add(node.name.text);
      }
    }
    if (ts.isCallExpression(node)) calls.push(node);
  });

  const resolveFunction = (node: ts.Node | undefined): FunctionNode | undefined => {
    if (!node) return undefined;
    if (isFunctionNode(node)) return node;
    const stableFunction = hookFunction(node);
    if (stableFunction) return stableFunction;
    return ts.isIdentifier(node) ? functions.get(node.text) : undefined;
  };

  const reachableFrom = (root: FunctionNode): ts.Node[] => {
    const reachable: ts.Node[] = [];
    const visited = new Set<FunctionNode>();
    const collect = (fn: FunctionNode) => {
      if (visited.has(fn)) return;
      visited.add(fn);
      reachable.push(fn);
      visitExecutedBody(fn, (node) => {
        if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
        const called = functions.get(node.expression.text);
        if (called) collect(called);
      });
    };
    collect(root);
    return reachable;
  };

  const hasCall = (nodes: readonly ts.Node[], names: readonly string[], event?: string) => {
    let found = false;
    for (const root of nodes) {
      const inspect = (node: ts.Node) => {
        if (!ts.isCallExpression(node) || !names.includes(calledName(node) ?? '')) return;
        if (!event || isStringArgument(node.arguments[0], event) || calledName(node) === names[1]) found = true;
      };
      if (isFunctionNode(root)) visitExecutedBody(root, inspect);
      else visit(root, inspect);
    }
    return found;
  };

  const transformEffectUsesMemoizedCallback = calls.some((call) => (
    calledName(call) === 'useTransformEffect'
    && ts.isIdentifier(call.arguments[0])
    && memoizedCallbacks.has(call.arguments[0].text)
  ));
  const hasInitialLayoutWork = calls.some((call) => {
    if (calledName(call) !== 'useLayoutEffect') return false;
    const effect = resolveFunction(call.arguments[0]);
    if (!effect || !effect.body) return false;
    let invokesWork = false;
    visit(effect.body, (node) => {
      if (ts.isCallExpression(node) && calledName(node) !== null) invokesWork = true;
    });
    return invokesWork;
  });
  const dprChangeResubscribes = calls.some((call) => {
    const name = calledName(call);
    const isChangeRegistration = (name === 'addEventListener' && isStringArgument(call.arguments[0], 'change'))
      || name === 'addListener';
    if (!isChangeRegistration) return false;
    const handler = resolveFunction(call.arguments[name === 'addListener' ? 0 : 1]);
    if (!handler) return false;
    const reachable = reachableFrom(handler);
    let readsCurrentDpr = false;
    let containsDppx = false;
    for (const root of reachable) {
      if (!isFunctionNode(root)) continue;
      visitExecutedBody(root, (node) => {
        if (ts.isPropertyAccessExpression(node) && node.name.text === 'devicePixelRatio') readsCurrentDpr = true;
        if ((ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) && node.text.includes('dppx')) {
          containsDppx = true;
        }
      });
    }
    return readsCurrentDpr
      && containsDppx
      && hasCall(reachable, ['matchMedia'])
      && hasCall(reachable, ['removeEventListener', 'removeListener'], 'change')
      && hasCall(reachable, ['addEventListener', 'addListener'], 'change');
  });

  return {
    calls,
    transformEffectUsesMemoizedCallback,
    hasInitialLayoutWork,
    dprChangeResubscribes,
    hasCall: (names: readonly string[], event?: string) => hasCall([sourceFile], names, event),
  };
}

describe('scheduling source analyzer', () => {
  it('unwraps memoized callbacks and follows an invoked DPR resubscription', () => {
    const fixture = `
      let query;
      function refreshDprQuery() {
        query?.removeEventListener('change', handleDprChange);
        const dpr = window.devicePixelRatio;
        query = window.matchMedia(\`(resolution: \${dpr}dppx)\`);
        query.addEventListener('change', handleDprChange);
      }
      const handleDprChange = useCallback(() => refreshDprQuery(), []);
      const handleTransform = useMemo(() => () => refreshDprQuery(), []);
      useTransformEffect(handleTransform);
    `;
    const fixtureStructure = schedulingStructure(fixture);

    expect(fixtureStructure.transformEffectUsesMemoizedCallback).toBe(true);
    expect(fixtureStructure.dprChangeResubscribes).toBe(true);
  });

  it('ignores a matching DPR implementation inside an uncalled nested function', () => {
    const fixture = `
      let query;
      const handleDprChange = useCallback(() => {
        function neverCalled() {
          query?.removeEventListener('change', handleDprChange);
          const dpr = window.devicePixelRatio;
          query = window.matchMedia(\`(resolution: \${dpr}dppx)\`);
          query.addEventListener('change', handleDprChange);
        }
      }, []);
      query.addEventListener('change', handleDprChange);
    `;

    expect(schedulingStructure(fixture).dprChangeResubscribes).toBe(false);
  });
});

describe('H5CanvasLayers scheduling contract', () => {
  const source = fs.readFileSync(path.resolve('apps/h5/src/canvas/H5CanvasLayers.tsx'), 'utf8');
  const structure = schedulingStructure(source);

  it('passes a stable callback to the transform effect and schedules initial layout work', () => {
    expect(structure.transformEffectUsesMemoizedCallback).toBe(true);
    expect(structure.hasInitialLayoutWork).toBe(true);
  });

  it('draws camera frames directly from the transform callback instead of queueing a second RAF', () => {
    const transformCallback = source.match(/const handleTransform = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/)?.[0] ?? '';
    expect(transformCallback).toContain('drawFrameRef.current()');
    expect(transformCallback).not.toContain('scheduleDraw()');
  });

  it('cleans up viewport observers and resubscribes after a DPR change', () => {
    expect(source).toContain('ResizeObserver');
    expect(structure.hasCall(['disconnect'])).toBe(true);
    expect(structure.hasCall(['addEventListener'], 'resize')).toBe(true);
    expect(structure.hasCall(['removeEventListener'], 'resize')).toBe(true);
    expect(structure.dprChangeResubscribes).toBe(true);
  });

  it('coalesces redraws with RAF and cancels a pending frame on cleanup', () => {
    expect(structure.hasCall(['requestAnimationFrame'])).toBe(true);
    expect(structure.hasCall(['cancelAnimationFrame'])).toBe(true);
  });

  it('renders and configures four canvases in color, code, grid, overlay order', () => {
    const classes = [...source.matchAll(/<canvas[^>]+className="([^"]+)"/g)]
      .map((match) => match[1]);
    expect(classes).toEqual([
      'h5-color-canvas',
      'h5-code-canvas',
      'h5-grid-canvas',
      'h5-overlay-canvas',
    ]);
    expect(source.match(/configureCanvas\(/g)).toHaveLength(4);
    expect(source).toContain('drawViewportBeadingOverlay');
    expect(source).toContain('style={{ zIndex: 4 }}');
    expect(source).not.toMatch(/Math\.round\([^)]*logical(?:Width|Height)[^)]*renderScale[^)]*\)/);
  });

  it('keeps overlay props in the latest snapshot and schedules their changes', () => {
    expect(source).toContain('overlay, gridVisible');
    expect(source).toMatch(/\[[^\]]*overlay[^\]]*gridVisible[^\]]*scheduleDraw[^\]]*\]/);
  });

  it('has no zoom-settlement timer because camera changes only redraw', () => {
    expect(source).not.toContain('CANVAS_RASTER_SETTLE_MS');
    expect(source).not.toContain('rasterScaleRef');
    expect(structure.hasCall(['setTimeout'])).toBe(false);
    expect(structure.hasCall(['clearTimeout'])).toBe(false);
  });
});

describe('H5CanvasLayers production draw path', () => {
  it.each([0.5, 2])('keeps four canvases in untransformed artboard geometry at %s× zoom', async (transformScale) => {
    const originalConsoleError = console.error;
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (args[0] === 'react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer') return;
      originalConsoleError(...args);
    });
    const rafCallbacks = new Map<number, FrameRequestCallback>();
    let nextRaf = 1;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      devicePixelRatio: 3,
      requestAnimationFrame(callback: FrameRequestCallback) {
        const id = nextRaf;
        nextRaf += 1;
        rafCallbacks.set(id, callback);
        return id;
      },
      cancelAnimationFrame(id: number) { rafCallbacks.delete(id); },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: () => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.stubGlobal('document', { fonts: { ready: new Promise<void>(() => undefined) } });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });

    const stack = {
      dataset: {} as Record<string, string>,
      clientWidth: 1024,
      clientHeight: 768,
      getBoundingClientRect: () => ({
        left: 40,
        top: 30,
        width: 1024 * transformScale,
        height: 768 * transformScale,
      }),
    };
    const artboard = {
      clientWidth: 1024,
      clientHeight: 768,
      getBoundingClientRect: () => ({
        left: 40,
        top: 30,
        width: 1024 * transformScale,
        height: 768 * transformScale,
      }),
    };
    const canvases = new Map<string, {
      width: number;
      height: number;
      style: { width: string; height: string };
    }>();
    const operations = new Map<string, string[]>();
    let renderer: ReactTestRenderer | undefined;

    await act(async () => {
      renderer = create(createElement(H5CanvasLayers, {
        artboardRef: { current: artboard as unknown as HTMLElement },
        cells: [
          { x: 0, y: 0, color: '#111111' },
          { x: 1, y: 0, color: '#222222' },
        ],
        rows: 1,
        cols: 2,
        codesVisible: false,
        gridVisible: false,
        getCode: (color: string) => color === '#111111' ? 'A1' : 'B2',
        getTextColor: () => '#ffffff',
        overlay: {
          currentColorCode: 'A1',
          highlightEnabled: true,
          markedCellIndexes: [],
          completedColorCodes: [],
        },
      }), {
        createNodeMock(element) {
          if (element.type === 'div') return stack;
          const className = String((element.props as { className?: unknown }).className);
          const canvas = { width: 0, height: 0, style: { width: '', height: '' } };
          const calls: string[] = [];
          const context = {
            fillStyle: '#000000',
            strokeStyle: '#000000',
            lineWidth: 1,
            font: '',
            textAlign: 'start',
            textBaseline: 'alphabetic',
            setTransform: () => calls.push('setTransform'),
            save: () => calls.push('save'),
            restore: () => calls.push('restore'),
            clearRect: () => calls.push('clearRect'),
            fillRect: () => calls.push('fillRect'),
            fillText: () => calls.push('fillText'),
            beginPath: () => calls.push('beginPath'),
            moveTo: () => calls.push('moveTo'),
            lineTo: () => calls.push('lineTo'),
            stroke: () => calls.push('stroke'),
            strokeRect: () => calls.push('strokeRect'),
          };
          Object.assign(canvas, { getContext: () => context });
          canvases.set(className, canvas);
          operations.set(className, calls);
          return canvas;
        },
      });
    });

    await act(async () => {
      const pending = [...rafCallbacks.values()];
      rafCallbacks.clear();
      pending.forEach((callback) => callback(0));
    });

    const expected = canvasRenderMetrics(1024, 768, 3, 1);
    expect(canvases.size).toBe(CANVAS_LAYER_COUNT);
    for (const canvas of canvases.values()) {
      expect({ width: canvas.width, height: canvas.height }).toEqual({
        width: expected.backingWidth,
        height: expected.backingHeight,
      });
      expect(canvas.style).toEqual({ width: '1024px', height: '768px' });
    }
    expect(CANVAS_LAYER_COUNT * expected.backingWidth * expected.backingHeight)
      .toBeLessThanOrEqual(MAX_CANVAS_BACKING_AREA);
    expect(operations.get('h5-grid-canvas')).toContain('clearRect');
    expect(operations.get('h5-grid-canvas')).not.toContain('stroke');
    expect(operations.get('h5-overlay-canvas')).toEqual(expect.arrayContaining([
      'save', 'clearRect', 'strokeRect', 'fillRect', 'restore',
    ]));
    expect(stack.dataset.rasterWidth).toBe(String(expected.backingWidth));
    expect(stack.dataset.rasterHeight).toBe(String(expected.backingHeight));

    await act(async () => { renderer?.unmount(); });
  });
});
