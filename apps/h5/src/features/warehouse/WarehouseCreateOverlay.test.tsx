import { act, create } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { WarehouseCreateOverlay } from './WarehouseFeatureContent';

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(globalThis, { window: new EventTarget() });
});

describe('WarehouseCreateOverlay', () => {
  it('closes on Escape and does not leak backdrop-touch events from its panel', () => {
    const onClose = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<WarehouseCreateOverlay name="仓库" remark="" pending={false} setName={vi.fn()} setRemark={vi.fn()} onClose={onClose} onCreate={vi.fn()} />); });
    const escape = new Event('keydown');
    Object.defineProperty(escape, 'key', { value: 'Escape' });
    act(() => { window.dispatchEvent(escape); });
    expect(onClose).toHaveBeenCalledTimes(1);
    const panel = renderer.root.findByProps({ className: 'home-create-panel' });
    const stopPropagation = vi.fn();
    act(() => panel.props.onTouchStart({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledOnce();
    const backdrop = renderer.root.findByProps({ className: 'home-create-modal' });
    act(() => backdrop.props.onClick());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('disables duplicate submit and close while pending', () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<WarehouseCreateOverlay name="仓库" remark="" pending setName={vi.fn()} setRemark={vi.fn()} onClose={onClose} onCreate={onCreate} />); });
    const buttons = renderer.root.findAllByType('button');
    expect(buttons.every((button) => button.props.disabled)).toBe(true);
  });
});
