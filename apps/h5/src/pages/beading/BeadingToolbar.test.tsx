import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BeadingToolbar } from './BeadingToolbar';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const callbacks = () => ({
  onExit: vi.fn(),
  onInventory: vi.fn(),
  onTogglePause: vi.fn(),
  onSave: vi.fn(),
  onSettings: vi.fn(),
});

describe('BeadingToolbar', () => {
  it('renders compact controls without a title and reports percentage progress accessibly', () => {
    const markup = renderToStaticMarkup(createElement(BeadingToolbar, {
      title: '不应占宽的标题',
      elapsed: '12:34',
      paused: false,
      progress: { completed: 3, total: 8, percent: 37.5 },
      ...callbacks(),
    }));

    expect(markup).not.toContain('不应占宽的标题');
    expect(markup).toContain('库存');
    expect(markup).toContain('12:34');
    expect(markup).toContain('保存');
    expect(markup).toContain('37.5%');
    expect(markup).toContain('aria-label="完成 3/8"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="100"');
    expect(markup).toContain('aria-valuenow="37.5"');
    expect(markup).toContain('width:37.5%');
    expect(markup).toContain('aria-label="返回"');
    expect(markup).toContain('aria-label="暂停计时"');
    expect(markup).toContain('aria-label="设置"');
  });

  it.each([
    ['save', false, true, false, false],
    ['patch', false, true, false, false],
    ['prepare', false, true, false, false],
    ['complete', false, true, false, false],
    ['inventory', true, true, false, false],
    ['resume', false, true, true, false],
  ] as const)('uses the network pending matrix for %s', (pendingAction, inventoryDisabled, saveDisabled, timerDisabled, settingsDisabled) => {
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingToolbar elapsed="00:10" paused progress={{ completed: 1, total: 2, percent: 50 }} pendingAction={pendingAction} {...callbacks()} />); });
    expect(renderer.root.findByProps({ 'aria-label': '查看库存' }).props.disabled).toBe(inventoryDisabled);
    expect(renderer.root.findByProps({ 'aria-label': '保存' }).props.disabled).toBe(saveDisabled);
    expect(renderer.root.findByProps({ 'aria-label': '继续计时' }).props.disabled).toBe(timerDisabled);
    expect(renderer.root.findByProps({ 'aria-label': '设置' }).props.disabled).toBe(settingsDisabled);
  });

  it.each([
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [-20, 0],
    [140, 100],
  ])('normalizes progress %s once for width, text, and aria', (percent, expected) => {
    const markup = renderToStaticMarkup(createElement(BeadingToolbar, {
      elapsed: '00:00', paused: false, progress: { completed: 1, total: 2, percent }, ...callbacks(),
    }));
    expect(markup).toContain(`aria-valuenow="${expected}"`);
    expect(markup).toContain(`width:${expected}%`);
    expect(markup).toContain(`>${expected}%<`);
    expect(markup).not.toContain('NaN');
    expect(markup).not.toContain('Infinity');
  });

  it('disables only the action represented by pendingAction', () => {
    const actions = callbacks();
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<BeadingToolbar
        elapsed="00:10"
        paused
        progress={{ completed: 1, total: 2, percent: 50 }}
        pendingAction="save"
        {...actions}
      />);
    });

    const buttons = renderer.root.findAllByType('button');
    const byLabel = (label: string) => buttons.find((button) => button.props['aria-label'] === label)!;
    expect(byLabel('保存').props.disabled).toBe(true);
    expect(byLabel('返回').props.disabled).toBe(false);
    expect(byLabel('查看库存').props.disabled).toBe(false);
    expect(byLabel('继续计时').props.disabled).toBe(false);
    expect(byLabel('设置').props.disabled).toBe(false);

    act(() => byLabel('查看库存').props.onClick());
    expect(actions.onInventory).toHaveBeenCalledTimes(1);

    act(() => {
      renderer.update(<BeadingToolbar
        elapsed="00:10"
        paused
        progress={{ completed: 1, total: 2, percent: 50 }}
        pendingAction="resume"
        {...actions}
      />);
    });
    expect(renderer.root.findByProps({ 'aria-label': '继续计时' }).props.disabled).toBe(true);
  });

  it('marks focus mode so secondary toolbar content can be hidden by CSS', () => {
    const markup = renderToStaticMarkup(createElement(BeadingToolbar, {
      elapsed: '00:00',
      paused: false,
      progress: { completed: 0, total: 0, percent: 0 },
      focusMode: true,
      ...callbacks(),
    }));
    expect(markup).toContain('beading-toolbar is-focus-mode');
    expect(markup).toContain('beading-toolbar-secondary');
  });
});
