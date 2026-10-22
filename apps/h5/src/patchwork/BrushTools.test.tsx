import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AppOverlayHost } from '../app/overlays/AppOverlayHost';
import { AppOverlayProvider } from '../app/overlays/AppOverlayContext';
import { createH5Store } from '../store/store';
import { PatchworkPage } from './PatchworkPage';
import { FabricPicker } from './FabricPicker';
import { FabricCreateDialog } from '../fabrics/FabricCreateDialog';
import { BrushSettingsDialog } from './BrushTools';
import { defaultShapePaint, defaultStitch } from './stitches';
import type { PatchworkProject } from './model';
const state=vi.hoisted(()=>({project:null as PatchworkProject|null}));
vi.mock('./canvas',async importOriginal=>({...await importOriginal<object>(),drawScene:(_c:unknown,p:PatchworkProject)=>{state.project=p;}}));
let renderer:ReactTestRenderer;
let listeners:Record<string,Function>;
const button=(name:string)=>renderer.root.findAllByType('button').find(b=>b.props['aria-label']===name||b.children.filter(c=>typeof c==='string').join('')===name)!;
const canvas=()=>renderer.root.findByType('canvas');
const event=(x:number,y:number)=>({pointerId:1,isPrimary:true,clientX:x,clientY:y,target:{setPointerCapture:vi.fn()}});
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);listeners={};state.project=null;
 vi.stubGlobal('window',{addEventListener:(n:string,f:Function)=>listeners[n]=f,removeEventListener:vi.fn(),dispatchEvent:vi.fn()});
 vi.stubGlobal('document',{body:{classList:{add:vi.fn(),remove:vi.fn(),contains:()=>false},style:{}}});
});
afterEach(()=>{if(renderer)act(()=>renderer.unmount());vi.unstubAllGlobals();});
async function mount(props: Parameters<typeof PatchworkPage>[0] = {}){await act(async()=>{renderer=create(<Provider store={createH5Store()}><MemoryRouter><AppOverlayProvider><AppOverlayHost/><PatchworkPage {...props}/></AppOverlayProvider></MemoryRouter></Provider>,{createNodeMock:e=>e.type==='canvas'?{getBoundingClientRect:()=>({left:0,top:0,width:360,height:480})}:null});});}
function draw(){act(()=>canvas().props.onPointerDown(event(100,150)));act(()=>canvas().props.onPointerMove(event(220,270)));act(()=>canvas().props.onPointerUp(event(220,270)));}
describe('compact brush workflow',()=>{
 it('draws a preset with two drag endpoints and keeps undo/redo as one gesture',async()=>{
  await mount();act(()=>button('画笔').props.onClick());act(()=>button('形状').props.onClick());act(()=>button('画笔矩形').props.onClick());draw();
  expect(state.project!.pieces).toHaveLength(1);expect(state.project!.pieces[0].points).toHaveLength(4);
  expect(state.project!.pieces[0].paint?.fill).toBe('solid');
  act(()=>button('撤销').props.onClick());expect(state.project!.pieces).toHaveLength(0);
  act(()=>button('重做').props.onClick());expect(state.project!.pieces).toHaveLength(1);
 });
 it('draws an open sewing path, updates quick color, and discards pointer cancellation',async()=>{
  await mount();act(()=>button('画笔').props.onClick());act(()=>button('缝纫线').props.onClick());act(()=>button('快捷线色 粉色').props.onClick());draw();
  expect(state.project!.pieces[0].stitch?.color).toBe('#d692a0');expect(state.project!.pieces[0].points).toHaveLength(2);
  act(()=>canvas().props.onPointerDown(event(140,200)));act(()=>canvas().props.onPointerMove(event(220,260)));act(()=>canvas().props.onPointerCancel(event(220,260)));
  expect(state.project!.pieces).toHaveLength(1);
  expect(renderer.root.findAll(n=>n.type==='button'&&n.children.join('')==='粗')).toHaveLength(0);
 });

 it('reapplies the same fabric to a solid shape from the quick swatch and properties picker',async()=>{
  await mount();act(()=>button('画笔').props.onClick());act(()=>button('形状').props.onClick());act(()=>button('画笔矩形').props.onClick());draw();
  const id=state.project!.pieces[0].materialId;
  act(()=>button('填布').props.onClick());
  const swatch=renderer.root.findAllByType('button').find(b=>String(b.props['aria-label']).startsWith('布料 '+id+' '))!;
  act(()=>swatch.props.onClick());
  expect(state.project!.pieces[0].paint?.fill).toBe('fabric');
  act(()=>button('撤销').props.onClick());
  act(()=>button('选择').props.onClick());act(()=>canvas().props.onPointerDown(event(160,220)));act(()=>canvas().props.onPointerUp(event(160,220)));
  act(()=>button('属性').props.onClick());act(()=>button('选择布片布料').props.onClick());
  act(()=>renderer.root.findByType(FabricPicker).props.onSelect(id));
  expect(state.project!.pieces[0].paint?.fill).toBe('fabric');
 });
 it.each(['shape','stitch'] as const)('applies a new fabric to selected fabric shapes without refilling sewing paths (%s)',async mode=>{
  const api=vi.fn(async (_url:string,init?:RequestInit)=>init?.method==='POST'?{fabric:{id:'created-inventory',name:'新布料',color:'#123456'}}:{fabrics:[]});
  await mount({token:'token',requestApi:api as any});
  act(()=>button('画笔').props.onClick());act(()=>button(mode==='shape'?'形状':'缝纫线').props.onClick());if(mode==='shape')act(()=>button('画笔矩形').props.onClick());draw();
  act(()=>button('填布').props.onClick());act(()=>button('打开布料列表').props.onClick());act(()=>button('新增布料').props.onClick());
  await act(async()=>renderer.root.findByType(FabricCreateDialog).props.onSave({projectOnly:false,payload:{name:'新布料',color:'#123456',category:'',image:null,sampleWidthMm:null,stockMode:'own',widthMm:null,heightMm:null,quantity:1,availableAreaMm2:null,note:null}}));
  const p=state.project!.pieces[0];
  if(mode==='shape'){expect(state.project!.materials.find(m=>m.id===p.materialId)?.inventoryFabricId).toBe('created-inventory');expect(p.paint?.fill).toBe('fabric');}
  else{expect(p.materialId).toBe('');expect(p.stitch).toEqual(defaultStitch);}
 });


 it('rolls back a resize that would silently remove the attached sewing outline',async()=>{
  await mount();act(()=>button('画笔').props.onClick());act(()=>button('形状').props.onClick());act(()=>button('画笔矩形').props.onClick());draw();
  act(()=>button('选择').props.onClick());act(()=>button('属性').props.onClick());act(()=>button('设置布片周边缝线').props.onClick());
  act(()=>renderer.root.findByType(BrushSettingsDialog).props.onDone({shape:null,paint:{...defaultShapePaint},stitch:{...defaultStitch},outline:{...defaultStitch,insetMm:2}}));
  const original=JSON.parse(JSON.stringify(state.project!.pieces[0].points));
  const width=renderer.root.findAllByType('label').find(l=>l.findAllByType('span').some(n=>n.children.join('')==='宽 (mm)'))!.findByType('input');
  act(()=>width.props.onChange({target:{value:'1'}}));
  act(()=>renderer.root.findAllByType('label').find(l=>l.findAllByType('span').some(n=>n.children.join('')==='宽 (mm)'))!.findByType('input').props.onBlur());
  expect(state.project!.pieces[0].points).toEqual(original);
  expect(state.project!.pieces[0].outlineStitch?.insetMm).toBe(2);
 });
 it('keeps Shift+Tab inside the settings dialog when its container has initial focus',async()=>{
  const first={focus:vi.fn()},last={focus:vi.fn()};
  const node={focus:vi.fn(),querySelectorAll:()=>[first,last]};
  await act(async()=>{renderer=create(<Provider store={createH5Store()}><MemoryRouter><AppOverlayProvider><AppOverlayHost/><BrushSettingsDialog kind="shape" initial={{shape:null,paint:{...defaultShapePaint},stitch:{...defaultStitch},outline:null}} onClose={vi.fn()} onDone={vi.fn()} onFabric={vi.fn()}/></AppOverlayProvider></MemoryRouter></Provider>,{createNodeMock:e=>e.props.role==='dialog'?node:null});});
  (document as any).activeElement=node;
  const preventDefault=vi.fn();
  listeners.keydown({key:'Tab',shiftKey:true,preventDefault});
  expect(preventDefault).toHaveBeenCalledOnce();expect(last.focus).toHaveBeenCalledOnce();
 });
 it('uses durable overlay, isolates backdrop events and keeps settings draft until completed',async()=>{
  const done=vi.fn(),close=vi.fn();
  await act(async()=>{renderer=create(<Provider store={createH5Store()}><MemoryRouter><AppOverlayProvider><AppOverlayHost/><BrushSettingsDialog kind="stitch" initial={{shape:null,paint:{...defaultShapePaint},stitch:{...defaultStitch},outline:null}} onClose={close} onDone={done} onFabric={vi.fn()}/></AppOverlayProvider></MemoryRouter></Provider>);});
  expect(renderer.root.findByProps({'data-overlay-slot':'patchworkBrush'})).toBeDefined();
  act(()=>button('粗').props.onClick());expect(done).not.toHaveBeenCalled();
  act(()=>button('完成').props.onClick());expect(done.mock.calls[0][0].stitch.widthMm).toBe(1);
  const stop=vi.fn();renderer.root.findByProps({className:'pw-brush-backdrop'}).props.onTouchStart({stopPropagation:stop});expect(stop).toHaveBeenCalledOnce();
  listeners.keydown({key:'Escape',isComposing:true});expect(close).not.toHaveBeenCalled();
  listeners.keydown({key:'Escape',preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()});expect(close).toHaveBeenCalledOnce();
 });
});
