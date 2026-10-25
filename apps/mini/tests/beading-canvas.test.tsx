import { describe, expect, it, vi } from 'vitest'
import { drawBeadingWorkspace } from '../src/platform/beadingCanvas'

function fakeCanvas() {
  const calls: Array<{method:string,args:any[]}> = []
  const operations = new Set([
    'clearRect','fillRect','beginPath','moveTo','lineTo','stroke','save','restore',
    'rect','clip','drawImage','strokeRect','fillText','setLineDash','closePath','fill','arc',
  ])
  const ctx = new Proxy({} as Record<string,any>, {
    get:(_,key)=>operations.has(String(key)) ? (...args:any[])=>calls.push({method:String(key),args}):undefined,
    set:()=>true,
  })
  return {ctx,calls}
}
const cell=(x:number,y:number,color:string,transparent=false)=>({x,y,color,transparent})

describe('微信小程序拼豆 Canvas2D 工作区',()=>{
  it('背景、白色画布、透明孔位和网格/10格刻度均有绘制',()=>{
    const {ctx,calls}=fakeCanvas()
    drawBeadingWorkspace(ctx,{cols:32,rows:32,cells:[
      cell(0,0,'#ffffff',true),cell(1,1,'#da4050'),cell(15,13,'#e6d8b4',true)
    ]} as any,{width:390,height:650,scale:10,ox:32,oy:150},()=>'',()=>0)
    const used=(method:string)=>calls.filter(call=>call.method===method)
    expect(calls[0]).toEqual({method:'clearRect',args:[0,0,390,650]})
    expect(used('fillRect').length).toBeGreaterThan(1)
    expect(used('strokeRect')).toContainEqual({method:'strokeRect',args:[32,150,320,320]})
    expect(used('arc')).toHaveLength(3)
    expect(used('fillText').some(c=>c.args[0]==='10')).toBe(true)
  })
  it('放大后显示色号并裁剪超出画布的格子',()=>{
    const {ctx,calls}=fakeCanvas()
    const codeOf=vi.fn(()=> 'A03')
    drawBeadingWorkspace(ctx,{cols:8,rows:8,cells:[cell(0,0,'#000000'),cell(1,0,'#ffffff',true),
      cell(6,6,'#ea5677')]} as any,{width:250,height:230,scale:23,ox:12,oy:25},codeOf,()=>0)
    expect(calls.some(c=>c.method==='clip')).toBe(true)
    expect(calls.filter(c=>c.method==='fillText'&&c.args[0]==='A03')).toHaveLength(2)
    expect(codeOf).toHaveBeenCalledTimes(2)
  })
  it('零尺寸尚未初始化时不能绘制到原生 context',()=>{
    const {ctx,calls}=fakeCanvas()
    drawBeadingWorkspace(ctx,{cols:8,rows:8,cells:[]} as any,{width:0,height:0,scale:10,ox:0,oy:0},
      ()=>'',()=>0)
    expect(calls).toHaveLength(0)
  })
})
