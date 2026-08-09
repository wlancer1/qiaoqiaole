import { createElement, useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { BeadingSession } from '../../beading/beadingSessionClient';

const canvasSpy = vi.hoisted(() => ({ props: undefined as Record<string, any> | undefined }));
const viewportSpy = vi.hoisted(() => ({ fit: vi.fn() }));

vi.mock('react-zoom-pan-pinch', () => ({
  TransformWrapper: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TransformComponent: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('../../canvas/H5CanvasLayers', () => ({
  H5CanvasLayers: (props: Record<string, unknown>) => {
    canvasSpy.props = props;
    return <div data-canvas-layers="true" />;
  },
}));

vi.mock('./BeadingCanvasViewport', async () => {
  const React = await import('react');
  return {
    BeadingCanvasViewport: React.forwardRef(function MockViewport(props: {
      children?: ReactNode | ((dimensions: { width: number; height: number }) => ReactNode);
      rows: number;
      cols: number;
      locked: boolean;
      focusMode: boolean;
      interactionMode: string;
      artboardRef?: React.Ref<HTMLDivElement>;
      artboardProps?: Record<string, unknown>;
      onFitReady?: (fit: () => void) => void;
    }, _ref) {
      React.useEffect(() => props.onFitReady?.(viewportSpy.fit), [props.onFitReady]);
      const content = typeof props.children === 'function'
        ? props.children({ width: props.cols * 18, height: props.rows * 18 })
        : props.children;
      return <section
        className={`beading-canvas-stage${props.focusMode ? ' is-focus-mode' : ''}`}
        data-locked={String(props.locked)}
        data-mode={props.interactionMode}
      >
        <div {...props.artboardProps} ref={props.artboardRef} className="beading-canvas-artboard">{content}</div>
      </section>;
    }),
  };
});

import { BeadingSessionPage, type BeadingSessionPageProps } from './BeadingSessionPage';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function session(overrides: Partial<BeadingSession> = {}): BeadingSession {
  return {
    id: 's1',
    projectId: 'p1',
    projectName: '小熊',
    requirements: [
      { colorCode: 'A1', required: 2 },
      { colorCode: 'B2', required: 1 },
    ],
    warehouseId: null,
    warehouseName: null,
    status: 'in_progress',
    completedColorCodes: [],
    progress: { completed: 0, total: 2, percent: 0 },
    elapsedSeconds: 10,
    timerStartedAt: null,
    inventoryDeducted: false,
    version: 4,
    ...overrides,
  };
}

const cells = [
  { x: 0, y: 0, color: '#111111', transparent: false },
  { x: 1, y: 0, color: '#222222', transparent: false },
  { x: 0, y: 1, color: '#111111', transparent: false },
  { x: 1, y: 1, color: '#00000000', transparent: true },
] as any;

const getCode = (color: string) => color === '#111111' ? 'A1' : color === '#222222' ? 'B2' : '透明';

function callbacks(overrides: Partial<BeadingSessionPageProps> = {}): BeadingSessionPageProps {
  return {
    session: session(),
    cells,
    rows: 2,
    cols: 2,
    getCode,
    onPatch: vi.fn(async ({ completedColorCodes, elapsedSeconds, version }) => session({
      completedColorCodes,
      elapsedSeconds,
      version: version + 1,
      progress: { completed: completedColorCodes.length, total: 2, percent: completedColorCodes.length * 50 },
    })),
    onPause: vi.fn(async ({ completedColorCodes, elapsedSeconds, version }) => session({
      completedColorCodes, elapsedSeconds, status: 'paused', version: version + 2,
    })),
    onReturnToProgress: vi.fn(async ({ version }) => session({ status: 'in_progress', version: version + 1 })),
    onAbandon: vi.fn(async ({ version }) => session({ status: 'abandoned', version: version + 1 })),
    onPrepareCompletion: vi.fn(async ({ version }) => session({
      completedColorCodes: ['A1', 'B2'], status: 'pending_completion', version: version + 1,
    })),
    onComplete: vi.fn(async ({ deduct }) => session({
      completedColorCodes: ['A1', 'B2'],
      status: deduct ? 'completed_deducted' : 'completed_without_deduction',
      inventoryDeducted: deduct,
      version: 7,
    })),
    onResume: vi.fn(async ({ version }) => session({ status: 'in_progress', version: version + 1 })),
    onOpenInventory: vi.fn(async () => undefined),
    onExit: vi.fn(),
    onSessionConflict: vi.fn(),
    onStatus: vi.fn(),
    ...overrides,
  };
}

const artboardNode = {
  getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 200, height: 200 })),
  setPointerCapture: vi.fn(),
  releasePointerCapture: vi.fn(),
};

async function renderPage(props = callbacks()) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<BeadingSessionPage {...props} />, {
      createNodeMock: (element) => (element.props as Record<string, unknown>).className === 'beading-canvas-artboard'
        ? artboardNode
        : { focus: vi.fn(), parentElement: null },
    });
  });
  return { renderer, props };
}

function button(renderer: ReactTestRenderer, label: string) {
  return renderer.root.findByProps({ 'aria-label': label });
}

function textButton(renderer: ReactTestRenderer, text: string) {
  const target = renderer.root.findAllByType('button').find((node) => node.children.join('') === text);
  if (!target) throw new Error(`button text not found: ${text}`);
  return target;
}

async function click(renderer: ReactTestRenderer, label: string) {
  await act(async () => { await button(renderer, label).props.onClick(); });
}

async function clickText(renderer: ReactTestRenderer, text: string) {
  await act(async () => { await textButton(renderer, text).props.onClick(); });
}

function pointerTap(renderer: ReactTestRenderer, x: number, y: number, pointerId = 1) {
  const artboard = renderer.root.findByProps({ className: 'beading-canvas-artboard' });
  const event = { pointerId, clientX: x, clientY: y, currentTarget: artboardNode };
  act(() => artboard.props.onPointerDown(event));
  act(() => artboard.props.onPointerUp(event));
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function installWindow(storage = new MemoryStorage()) {
  vi.stubGlobal('window', {
    localStorage: storage,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    confirm: vi.fn(() => true),
  });
  return storage;
}

function relativeLuminance(hex: string): number {
  const normalized = hex.length === 4
    ? `#${hex.slice(1).split('').map((channel) => channel.repeat(2)).join('')}`
    : hex;
  const channels = [1, 3, 5].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function cssSource(file: 'session' | 'global' = 'session'): string {
  const relativePath = file === 'session'
    ? 'apps/h5/src/pages/beading/beadingSession.css'
    : 'apps/h5/src/styles.css';
  return fs.readFileSync(path.resolve(relativePath), 'utf8');
}

function cssBlock(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`, 's'));
  if (!match) throw new Error(`CSS selector not found: ${selector}`);
  return match[1];
}

function expectDeclaration(block: string, property: string, value: RegExp | string) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const valuePattern = typeof value === 'string'
    ? value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    : value.source;
  expect(block).toMatch(new RegExp(`(?:^|;)\\s*${escapedProperty}\\s*:\\s*${valuePattern}\\s*(?:;|$)`, 's'));
}

function declarationValue(block: string, property: string): string {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`(?:^|;)\\s*${escapedProperty}\\s*:\\s*([^;]+)`));
  if (!match) throw new Error(`CSS declaration not found: ${property}`);
  return match[1].trim();
}

function cssAtRuleBlock(source: string, header: string): string {
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`CSS at-rule not found: ${header}`);
  const open = source.indexOf('{', start + header.length);
  let depth = 1;
  for (let index = open + 1; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unclosed CSS at-rule: ${header}`);
}

beforeEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  canvasSpy.props = undefined;
  viewportSpy.fit.mockReset();
  artboardNode.getBoundingClientRect.mockClear();
  artboardNode.setPointerCapture.mockClear();
  artboardNode.releasePointerCapture.mockClear();
  installWindow();
});

describe('BeadingSessionPage integration', () => {
  it('selects colors, restores highlight, and passes all Canvas overlay/display props', async () => {
    const { renderer } = await renderPage();
    expect(canvasSpy.props?.overlay).toEqual({
      currentColorCode: 'A1',
      highlightEnabled: true,
      markedCellIndexes: [],
      completedColorCodes: [],
    });

    await click(renderer, '高亮');
    expect(canvasSpy.props?.overlay.highlightEnabled).toBe(false);
    await click(renderer, '选择色号 B2');
    expect(canvasSpy.props?.overlay).toMatchObject({ currentColorCode: 'B2', highlightEnabled: true });
    expect(canvasSpy.props).toMatchObject({ codesVisible: true, gridVisible: true });
  });

  it('marks only the current opaque color, revises marks, and blocks pointer writes while locked', async () => {
    const { renderer } = await renderPage();
    await click(renderer, '标记');
    pointerTap(renderer, 25, 25);
    expect(canvasSpy.props?.overlay.markedCellIndexes).toEqual([0]);
    pointerTap(renderer, 125, 25);
    pointerTap(renderer, 125, 125);
    expect(canvasSpy.props?.overlay.markedCellIndexes).toEqual([0]);

    await click(renderer, '修订当前色');
    pointerTap(renderer, 25, 25);
    expect(canvasSpy.props?.overlay.markedCellIndexes).toEqual([]);
    await click(renderer, '锁定画布');
    expect(renderer.root.findByProps({ className: 'beading-canvas-stage' }).props['data-locked']).toBe('true');
    pointerTap(renderer, 25, 25);
    expect(canvasSpy.props?.overlay.markedCellIndexes).toEqual([]);
  });

  it('integrates search, sorting, more settings, fit, focus exit, and inventory', async () => {
    const props = callbacks();
    const { renderer } = await renderPage(props);
    await click(renderer, '搜色');
    act(() => renderer.root.findByType('input').props.onChange({ target: { value: 'b2' } }));
    expect(renderer.root.findAllByProps({ className: 'beading-search-result' })).toHaveLength(1);
    await act(async () => renderer.root.findByProps({ className: 'beading-search-result' }).props.onClick());
    expect(canvasSpy.props?.overlay.currentColorCode).toBe('B2');

    await click(renderer, '切换排序，当前作品顺序');
    expect(button(renderer, '切换排序，当前剩余数量')).toBeTruthy();
    await click(renderer, '更多工具');
    await click(renderer, '显示色号');
    await click(renderer, '显示网格');
    expect(canvasSpy.props).toMatchObject({ codesVisible: false, gridVisible: false });
    await click(renderer, '关闭更多工具');
    await click(renderer, '适应画布');
    expect(viewportSpy.fit).toHaveBeenCalledTimes(1);

    await click(renderer, '进入专注模式');
    expect(renderer.root.findByType('main').props.className).toContain('is-focus');
    expect(button(renderer, '退出专注模式')).toBeTruthy();
    await click(renderer, '退出专注模式');
    expect(renderer.root.findByType('main').props.className).not.toContain('is-focus');
    await click(renderer, '查看库存');
    expect(props.onOpenInventory).toHaveBeenCalledTimes(1);
  });

  it('restores draft tool state and keeps it after ordinary save exit', async () => {
    vi.useFakeTimers();
    const storage = installWindow();
    storage.setItem('qiaoqiaole.beading-draft:alice:s1', JSON.stringify({
      markedCellIndexes: [0], highlightEnabled: false, locked: true,
      codesVisible: false, gridVisible: false, sortMode: 'code', updatedAt: new Date().toISOString(),
    }));
    const props = callbacks({ draftOwnerId: 'alice' });
    const { renderer } = await renderPage(props);
    expect(canvasSpy.props).toMatchObject({ codesVisible: false, gridVisible: false });
    expect(canvasSpy.props?.overlay).toMatchObject({ highlightEnabled: false, markedCellIndexes: [0] });

    await click(renderer, '返回');
    await clickText(renderer, '保存并退出');
    expect(props.onPatch).toHaveBeenCalledWith({ completedColorCodes: [], elapsedSeconds: 10, version: 4 });
    expect(props.onExit).toHaveBeenCalledWith({ mode: 'saved' });
    expect(storage.getItem('qiaoqiaole.beading-draft:alice:s1')).not.toBeNull();
  });

  it('clears draft on abandon and successful completion, but retains it when completion fails', async () => {
    const storage = installWindow();
    const key = 'qiaoqiaole.beading-draft:alice:s1';
    storage.setItem(key, JSON.stringify({ updatedAt: new Date().toISOString() }));
    const abandonProps = callbacks({ draftOwnerId: 'alice' });
    const abandon = await renderPage(abandonProps);
    await click(abandon.renderer, '返回');
    await clickText(abandon.renderer, '放弃会话');
    expect(storage.getItem(key)).toBeNull();
    expect(abandonProps.onExit).toHaveBeenCalledWith({ mode: 'abandon' });
    act(() => abandon.renderer.unmount());

    storage.setItem(key, JSON.stringify({ updatedAt: new Date().toISOString() }));
    const completeProps = callbacks({
      draftOwnerId: 'alice',
      session: session({ status: 'pending_completion', completedColorCodes: ['A1', 'B2'] }),
    });
    const completed = await renderPage(completeProps);
    await clickText(completed.renderer, '完成并扣减库存');
    expect(storage.getItem(key)).toBeNull();

    storage.setItem(key, JSON.stringify({ updatedAt: new Date().toISOString() }));
    const failedProps = callbacks({
      draftOwnerId: 'alice',
      session: session({ status: 'pending_completion', completedColorCodes: ['A1', 'B2'] }),
      onComplete: vi.fn(async () => { throw new Error('完成失败'); }),
    });
    const failed = await renderPage(failedProps);
    await clickText(failed.renderer, '完成但不扣减库存');
    expect(storage.getItem(key)).not.toBeNull();
    expect(failedProps.onStatus).toHaveBeenCalledWith('完成失败');
  });

  it('clears the draft before asking the parent to exit after completion', async () => {
    const storage = installWindow();
    const key = 'qiaoqiaole.beading-draft:alice:s1';
    storage.setItem(key, JSON.stringify({ updatedAt: new Date().toISOString() }));
    const completedSession = session({
      status: 'completed_deducted', completedColorCodes: ['A1', 'B2'], inventoryDeducted: true, version: 8,
    });

    const events: string[] = [];
    const removeItem = storage.removeItem.bind(storage);
    vi.spyOn(storage, 'removeItem').mockImplementation((keyToRemove) => {
      events.push('clear');
      removeItem(keyToRemove);
    });

    function Parent() {
      const [visible, setVisible] = useState(true);
      const [activeSession, setActiveSession] = useState(session({
        status: 'pending_completion', completedColorCodes: ['A1', 'B2'],
      }));
      if (!visible) return <p>canvas screen</p>;
      return <BeadingSessionPage {...callbacks({
        draftOwnerId: 'alice',
        session: activeSession,
        onComplete: async () => {
          events.push('complete');
          setActiveSession(completedSession);
          return completedSession;
        },
        onExit: ({ mode }) => {
          events.push(`exit:${mode}`);
          setVisible(false);
        },
      })} />;
    }

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<Parent />, {
        createNodeMock: (element) => (element.props as Record<string, unknown>).className === 'beading-canvas-artboard'
          ? artboardNode
          : { focus: vi.fn(), parentElement: null },
      });
    });
    await clickText(renderer, '完成并扣减库存');
    expect(renderer.root.findByType('p').children.join('')).toBe('canvas screen');
    expect(storage.getItem(key)).toBeNull();
    expect(events).toEqual(['complete', 'clear', 'exit:completed']);
  });

  it('freezes timing while pause is pending, excludes failed network wait, and only resumes after success', async () => {
    vi.useFakeTimers();
    installWindow();
    let resolvePause!: (value: BeadingSession) => void;
    const pauseRequest = new Promise<BeadingSession>((resolve) => { resolvePause = resolve; });
    const onPause = vi.fn(() => pauseRequest);
    const props = callbacks({ onPause });
    const { renderer } = await renderPage(props);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(button(renderer, '暂停计时').findByType('span').children.join('')).toBe('00:12');
    act(() => { button(renderer, '暂停计时').props.onClick(); });
    expect(onPause).toHaveBeenCalledWith({ completedColorCodes: [], elapsedSeconds: 12, version: 4 });
    expect(button(renderer, '暂停计时').props.disabled).toBe(true);
    await act(async () => renderer.update(<BeadingSessionPage {...props} status="父层刷新" />));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(button(renderer, '暂停计时').findByType('span').children.join('')).toBe('00:12');
    await act(async () => { resolvePause(session({ status: 'paused', elapsedSeconds: 12, version: 6 })); });
    expect(button(renderer, '继续计时').findByType('span').children.join('')).toBe('00:12');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(button(renderer, '继续计时').findByType('span').children.join('')).toBe('00:12');
    await click(renderer, '继续计时');
    expect(props.onResume).toHaveBeenCalledWith({ version: 4 });
    expect(button(renderer, '暂停计时')).toBeTruthy();

    const failedProps = callbacks({ onPause: vi.fn(async () => { throw new Error('暂停失败'); }) });
    const failed = await renderPage(failedProps);
    await click(failed.renderer, '暂停计时');
    expect(button(failed.renderer, '暂停计时')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(button(failed.renderer, '暂停计时').findByType('span').children.join('')).toBe('00:11');
    expect(failedProps.onStatus).toHaveBeenCalledWith('暂停失败');
  });

  it('keeps completion open on return failure and closes it only after a successful transition', async () => {
    let resolveReturn!: (value: BeadingSession) => void;
    const pendingReturn = new Promise<BeadingSession>((resolve) => { resolveReturn = resolve; });
    const onReturnToProgress = vi.fn()
      .mockRejectedValueOnce(new Error('返回失败'))
      .mockImplementationOnce(() => pendingReturn);
    const props = callbacks({
      session: session({ status: 'pending_completion', completedColorCodes: ['A1', 'B2'] }),
      onReturnToProgress,
    });
    const { renderer } = await renderPage(props);
    await clickText(renderer, '返回检查');
    expect(renderer.root.findByProps({ 'aria-label': '完成拼豆' })).toBeTruthy();
    expect(props.onStatus).toHaveBeenCalledWith('返回失败');

    act(() => { textButton(renderer, '返回检查').props.onClick(); });
    expect(textButton(renderer, '返回检查').props.disabled).toBe(true);
    act(() => { textButton(renderer, '返回检查').props.onClick(); });
    expect(onReturnToProgress).toHaveBeenCalledTimes(2);
    await act(async () => resolveReturn(session({ status: 'paused', version: 5 })));
    expect(renderer.root.findAllByProps({ 'aria-label': '完成拼豆' })).toHaveLength(0);
    expect(button(renderer, '继续计时')).toBeTruthy();
    await click(renderer, '继续计时');
    expect(props.onResume).toHaveBeenCalledWith({ version: 4 });
    expect(button(renderer, '暂停计时')).toBeTruthy();
  });

  it('retains the exit dialog and draft when remote abandon fails', async () => {
    const storage = installWindow();
    const key = 'qiaoqiaole.beading-draft:alice:s1';
    storage.setItem(key, JSON.stringify({ updatedAt: new Date().toISOString() }));
    const props = callbacks({
      draftOwnerId: 'alice',
      onAbandon: vi.fn(async () => { throw new Error('放弃失败'); }),
    });
    const { renderer } = await renderPage(props);
    await click(renderer, '返回');
    await clickText(renderer, '放弃会话');
    expect(renderer.root.findByProps({ 'aria-label': '退出拼豆' })).toBeTruthy();
    expect(storage.getItem(key)).not.toBeNull();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('keeps the Canvas overlay object stable across elapsed timer ticks', async () => {
    vi.useFakeTimers();
    installWindow();
    const { renderer } = await renderPage();
    const before = canvasSpy.props?.overlay;
    act(() => { vi.advanceTimersByTime(3000); });
    expect(button(renderer, '暂停计时').findByType('span').children.join('')).toBe('00:13');
    expect(canvasSpy.props?.overlay).toBe(before);
  });

  it('keeps pending controls disabled, retries terminal prepare, and opens the completion dialog only after success', async () => {
    let resolvePatch!: (value: BeadingSession) => void;
    const pendingPatch = new Promise<BeadingSession>((resolve) => { resolvePatch = resolve; });
    const props = callbacks({
      session: session({ completedColorCodes: ['A1'], progress: { completed: 1, total: 2, percent: 50 } }),
      onPatch: vi.fn(() => pendingPatch),
    });
    const { renderer } = await renderPage(props);
    let completePromise!: Promise<unknown>;
    act(() => { completePromise = button(renderer, '完成当前色').props.onClick(); });
    expect(button(renderer, '保存').props.disabled).toBe(true);
    expect(button(renderer, '完成当前色').props.disabled).toBe(true);
    await act(async () => resolvePatch(session({ completedColorCodes: ['A1', 'B2'], version: 5 })));
    await act(async () => { await completePromise; });

    const retryProps = callbacks({
      session: session({ completedColorCodes: ['A1', 'B2'], progress: { completed: 2, total: 2, percent: 100 } }),
      onPrepareCompletion: vi.fn()
        .mockRejectedValueOnce(new Error('准备失败'))
        .mockResolvedValueOnce(session({ status: 'pending_completion', completedColorCodes: ['A1', 'B2'], version: 5 })),
    });
    const retry = await renderPage(retryProps);
    await click(retry.renderer, '确认完成拼豆');
    expect(retry.renderer.root.findAllByProps({ 'aria-label': '完成拼豆' })).toHaveLength(0);
    await click(retry.renderer, '确认完成拼豆');
    expect(retry.renderer.root.findByProps({ 'aria-label': '完成拼豆' })).toBeTruthy();
  });

  it('disables both final completion choices while complete is pending', async () => {
    let resolveComplete!: (value: BeadingSession) => void;
    const pendingComplete = new Promise<BeadingSession>((resolve) => { resolveComplete = resolve; });
    const props = callbacks({
      session: session({ status: 'pending_completion', completedColorCodes: ['A1', 'B2'] }),
      onComplete: vi.fn(() => pendingComplete),
    });
    const { renderer } = await renderPage(props);
    act(() => { textButton(renderer, '完成并扣减库存').props.onClick(); });
    expect(textButton(renderer, '完成并扣减库存').props.disabled).toBe(true);
    expect(textButton(renderer, '完成但不扣减库存').props.disabled).toBe(true);
    await act(async () => { resolveComplete(session({ status: 'completed_deducted' })); });
  });

  it('does not exit when save-and-exit fails', async () => {
    const props = callbacks({ onPatch: vi.fn(async () => { throw new Error('保存失败'); }) });
    const { renderer } = await renderPage(props);
    await click(renderer, '返回');
    await clickText(renderer, '保存并退出');
    expect(props.onExit).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ 'aria-label': '退出拼豆' })).toBeTruthy();
    expect(props.onStatus).toHaveBeenCalledWith('保存失败');
  });

  it('syncs authoritative elapsed and pause state only when the same-session version changes', async () => {
    vi.useFakeTimers();
    installWindow();
    const initial = callbacks();
    const { renderer } = await renderPage(initial);
    act(() => { vi.advanceTimersByTime(2000); });
    await act(async () => renderer.update(<BeadingSessionPage {...callbacks({
      session: session({ version: 4, elapsedSeconds: 99, status: 'paused' }),
    })} />));
    expect(button(renderer, '暂停计时').findByType('span').children.join('')).toBe('00:12');

    const pausedProps = callbacks({
      session: session({ version: 5, elapsedSeconds: 50, status: 'paused' }),
    });
    await act(async () => renderer.update(<BeadingSessionPage {...pausedProps} />));
    expect(button(renderer, '继续计时').findByType('span').children.join('')).toBe('00:50');
    await click(renderer, '保存');
    expect(pausedProps.onPatch).toHaveBeenCalledWith({ completedColorCodes: [], elapsedSeconds: 50, version: 5 });

    await act(async () => renderer.update(<BeadingSessionPage {...callbacks({
      session: session({ version: 6, elapsedSeconds: 55, status: 'in_progress' }),
    })} />));
    expect(button(renderer, '暂停计时').findByType('span').children.join('')).toBe('00:55');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(button(renderer, '暂停计时').findByType('span').children.join('')).toBe('00:56');
  });

  it('advances a newly completed current color on an authoritative version change only', async () => {
    const { renderer } = await renderPage();
    await act(async () => renderer.update(<BeadingSessionPage {...callbacks({
      session: session({ version: 5, completedColorCodes: ['A1'] }),
    })} />));
    expect(canvasSpy.props?.overlay.currentColorCode).toBe('B2');

    const completedA1 = renderer.root.findAllByType('button').find((node) => (
      String(node.props['aria-label']).startsWith('选择色号 A1')
    ));
    if (!completedA1) throw new Error('completed A1 color chip not found');
    await act(async () => completedA1.props.onClick());
    expect(canvasSpy.props?.overlay.currentColorCode).toBe('A1');
    await act(async () => renderer.update(<BeadingSessionPage {...callbacks({
      session: session({ version: 5, completedColorCodes: ['A1'] }),
    })} />));
    expect(canvasSpy.props?.overlay.currentColorCode).toBe('A1');
    await act(async () => renderer.update(<BeadingSessionPage {...callbacks({
      session: session({ version: 6, completedColorCodes: ['A1'], status: 'paused' }),
    })} />));
    expect(canvasSpy.props?.overlay.currentColorCode).toBe('A1');
  });

  it('resets every local tool and selects the new next color when session id changes without an owner', async () => {
    const { renderer } = await renderPage();
    await click(renderer, '高亮');
    await click(renderer, '标记');
    pointerTap(renderer, 25, 25);
    await click(renderer, '锁定画布');
    await click(renderer, '更多工具');
    await click(renderer, '显示色号');
    await click(renderer, '显示网格');
    await click(renderer, '关闭更多工具');
    await click(renderer, '切换排序，当前作品顺序');
    await click(renderer, '进入专注模式');

    await act(async () => renderer.update(<BeadingSessionPage {...callbacks({
      session: session({
        id: 's2', version: 1, elapsedSeconds: 40, status: 'paused',
        requirements: [{ colorCode: 'C3', required: 1 }, { colorCode: 'D4', required: 1 }],
        completedColorCodes: [],
      }),
    })} />));
    expect(button(renderer, '继续计时').findByType('span').children.join('')).toBe('00:40');
    expect(renderer.root.findByType('main').props.className).not.toContain('is-focus');
    expect(renderer.root.findByProps({ className: 'beading-canvas-stage' }).props).toMatchObject({
      'data-locked': 'false', 'data-mode': 'pan',
    });
    expect(canvasSpy.props).toMatchObject({ codesVisible: true, gridVisible: true });
    expect(canvasSpy.props?.overlay).toMatchObject({
      currentColorCode: 'C3', highlightEnabled: true, markedCellIndexes: [],
    });
    expect(button(renderer, '切换排序，当前作品顺序')).toBeTruthy();
    expect(renderer.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
  });

  it('applies the new session draft after the layout reset', async () => {
    const storage = installWindow();
    storage.setItem('qiaoqiaole.beading-draft:alice:s2', JSON.stringify({
      markedCellIndexes: [1], highlightEnabled: false, locked: true,
      codesVisible: false, gridVisible: false, sortMode: 'code', updatedAt: new Date().toISOString(),
    }));
    const initial = callbacks({ draftOwnerId: 'alice' });
    const { renderer } = await renderPage(initial);

    await act(async () => renderer.update(<BeadingSessionPage {...callbacks({
      draftOwnerId: 'alice',
      session: session({ id: 's2', version: 1 }),
    })} />));

    expect(renderer.root.findByProps({ className: 'beading-canvas-stage' }).props['data-locked']).toBe('true');
    expect(canvasSpy.props).toMatchObject({ codesVisible: false, gridVisible: false });
    expect(canvasSpy.props?.overlay).toMatchObject({ highlightEnabled: false, markedCellIndexes: [1] });
    expect(button(renderer, '切换排序，当前色号顺序')).toBeTruthy();
  });
});

describe('BeadingSessionPage static contracts', () => {
  it('renders reference-aligned controls and color progress', () => {
    const markup = renderToStaticMarkup(createElement(BeadingSessionPage, callbacks({
      session: session({ requirements: [{ colorCode: 'A1', required: 3 }], progress: { completed: 0, total: 1, percent: 0 } }),
      cells: [cells[0]], rows: 1, cols: 1,
    })));
    expect(markup).toContain('开始拼豆');
    expect(markup).toContain('A1');
    expect(markup).toContain('完成当前色');
    expect(markup).toContain('aria-label="完成 0/1"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="0"');
  });

  it('imports isolated session styles and leaves no legacy session rules in global CSS', () => {
    const page = fs.readFileSync(path.resolve('apps/h5/src/pages/beading/BeadingSessionPage.tsx'), 'utf8');
    const globalStyles = cssSource('global');
    expect(page).toMatch(/import ['"]\.\/beadingSession\.css['"];?/);
    expect(globalStyles).not.toMatch(/\.beading-(?:session-page|toolbar|progress|canvas|tool-row|color-(?:section|rail|chip|actions|sort|revise|complete)|dialog|status|resume)/);
    expect(globalStyles).not.toMatch(/Temporary Task 5|Task 9 migrates/i);
    expect(globalStyles).toContain('.beading-sheet');
    expect(globalStyles).toContain('.project-action-list');
  });

  it('makes the session a safe-area-aware fixed viewport with a flexible stage', () => {
    const styles = cssSource();
    const page = cssBlock(styles, '.beading-session-page');
    expectDeclaration(page, 'position', 'fixed');
    expectDeclaration(page, 'height', '100dvh');
    expectDeclaration(page, 'overflow', 'hidden');
    expectDeclaration(page, 'display', 'flex');
    expectDeclaration(page, 'background', '#f2f5fd');
    expectDeclaration(page, 'color', '#1e3048');

    const toolbar = cssBlock(styles, '.beading-toolbar');
    expectDeclaration(toolbar, 'padding-top', /env\(safe-area-inset-top\)/);
    expectDeclaration(toolbar, 'padding-left', /max\(8px, env\(safe-area-inset-left\)\)/);
    expectDeclaration(toolbar, 'padding-right', /max\(10px, env\(safe-area-inset-right\)\)/);
    expectDeclaration(toolbar, 'min-height', '2.0317rem');
    expectDeclaration(toolbar, 'height', /max\(2\.0317rem, calc\(1\.7143rem \+ env\(safe-area-inset-top\)\)\)/);
    const stage = cssBlock(styles, '.beading-canvas-stage');
    expectDeclaration(stage, 'flex', /1(?: 1 auto)?/);
    expectDeclaration(stage, 'min-height', '0');
    expectDeclaration(stage, 'overflow', 'hidden');
    expectDeclaration(cssBlock(styles, '.beading-focus-toggle'), 'right', /max\(12px, env\(safe-area-inset-right\)\)/);
    const toolRow = cssBlock(styles, '.beading-tool-row');
    expectDeclaration(toolRow, 'padding-left', /max\(3px, env\(safe-area-inset-left\)\)/);
    expectDeclaration(toolRow, 'padding-right', /max\(3px, env\(safe-area-inset-right\)\)/);
    const colorDock = cssBlock(styles, '.beading-color-section');
    expectDeclaration(colorDock, 'padding-left', /max\(0\.254rem, env\(safe-area-inset-left\)\)/);
    expectDeclaration(colorDock, 'padding-right', /max\(0\.254rem, env\(safe-area-inset-right\)\)/);
  });

  it('sizes the header controls, progress, tool row, and color dock to the mobile reference', () => {
    const styles = cssSource();
    const pageButtons = cssBlock(styles, '.beading-session-page button');
    expectDeclaration(pageButtons, 'font-family', 'inherit');
    expect(pageButtons).not.toMatch(/(?:^|;)\s*font\s*:/);
    expectDeclaration(cssBlock(styles, '.beading-toolbar > button'), 'width', '1.1429rem');
    expectDeclaration(cssBlock(styles, '.beading-toolbar-actions button'), 'min-height', '44px');
    expectDeclaration(cssBlock(styles, '.beading-toolbar-actions button::before'), 'inset', '0.1905rem 0');
    expectDeclaration(cssBlock(styles, '.beading-toolbar-actions button::before'), 'background', '#f7f9fc');
    expectDeclaration(cssBlock(styles, '.beading-progress-track'), 'height', /[78]px/);
    expectDeclaration(cssBlock(styles, '.beading-progress-fill'), 'background', /linear-gradient\([^;]*#(?:1268d7|146cff)[^;]*#[0-9a-f]{6}[^;]*\)/i);
    expectDeclaration(cssBlock(styles, '.beading-tool-row'), 'height', '1.7778rem');
    expectDeclaration(cssBlock(styles, '.beading-tool-button'), 'width', '1.5238rem');
    expectDeclaration(cssBlock(styles, '.beading-tool-button'), 'height', '1.5238rem');
    expectDeclaration(cssBlock(styles, '.beading-tool-button'), 'font-size', '0.381rem');
    expectDeclaration(cssBlock(styles, '.beading-focus-toggle'), 'font-size', '0.4127rem');
    expectDeclaration(cssBlock(styles, '.beading-color-sort,\n.beading-color-revise'), 'font-size', '0.3492rem');
    const chip = cssBlock(styles, '.beading-color-chip');
    expectDeclaration(chip, 'width', '1.3968rem');
    expectDeclaration(chip, 'height', '1.3968rem');
    expectDeclaration(cssBlock(styles, '.beading-color-chip > span:not(.beading-color-complete-badge)'), 'font-size', '0.3492rem');
    expectDeclaration(cssBlock(styles, '.beading-color-chip.is-current'), 'box-shadow', /0 0 0 0\.0635rem #fff[^,;]*,\s*0 0 0 0\.127rem #f0a517/);
    expectDeclaration(cssBlock(styles, '.beading-color-complete-badge'), 'background', /#(?:1268d7|146cff)/i);
    expectDeclaration(cssBlock(styles, '.beading-complete-color'), 'min-width', '1.7778rem');
    expectDeclaration(cssBlock(styles, '.beading-complete-color'), 'height', '1.3968rem');
    expectDeclaration(cssBlock(styles, '.beading-color-section'), 'padding-bottom', /.*env\(safe-area-inset-bottom\).*/);
  });

  it('keeps all four Canvas layers aligned and the overlay on top', () => {
    const styles = cssSource();
    const stack = cssBlock(styles, '.beading-canvas-artboard .h5-canvas-layers');
    expectDeclaration(stack, 'position', 'absolute');
    expectDeclaration(stack, 'inset', '0');
    const canvases = cssBlock(styles, '.beading-canvas-artboard .h5-canvas-layers canvas');
    expectDeclaration(canvases, 'position', 'absolute');
    expectDeclaration(canvases, 'inset', '0');
    expectDeclaration(canvases, 'width', '100%');
    expectDeclaration(canvases, 'height', '100%');
    expectDeclaration(canvases, 'pointer-events', 'none');
    expectDeclaration(cssBlock(styles, '.beading-canvas-artboard .h5-overlay-canvas'), 'z-index', '4');
    expectDeclaration(cssBlock(styles, '.beading-canvas-viewport'), 'width', '100%');
    expectDeclaration(cssBlock(styles, '.beading-canvas-viewport'), 'height', '100%');
    expect(styles).not.toMatch(/Math\.min\([^)]*82|82px/);
  });

  it('expands the stage in focus mode while preserving the exit control', () => {
    const styles = cssSource();
    expectDeclaration(cssBlock(styles, '.beading-focus-toggle'), 'position', 'absolute');
    expectDeclaration(cssBlock(styles, '.beading-focus-toggle'), 'min-height', '44px');
    expectDeclaration(cssBlock(styles, '.beading-session-page.is-focus .beading-toolbar'), 'display', 'none');
    expectDeclaration(cssBlock(styles, '.beading-session-page.is-focus .beading-progress-bar'), 'display', 'none');
    expectDeclaration(cssBlock(styles, '.beading-session-page.is-focus .beading-canvas-stage'), 'margin', /0/);
    expect(styles).not.toMatch(/\.beading-session-page\.is-focus[^{}]*\.beading-focus-toggle\s*\{[^}]*display:\s*none/s);
  });

  it('fits fixed toolbar controls inside a 320px viewport without hiding essential controls', () => {
    const styles = cssSource();
    const narrow = styles.match(/@media\s*\(max-width:\s*360px\)\s*\{([\s\S]*)\}\s*@media/s)?.[1];
    expect(narrow).toBeTruthy();
    expect(narrow).toMatch(/\.beading-toolbar-label\s*\{[^}]*display:\s*none/);
    expect(narrow).toMatch(/\.beading-toolbar\s*\{[^}]*padding-left:\s*max\(0\.254rem, env\(safe-area-inset-left\)\)/);
    expect(narrow).toMatch(/\.beading-toolbar\s*\{[^}]*padding-right:\s*max\(0\.254rem, env\(safe-area-inset-right\)\)/);
    expect(narrow).toMatch(/\.beading-tool-button\s*\{[^}]*font-size:\s*0\.3492rem/);
    expect(narrow).not.toMatch(/\.beading-color-chip[^{}]*span[^{}]*\{[^}]*font-size:\s*(?:[0-9]|1[01])px/);
    const contentWidth = 320 - 2 * 8;
    const fixedControlWidth = 44 + 4 + 44 + 76 + 44 + 44 + 3 * 2;
    expect(fixedControlWidth).toBeLessThanOrEqual(contentWidth);
    expect(styles).toMatch(/@media\s*\(min-width:\s*600px\)[\s\S]*?\.beading-session-page\s*\{[^}]*max-width:\s*430px/);
  });

  it('keeps active control text at WCAG AA contrast and honors reduced motion', () => {
    const styles = cssSource();
    expect(styles).toMatch(/\.beading-color-revise\.is-active\s*\{[^}]*color:\s*#8a5700;/);
    expect(styles).toMatch(/\.beading-more-actions button\[aria-pressed="true"\]\s*\{[^}]*color:\s*#1859b8;/);
    expect(styles).toMatch(/\.beading-dialog h2\s*\{[^}]*font-size:\s*0\.635rem/);
    expect(styles).toMatch(/\.beading-dialog p\s*\{[^}]*font-size:\s*0\.4444rem/);
    expect(styles).toMatch(/\.beading-dialog-actions button\s*\{[^}]*font-size:\s*0\.508rem/);
    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?transition(?:-duration)?:\s*(?:none|0\.01ms)/);
    expect(contrastRatio('#8a5700', '#f7f9fc')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#1859b8', '#eef5ff')).toBeGreaterThanOrEqual(4.5);

    const actualPairs = [
      ['.beading-toolbar-actions .beading-toolbar-save', '.beading-toolbar-actions .beading-toolbar-save::before'],
      ['.beading-toolbar-actions .beading-timer svg', '.beading-toolbar-actions .beading-timer svg'],
      ['.beading-tool-button.is-active,\n.beading-tool-button[aria-pressed="true"]', '.beading-tool-button.is-active,\n.beading-tool-button[aria-pressed="true"]'],
      ['.beading-search-input svg', '.beading-search-input'],
      ['.beading-search-empty', '.beading-dialog'],
      ['.beading-dialog-actions button.is-danger', '.beading-dialog-actions button'],
    ] as const;
    actualPairs.forEach(([foregroundSelector, backgroundSelector]) => {
      const foreground = declarationValue(cssBlock(styles, foregroundSelector), 'color');
      const background = declarationValue(cssBlock(styles, backgroundSelector), 'background');
      expect(contrastRatio(foreground, background), `${foregroundSelector} on ${backgroundSelector}`)
        .toBeGreaterThanOrEqual(4.5);
    });
  });

  it('keeps controls reachable in short landscape viewports and avoids structural selector debt', () => {
    const styles = cssSource();
    const shortLandscape = cssAtRuleBlock(styles, '@media (max-height: 520px) and (orientation: landscape)');
    expect(shortLandscape).toMatch(/\.beading-session-page\s*\{[^}]*overflow-y:\s*auto/);
    expect(shortLandscape).toMatch(/\.beading-canvas-stage\s*\{[^}]*min-height:\s*(?:1[2-9][0-9]|[2-9][0-9]{2,})px/);
    expect(shortLandscape).toMatch(/\.beading-color-section\s*\{[^}]*flex:\s*0 0 auto/);
    expect(styles).not.toContain('.beading-toolbar-capsule:nth-child');
    expect(styles).not.toContain('--beading-blue');
    expect(styles).not.toContain('--beading-orange');
  });
});
