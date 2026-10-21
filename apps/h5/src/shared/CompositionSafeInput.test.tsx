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
  it('publishes the selected word once when compositionend is followed by the final change event', async () => {
    const change = vi.fn();let renderer!: ReturnType<typeof create>;
    await act(async()=>{renderer=create(<CompositionSafeInput value="" onValueChange={change}/>);});
    act(()=>renderer.root.findByType('input').props.onCompositionStart({currentTarget:{value:''}}));
    act(()=>renderer.root.findByType('input').props.onChange({currentTarget:{value:'pinbu'}}));
    act(()=>renderer.root.findByType('input').props.onCompositionEnd({currentTarget:{value:'拼布'}}));
    act(()=>renderer.root.findByType('input').props.onChange({currentTarget:{value:'拼布'}}));
    expect(change.mock.calls).toEqual([['拼布']]);
    act(()=>renderer.unmount());
  });

  it('retains the live draft during parent updates and flushes text before the blur callback', async()=>{
    const change=vi.fn(),blur=vi.fn(),key=vi.fn();let renderer!:ReturnType<typeof create>;
    const props={value:'原名',onValueChange:change,onBlur:blur,onKeyDown:key};
    await act(async()=>{renderer=create(<CompositionSafeInput {...props}/>);});
    const input=()=>renderer.root.findByType('input');const target={value:'原名'};
    act(()=>input().props.onCompositionStart({currentTarget:target}));
    target.value='原名pin';act(()=>input().props.onChange({currentTarget:target}));
    await act(async()=>renderer.update(<CompositionSafeInput {...props} value="外部变化"/>));
    expect(input().props.value).toBe('原名pin');expect(change).not.toHaveBeenCalled();
    const stop=vi.fn();act(()=>input().props.onKeyDown({nativeEvent:{keyCode:229},stopPropagation:stop}));
    expect(stop).toHaveBeenCalled();expect(key).not.toHaveBeenCalled();
    target.value='原名拼布';act(()=>input().props.onBlur({currentTarget:target}));
    expect(change).toHaveBeenLastCalledWith('原名拼布');expect(blur).toHaveBeenCalledOnce();
    act(()=>input().props.onCompositionEnd({currentTarget:target}));expect(change).toHaveBeenCalledOnce();
    act(()=>renderer.unmount());
  });

});
