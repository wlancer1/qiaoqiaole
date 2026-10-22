import { describe, expect, it, vi, afterEach } from 'vitest';
import { drawScene, metrics } from './canvas';
import { makePiece, makeProject, type PatchworkProject } from './model';
import { defaultStitch } from './stitches';
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


describe('sewing render export',()=>{
 it('renders open sewing lines without polygon fill or an implicit closing segment in clean output',()=>{
  vi.stubGlobal('window',{devicePixelRatio:1});
  const calls:Record<string,ReturnType<typeof vi.fn>>={};
  const ctx=new Proxy({} as any,{get:(_,key:string)=>calls[key]??=vi.fn(),set:()=>true});
  const canvas={width:0,height:0,getBoundingClientRect:()=>({width:400,height:400}),getContext:()=>ctx} as unknown as HTMLCanvasElement;
  const project=makeProject(),p=makePiece([{x:30,y:30},{x:100,y:70}],'','thread');
  p.stitch={...defaultStitch};project.pieces=[p];
  drawScene(canvas,project,{zoom:1,panX:0,panY:0},{selectedIds:[],draft:[],draftClosed:false,nodeMode:false,images:new Map(),clean:true});
  expect(calls.stroke).toHaveBeenCalled();expect(calls.fill).toBeUndefined();expect(calls.closePath).toBeUndefined();
 });
});

describe('fabric numbering with sewing layers',()=>{
 it('keeps canvas piece numbers aligned with the cutting list when a thread precedes a fabric piece',()=>{
  vi.stubGlobal('window',{devicePixelRatio:1});
  const calls:Record<string,ReturnType<typeof vi.fn>>={};
  const ctx=new Proxy({} as any,{get:(_,key:string)=>calls[key]??=vi.fn(),set:()=>true});
  const canvas={width:0,height:0,getBoundingClientRect:()=>({width:400,height:400}),getContext:()=>ctx} as unknown as HTMLCanvasElement;
  const project=makeProject(),thread=makePiece([{x:20,y:20},{x:70,y:30}],'','thread'),fabric=makePiece([{x:30,y:30},{x:100,y:30},{x:100,y:100},{x:30,y:100}],'B','fabric');
  thread.stitch={...defaultStitch};project.pieces=[thread,fabric];
  drawScene(canvas,project,{zoom:1,panX:0,panY:0},{selectedIds:[],draft:[],draftClosed:false,nodeMode:false,images:new Map(),clean:true,showNumbers:true});
  expect(calls.fillText.mock.calls.some(([text])=>text==='P1')).toBe(true);
  expect(calls.fillText.mock.calls.some(([text])=>text==='P2')).toBe(false);
 });
});

describe('no base fabric',()=>{
 it.each([false,true])('does not invent a cream material when none is selected (clean=%s)',clean=>{
  vi.stubGlobal('window',{devicePixelRatio:1});
  const fills:string[]=[];let fill='';
  const ctx=new Proxy({} as any,{get:(_,key:string)=>key==='fillRect'?()=>fills.push(fill):vi.fn(),set:(_,key:string,value)=>{if(key==='fillStyle')fill=value;return true;}});
  const canvas={width:0,height:0,getBoundingClientRect:()=>({width:400,height:400}),getContext:()=>ctx} as unknown as HTMLCanvasElement;
  const project=makeProject();project.base.materialId='';
  drawScene(canvas,project,{zoom:1,panX:0,panY:0},{selectedIds:[],draft:[],draftClosed:false,nodeMode:false,images:new Map(),clean});
  expect(fills).not.toContain('#f2e6d2');
  if(clean)expect(fills).toEqual([]);
 });
});
