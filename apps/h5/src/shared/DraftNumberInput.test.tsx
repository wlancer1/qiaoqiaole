import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftNumberInput } from './DraftNumberInput';

let renderer: ReactTestRenderer;
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.unstubAllGlobals(); });
const input = () => renderer.root.findByType('input');
const change = (value: string) => act(() => input().props.onChange({ target: { value } }));
const focus = () => act(() => input().props.onFocus({}));
const blur = () => act(() => input().props.onBlur({}));

describe('numeric editing draft', () => {
  it('keeps an empty required field without publishing a temporary zero and restores on blur', () => {
    const update = vi.fn(), onBlur = vi.fn();
    act(() => { renderer = create(<DraftNumberInput min={2} value={40} onValueChange={update} onBlur={onBlur}/>); });
    focus(); change('');
    expect(input().props.value).toBe('');
    expect(update).not.toHaveBeenCalled();
    act(() => renderer.update(<DraftNumberInput min={2} value={40} onValueChange={update} onBlur={onBlur}/>));
    expect(input().props.value).toBe('');
    blur(); expect(input().props.value).toBe('40'); expect(onBlur).toHaveBeenCalledOnce();
  });

  it('permits an out-of-range prefix while typing a valid size', () => {
    const update = vi.fn();
    function Form() {
      const [value, setValue] = useState(40);
      return <DraftNumberInput min={2} max={300} value={value} onValueChange={n => { update(n); setValue(n); }}/>;
    }
    act(() => { renderer = create(<Form/>); });
    focus(); change(''); change('1');
    expect(input().props.value).toBe('1'); expect(update).not.toHaveBeenCalled();
    change('12'); expect(update).toHaveBeenLastCalledWith(12);
    blur(); expect(input().props.value).toBe('12');
  });

  it('preserves decimal typing during converted-unit updates and canonicalizes only after blur', () => {
    function Form() {
      const [mm, setMm] = useState(500);
      return <DraftNumberInput min={0} value={mm/10} onValueChange={cm => setMm(Math.round(cm*10))}/>;
    }
    act(() => { renderer = create(<Form/>); });
    focus(); change(''); change('0'); change('0.');
    expect(input().props.value).toBe('0.');
    change('0.5'); expect(input().props.value).toBe('0.5');
    change('0.55'); expect(input().props.value).toBe('0.55');
    blur(); expect(input().props.value).toBe('0.6');
  });

  it.each(['0', '-12.5'])('retains a valid %s without applying truthy fallbacks', raw => {
    const update = vi.fn();
    act(() => { renderer = create(<DraftNumberInput value={10} onValueChange={update}/>); });
    focus(); change(raw);
    expect(input().props.value).toBe(raw); expect(update).toHaveBeenLastCalledWith(Number(raw));
  });

  it('clears optional calibration values and leaves them empty after blur', () => {
    const cleared = vi.fn();
    function Form() {
      const [value, setValue] = useState<number|undefined>(150);
      return <DraftNumberInput value={value} onValueChange={setValue} onClear={() => { cleared(); setValue(undefined); }}/>;
    }
    act(() => { renderer = create(<Form/>); });
    focus(); change(''); blur();
    expect(cleared).toHaveBeenCalledOnce(); expect(input().props.value).toBe('');
  });

  it('rejects invalid numbers and restores external values when idle', () => {
    const update = vi.fn();
    act(() => { renderer = create(<DraftNumberInput value={40} onValueChange={update}/>); });
    focus(); change('-'); change('Infinity');
    expect(update).not.toHaveBeenCalled();
    blur(); expect(input().props.value).toBe('40');
    act(() => renderer.update(<DraftNumberInput value={25} onValueChange={update}/>));
    expect(input().props.value).toBe('25');
  });
});
