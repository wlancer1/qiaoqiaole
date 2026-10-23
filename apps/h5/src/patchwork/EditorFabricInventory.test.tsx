import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createH5Store } from '../store/store';
import { AppOverlayHost } from '../app/overlays/AppOverlayHost';
import { AppOverlayProvider } from '../app/overlays/AppOverlayContext';
import { PatchworkPage } from './PatchworkPage';
import { FabricPicker } from './FabricPicker';

let renderer: ReactTestRenderer;
const fabric = { id: 'inventory-new', name: '新布料', color: '#d9ad45', image: null, stockMode: 'own', widthMm: null, heightMm: null, quantity: 1, availableAreaMm2: null, note: null, updatedAt: '2026-10-20' };
beforeEach(() => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() });
 vi.stubGlobal('document', { body: { classList: { add: vi.fn(), remove: vi.fn(), contains: () => false } } });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.unstubAllGlobals(); });
const button = (label: string, root = renderer.root) => root.findAllByType('button').find(n => n.props['aria-label'] === label || n.children.filter(c => typeof c === 'string').join('') === label)!;
async function mount(requestApi: ReturnType<typeof vi.fn>) {
 await act(async () => { renderer = create(<Provider store={createH5Store()}><MemoryRouter><AppOverlayProvider><AppOverlayHost /><PatchworkPage token="token" requestApi={requestApi as any} /></AppOverlayProvider></MemoryRouter></Provider>, { createNodeMock: e => e.type === 'canvas' ? { getContext: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 480 }) } : null }); });
 await act(async () => button('填充').props.onClick());
 await act(async () => button('打开布料列表').props.onClick());
 act(() => button('新增布料').props.onClick());
 act(() => dialog().find(node => node.type === 'input' && node.props.placeholder === '如：复古红碎花棉布').props.onChange({target:{value:'新布料'}}));
}
const dialog = () => renderer.root.findAll(n => n.props.role === 'dialog' && n.props['aria-label'] === '新增布料')[0];
const posts = (api: ReturnType<typeof vi.fn>) => api.mock.calls.filter(([url, init]) => url === '/fabrics' && init?.method === 'POST');

describe('editor new fabric inventory', () => {
 it('saves to warehouse first, records unknown stock and reuses its inventory identity', async () => {
  const api = vi.fn(async (_url, init) => init?.method === 'POST' ? { fabric } : { fabrics: [] });
  await mount(api);
  await act(async () => button('保存布料', dialog()).props.onClick());
  expect(posts(api)).toHaveLength(1);
  expect(JSON.parse(posts(api)[0][1].body)).toMatchObject({ stockMode: 'own', availableAreaMm2: null, widthMm: null, heightMm: null });
  await act(async () => button('打开布料列表').props.onClick());
  expect(renderer.root.findByType(FabricPicker).props.materials.some((m: any) => m.inventoryFabricId === fabric.id)).toBe(true);
 });
 it('keeps the draft on failure, blocks double submissions and allows retry', async () => {
  let reject!: (e: Error) => void;
  const api = vi.fn((_url, init) => init?.method === 'POST' ? new Promise((_r, rej) => { reject = rej; }) : Promise.resolve({ fabrics: [] }));
  await mount(api);
  let saving: Promise<unknown>;
  await act(async () => { saving = button('保存布料', dialog()).props.onClick(); });
  await act(async () => button('保存中…', dialog()).props.onClick());
  expect(posts(api)).toHaveLength(1);
  act(() => button('关闭布料表单', dialog()).props.onClick());
  expect(dialog()).toBeDefined();
  await act(async () => { reject(new Error('offline')); await saving; });
  expect(dialog()).toBeDefined();
  expect(renderer.root.findAllByProps({ role: 'alert' }).map(n => n.children.join('')).join('')).toContain('未保存到布料仓库');
  api.mockImplementation(async (_url, init) => init?.method === 'POST' ? { fabric } : { fabrics: [] });
  await act(async () => button('保存布料', dialog()).props.onClick());
  expect(posts(api)).toHaveLength(2);
 });
 it('keeps explicitly virtual materials only in the project', async () => {
  const api = vi.fn(async () => ({ fabrics: [] }));
  await mount(api);
  const local = dialog().findByProps({ 'aria-label': '仅用于本作品' });
  act(() => local.props.onChange({ target: { checked: true } }));
  await act(async () => button('保存布料', dialog()).props.onClick());
  expect(posts(api)).toHaveLength(0);
  await act(async () => button('打开布料列表').props.onClick());
  expect(renderer.root.findByType(FabricPicker).props.materials.some((m: any) => m.projectOnly)).toBe(true);
 });
 it('normal picking merges project fabrics, personal fabrics and builtins without duplicates', async () => {
  const api = vi.fn(async () => ({ fabrics: [fabric] }));
  await mount(api);
  act(() => button('关闭布料表单', dialog()).props.onClick());
  const picker = renderer.root.findByType(FabricPicker);
  expect(picker.findAllByType('button').filter(n => n.props['aria-label'] === '选择布料 新布料')).toHaveLength(1);
  expect(picker.findAllByType('button').filter(n => String(n.props['aria-label'] || '').startsWith('选择布料 '))).toHaveLength(16);
 });

 it('appends the next batch on upward scrolling and resets the batch for search', async () => {
  const own = Array.from({length:20},(_,i)=>({...fabric,id:'f'+i,name:'布料'+i}));
  const props = {materials:[],selectedId:'',editMode:false,query:'',warehouseFabrics:own,onQueryChange:vi.fn(),onSelect:vi.fn(),onEditMaterial:vi.fn(),onEditModeChange:vi.fn(),onCreate:vi.fn(),onClose:vi.fn()};
  await act(async()=>{renderer=create(<FabricPicker {...props}/>);});
  const count=()=>renderer.root.findAllByType('button').filter(n=>String(n.props['aria-label']||'').startsWith('选择布料 ')).length;
  expect(count()).toBe(16);
  act(()=>renderer.root.findByProps({className:'pw-fab-scroll'}).props.onScroll({currentTarget:{clientHeight:300,scrollHeight:700,scrollTop:399}}));
  expect(count()).toBe(32);
  await act(async()=>renderer.update(<FabricPicker {...props} query="奶油"/>));
  expect(count()).toBe(3);
 });

 it('keeps the same fabric identities and loaded batch when toggling edit mode', async () => {
  const own = Array.from({length:20},(_,i)=>({...fabric,id:'f'+i,name:'布料'+i}));
  const props={materials:[{id:'legacy',name:'旧版布料',color:'#aaa'}],selectedId:'',editMode:false,query:'',warehouseFabrics:own,onQueryChange:vi.fn(),onSelect:vi.fn(),onEditMaterial:vi.fn(),onEditModeChange:vi.fn(),onCreate:vi.fn(),onClose:vi.fn()};
  await act(async()=>{renderer=create(<FabricPicker {...props}/>);});
  act(()=>renderer.root.findByProps({className:'pw-fab-scroll'}).props.onScroll({currentTarget:{clientHeight:300,scrollHeight:700,scrollTop:399}}));
  const names=()=>renderer.root.findAllByProps({className:'pw-fab-card-name'}).map(n=>n.children.join(''));
  const before=names();expect(before).toHaveLength(32);
  await act(async()=>renderer.update(<FabricPicker {...props} editMode/>));
  expect(names()).toEqual(before);
  await act(async()=>renderer.update(<FabricPicker {...props}/>));expect(names()).toEqual(before);
 });

 it('loads the next page on an upward gesture even when the current page fits the viewport', async () => {
  const loadMore=vi.fn();const props={materials:[],selectedId:'',editMode:false,query:'',warehouseFabrics:[],onQueryChange:vi.fn(),onSelect:vi.fn(),onEditMaterial:vi.fn(),onEditModeChange:vi.fn(),onCreate:vi.fn(),onClose:vi.fn(),remoteCatalog:{hasMore:true,loading:false,error:false,ownedPresetIds:[],loadMore,retry:vi.fn()}};
  await act(async()=>{renderer=create(<FabricPicker {...props}/>);});
  const el={clientHeight:500,scrollHeight:500,scrollTop:0};
  const scroll=()=>renderer.root.findByProps({className:'pw-fab-scroll'});
  act(()=>scroll().props.onTouchStart({touches:[{clientY:400}]}));
  act(()=>scroll().props.onTouchEnd({changedTouches:[{clientY:250}],currentTarget:el}));
  act(()=>scroll().props.onWheel({deltaY:50,currentTarget:el}));
  expect(loadMore).toHaveBeenCalledTimes(1);
 });

 it('does not search for unfinished pinyin and keeps the committed Chinese query', async () => {
  const query=vi.fn();const props={materials:[],selectedId:'',editMode:false,query:'',onQueryChange:query,onSelect:vi.fn(),onEditMaterial:vi.fn(),onEditModeChange:vi.fn(),onCreate:vi.fn(),onClose:vi.fn()};
  await act(async()=>{renderer=create(<FabricPicker {...props}/>);});
  const input=()=>renderer.root.findByType('input');
  act(()=>input().props.onCompositionStart({currentTarget:{value:''}}));
  act(()=>input().props.onChange({currentTarget:{value:'suige'}}));
  expect(query).not.toHaveBeenCalled();expect(input().props.value).toBe('suige');
  await act(async()=>renderer.update(<FabricPicker {...props} editMode/>));
  expect(input().props.value).toBe('suige');
  act(()=>input().props.onCompositionEnd({currentTarget:{value:'碎格'}}));
  expect(query).toHaveBeenCalledWith('碎格');
 });

});
