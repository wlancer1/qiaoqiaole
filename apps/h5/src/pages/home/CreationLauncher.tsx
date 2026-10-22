import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Icon } from '../../shared/h5Icons';
import { useAppOverlay } from '../../app/overlays/AppOverlayContext';
import './creation-launcher.css';

const colors=['#4b89ff','#ff7497','#ffc44c'];
function CreationIcon({fabric=false}:{fabric?:boolean}) {
  return <svg viewBox="0 0 80 80" aria-hidden="true">
    {fabric ? ['#ff7497','#ffc44c','#53c8a4','#4b89ff'].map((color,i)=><g key={color}>
      <rect x={4+i%2*38} y={4+Math.floor(i/2)*38} width="34" height="34" rx="9" fill={color}/>
      <rect x={10+i%2*38} y={10+Math.floor(i/2)*38} width="22" height="22" rx="3" fill="none" stroke="white" strokeWidth="2" strokeDasharray="3 3"/>
    </g>) : Array.from({length:9},(_,i)=><g key={i}>
      <circle cx={14+i%3*26} cy={14+Math.floor(i/3)*26} r="12" fill={colors[(i%3+Math.floor(i/3))%3]}/>
      <circle cx={14+i%3*26} cy={14+Math.floor(i/3)*26} r="4" fill="white"/>
    </g>)}
  </svg>;
}

export function CreationMenu({onClose,onBead,onFabric}:{onClose:()=>void;onBead:()=>void;onFabric:()=>void}) {
  const {setOverlaySlot}=useAppOverlay();
  const panel=useRef<HTMLDivElement>(null);
  const close=useRef(onClose);close.current=onClose;
  const attachPanel=useCallback((node:HTMLDivElement|null)=>{
    panel.current=node;
    node?.querySelector<HTMLButtonElement>('button')?.focus();
  },[]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const key=(e:KeyboardEvent)=>{
      if(e.isComposing||e.keyCode===229)return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();}
      if(e.key==='Tab'){
        const buttons=panel.current?.querySelectorAll<HTMLButtonElement>('button');
        if(!buttons?.length)return;
        const first=buttons[0],last=buttons[buttons.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    const back=()=>close.current();
    document.addEventListener('keydown',key,true);window.addEventListener('popstate',back);
    return ()=>{document.removeEventListener('keydown',key,true);window.removeEventListener('popstate',back);if(previous?.isConnected)previous.focus();};
  },[]);
  useLayoutEffect(()=>{
    setOverlaySlot('creationMenu',<div className="creation-menu-backdrop" onClick={onClose} onTouchStart={e=>e.stopPropagation()}>
      <div className="creation-menu" role="dialog" aria-modal="true" aria-label="选择创作类型" ref={attachPanel} onClick={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
        <div className="creation-menu-options">
          <button type="button" onClick={()=>{onClose();onBead();}}>
            <span className="creation-menu-circle"><CreationIcon/></span>
            <strong>拼豆</strong><small>像素变成小作品</small>
          </button>
          <button type="button" onClick={()=>{onClose();onFabric();}}>
            <span className="creation-menu-circle"><CreationIcon fabric/></span>
            <strong>拼布</strong><small>拼出布料的灵感</small>
          </button>
        </div>
        <button type="button" className="creation-menu-close" aria-label="关闭创作菜单" onClick={onClose}><X/></button>
      </div>
    </div>);
  });
  useLayoutEffect(()=>()=>setOverlaySlot('creationMenu',null),[setOverlaySlot]);
  return null;
}

export function CreationLauncher({onBead,onFabric}:{onBead:()=>void;onFabric:()=>void}) {
  const [open,setOpen]=useState(false);
  return <><button className="plus-tab" aria-label="创建" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><Icon name="plus"/></button>
    {open&&<CreationMenu onClose={()=>setOpen(false)} onBead={onBead} onFabric={onFabric}/>}</>;
}
