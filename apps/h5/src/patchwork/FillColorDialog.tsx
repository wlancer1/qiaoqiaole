import {useEffect,useLayoutEffect,useRef,useState,useCallback} from 'react';
import {X} from 'lucide-react';
import {useAppOverlay} from '../app/overlays/AppOverlayContext';
import {isImeComposing} from '../shared/ime';
import {fillColors} from './fill';
export function FillColorDialog({color,onClose,onDone}:{color:string|null;onClose:()=>void;onDone:(color:string|null)=>void}){
 const {setOverlaySlot}=useAppOverlay();
 const [draft,setDraft]=useState(color);
 const ref=useRef<HTMLDivElement|null>(null);
 const close=useRef(onClose);close.current=onClose;
 const attach=useCallback((node:HTMLDivElement|null)=>{ref.current=node;node?.focus();},[]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const key=(e:KeyboardEvent)=>{
   if(isImeComposing(e))return;
   if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close.current();}
   if(e.key==='Tab'){
    const items=ref.current?.querySelectorAll<HTMLElement>('button,input');if(!items?.length)return;
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   }
  };
  window.addEventListener('keydown',key,true);
  return()=>{window.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus();};
 },[]);
 useLayoutEffect(()=>{
  setOverlaySlot('patchworkFill',<div className="pw-brush-backdrop" onClick={onClose} onTouchStart={e=>e.stopPropagation()}>
   <div className="pw-brush-sheet" role="dialog" aria-modal="true" aria-label="选择填充颜色" tabIndex={-1} ref={attach} onClick={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
    <header><strong>选择颜色</strong><button aria-label="关闭颜色选择" onClick={onClose}><X/></button></header>
    <div className="pw-brush-sheet-body"><section>
     <button className="patchwork-chip" aria-pressed={draft===null} onClick={()=>setDraft(null)}>无填充</button>
     <div className="pw-fill-color-grid">{fillColors.map(c=><button key={c} aria-label={'颜色 '+c} aria-pressed={draft===c} className={draft===c?'selected':''} style={{background:c}} onClick={()=>setDraft(c)}/>)}</div>
     <label className="pw-fill-custom">自定义颜色<input type="color" aria-label="自定义填充颜色" value={draft||'#dca1aa'} onChange={e=>setDraft(e.target.value)}/><span>{draft||'无填充'}</span></label>
    </section></div>
    <button className="pw-brush-done" onClick={()=>onDone(draft)}>完成</button>
   </div>
  </div>);
 });
 useLayoutEffect(()=>()=>setOverlaySlot('patchworkFill',null),[setOverlaySlot]);
 return null;
}
