import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppOverlayProvider, useAppOverlayState } from '../app/overlays/AppOverlayContext';
import { FabricStockDialog, recordFabricStock } from './FabricStockDialog';
import { builtinFabrics } from './fabricCatalog';
let renderer: ReactTestRenderer | undefined;
afterEach(() => { if (renderer) act(() => renderer!.unmount()); renderer = undefined; vi.unstubAllGlobals(); });
function Host() { const { slots } = useAppOverlayState(); return <>{slots.inventory}</>; }
const button = (label: string) => renderer!.root.findAllByType('button').find(n => n.props['aria-label'] === label || n.children.join('') === label)!;
async function mount(save: any, close = vi.fn()) {
 const listeners = new Map<string, Function>();
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 vi.stubGlobal('window', { addEventListener: (name: string, fn: Function) => listeners.set(name, fn), removeEventListener: vi.fn() });
 await act(async () => { renderer = create(<AppOverlayProvider><FabricStockDialog fabric={builtinFabrics[0]} onSave={save} onClose={close}/><Host/></AppOverlayProvider>); });
 return { close, listeners };
}
describe('stock-only shared dialog', () => {
 it('opens in the overlay, isolates the background and supports cancel and Escape', async () => {
  const save = vi.fn(), { close, listeners } = await mount(save);
  const stop = vi.fn();
  act(() => renderer!.root.findByProps({role:'dialog'}).props.onClick({ stopPropagation: stop }));
  expect(stop).toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  act(() => button('取消').props.onClick());
  act(() => renderer!.root.findByProps({role:'presentation'}).props.onClick());
  act(() => listeners.get('keydown')!({key:'Escape', preventDefault:vi.fn(), stopImmediatePropagation:vi.fn()}));
  expect(close).toHaveBeenCalledTimes(3); expect(save).not.toHaveBeenCalled();
 });
 it('validates stock, prevents double saves, keeps failed input and retries', async () => {
  let reject!: (err: Error) => void;
  const save = vi.fn(() => new Promise<void>((_, rej) => { reject = rej; }));
  const { close } = await mount(save);
  await act(async () => button('保存库存').props.onClick());
  expect(save).not.toHaveBeenCalled();
  act(() => {
   renderer!.root.findByProps({'aria-label':'库存布料宽度'}).props.onChange({target:{value:'50'}});
   renderer!.root.findByProps({'aria-label':'库存布料高度'}).props.onChange({target:{value:'35'}});
   renderer!.root.findByProps({'aria-label':'库存布料数量'}).props.onChange({target:{value:'2'}});
  });
  await act(async () => { button('保存库存').props.onClick(); });
  act(() => { button('保存中…').props.onClick(); button('取消').props.onClick(); });
  expect(save).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
  expect(save).toHaveBeenCalledWith({stockMode:'size',widthMm:500,heightMm:350,quantity:2,availableAreaMm2:350000});
  await act(async () => reject(new Error('网络失败')));
  expect(renderer!.root.findByProps({role:'alert'}).children.join('')).toBe('网络失败');
  expect(renderer!.root.findByProps({'aria-label':'库存布料宽度'}).props.value).toBe('50');
  save.mockImplementation(async () => {});
  await act(async () => button('保存库存').props.onClick());
  expect(close).toHaveBeenCalledTimes(1);
 });
 it('ensures a personal record then patches stock only without overwriting calibration', async () => {
  const personal = {...builtinFabrics[0],id:'personal',sampleWidthMm:123};
  const request = vi.fn(async () => ({fabric:personal}));
  const stock = {stockMode:'size' as const,widthMm:500,heightMm:350,quantity:2,availableAreaMm2:350000};
  const saved = await recordFabricStock(request as any, 'token', builtinFabrics[0], stock);
  expect(request.mock.calls.map((c:any) => c[0])).toEqual(['/fabrics/presets/ivory','/fabrics/personal']);
  expect(JSON.parse((request.mock.calls[1] as any)[1].body)).toEqual(stock);
  expect(saved.sampleWidthMm).toBe(123);
 });
});
