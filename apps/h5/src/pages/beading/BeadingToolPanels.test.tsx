import type { ReactElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeadingToolPanels } from './BeadingToolPanels';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const searchProps = () => ({
  activePanel: 'search' as const,
  query: '',
  onQueryChange: vi.fn(),
  requirements: [
    { colorCode: 'A1', required: 5 },
    { colorCode: 'B12', required: 8 },
  ],
  completed: ['A1'],
  current: 'B12',
  resolveColor: (code: string) => code === 'A1' ? '#faf4c8' : '#121212',
  onSelect: vi.fn(),
  onClose: vi.fn(),
});

beforeEach(() => vi.clearAllMocks());

function modalHarness() {
  const listeners = new Map<string, EventListener>();
  const documentMock = { activeElement: null as unknown };
  const focusNode = () => {
    const node = {
      focus: vi.fn(() => { documentMock.activeElement = node; }),
      tabIndex: 0,
      disabled: false,
      isConnected: true,
    };
    return node;
  };
  const trigger = focusNode();
  const close = focusNode();
  const input = focusNode();
  const lastAction = focusNode();
  const attributes = new Map<string, string>();
  const sibling = {
    inert: false,
    getAttribute: vi.fn((name: string) => attributes.get(name) ?? null),
    setAttribute: vi.fn((name: string, value: string) => attributes.set(name, value)),
    removeAttribute: vi.fn((name: string) => attributes.delete(name)),
  };
  const backdrop = { parentElement: null as unknown };
  const parent = { children: [sibling, backdrop] };
  backdrop.parentElement = parent;
  const dialog = {
    querySelectorAll: vi.fn(() => [close, input, lastAction]),
    contains: vi.fn((node: unknown) => [close, input, lastAction].includes(node as typeof close)),
  };
  documentMock.activeElement = trigger;
  vi.stubGlobal('document', documentMock);
  vi.stubGlobal('window', {
    addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
  });
  const createNodeMock = (element: ReactElement<unknown>) => {
    const elementProps = element.props as Record<string, unknown>;
    if (element.type === 'section') return dialog;
    if (element.type === 'input') return input;
    if (element.type === 'div' && elementProps.className === 'beading-tool-panel-backdrop') return backdrop;
    if (element.type === 'button' && String(elementProps['aria-label']).startsWith('关闭')) return close;
    return {};
  };
  return { listeners, documentMock, trigger, close, input, lastAction, sibling, createNodeMock };
}

describe('BeadingToolPanels search sheet', () => {
  it('renders only matching artwork colors with swatch, required, remaining, and empty state', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingToolPanels {...searchProps()} query="a" />); });
    expect(renderer.root.findAllByProps({ className: 'beading-search-result' })).toHaveLength(1);
    expect(renderer.root.findByProps({ className: 'beading-search-result-code' }).children.join('')).toBe('A1');
    expect(renderer.root.findByProps({ className: 'beading-search-result-required' }).children.join('')).toContain('5');
    expect(renderer.root.findByProps({ className: 'beading-search-result-remaining' }).children.join('')).toContain('0');
    expect(renderer.root.findByProps({ className: 'beading-color-swatch' }).props.style.backgroundColor).toBe('#faf4c8');

    act(() => { renderer.update(<BeadingToolPanels {...searchProps()} query="C9" />); });
    expect(renderer.root.findByProps({ className: 'beading-search-empty' }).children.join('')).toContain('无结果');
  });

  it('forwards controlled query changes and selects before closing', () => {
    const props = searchProps();
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingToolPanels {...props} />); });
    act(() => renderer.root.findByType('input').props.onChange({ target: { value: 'b1' } }));
    expect(props.onQueryChange).toHaveBeenCalledWith('b1');

    act(() => renderer.root.findAllByProps({ className: 'beading-search-result' })[1].props.onClick());
    expect(props.onSelect).toHaveBeenCalledWith('B12');
    expect(props.onClose.mock.invocationCallOrder[0]).toBeGreaterThan(props.onSelect.mock.invocationCallOrder[0]);
  });

  it('closes from Escape, the close button, and only a direct backdrop click', () => {
    const listeners = new Map<string, EventListener>();
    const addEventListener = vi.fn((type: string, listener: EventListener) => listeners.set(type, listener));
    const removeEventListener = vi.fn((type: string) => listeners.delete(type));
    vi.stubGlobal('window', { addEventListener, removeEventListener });
    const props = searchProps();
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingToolPanels {...props} />); });

    act(() => listeners.get('keydown')?.({ key: 'Escape' } as KeyboardEvent));
    act(() => renderer.root.findByProps({ 'aria-label': '关闭搜色' }).props.onClick());
    const backdrop = renderer.root.findByProps({ className: 'beading-tool-panel-backdrop' });
    act(() => backdrop.props.onClick({ target: {}, currentTarget: {} }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
    const sameTarget = {};
    act(() => backdrop.props.onClick({ target: sameTarget, currentTarget: sameTarget }));
    expect(props.onClose).toHaveBeenCalledTimes(3);
    act(() => renderer.unmount());
    expect(removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    vi.unstubAllGlobals();
  });

  it('focuses search, traps Tab, isolates background siblings, and restores the trigger', () => {
    const harness = modalHarness();
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingToolPanels {...searchProps()} />, { createNodeMock: harness.createNodeMock }); });

    expect(harness.input.focus).toHaveBeenCalledTimes(1);
    expect(harness.sibling.inert).toBe(true);
    expect(harness.sibling.setAttribute).toHaveBeenCalledWith('aria-hidden', 'true');

    const preventDefault = vi.fn();
    harness.documentMock.activeElement = harness.lastAction;
    act(() => harness.listeners.get('keydown')?.({ key: 'Tab', shiftKey: false, preventDefault } as unknown as KeyboardEvent));
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(harness.close.focus).toHaveBeenCalledTimes(1);

    harness.documentMock.activeElement = harness.close;
    act(() => harness.listeners.get('keydown')?.({ key: 'Tab', shiftKey: true, preventDefault } as unknown as KeyboardEvent));
    expect(harness.lastAction.focus).toHaveBeenCalledTimes(1);

    act(() => renderer.unmount());
    expect(harness.trigger.focus).toHaveBeenCalledTimes(1);
    expect(harness.sibling.inert).toBe(false);
    expect(harness.sibling.removeAttribute).toHaveBeenCalledWith('aria-hidden');
    vi.unstubAllGlobals();
  });
});

describe('BeadingToolPanels more sheet', () => {
  it('focuses the close control when opened', () => {
    const harness = modalHarness();
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingToolPanels activePanel="more" codesVisible gridVisible hasMarks onToggleCodes={vi.fn()} onToggleGrid={vi.fn()} onClearMarks={vi.fn()} onReset={vi.fn()} onClose={vi.fn()} />, { createNodeMock: harness.createNodeMock }); });
    expect(harness.close.focus).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
    vi.unstubAllGlobals();
  });

  it('renders semantic switches, disables clear without marks, and forwards actions', () => {
    const props = {
      activePanel: 'more' as const,
      codesVisible: true,
      gridVisible: false,
      hasMarks: false,
      onToggleCodes: vi.fn(),
      onToggleGrid: vi.fn(),
      onClearMarks: vi.fn(),
      onReset: vi.fn(),
      onClose: vi.fn(),
    };
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingToolPanels {...props} />); });
    expect(renderer.root.findByProps({ 'aria-label': '显示色号' }).props['aria-pressed']).toBe(true);
    expect(renderer.root.findByProps({ 'aria-label': '显示网格' }).props['aria-pressed']).toBe(false);
    expect(renderer.root.findByProps({ 'aria-label': '清除标记' }).props.disabled).toBe(true);
    act(() => renderer.root.findByProps({ 'aria-label': '显示色号' }).props.onClick());
    act(() => renderer.root.findByProps({ 'aria-label': '显示网格' }).props.onClick());
    act(() => renderer.root.findByProps({ 'aria-label': '重置工具' }).props.onClick());
    expect(props.onToggleCodes).toHaveBeenCalledTimes(1);
    expect(props.onToggleGrid).toHaveBeenCalledTimes(1);
    expect(props.onReset).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('delegates clear confirmation to the parent', () => {
    const onClearMarks = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingToolPanels activePanel="more" codesVisible gridVisible hasMarks onToggleCodes={vi.fn()} onToggleGrid={vi.fn()} onClearMarks={onClearMarks} onReset={vi.fn()} onClose={vi.fn()} />); });
    act(() => renderer.root.findByProps({ 'aria-label': '清除标记' }).props.onClick());
    expect(onClearMarks).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when no panel is active', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingToolPanels activePanel={null} />); });
    expect(renderer.toJSON()).toBeNull();
  });
});
