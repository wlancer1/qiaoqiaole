import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppOverlayProvider, useAppOverlayState } from '../app/overlays/AppOverlayContext';
import { FabricImageCropper } from './FabricImageCropper';
import { FabricCreateDialog } from './FabricCreateDialog';
import {
 clampFabricCrop,
 fabricCropPixels,
 cropFabricPhoto,
 fitFabricCropAspect,
 resizeFabricCropRect,
} from './fabricPhoto';
let renderer: ReactTestRenderer | undefined;
afterEach(()=>{if(renderer)act(()=>renderer!.unmount());renderer=undefined;vi.unstubAllGlobals();});
function Host(){const {slots}=useAppOverlayState();return <>{slots.inventory}</>;}
const button=(label:string)=>renderer!.root.findAllByType('button').find(n=>n.children.filter(c=>typeof c==='string').join('')===label||n.props['aria-label']===label)!;
describe('shared fabric create dialog',()=>{
 it('uses the app overlay, isolates clicks, cancels without saving and supports Escape',async()=>{
  const listeners=new Map<string,Function>();const close=vi.fn(),save=vi.fn();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('window',{addEventListener:(name:string,fn:Function)=>listeners.set(name,fn),removeEventListener:vi.fn()});
  await act(async()=>{renderer=create(<AppOverlayProvider><FabricCreateDialog onClose={close} onSave={save}/><Host/></AppOverlayProvider>);});
  const dialog=renderer!.root.findByProps({role:'dialog','aria-label':'新增布料'});const stop=vi.fn();
  act(()=>dialog.props.onClick({stopPropagation:stop}));expect(stop).toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
  act(()=>button('关闭布料表单').props.onClick());expect(close).toHaveBeenCalledTimes(1);expect(save).not.toHaveBeenCalled();
  act(()=>listeners.get('keydown')!({key:'Escape',isComposing:true,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()}));expect(close).toHaveBeenCalledTimes(1);
  const prevent=vi.fn();act(()=>listeners.get('keydown')!({key:'Escape',preventDefault:prevent,stopImmediatePropagation:vi.fn()}));expect(prevent).toHaveBeenCalled();expect(close).toHaveBeenCalledTimes(2);
  act(()=>renderer!.root.findByProps({role:'presentation'}).props.onClick());expect(close).toHaveBeenCalledTimes(3);
  vi.stubGlobal('document',{querySelector:()=>({})});
  act(()=>listeners.get('keydown')!({key:'Escape',preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()}));expect(close).toHaveBeenCalledTimes(3);
 });

 it('keeps Chinese names and notes intact, and treats Escape as candidate input even without isComposing', async()=>{
  const listeners=new Map<string,Function>(),close=vi.fn(),save=vi.fn(async()=>{});
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('window',{addEventListener:(name:string,fn:Function)=>listeners.set(name,fn),removeEventListener:vi.fn()});
  await act(async()=>{renderer=create(<AppOverlayProvider><FabricCreateDialog onClose={close} onSave={save}/><Host/></AppOverlayProvider>);});
  const name=()=>renderer!.root.find(node=>node.type==='input'&&node.props.placeholder==='如：复古红碎花棉布');
  const target={value:''};
  act(()=>name().props.onCompositionStart({currentTarget:target}));
  target.value='suige';act(()=>name().props.onChange({currentTarget:target}));
  const prevent=vi.fn();act(()=>listeners.get('keydown')!({key:'Escape',target,isComposing:false,preventDefault:prevent}));
  expect(close).not.toHaveBeenCalled();expect(prevent).not.toHaveBeenCalled();
  expect(name().props.value).toBe('suige');
  target.value='碎格棉布';act(()=>name().props.onCompositionEnd({currentTarget:target}));
  const note=()=>renderer!.root.find(node=>node.type==='input'&&node.props.placeholder==='如：宜家购入，做裙子剩的');
  act(()=>note().props.onCompositionStart({currentTarget:{value:''}}));
  act(()=>note().props.onChange({currentTarget:{value:'ce shi'}}));
  act(()=>note().props.onCompositionEnd({currentTarget:{value:'测试备注'}}));
  await act(async()=>button('保存布料').props.onClick());
  expect(save).toHaveBeenCalledWith(expect.objectContaining({payload:expect.objectContaining({name:'碎格棉布',note:'测试备注'})}));
 });
 it('defaults unknown stock, validates dimensions and emits the same payload for both entry points',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});const save=vi.fn(async()=>{});
  await act(async()=>{renderer=create(<AppOverlayProvider><FabricCreateDialog onClose={vi.fn()} onSave={save}/><Host/></AppOverlayProvider>);});
  act(()=>renderer!.root.find(node => node.type === 'input' && node.props.placeholder === '如：复古红碎花棉布').props.onChange({target:{value:'测试布料'}}));
  expect(renderer!.root.findAllByType('select')).toHaveLength(0);
  await act(async()=>{await button('保存布料').props.onClick();});
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({payload:expect.objectContaining({stockMode:'own',availableAreaMm2:null,widthMm:null,heightMm:null})}));
  act(()=>renderer!.root.findByProps({'aria-label':'布料宽度'}).props.onChange({target:{value:'40'}}));
  await act(async()=>{await button('保存布料').props.onClick();});expect(save).toHaveBeenCalledTimes(1);
  act(()=>{renderer!.root.findByProps({'aria-label':'布料宽度'}).props.onChange({target:{value:'40'}});renderer!.root.findByProps({'aria-label':'布料高度'}).props.onChange({target:{value:'30'}});});
  await act(async()=>{await button('保存布料').props.onClick();});
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({payload:expect.objectContaining({stockMode:'size',widthMm:400,heightMm:300,availableAreaMm2:120000})}));
 });
});
describe('fabric photo crop',()=>{
 it('converts the actual normalized selection into source pixels rather than saving the whole image',()=>{
  expect(fabricCropPixels(800,400,{x:.25,y:.25,w:.5,h:.5})).toEqual({x:200,y:100,width:400,height:200});
  expect(clampFabricCrop({x:-1,y:5,w:2,h:0})).toEqual({x:0,y:.98,w:1,h:.02});
 });
 it('fits crop rectangle to target physical aspect ratio and prevents sliver collapse during resize',()=>{
  const squareOnTall = fitFabricCropAspect({ x: .06, y: .06, w: .88, h: .88 }, 1200, 2400, 1);
  const px = fabricCropPixels(1200, 2400, squareOnTall);
  expect(px.width).toBe(px.height);
  const resized = resizeFabricCropRect(squareOnTall, 'se', -.95, -.95, {
   imageWidth: 1200,
   imageHeight: 2400,
   lockPixelAspect: 1,
   minSize: .12,
  });
  const resizedPx = fabricCropPixels(1200, 2400, resized);
  expect(resizedPx.width).toBe(resizedPx.height);
  expect(resizedPx.width).toBeGreaterThanOrEqual(144);
 });
 it('draws only the selected source rectangle and encodes the cropped image',()=>{
  const drawImage=vi.fn();const canvas={width:0,height:0,getContext:()=>({fillStyle:'',fillRect:vi.fn(),drawImage,getImageData:()=>({data:new Uint8ClampedArray([255,0,0,255])})}),toDataURL:()=> 'data:image/jpeg;base64,cropped'};
  vi.stubGlobal('document',{createElement:()=>canvas});const image={naturalWidth:800,naturalHeight:400} as HTMLImageElement;
  const result=cropFabricPhoto(image,{x:.25,y:.25,w:.5,h:.5});
  expect(drawImage).toHaveBeenCalledWith(image,200,100,400,200,0,0,400,200);
  expect(canvas.width).toBe(400);expect(canvas.height).toBe(200);expect(result.image).toContain('cropped');
 });
});

describe('crop scale calibration',()=>{
 it('defaults the initial selection to 10cm and keeps its scale when selecting the full image',()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const apply=vi.fn();
  const canvas={width:0,height:0,getContext:()=>({fillRect:vi.fn(),drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray([255,0,0,255])})}),toDataURL:()=> 'data:image/jpeg;base64,crop'};
  vi.stubGlobal('document',{createElement:()=>canvas});
  act(()=>{renderer=create(<FabricImageCropper image={{naturalWidth:800,naturalHeight:400} as HTMLImageElement} url="test" onApply={apply} onCancel={vi.fn()}/>);});
  act(()=>button('确认截取').props.onClick());
  expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({widthMm:100,heightMm:50,pixelWidth:704,pixelHeight:352}),'100');
  act(()=>button('选择全图').props.onClick());
  act(()=>button('确认截取').props.onClick());
  expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({widthMm:113.636,heightMm:56.818,pixelWidth:800,pixelHeight:400}),'113.636');
 });

 it('shrinking a square selection updates the badge and saved dimensions, moving it preserves scale',()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const apply=vi.fn();
  const canvas={width:0,height:0,getContext:()=>({fillRect:vi.fn(),drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray([255,0,0,255])})}),toDataURL:()=> 'data:image/jpeg;base64,crop'};
  vi.stubGlobal('document',{createElement:()=>canvas});
  act(()=>{renderer=create(<FabricImageCropper image={{naturalWidth:800,naturalHeight:800} as HTMLImageElement} url="test" defaultAspect="1:1" onApply={apply} onCancel={vi.fn()}/>);});
  const badge=()=>renderer!.root.findByProps({className:'fabric-crop-live-badge'}).children.join('');
  expect(badge()).toBe('10 × 10 cm');
  const target={getBoundingClientRect:()=>({left:0,top:0,width:1000,height:1000}),setPointerCapture:vi.fn()};
  const pointer=(x:number,y:number,handle?:string)=>({pointerId:1,clientX:x,clientY:y,currentTarget:target,target:{dataset:{handle},closest:()=>true},preventDefault:vi.fn()});
  const crop=()=>renderer!.root.findByProps({className:'fabric-crop-canvas'});
  act(()=>crop().props.onPointerDown(pointer(940,940,'se')));
  act(()=>crop().props.onPointerMove(pointer(500,500)));
  act(()=>crop().props.onPointerUp({pointerId:1}));
  expect(badge()).toBe('5 × 5 cm');
  act(()=>crop().props.onPointerDown(pointer(280,280)));
  act(()=>crop().props.onPointerMove(pointer(380,380)));
  act(()=>crop().props.onPointerUp({pointerId:1}));
  expect(badge()).toBe('5 × 5 cm');
  act(()=>button('确认截取').props.onClick());
  expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({widthMm:50,heightMm:50,pixelWidth:352,pixelHeight:352}),'50');
 });

 it('zooming the image updates the covered physical dimensions and resetting restores them',()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const apply=vi.fn();
  const canvas={width:0,height:0,getContext:()=>({fillRect:vi.fn(),drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray([255,0,0,255])})}),toDataURL:()=> 'data:image/jpeg;base64,crop'};
  vi.stubGlobal('document',{createElement:()=>canvas});
  act(()=>{renderer=create(<FabricImageCropper image={{naturalWidth:800,naturalHeight:800} as HTMLImageElement} url="test" initialWidthMm="200" onApply={apply} onCancel={vi.fn()}/>);});
  act(()=>button('放大底图').props.onClick());
  expect(renderer!.root.findByProps({className:'fabric-crop-live-badge'}).children.join('')).toBe('16 × 16 cm');
  act(()=>button('确认截取').props.onClick());
  expect(apply.mock.lastCall![0].widthMm).toBeCloseTo(160,0);
  act(()=>button('还原底图大小').props.onClick());
  act(()=>button('确认截取').props.onClick());
  expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({widthMm:200,heightMm:200}),'200');
 });

 it('reopening a saved crop uses its saved width as calibration without shrinking twice',()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  act(()=>{renderer=create(<FabricImageCropper image={{naturalWidth:800,naturalHeight:800} as HTMLImageElement} url="test" initialRect={{x:.1,y:.1,w:.44,h:.44}} initialWidthMm="50" onApply={vi.fn()} onCancel={vi.fn()}/>);});
  expect(renderer!.root.findByProps({className:'fabric-crop-live-badge'}).children.join('')).toBe('5 × 5 cm');
  act(()=>button('放大底图').props.onClick());
  expect(renderer!.root.findByProps({className:'fabric-crop-live-badge'}).children.join('')).toBe('4 × 4 cm');
 });

 it('keeps an existing pattern width and does not distort dimensions on portrait screenshots',()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const apply=vi.fn();
  const canvas={width:0,height:0,getContext:()=>({fillRect:vi.fn(),drawImage:vi.fn(),getImageData:()=>({data:new Uint8ClampedArray([255,0,0,255])})}),toDataURL:()=> 'data:image/jpeg;base64,crop'};
  vi.stubGlobal('document',{createElement:()=>canvas});
  act(()=>{renderer=create(<FabricImageCropper image={{naturalWidth:1200,naturalHeight:2400} as HTMLImageElement} url="test" defaultAspect="1:1" initialWidthMm="320" onApply={apply} onCancel={vi.fn()}/>);});
  act(()=>button('确认截取').props.onClick());
  const applied = apply.mock.calls[apply.mock.calls.length - 1];
  expect(applied[0].widthMm).toBe(320);
  expect(applied[0].heightMm).toBe(320);
  expect(applied[0].pixelWidth).toBe(applied[0].pixelHeight);
  expect(applied[1]).toBe('320');
 });

 it('supports zooming and resetting base image scale for inspecting fine pattern details', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const canvas = { width: 0, height: 0, getContext: () => ({ fillRect: vi.fn(), drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 255]) }) }), toDataURL: () => 'data:image/jpeg;base64,crop' };
  vi.stubGlobal('document', { createElement: () => canvas });
  act(() => {
   renderer = create(<FabricImageCropper image={{ naturalWidth: 800, naturalHeight: 800 } as HTMLImageElement} url="test" onApply={vi.fn()} onCancel={vi.fn()} />);
  });
  const zoomInBtn = renderer!.root.findByProps({ 'aria-label': '放大底图' });
  const zoomPctBtn = renderer!.root.findByProps({ 'aria-label': '切换缩放比例' });
  expect(zoomPctBtn.children.join('')).toBe('100%');

  act(() => zoomInBtn.props.onClick());
  expect(zoomPctBtn.children.join('')).toBe('125%');

  const resetBtn = renderer!.root.findByProps({ 'aria-label': '还原底图大小' });
  act(() => resetBtn.props.onClick());
  expect(zoomPctBtn.children.join('')).toBe('100%');

  act(() => zoomPctBtn.props.onClick());
  expect(zoomPctBtn.children.join('')).toBe('150%');
 });
});
