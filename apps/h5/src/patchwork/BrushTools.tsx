import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, X } from 'lucide-react';
import { useAppOverlay } from '../app/overlays/AppOverlayContext';
import { useBodyScrollLock } from '../app/overlays/useBodyScrollLock';
import { isImeComposing } from '../shared/ime';
import { pointBounds, type Material } from './model';
import { shapeChoices, type ShapeChoice } from './shapeLibrary';
import { defaultStitch, stitchNames, threadColors, stitchSegments, type ShapePaint, type StitchStyle, type OutlineStitch } from './stitches';
import './brush-tools.css';

export type BrushMode = 'shape' | 'stitch';
const allShapes = shapeChoices('base', []);
export const quickShapes = ['rectangle','oval','triangle','hexagon','star'].map(id => allShapes.find(s => s.id === id)!);
export function brushShapeName(shape: ShapeChoice | null) { return shape?.id === 'rectangle' ? '矩形' : shape?.id === 'oval' ? '椭圆' : shape?.name || '自由绘制'; }
function ShapeIcon({ shape }: { shape: ShapeChoice | null }) {
  if (!shape) return <Pencil aria-hidden="true" />;
  const b=pointBounds(shape.polygons.flat()), scale=22/Math.max(b.width,b.height,1);
  return <svg viewBox="0 0 28 28" aria-hidden="true">{shape.polygons.map((p,i)=><polygon key={i} points={p.map(p=>`${3+(p.x-b.x)*scale},${3+(p.y-b.y)*scale}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>)}</svg>;
}
function StitchSample({ style }: { style: StitchStyle }) {
  return <svg viewBox="0 0 70 20" aria-hidden="true">{stitchSegments([{x:2,y:8},{x:68,y:8}],{...style,lengthMm:style.lengthMm*2,gapMm:style.gapMm*2}).map((pts,i)=><polyline key={i} points={pts.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={style.color} strokeWidth={Math.max(1,style.widthMm*2)} strokeLinecap="round"/>)}</svg>;
}
function Palette({ color, onChange }: { color:string; onChange:(c:string)=>void }) {
  return <div className="pw-thread-palette">{threadColors.map((c,i)=><button type="button" key={c} aria-label={`线色 ${['米白','深灰','粉色','绿色','蓝色'][i]}`} aria-pressed={color===c} className={`pw-thread-color${color===c?' active':''}`} style={{background:c}} onClick={()=>onChange(c)}/>)}<label className="pw-custom-color" title="自定义颜色"><input type="color" aria-label="自定义颜色" value={color} onChange={e=>onChange(e.target.value)}/><span>＋</span></label></div>;
}
export function BrushQuickBar({ mode, shape, stitch, onShape, onStitch, onMore }: {
  mode:BrushMode; shape:ShapeChoice|null; stitch:StitchStyle; onShape:(s:ShapeChoice|null)=>void; onStitch:(s:StitchStyle)=>void; onMore:()=>void;
}) {
  return <footer className="pw-brush-quickbar" aria-label={mode==='shape'?'形状快捷栏':'缝纫线快捷栏'}>
    {mode==='shape'?<>
      <button className={`pw-free-shape${!shape?' active':''}`} aria-pressed={!shape} onClick={()=>onShape(null)}><Pencil/><span>自由</span></button>
      <div className="pw-shape-quick-items">{quickShapes.map(s=><button key={s.id} aria-label={`画笔${brushShapeName(s)}`} aria-pressed={shape?.id===s.id} className={shape?.id===s.id?'active':''} onClick={()=>onShape(s)}><ShapeIcon shape={s}/><span>{brushShapeName(s)}</span></button>)}</div>
    </>:<>
      <label className="pw-stitch-kind"><select aria-label="快捷针法" value={stitch.kind} onChange={e=>onStitch({...stitch,kind:e.target.value as StitchStyle['kind']})}>{Object.entries(stitchNames).map(([k,n])=><option value={k} key={k}>{n}</option>)}</select><ChevronDown/></label>
      <div className="pw-thread-quick-colors">{threadColors.map((c,i)=><button key={c} className={`pw-thread-color${stitch.color===c?' active':''}`} style={{background:c}} aria-label={`快捷线色 ${['米白','深灰','粉色','绿色','蓝色'][i]}`} aria-pressed={stitch.color===c} onClick={()=>onStitch({...stitch,color:c})}/>)}</div>
    </>}
    <button className="pw-brush-more" aria-label={mode==='shape'?'更多形状设置':'更多缝纫线设置'} onClick={onMore}><MoreHorizontal/><span>更多</span></button>
  </footer>;
}
export type BrushSettingsValue = { shape:ShapeChoice|null; paint:ShapePaint; stitch:StitchStyle; outline:OutlineStitch|null };
export function BrushSettingsDialog({ kind, initial, material, onClose, onDone, onFabric }: {
  kind:'shape'|'stitch'|'outline'; initial:BrushSettingsValue; material?:Material; onClose:()=>void; onDone:(v:BrushSettingsValue)=>void; onFabric:(v:BrushSettingsValue)=>void;
}) {
  const {setOverlaySlot}=useAppOverlay();
  useBodyScrollLock(true);
  const [value,setValue]=useState(initial);
  const [library,setLibrary]=useState(false);
  const [limit,setLimit]=useState(16);
  const [borderMore,setBorderMore]=useState(false);
  const [error,setError]=useState('');
  const dialogRef=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose); closeRef.current=onClose;
  const style=kind==='outline'?(value.outline||{...defaultStitch,insetMm:2}):value.stitch;
  const updateStitch=(patch:Partial<StitchStyle & {insetMm:number}>)=>setValue(v=>kind==='outline'?{...v,outline:{...(v.outline||{...defaultStitch,insetMm:2}),...patch}}:{...v,stitch:{...v.stitch,...patch}});
  const paint=(patch:Partial<ShapePaint>)=>setValue(v=>({...v,paint:{...v.paint,...patch}}));
  useEffect(()=>{
    const old=document.activeElement as HTMLElement|null;
    dialogRef.current?.focus?.();
    const key=(e:KeyboardEvent)=>{
      if(isImeComposing(e))return;
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeRef.current();}
      if(e.key==='Tab'){
        const nodes=dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]');
        if(!nodes?.length)return;
        const first=nodes[0],last=nodes[nodes.length-1];
        if(document.activeElement===dialogRef.current){e.preventDefault();(e.shiftKey?last:first).focus();}
        else if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    window.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('keydown',key,true);old?.focus?.();};
  },[]);
  const title=kind==='shape'?'形状设置':kind==='outline'?'布片周边缝线':'缝纫线设置';
  const modal=<div className="pw-brush-backdrop" onClick={onClose} onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
    <div ref={dialogRef} className="pw-brush-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onClick={e=>e.stopPropagation()}>
      <header><strong>{title}</strong><button aria-label={`关闭${title}`} onClick={onClose}><X/></button></header>
      <div className="pw-brush-sheet-body">
      {kind==='shape'?<>
        <div className="pw-brush-shape-types">{[null,...quickShapes.filter(s=>s.id!=='triangle')].map((s,i)=><button key={s?.id||'free'} className={value.shape?.id===s?.id?'active':''} aria-pressed={value.shape?.id===s?.id} onClick={()=>setValue(v=>({...v,shape:s}))}><ShapeIcon shape={s}/><span>{brushShapeName(s)}</span></button>)}<button className={library?'active':''} onClick={()=>setLibrary(!library)}><MoreHorizontal/><span>更多形状</span></button></div>
        {library&&<div className="pw-brush-shape-library" aria-label="画笔形状库" onScroll={e=>{const el=e.currentTarget;if(el.scrollHeight-el.scrollTop-el.clientHeight<60)setLimit(n=>n+16);}}><div>{allShapes.slice(0,limit).map(s=><button key={s.id} aria-label={`选择画笔形状 ${s.name}`} className={value.shape?.id===s.id?'active':''} onClick={()=>setValue(v=>({...v,shape:s}))}><ShapeIcon shape={s}/><span>{s.name}</span></button>)}</div>{limit<allShapes.length&&<button className="pw-brush-load" onClick={()=>setLimit(n=>n+16)}>上拉加载更多</button>}</div>}
        <section><h3>填充方式</h3><div className="pw-brush-segments">{([['solid','纯色'],['fabric','布料'],['none','无填充']] as const).map(([k,n])=><button key={k} aria-pressed={value.paint.fill===k} className={value.paint.fill===k?'active':''} onClick={()=>paint({fill:k})}>{n}</button>)}</div>
        {value.paint.fill==='solid'&&<Palette color={value.paint.color} onChange={color=>paint({color})}/>}
        {value.paint.fill==='fabric'&&<button className="pw-brush-fabric" onClick={()=>onFabric(value)}><span style={{background:material?.color||'#e9cfca'}}/><strong>{material?.name||'选择布料'}</strong><ChevronRight/></button>}</section>
        <section><label className="pw-brush-switch"><span>边框</span><input type="checkbox" role="switch" aria-label="启用形状边框" checked={value.paint.border} onChange={e=>paint({border:e.target.checked})}/></label>{value.paint.border&&<><Palette color={value.paint.borderColor} onChange={borderColor=>paint({borderColor})}/><button className="pw-brush-link" onClick={()=>setBorderMore(!borderMore)}>更多设置 <ChevronRight/></button>{borderMore&&<label className="pw-brush-range">边框粗细 <output>{value.paint.borderWidthMm} mm</output><input type="range" aria-label="边框粗细" min={.2} max={2} step={.1} value={value.paint.borderWidthMm} onChange={e=>paint({borderWidthMm:Number(e.target.value)})}/></label>}</>}</section>
      </>:<>
        {kind==='outline'&&<label className="pw-brush-switch"><span>周边缝线</span><input type="checkbox" role="switch" aria-label="启用周边缝线" checked={!!value.outline} onChange={e=>{const checked=e.target.checked;setValue(v=>({...v,outline:checked?{...v.stitch,insetMm:2}:null}));}}/></label>}
        {(kind!=='outline'||value.outline)&&<>
        <div className="pw-stitch-types">{Object.entries(stitchNames).map(([k,n])=><button key={k} className={style.kind===k?'active':''} aria-pressed={style.kind===k} onClick={()=>updateStitch({kind:k as StitchStyle['kind']})}><StitchSample style={{...style,kind:k as StitchStyle['kind'],color:style.kind===k?'#208edc':'#7b8793'}}/><span>{n}</span></button>)}</div>
        <section><h3>线色</h3><Palette color={style.color} onChange={color=>updateStitch({color})}/></section>
        <section><h3>粗细</h3><div className="pw-brush-segments">{([['细',.35],['中',.6],['粗',1]] as const).map(([n,w])=><button key={n} aria-pressed={style.widthMm===w} className={style.widthMm===w?'active':''} onClick={()=>updateStitch({widthMm:w})}>{n}</button>)}</div></section>
        {([['lengthMm','针长',1,8],['gapMm','针距',.5,6],...(kind==='outline'?[['insetMm','距边',0,8]]:[])] as Array<['lengthMm'|'gapMm'|'insetMm',string,number,number]>).map(([k,n,min,max])=><label className="pw-brush-range" key={k}>{n}<output>{k==='insetMm'?value.outline?.insetMm:style[k]} mm</output><input type="range" aria-label={n} min={min} max={max} step={.5} value={k==='insetMm'?value.outline?.insetMm:style[k]} onChange={e=>updateStitch({[k]:Number(e.target.value)})}/></label>)}
        <div className="pw-stitch-preview"><StitchSample style={style}/></div>
        </>}
      </>}
      {error&&<p role="alert" className="pw-brush-error">{error}</p>}
      </div>
      <button className="pw-brush-done" onClick={()=>{try{onDone(value);}catch(e){setError(e instanceof Error?e.message:'请调整设置');}}}>完成</button>
    </div>
  </div>;
  useLayoutEffect(()=>{setOverlaySlot('patchworkBrush',modal);});
  useLayoutEffect(()=>()=>setOverlaySlot('patchworkBrush',null),[setOverlaySlot]);
  return null;
}
