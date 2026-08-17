import { act, create } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CompositionSafeInput } from './CompositionSafeInput';

describe('CompositionSafeInput', () => {
  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  it('keeps pinyin local until the IME commits the selected Chinese text', async () => {
    const onValueChange = vi.fn();
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CompositionSafeInput value="" onValueChange={onValueChange} aria-label="名称" />); });
    const input = renderer.root.findByType('input');

    act(() => input.props.onCompositionStart({ currentTarget: { value: '' } }));
    act(() => input.props.onChange({ currentTarget: { value: 'dongwu' } }));
    expect(renderer.root.findByType('input').props.value).toBe('dongwu');
    expect(onValueChange).not.toHaveBeenCalled();

    act(() => renderer.root.findByType('input').props.onCompositionEnd({ currentTarget: { value: '动物' } }));
    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenLastCalledWith('动物');
  });

  it('reports ordinary keyboard input immediately', async () => {
    const onValueChange = vi.fn();
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<CompositionSafeInput value="" onValueChange={onValueChange} />); });
    act(() => renderer.root.findByType('input').props.onChange({ currentTarget: { value: 'hello' } }));
    expect(onValueChange).toHaveBeenCalledWith('hello');
  });
});
