import { act,create,type ReactTestRenderer } from 'react-test-renderer';
import { Provider } from 'react-redux';
import { afterEach,expect,it,vi } from 'vitest';
import { createH5Store } from '../store/store';
import { AppOverlayProvider,useAppOverlayState } from '../app/overlays/AppOverlayContext';
import { PatchworkCreateDialog } from './PatchworkCreateDialog';
let renderer:ReactTestRenderer;
afterEach(()=>{if(renderer)act(()=>renderer.unmount());vi.unstubAllGlobals();});
function Host(){const {slots}=useAppOverlayState();return <>{slots.patchworkCreate}</>;}
it('owns its overlay, isolates clicks, closes the nested picker first and confirms actual dimensions',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const listeners=new Map<string,Function>(),cancel=vi.fn(),confirm=vi.fn();
 vi.stubGlobal('window',{addEventListener:(name:string,fn:Function)=>listeners.set(name,fn),removeEventListener:vi.fn()});
 await act(async()=>{renderer=create(<Provider store={createH5Store()}><AppOverlayProvider><PatchworkCreateDialog onCancel={cancel} onConfirm={confirm}/><Host/></AppOverlayProvider></Provider>);});
 const button=(label:string)=>renderer.root.findAllByType('button').find(n=>n.props['aria-label']===label||n.children.join('')===label)!;
 const stop=vi.fn();act(()=>renderer.root.findByProps({role:'dialog','aria-label':'新建拼布画布'}).props.onClick({stopPropagation:stop}));
 expect(stop).toHaveBeenCalled();expect(cancel).not.toHaveBeenCalled();
 act(()=>button('选择底布材料').props.onClick());
 const esc=()=>listeners.get('keydown')!({key:'Escape',preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()});
 act(esc);expect(cancel).not.toHaveBeenCalled();expect(renderer.root.findAllByProps({'aria-label':'选择底布'})).toHaveLength(0);
 act(()=>button('创建画布').props.onClick());expect(confirm).toHaveBeenCalledWith({widthMm:400,heightMm:400,baseFabricId:''});
 act(esc);expect(cancel).toHaveBeenCalledTimes(1);
 act(()=>renderer.root.findByProps({role:'presentation'}).props.onClick());expect(cancel).toHaveBeenCalledTimes(2);
});
