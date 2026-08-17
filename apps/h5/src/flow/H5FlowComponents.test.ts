import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { Children, createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  FlowTopbar,
  BeadListDrawer,
  HomeUploadHero,
  SegmentedControl,
  SplitCanvasLoading,
  SplitBeadList,
  ThresholdControl,
  getImportAction,
} from './H5FlowComponents';

function getVariableInitializer(source: string, name: string): string {
  const sourceFile = ts.createSourceFile('H5App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer = '';

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === name
      && node.initializer
    ) {
      initializer = node.initializer.getText(sourceFile);
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return initializer.replace(/\s+/g, ' ');
}

describe('H5 flow presentation components', () => {
  it('does not show a success toast after inventory check before beading', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/features/beading/BeadingFeatureContent.tsx'), 'utf8');

    expect(source).toContain('setInventory(checked);');
    expect(source).not.toContain("setStatus('库存检测完成，缺豆也可以继续拼豆。');");
    expect(source).not.toContain("setStatus('已撤销上一步。');");
  });

  it('allows local image loading to use the shared progress UI without a grid-size label', () => {
    const markup = renderToStaticMarkup(createElement(SplitCanvasLoading, {
      rows: 0,
      cols: 0,
      title: '正在读取图片',
      stage: '正在解析图片尺寸与像素',
      progress: 25,
    }));

    expect(markup).toContain('正在读取图片');
    expect(markup).not.toContain('正在生成 0 × 0 格画布');
  });

  it('renders a non-blocking pixel-grid loading state for the generated canvas', () => {
    const markup = renderToStaticMarkup(createElement(SplitCanvasLoading, {
      rows: 160,
      cols: 120,
      stage: '正在匹配拼豆色号...',
      progress: 68,
    }));

    expect(markup).toContain('class="split-canvas-loading"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('class="split-canvas-loading-grid"');
    expect(markup.match(/class="split-canvas-loading-pixel/g)?.length).toBe(25);
    expect(markup).toContain('正在匹配拼豆色号...');
    expect(markup).toContain('正在生成 120 × 160 格画布');
    expect(markup).toContain('68%');
    expect(markup).not.toContain('spinner');
  });

  it('presents visual canvases in viewport space below the transformed interaction surface', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    const app = fs.readFileSync(path.resolve('apps/h5/src/pages/editor/CanvasPage.tsx'), 'utf8');
    const layers = fs.readFileSync(path.resolve('apps/h5/src/canvas/H5CanvasLayers.tsx'), 'utf8');
    const editorLayers = fs.readFileSync(path.resolve('apps/h5/src/canvas/EditorCanvasLayers.tsx'), 'utf8');
    const artboardStyles = styles.match(/\.h5-artboard\s*\{([^}]*)\}/s)?.[1] ?? '';
    const canvasStyles = styles.match(/\.h5-canvas-layers canvas\s*\{([^}]*)\}/s)?.[1] ?? '';
    const stackStyles = styles.match(/\.h5-canvas-layers\s*\{([^}]*)\}/s)?.[1] ?? '';
    const transformStyles = styles.match(/\.react-transform-wrapper\s*\{([^}]*)\}/s)?.[1] ?? '';
    const rulerStyles = styles.match(/\.h5-canvas-rulers\s*\{([^}]*)\}/s)?.[1] ?? '';
    const viewportRulerStyles = styles.match(/\.h5-viewport-rulers\s*\{([^}]*)\}/s)?.[1] ?? '';
    const controlStyles = styles.match(/\.canvas-zoom-controls\s*\{([^}]*)\}/s)?.[1] ?? '';
    const editorStart = app.indexOf('<main className="h5-canvas-page cell-codes-visible"');
    const editorEnd = app.indexOf('<main className="warehouse-page"', editorStart);
    const editorSource = app.slice(editorStart, editorEnd);
    const stackIndex = editorSource.indexOf('<EditorCanvasLayers');
    const transformIndex = editorSource.indexOf('<TransformComponent');
    const zIndex = (rule: string) => Number(rule.match(/z-index:\s*(-?\d+(?:\.\d+)?)\s*;/)?.[1] ?? Number.NaN);
    const stackZ = zIndex(stackStyles);
    const transformZ = zIndex(transformStyles);
    const rulerZ = zIndex(rulerStyles);
    const controlZ = zIndex(controlStyles);
    const viewportRulerZ = zIndex(viewportRulerStyles);

    expect(styles).toContain('--canvas-cell-size: 14px;');
    expect(styles).toContain('--canvas-ruler-gutter: 22px;');
    expect(styles).toMatch(/\.h5-column-ruler,\s*\.h5-row-ruler\s*\{[^}]*font-size:\s*7px;/s);
    expect(stackIndex).toBeGreaterThan(-1);
    expect(transformIndex).toBeGreaterThan(-1);
    expect(stackIndex).toBeLessThan(transformIndex);
    expect([stackZ, transformZ, rulerZ, controlZ].every(Number.isFinite)).toBe(true);
    expect(viewportRulerZ).toBe(4);
    expect(viewportRulerStyles).toContain('pointer-events: none;');
    expect(stackZ).toBeLessThan(transformZ);
    expect(transformZ).toBeLessThan(rulerZ);
    expect(rulerZ).toBeLessThan(controlZ);
    expect(canvasStyles).toMatch(/pointer-events:\s*none\s*;/);
    expect(artboardStyles).not.toContain('background-image');
    expect(`${stackStyles}\n${canvasStyles}`).not.toContain('image-rendering: pixelated');
    expect(layers.match(/aria-hidden="true"/g)).toHaveLength(4);
    expect(layers).toContain('className="h5-overlay-canvas"');
    expect(editorLayers).toContain('getBoundingClientRect');
    expect(editorLayers).toContain('editorCanvasGeometry');
    expect(app).toContain('CanvasViewportRulers');
    expect(app).toContain('const canvasStageRef = useRef<HTMLDivElement | null>(null);');
    expect(app).toContain('viewportRulerSticky');
    expect(app).toContain('onStickyChange={setViewportRulerSticky}');
    expect(app).toContain('ref={canvasStageRef}');
    expect(editorSource).toContain('<CanvasViewportRulers');
  });

  it('keeps artwork semantics and input handlers on a div inside the transformed artboard', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/pages/editor/CanvasPage.tsx'), 'utf8');
    const layers = fs.readFileSync(path.resolve('apps/h5/src/canvas/H5CanvasLayers.tsx'), 'utf8');
    const artboardStart = source.indexOf('className="h5-artboard"');
    const artboardSubtree = source.slice(
      artboardStart,
      source.indexOf('</TransformComponent>', artboardStart),
    );
    const interactionTag = artboardSubtree.match(/<div[\s\S]*?className="h5-canvas-interaction canvas-artwork"[\s\S]*?>/)?.[0] ?? '';

    expect(source).toContain('<EditorCanvasLayers');
    expect(source).toContain('<main className="h5-canvas-page cell-codes-visible"');
    expect(layers).toContain('className="h5-color-canvas"');
    expect(layers).toContain('className="h5-code-canvas"');
    expect(layers).toContain('className="h5-grid-canvas"');
    expect(interactionTag).toContain('role="img"');
    expect(interactionTag).toContain('aria-label="拼豆编辑画布"');
    expect(interactionTag).toContain('onPointerDown={handleCanvasPointerDown}');
    expect(interactionTag).toContain('onPointerMove={handleCanvasPointerMove}');
    expect(interactionTag).toContain('onPointerUp={handleCanvasPaintPointerEnd}');
    expect(interactionTag).toContain('onPointerCancel={handleCanvasPaintPointerEnd}');
    expect(interactionTag).toContain('onLostPointerCapture={handleCanvasPaintPointerEnd}');
    expect(interactionTag).toContain('onClick={handleCanvasClick}');
    expect(layers).not.toContain('gridCanvasProps');
    expect(layers).not.toContain('role="img"');
    expect(layers).not.toContain('aria-label="拼豆编辑画布"');
    expect(source).not.toContain('className="h5-cell-code"');
    expect(source).not.toContain('h5-' + 'code-overlay');
  });

  it('renders imported cells through the layered Canvas path', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/pages/editor/CanvasPage.tsx'), 'utf8');

    expect(source).not.toContain("setCanvasKind('image')");
    expect(source).not.toContain("canvasKind === 'image'");
    expect(source).toContain('<EditorCanvasLayers');
    expect(source).toContain('codesVisible={canvasScale >= 1.5}');
    expect(source).not.toContain('h5-' + 'vector-canvas');
    expect(source).not.toContain('h5-' + 'vector-grid-lines');
    expect(source).not.toContain('h5-' + 'code-overlay');
    expect(source).not.toContain('className="h5-' + 'canvas-cell');
  });

  it('imports the already computed preview cells without resampling the image', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/app/H5Application.tsx'), 'utf8');
    const importBody = source.match(/const importSplitToCanvas = \(\{ cells, rows, cols \}:[\s\S]*?\n  \};/)?.[0] ?? '';

    expect(importBody).toContain('pendingEditorCanvasRef.current = { cells, rows, cols };');
    expect(importBody).not.toContain('cellsFromImage(');
    expect(importBody).not.toContain('cellsFromAlignedGrid(');
    expect(importBody).not.toContain('mergeSimilarCells(');
  });

  it('defers expensive split merge recomputation away from slider input updates', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/features/split/useSplitWorkflow.ts'), 'utf8');
    const sourceFile = ts.createSourceFile('useSplitWorkflow.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let usesDeferredHook = false;
    let mergeUsesDeferredThreshold = false;

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'useDeferredValue'
        && node.arguments[0]?.getText(sourceFile) === 'splitMergeThreshold'
      ) {
        usesDeferredHook = true;
      }

      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'mergeSimilarCells'
        && node.arguments[1]?.getText(sourceFile) === 'deferredSplitMergeThreshold'
      ) {
        mergeUsesDeferredThreshold = true;
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    expect(usesDeferredHook).toBe(true);
    expect(mergeUsesDeferredThreshold).toBe(true);
  });

  it('builds a disabled primary import action for an empty canvas', () => {
    const onClick = vi.fn();

    expect(getImportAction(0, onClick)).toEqual({
      label: '导入画布',
      onClick,
      disabled: true,
      primary: true,
    });
  });

  it('removes the click handler from a disabled topbar action', () => {
    const onClick = vi.fn();
    const tree = FlowTopbar({
      title: '分割设置',
      backLabel: '返回首页',
      onBack: vi.fn(),
      action: { label: '导入画布', onClick, disabled: true, primary: true },
    });
    const action = Children.toArray(tree.props.children)[2] as ReactElement<{
      disabled?: boolean;
      onClick?: () => void;
    }>;

    expect(action.props.disabled).toBe(true);
    expect(action.props.onClick).toBeUndefined();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('marks only the selected segment as selected and keyboard reachable', () => {
    const markup = renderToStaticMarkup(createElement(SegmentedControl, {
      ariaLabel: '分割方式',
      value: 'quick',
      onChange: vi.fn(),
      options: [
        { value: 'quick', label: '快速分割' },
        { value: 'align', label: '对格子' },
      ],
    }));

    expect(markup).toContain('aria-selected="true"');
    expect(markup).toMatch(/class="is-active"[^>]*role="tab"[^>]*aria-selected="true"/);
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-selected="false"');
    expect(markup).toContain('tabindex="-1"');
  });

  it('links split-mode tabs to their matching controlled panels', () => {
    const markup = renderToStaticMarkup(createElement(SegmentedControl, {
      ariaLabel: '分割模式',
      idPrefix: 'split-mode',
      value: 'quick',
      onChange: vi.fn(),
      options: [
        { value: 'quick', label: '快速分割' },
        { value: 'align', label: '对格子' },
      ],
    }));

    expect(markup).toMatch(/id="split-mode-quick-tab"[^>]*aria-controls="split-mode-quick-panel"/);
    expect(markup).toMatch(/id="split-mode-align-tab"[^>]*aria-controls="split-mode-align-panel"/);
  });

  it('loops segmented-control focus and selection with arrow keys', () => {
    const onChange = vi.fn();
    const tree = SegmentedControl<'quick' | 'align'>({
      ariaLabel: '分割方式',
      value: 'quick',
      onChange,
      options: [
        { value: 'quick', label: '快速分割' },
        { value: 'align', label: '对格子' },
      ],
    });
    const focusTargets = [{ focus: vi.fn() }, { focus: vi.fn() }];
    type FakeKeyEvent = {
      key: string;
      preventDefault: ReturnType<typeof vi.fn>;
      currentTarget: { parentElement: { querySelectorAll: () => typeof focusTargets } };
    };
    const tabs = Children.toArray(tree.props.children) as ReactElement<{
      onKeyDown: (event: FakeKeyEvent) => void;
    }>[];
    const keyEvent = (key: string): FakeKeyEvent => ({
      key,
      preventDefault: vi.fn(),
      currentTarget: { parentElement: { querySelectorAll: () => focusTargets } },
    });

    const leftEvent = keyEvent('ArrowLeft');
    tabs[0].props.onKeyDown(leftEvent);
    expect(leftEvent.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenNthCalledWith(1, 'align');
    expect(focusTargets[1].focus).toHaveBeenCalledOnce();

    const rightEvent = keyEvent('ArrowRight');
    tabs[1].props.onKeyDown(rightEvent);
    expect(rightEvent.preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenNthCalledWith(2, 'quick');
    expect(focusTargets[0].focus).toHaveBeenCalledOnce();
  });

  it('renders the compact Figma threshold slider controls', () => {
    const markup = renderToStaticMarkup(createElement(ThresholdControl, {
      value: 0,
      min: 0,
      max: 20,
      onChange: vi.fn(),
    }));

    expect(markup).toContain('class="split-threshold-head"');
    expect(markup).toContain('class="split-threshold-row"');
    expect(markup).toContain('class="split-threshold-help"');
    expect(markup).toContain('减少');
    expect(markup).toContain('增加');
    expect(markup).toContain('≤ 0');
  });

  it('associates each threshold output with a unique range input', () => {
    const markup = renderToStaticMarkup(createElement('div', null,
      createElement(ThresholdControl, { value: 0, min: 0, max: 20, onChange: vi.fn() }),
      createElement(ThresholdControl, { value: 5, min: 0, max: 20, onChange: vi.fn() }),
    ));
    const rangeTags = markup.match(/<input\b[^>]*type="range"[^>]*>/g) ?? [];
    const rangeIds = rangeTags.map((tag) => tag.match(/\sid="([^"]+)"/)?.[1] ?? '');
    const outputFors = [...markup.matchAll(/<output\b[^>]*for="([^"]+)"/g)].map((match) => match[1]);

    expect(rangeIds).toHaveLength(2);
    expect(rangeIds.every(Boolean)).toBe(true);
    expect(rangeIds[0]).not.toBe(rangeIds[1]);
    expect(outputFors).toEqual(rangeIds);
  });

  it('renders both empty bead-list totals', () => {
    const markup = renderToStaticMarkup(createElement(SplitBeadList, {
      colors: [],
      totalBeads: 0,
    }));

    expect(markup).toContain('颜色种类');
    expect(markup).toContain('总豆子数');
    expect(markup).toContain('class="split-bead-list-summary"');
    expect(markup).toContain('class="split-bead-list"');
  });

  it('renders the reusable bead-list drawer shell', () => {
    const markup = renderToStaticMarkup(createElement(BeadListDrawer, {
      colors: [{ color: '#146cff', code: 'A1', count: 4 }],
      totalBeads: 4,
      onClose: vi.fn(),
    }));

    expect(markup).toContain('aria-label="豆子清单"');
    expect(markup).toContain('豆子清单');
    expect(markup).toContain('A1');
  });

  it('renders the shared icon-library components for upload and back actions', () => {
    const uploadMarkup = renderToStaticMarkup(createElement(HomeUploadHero, { onUpload: vi.fn() }));
    const topbarMarkup = renderToStaticMarkup(createElement(FlowTopbar, {
      title: '分割设置',
      backLabel: '返回首页',
      onBack: vi.fn(),
    }));

    expect(uploadMarkup).toMatch(/class="[^"]*lucide-image/);
    expect(uploadMarkup).toMatch(/class="[^"]*lucide-arrow-right/);
    expect(topbarMarkup).toMatch(/class="[^"]*lucide-arrow-left/);
  });

  it('preserves structured API error details without changing the auth fallback', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/app/H5Application.tsx'), 'utf8');
    const requestApi = getVariableInitializer(source, 'requestApi');

    expect(requestApi).toContain("response.status === 401 ? '登录状态已失效，请重新登录' : payload.message || '请求失败'");
    expect(requestApi).toContain('Object.assign(new Error(message), { status: response.status, code: payload.error || payload.code, body: payload })');
    expect(requestApi).toContain('token?: string');
    expect(requestApi).toContain('...(effectiveToken ? { authorization: `Bearer ${effectiveToken}` } : {})');
  });

  it('owns versioned beading lifecycle commands in the beading feature, not H5App', () => {
    const app = fs.readFileSync(path.resolve('apps/h5/src/app/H5Application.tsx'), 'utf8');
    const source = fs.readFileSync(path.resolve('apps/h5/src/features/beading/BeadingFeatureContent.tsx'), 'utf8');
    expect(app).toContain('<BeadingFeatureContent requestApi={requestApi}');
    expect(app).not.toContain('const patchBeadingProgress');
    expect(source).toContain("mutate('', { completedColorCodes, elapsedSeconds, version }");
    expect(source).toContain("mutate('/prepare-completion', { version }");
    expect(source).toContain("mutate('/resume', { version }");
    expect(source).toContain('idempotencyKey: `${session.id}:${deduct');
  });

  it('serializes pause through a progress PATCH followed by the patched version', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/features/beading/BeadingFeatureContent.tsx'), 'utf8');
    expect(source).toContain('const patched = await patch({ completedColorCodes, elapsedSeconds, version });');
    expect(source).toContain("mutate('/pause', { version: patched.version }");
  });

  it('keeps transition endpoints in the feature and exits through the project route', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/features/beading/BeadingFeatureContent.tsx'), 'utf8');
    expect(source).toContain("mutate('/return-to-progress', { version }");
    expect(source).toContain("mutate('/abandon', { version }");
    expect(source).toContain('onExit={() => navigate(`/projects/${encodeURIComponent(route.projectId)}/edit`)}');
  });

  it('keeps conflict recovery and the inventory sheet in the beading feature overlay', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/features/beading/BeadingFeatureContent.tsx'), 'utf8');
    expect(source).toContain('const session = error.body.session;');
    expect(source).toContain('session.id === expectedId');
    expect(source).toContain('/inventory-check');
    expect(source).toContain("setOverlaySlot('inventory'");
  });

  it('wires the beading page inside the feature with session and authenticated draft props', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/features/beading/BeadingFeatureContent.tsx'), 'utf8');
    expect(source).toContain('<BeadingSessionPage session={session}');
    expect(source).toContain('onPatch={patch}');
    expect(source).toContain('onPause={pause}');
    expect(source).toContain('draftOwnerId={authUserId || undefined}');
    expect(source).toContain('legacyDraftOwnerId={legacyDraftOwnerId || undefined}');
  });

  it('keys beading drafts from the authenticated Redux session', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/features/beading/BeadingFeatureContent.tsx'), 'utf8');
    expect(source).toContain('selectAuthUserId');
    expect(source).toContain("state.auth.user?.legacyDraftOwnerId ?? ''");
  });

  it('isolates Playwright frontends and their API proxy unless reuse is explicitly requested', () => {
    const source = fs.readFileSync(path.resolve('playwright.config.ts'), 'utf8');
    expect(source).toContain("validPort('WEB_E2E_PORT', process.env.WEB_E2E_PORT, 5183)");
    expect(source).toContain("validPort('H5_E2E_PORT', process.env.H5_E2E_PORT, 5184)");
    expect(source).toContain("reuseExistingServer: process.env.PLAYWRIGHT_REUSE_FRONTENDS === '1'");
    expect(source).not.toContain('reuseExistingServer: !process.env.CI');
  });
});
