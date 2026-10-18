import { pointBounds, type PatchworkProject, type Point } from './model';
export type View = { zoom: number; panX: number; panY: number };
export type Metrics = { scale: number; ox: number; oy: number; width: number; height: number };
export function metrics(width: number, height: number, project: PatchworkProject, view: View): Metrics {
  const base = Math.max(.01, Math.min((width - 76) / project.widthMm, (height - 80) / project.heightMm));
  const scale=base*view.zoom;
  return { scale, ox:(width-project.widthMm*scale)/2+view.panX, oy:(height-project.heightMm*scale)/2+view.panY,width,height };
}
export function screenToWorld(p: Point, m: Metrics): Point {return {x:(p.x-m.ox)/m.scale,y:(p.y-m.oy)/m.scale};}
export function worldToScreen(p: Point, m: Metrics): Point {return {x:p.x*m.scale+m.ox,y:p.y*m.scale+m.oy};}
function path(ctx:CanvasRenderingContext2D,points:Point[],m:Metrics,close=true) {
  ctx.beginPath();points.forEach((p,i)=>{const {x,y}=worldToScreen(p,m);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});if(close && points.length>2)ctx.closePath();
}
export type DrawOptions={selectedIds:string[];draft:Point[];draftClosed:boolean;nodeMode:boolean;preview?:{points:Point[];color:string;selected?:boolean}[];previewStyle?:'filled'|'outline';images:Map<string,HTMLImageElement>; showNumbers?:boolean;clean?:boolean};
export function drawScene(canvas:HTMLCanvasElement,project:PatchworkProject,view:View,opts:DrawOptions) {
  const bounds=canvas.getBoundingClientRect(),w=bounds.width,h=bounds.height;
  if(!w || !h)return;
  const dpr=Math.min(3,window.devicePixelRatio||1),realW=Math.round(w*dpr),realH=Math.round(h*dpr);
  if(canvas.width!==realW||canvas.height!==realH){canvas.width=realW;canvas.height=realH;}
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const m=metrics(w,h,project,view);
  const ox=m.ox,oy=m.oy,bw=project.widthMm*m.scale,bh=project.heightMm*m.scale;
  if(!opts.clean) {
    ctx.fillStyle='#edf3f7';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.strokeStyle='rgba(130,165,190,.20)';ctx.lineWidth=1;
    for(let x=11;x<w+22;x+=22)for(let y=11;y<h+22;y+=22){ctx.beginPath();ctx.moveTo(x-3,y);ctx.lineTo(x+3,y);ctx.moveTo(x,y-3);ctx.lineTo(x,y+3);ctx.stroke();}
    ctx.restore();
  }
  ctx.save();ctx.shadowColor='rgba(37,47,60,.12)';ctx.shadowBlur=opts.clean?0:20;ctx.fillStyle=project.materials.find((a)=>a.id===project.base.materialId)?.color||'#f2e6d2';ctx.fillRect(ox,oy,bw,bh);ctx.restore();
  ctx.save();ctx.beginPath();ctx.rect(ox,oy,bw,bh);ctx.clip();
  const base=project.materials.find((a)=>a.id===project.base.materialId);
  if(base?.assetId && opts.images.has(base.assetId)) {
    const image=opts.images.get(base.assetId)!;
    ctx.globalAlpha=.83;ctx.drawImage(image,ox,oy,bw,bh);ctx.globalAlpha=1;
  }
  if(project.reference && opts.images.has(project.reference.assetId)) {
    const image=opts.images.get(project.reference.assetId)!;
    ctx.globalAlpha=project.reference.opacity;
    const r=project.reference;ctx.drawImage(image,ox+r.x*m.scale,oy+r.y*m.scale,r.width*m.scale,r.height*m.scale);ctx.globalAlpha=1;
  }
  if(!opts.clean) {
    ctx.lineWidth=1;ctx.strokeStyle='rgba(127,121,108,.13)';
    const step=project.widthMm>900?100:25;
    for(let x=step;x<project.widthMm;x+=step){ctx.beginPath();ctx.moveTo(ox+x*m.scale,oy);ctx.lineTo(ox+x*m.scale,oy+bh);ctx.stroke();}
    for(let y=step;y<project.heightMm;y+=step){ctx.beginPath();ctx.moveTo(ox,oy+y*m.scale);ctx.lineTo(ox+bw,oy+y*m.scale);ctx.stroke();}
  }
  ctx.restore();
  for(const piece of project.pieces) {
    if(!piece.visible)continue;
    const material=project.materials.find((a)=>a.id===piece.materialId);
    path(ctx,piece.points,m);ctx.fillStyle=material?.color||'#d8d8d8';ctx.fill();
    const image=material?.assetId?opts.images.get(material.assetId):null;
    if(image) {
      ctx.save();path(ctx,piece.points,m);ctx.clip();
      const b=pointBounds(piece.points),scale=piece.texture.scale;
      const wMm=material?.sampleWidthMm||b.width||1,patternWidth=wMm*scale*m.scale;
      const patternHeight=patternWidth*image.naturalHeight/image.naturalWidth;
      const center=worldToScreen({x:b.x+b.width/2,y:b.y+b.height/2},m);
      ctx.translate(center.x+piece.texture.offsetX*m.scale,center.y+piece.texture.offsetY*m.scale);
      ctx.rotate(piece.texture.rotation*Math.PI/180);
      // 纹样不改变布片外轮廓；将同张图重复覆盖片区而非当作形状。
      if(patternWidth>2&&patternHeight>2) for(let yy=-Math.ceil(h/patternHeight)*patternHeight;yy<=h+patternHeight;yy+=patternHeight)for(let xx=-Math.ceil(w/patternWidth)*patternWidth;xx<=w+patternWidth;xx+=patternWidth) {
        ctx.drawImage(image,xx,yy,patternWidth,patternHeight);
      }
      ctx.restore();
    }
    path(ctx,piece.points,m);ctx.strokeStyle='rgba(96,74,58,.28)';ctx.lineWidth=1;ctx.stroke();
    path(ctx,piece.points,m);ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=1.3;ctx.setLineDash([4,3]);ctx.stroke();ctx.setLineDash([]);
    if(opts.showNumbers!==false) {
      const b=pointBounds(piece.points),center=worldToScreen({x:b.x+b.width/2,y:b.y+b.height/2},m);
      ctx.fillStyle='#22384c';ctx.font='600 11px PingFangSC, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(`P${project.pieces.indexOf(piece)+1}`,center.x,center.y);
    }
  }
  for(const preview of opts.preview||[]){
    path(ctx,preview.points,m);
    if(opts.previewStyle==='outline'){
      if(preview.selected){ctx.fillStyle='rgba(32,142,220,.20)';ctx.fill();}
      ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=preview.selected?4.2:3;ctx.lineJoin='round';ctx.stroke();
      ctx.strokeStyle=preview.selected?'#208edc':'#25384d';ctx.lineWidth=preview.selected?2.5:1.5;ctx.stroke();
    }else{ctx.fillStyle=preview.color;ctx.globalAlpha=.75;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='#fff';ctx.lineWidth=1.2;ctx.stroke();}
  }
  if(!opts.clean) {
    for(const guide of project.guides.filter((p)=>p.visible)) {
      path(ctx,guide.points,m,false);ctx.strokeStyle='#6295a6';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.stroke();ctx.setLineDash([]);
    }
    for(const id of opts.selectedIds) {
      const piece=project.pieces.find((p)=>p.id===id);if(!piece)continue;
      path(ctx,piece.points,m);ctx.strokeStyle='#208edc';ctx.lineWidth=2.2;ctx.stroke();
      if(opts.nodeMode){for(const p of piece.points){const s=worldToScreen(p,m);ctx.beginPath();ctx.arc(s.x,s.y,4.5,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#208edc';ctx.lineWidth=2;ctx.stroke();}}
      else if(opts.selectedIds.length===1){
        const b=pointBounds(piece.points),tl=worldToScreen({x:b.x,y:b.y},m),br=worldToScreen({x:b.x+b.width,y:b.y+b.height},m);
        ctx.strokeStyle='rgba(32,142,220,.85)';ctx.lineWidth=1;ctx.strokeRect(tl.x,tl.y,br.x-tl.x,br.y-tl.y);
        const hs=[[tl.x,tl.y],[(tl.x+br.x)/2,tl.y],[br.x,tl.y],[br.x,(tl.y+br.y)/2],[br.x,br.y],[(tl.x+br.x)/2,br.y],[tl.x,br.y],[tl.x,(tl.y+br.y)/2]];
        for(const [hx,hy] of hs){ctx.fillStyle='#fff';ctx.fillRect(hx-3.5,hy-3.5,7,7);ctx.strokeStyle='#208edc';ctx.lineWidth=1.4;ctx.strokeRect(hx-3.5,hy-3.5,7,7);}
        const cxm=(tl.x+br.x)/2;
        ctx.strokeStyle='#208edc';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(cxm,tl.y);ctx.lineTo(cxm,tl.y-16);ctx.stroke();
        ctx.beginPath();ctx.arc(cxm,tl.y-24,8,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#208edc';ctx.lineWidth=1.6;ctx.stroke();
        ctx.fillStyle='#208edc';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('\u21bb',cxm,tl.y-24);
      }
    }
    if(opts.draft.length) {
      path(ctx,opts.draft,m,false);ctx.strokeStyle='#208edc';ctx.lineWidth=2;ctx.lineJoin='round';ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([]);
      if(opts.draftClosed && opts.draft.length>2){const first=worldToScreen(opts.draft[0],m),last=worldToScreen(opts.draft[opts.draft.length-1],m);ctx.strokeStyle='#208edc';ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(first.x,first.y);ctx.stroke();ctx.setLineDash([]);}
      const f=worldToScreen(opts.draft[0],m);ctx.beginPath();ctx.arc(f.x,f.y,4,0,2*Math.PI);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#208edc';ctx.stroke();
    }
    ctx.fillStyle='#7d93a8';ctx.font='10px PingFangSC, sans-serif';ctx.textBaseline='middle';
    ctx.strokeStyle='rgba(125,147,168,.5)';ctx.lineWidth=1;
    for(let x=0;x<=project.widthMm;x+=10){const s=worldToScreen({x,y:0},m);if(s.x<4||s.x>w-4)continue;const len=x%50===0?6:3;ctx.beginPath();ctx.moveTo(s.x,s.y-len);ctx.lineTo(s.x,s.y);ctx.stroke();}
    for(let y=0;y<=project.heightMm;y+=10){const s=worldToScreen({x:0,y},m);if(s.y<4||s.y>h-4)continue;const len=y%50===0?6:3;ctx.beginPath();ctx.moveTo(s.x-len,s.y);ctx.lineTo(s.x,s.y);ctx.stroke();}
    const major=project.widthMm>1000?200:100;
    for(let x=0;x<=project.widthMm;x+=major){const s=worldToScreen({x,y:0},m);if(s.x<15||s.x>w-32)continue;ctx.textAlign='center';ctx.fillText(`${x/10}`,s.x,Math.max(12,s.y-15));}
    for(let y=0;y<=project.heightMm;y+=major){const s=worldToScreen({x:0,y},m);if(s.y<12||s.y>h-28)continue;ctx.textAlign='right';ctx.fillText(`${y/10}`,Math.max(25,s.x-10),s.y);}
    ctx.textAlign='left';ctx.fillText('(cm)',Math.min(w-36,ox+bw+6),Math.max(12,oy-15));
    ctx.fillText('(cm)',Math.max(25,ox-26),Math.min(h-14,oy+bh+15));
    ctx.strokeStyle='#a5adb0';ctx.lineWidth=1;ctx.strokeRect(ox,oy,bw,bh);
  }
}
