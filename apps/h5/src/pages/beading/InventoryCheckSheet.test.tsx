import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { InventoryCheckSheet } from './InventoryCheckSheet';

const result = { projectRevision: 1, warehouseId: 'w1', items: [{ colorCode: 'A14', required: 5, available: 3, missing: 2, sufficient: false }], summary: { required: 5, available: 3, missing: 2, sufficient: false } };
describe('InventoryCheckSheet', () => {
  beforeAll(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  it('shows missing text and still-start action', () => {
    const markup = renderToStaticMarkup(createElement(InventoryCheckSheet, { result, onClose: vi.fn(), onStart: vi.fn() }));
    expect(markup).toContain('缺 2 颗');
    expect(markup).toContain('仍然开始拼豆');
  });

  it('closes on a real window Escape event and backdrop click while isolating content interactions', () => {
    const keyboardTarget = new EventTarget();
    vi.stubGlobal('window', keyboardTarget);
    const onClose = vi.fn();
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(<InventoryCheckSheet result={result} onClose={onClose} onStart={vi.fn()} />); });
    const backdrop = renderer.root.findByProps({ className: 'beading-sheet-backdrop' });
    const panel = renderer.root.findByProps({ className: 'beading-sheet inventory-check-sheet' });
    act(() => { panel.props.onClick({ stopPropagation: vi.fn() }); panel.props.onTouchStart({ stopPropagation: vi.fn() }); });
    expect(onClose).not.toHaveBeenCalled();
    const escape = new Event('keydown');
    Object.defineProperty(escape, 'key', { value: 'Escape' });
    act(() => { keyboardTarget.dispatchEvent(escape); });
    expect(onClose).toHaveBeenCalledOnce();
    act(() => { backdrop.props.onClick(); });
    expect(onClose).toHaveBeenCalledTimes(2);
    act(() => { renderer.unmount(); });
    vi.unstubAllGlobals();
  });

  it('deduplicates async warehouse changes and disables controls while pending', async () => {
    let resolve!: () => void;
    const change = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(<InventoryCheckSheet result={result} onClose={vi.fn()} onStart={vi.fn()} warehouseId="w1" warehouseOptions={[{ id: 'w1', name: '仓库' }]} onWarehouseChange={change} />); });
    const select = renderer.root.findByType('select');
    act(() => { select.props.onChange({ target: { value: 'w2' } }); select.props.onChange({ target: { value: 'w2' } }); });
    expect(change).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('select').props.disabled).toBe(true);
    await act(async () => { resolve(); });
    expect(renderer.root.findByType('select').props.disabled).toBe(false);
  });
});
