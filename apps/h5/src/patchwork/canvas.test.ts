import { describe, expect, it, vi, afterEach } from 'vitest';
import { drawScene, metrics } from './canvas';
import type { PatchworkProject } from './model';
afterEach(()=>vi.unstubAllGlobals());
describe('base fabric tiling',()=>{
 it.each([false,true])('repeats in both directions at calibrated size (clean=%s)',(clean)=>{
  vi.stubGlobal('window',{devicePixelRatio:2});
  const pattern={};
  const calls: Record<string, ReturnType<typeof vi.fn>>={};
  const ctx=new Proxy({} as any,{get:(_,key:string)=>calls[key]??=vi.fn(key==='createPattern'?()=>pattern:undefined),set:()=>true});
  const canvas={width:0,height:0,getBoundingClientRect:()=>({width:500,height:400}),getContext:()=>ctx} as unknown as HTMLCanvasElement;
  const project={widthMm:400,heightMm:300,base:{materialId:'a'},materials:[{id:'a',color:'#fff',assetId:'photo',sampleWidthMm:100}],pieces:[],guides:[]} as unknown as PatchworkProject;
  const image={naturalWidth:200,naturalHeight:100} as HTMLImageElement;
  const opts={selectedIds:[],draft:[],draftClosed:false,nodeMode:false,images:new Map([['photo',image]]),clean};
  for(const zoom of [1,2]){
   drawScene(canvas,project,{zoom,panX:17,panY:-11},opts);
   const m=metrics(500,400,project,{zoom,panX:17,panY:-11});
   expect(calls.createPattern).toHaveBeenLastCalledWith(image,'repeat');
   expect(calls.translate).toHaveBeenLastCalledWith(m.ox,m.oy);
   expect(calls.scale).toHaveBeenLastCalledWith(m.scale/2,m.scale/2);
   expect(calls.fillRect).toHaveBeenCalledWith(0,0,800,600);
   expect(calls.drawImage).toBeUndefined();
  }
  delete project.materials[0].sampleWidthMm;
  drawScene(canvas,project,{zoom:1,panX:0,panY:0},opts);
  const m=metrics(500,400,project,{zoom:1,panX:0,panY:0});
  expect(calls.scale).toHaveBeenLastCalledWith(64/200*m.scale,64/200*m.scale);
 });
});
