import { act, create } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BeadingToolRow } from './BeadingToolRow';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

function renderRow(overrides: Partial<React.ComponentProps<typeof BeadingToolRow>> = {}) {
  const callbacks = {
    onSearch: vi.fn(),
    onToggleMark: vi.fn(),
    onToggleHighlight: vi.fn(),
    onToggleLock: vi.fn(),
    onMore: vi.fn(),
    onFit: vi.fn(),
  };
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<BeadingToolRow
      interactionMode="mark"
      activePanel="search"
      highlightEnabled
      locked={false}
      currentColor="A14"
      {...callbacks}
      {...overrides}
    />);
  });
  return { renderer, callbacks };
}

describe('BeadingToolRow', () => {
  it('expresses active panel, mode, and toggles without making fit persistent', () => {
    const { renderer } = renderRow();
    const buttons = renderer.root.findAllByType('button');
    const byLabel = (label: string) => buttons.find((button) => button.props['aria-label'] === label)!;

    expect(byLabel('搜色').props.className).toContain('is-active');
    expect(byLabel('搜色').props['aria-pressed']).toBe(true);
    expect(byLabel('标记').props.className).toContain('is-active');
    expect(byLabel('标记').props['aria-pressed']).toBe(true);
    expect(byLabel('高亮').props['aria-pressed']).toBe(true);
    expect(byLabel('锁定画布').props['aria-pressed']).toBe(false);
    expect(byLabel('更多工具').props['aria-pressed']).toBe(false);
    expect(byLabel('适应画布').props.className).not.toContain('is-active');
    expect(byLabel('适应画布').props['aria-pressed']).toBeUndefined();
  });

  it('disables mark without a current color and while locked, but always allows unlock', () => {
    const noColor = renderRow({ currentColor: null });
    expect(noColor.renderer.root.findByProps({ 'aria-label': '标记' }).props.disabled).toBe(true);

    const locked = renderRow({ locked: true });
    expect(locked.renderer.root.findByProps({ 'aria-label': '标记' }).props.disabled).toBe(true);
    expect(locked.renderer.root.findByProps({ 'aria-label': '解除画布锁定' }).props.disabled).toBe(false);
  });

  it('disables all tools while pending and forwards callbacks otherwise', () => {
    const pending = renderRow({ pending: true });
    expect(pending.renderer.root.findAllByType('button').every((button) => button.props.disabled)).toBe(true);

    const { renderer, callbacks } = renderRow({ activePanel: null, interactionMode: 'pan', highlightEnabled: false });
    const labels = ['搜色', '标记', '高亮', '锁定画布', '更多工具', '适应画布'];
    labels.forEach((label) => act(() => renderer.root.findByProps({ 'aria-label': label }).props.onClick()));
    Object.values(callbacks).forEach((callback) => expect(callback).toHaveBeenCalledTimes(1));
  });
});
