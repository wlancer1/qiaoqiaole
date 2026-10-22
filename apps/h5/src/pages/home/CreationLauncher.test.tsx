import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { AppOverlayProvider, useAppOverlayState } from '../../app/overlays/AppOverlayContext';
import { CreationLauncher } from './CreationLauncher';

function Host(){const {slots}=useAppOverlayState();return <>{slots.creationMenu}</>;}
afterEach(()=>vi.unstubAllGlobals());
it('opens in the shared host, blocks panel clicks, closes, and routes both creation choices',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('document',{activeElement:null,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 vi.stubGlobal('window',{addEventListener:vi.fn(),removeEventListener:vi.fn()});
 const bead=vi.fn(),fabric=vi.fn();let tree:ReturnType<typeof create>;
 await act(async()=>{tree=create(<AppOverlayProvider><CreationLauncher onBead={bead} onFabric={fabric}/><Host/></AppOverlayProvider>);});
 const open=async()=>{await act(async()=>tree.root.findByProps({'aria-label':'创建'}).props.onClick());};
 await open();
 const stop=vi.fn();tree!.root.findByProps({role:'dialog'}).props.onClick({stopPropagation:stop});expect(stop).toHaveBeenCalledOnce();
 expect(bead).not.toHaveBeenCalled();
 await act(async()=>tree.root.findByProps({'aria-label':'关闭创作菜单'}).props.onClick());
 expect(tree!.root.findAllByProps({role:'dialog'})).toHaveLength(0);
 await open();await act(async()=>tree.root.findByProps({className:'creation-menu-backdrop'}).props.onClick());
 expect(tree!.root.findAllByProps({role:'dialog'})).toHaveLength(0);
 for(const index of [0,1]){
  await open();const options=tree!.root.findByProps({className:'creation-menu-options'}).findAllByType('button');
  await act(async()=>options[index].props.onClick());
  expect(tree!.root.findAllByProps({role:'dialog'})).toHaveLength(0);
 }
 expect(bead).toHaveBeenCalledOnce();expect(fabric).toHaveBeenCalledOnce();
 await act(async()=>tree.unmount());
});
