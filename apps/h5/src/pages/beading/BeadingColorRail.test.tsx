import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BeadingColorRail } from './BeadingColorRail';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const baseProps = () => ({
  requirements: [
    { colorCode: 'A1', required: 4 },
    { colorCode: 'B2', required: 6 },
  ],
  completed: ['A1'],
  current: 'A1' as string | null,
  sortMode: 'canvas' as const,
  resolveColor: (code: string) => code === 'A1' ? '#faf4c8' : '#101010',
  resolveTextColor: (color: string) => color === '#faf4c8' ? '#000000' : '#ffffff',
  pending: false,
  terminalPrepare: false,
  onSelect: vi.fn(),
  onSort: vi.fn(),
  onRevise: vi.fn(),
  onComplete: vi.fn(),
});

describe('BeadingColorRail', () => {
  it('uses resolved MARD colors and contrast while keeping completed codes visible', () => {
    const markup = renderToStaticMarkup(createElement(BeadingColorRail, baseProps()));
    expect(markup).toContain('background-color:#faf4c8');
    expect(markup).toContain('color:#000000');
    expect(markup).toContain('background-color:#101010');
    expect(markup).toContain('color:#ffffff');
    expect(markup).toContain('>A1<');
    expect(markup).toContain('beading-color-complete-badge');
    expect(markup).toContain('is-current');
    expect(markup).toContain('is-complete');
    expect(markup.indexOf('A1')).toBeLessThan(markup.indexOf('B2'));
  });

  it('shows sort labels, revision state, and normal completion progress', () => {
    const markup = renderToStaticMarkup(createElement(BeadingColorRail, { ...baseProps(), sortMode: 'remaining', revisionActive: true, current: 'B2' }));
    expect(markup).toContain('剩余');
    expect(markup).toContain('aria-label="修订当前色"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('完成 1/2');
  });

  it('uses terminal confirmation and allows it even when current is completed', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingColorRail {...baseProps()} terminalPrepare />); });
    const complete = renderer.root.findByProps({ 'aria-label': '确认完成拼豆' });
    expect(complete.children.join('')).toContain('确认完成');
    expect(complete.props.disabled).toBe(false);
  });

  it('disables revision without a current color and normal completion for a completed current color', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingColorRail {...baseProps()} current={null} />); });
    expect(renderer.root.findByProps({ 'aria-label': '修订当前色' }).props.disabled).toBe(true);

    act(() => { renderer.update(<BeadingColorRail {...baseProps()} />); });
    expect(renderer.root.findByProps({ 'aria-label': '完成当前色' }).props.disabled).toBe(true);
  });

  it('disables rail actions while pending and forwards all callbacks otherwise', () => {
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<BeadingColorRail {...baseProps()} pending />); });
    expect(renderer.root.findAllByType('button').every((button) => button.props.disabled)).toBe(true);

    const props = { ...baseProps(), current: 'B2' };
    act(() => { renderer.update(<BeadingColorRail {...props} />); });
    act(() => renderer.root.findByProps({ 'aria-label': '选择色号 B2' }).props.onClick());
    act(() => renderer.root.findByProps({ 'aria-label': '切换排序，当前作品顺序' }).props.onClick());
    act(() => renderer.root.findByProps({ 'aria-label': '修订当前色' }).props.onClick());
    act(() => renderer.root.findByProps({ 'aria-label': '完成当前色' }).props.onClick());
    expect(props.onSelect).toHaveBeenCalledWith('B2');
    expect(props.onSort).toHaveBeenCalledTimes(1);
    expect(props.onRevise).toHaveBeenCalledTimes(1);
    expect(props.onComplete).toHaveBeenCalledTimes(1);
  });
});
