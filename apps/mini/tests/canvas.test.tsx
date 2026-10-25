import { describe, expect, it, vi } from 'vitest'
vi.mock('@tarojs/taro',()=>({default:{getStorageSync:vi.fn(),setStorageSync:vi.fn()}}))
import { drawPatchworkWorkspace, exportArtworkMetrics } from '../src/platform/patchworkCanvas'
import { makePwProject, type PwProject, type PwPiece } from '../src/platform/patchworkStore'

function fakeCanvas() {
  const calls: Array<{ name:string; args:any[] }> = []
  const methods = new Set(['clearRect','fillRect','beginPath','moveTo','lineTo','stroke','save','restore',
    'rect','clip','drawImage','strokeRect','fillText','setLineDash','closePath','fill','arc'])
  const ctx = new Proxy({} as Record<string,any>, {
    get: (_target, key) => methods.has(String(key))
      ? (...args:any[]) => {calls.push({name:String(key),args})}
      : undefined,
    set: () => true,
  })
  return {ctx,calls}
}

describe('WeChat Canvas2D 拼布工作区渲染', () => {
  it('导出大幅作品使用手机安全的离屏画布尺寸，保留比例与小幅作品精度', () => {
    expect(exportArtworkMetrics(400, 300)).toEqual({scale:4, width:1600, height:1200})
    const square = exportArtworkMetrics(3000, 3000)
    expect(square).toEqual({scale:3072/3000, width:3072, height:3072})
    const large = exportArtworkMetrics(3000, 1500)
    expect(large.width).toBe(3072)
    expect(large.height).toBe(1536)
    expect(large.width * large.height).toBeLessThanOrEqual(3072 * 3072)
  })

  it('无底布也绘制工作区十字网格、透明底板、外框及厘米刻度（H5 行为）', () => {
    const project = makePwProject(400,300)
    expect(project.base.materialId).toBe('')
    const {ctx,calls}=fakeCanvas()
    drawPatchworkWorkspace(ctx,project,{width:390,height:650,scale:.78,ox:39,oy:160},
      {selectedId:'',stroke:[],images:{}})
    const has=(name:string)=>calls.some(c=>c.name===name)
    expect(calls[0]).toEqual({name:'clearRect',args:[0,0,390,650]})
    expect(has('fillRect')).toBe(true)
    expect(calls.filter(c=>c.name==='fillRect').length).toBeGreaterThan(30)
    expect(calls.some(c=>c.name==='strokeRect'&&c.args[0]===39&&c.args[1]===160
      &&Math.abs(c.args[2]-312)<.001&&Math.abs(c.args[3]-234)<.001)).toBe(true)
    expect(calls.some(c=>c.name==='fillText'&&c.args[0]==='(cm)')).toBe(true)
    expect(calls.some(c=>c.name==='fillText'&&c.args[0]==='10')).toBe(true)
  })
  it('底布会正确使用材质纹理，并在裁片周围渲染选择框与八个控制点', () => {
    const project:PwProject=makePwProject(400,400)
    project.materials.push({id:'preset:ivory',presetId:'ivory',name:'奶油米白',color:'#eee5d5',sampleWidthMm:64})
    project.base.materialId='preset:ivory'
    const piece:PwPiece={id:'piece1',name:'爱心',materialId:'preset:ivory',locked:false,visible:true,seamMm:0,
      points:[{x:100,y:100},{x:200,y:100},{x:200,y:180},{x:100,y:180}],
      paint:{fill:'fabric',color:'#eee5d5'},texture:{scale:1,rotation:0,offsetX:0,offsetY:0}}
    project.pieces.push(piece)
    const {ctx,calls}=fakeCanvas()
    drawPatchworkWorkspace(ctx,project,{width:390,height:650,scale:.78,ox:39,oy:100},
      {selectedId:'piece1',stroke:[],images:{ivory:{}}})
    expect(calls.filter(c=>c.name==='drawImage').length).toBeGreaterThan(0)
    expect(calls.some(c=>c.name==='fillText'&&c.args[0]==='爱心')).toBe(true)
    const smallHandles=calls.filter(c=>c.name==='strokeRect'&&c.args[2]===7&&c.args[3]===7)
    expect(smallHandles).toHaveLength(8)
  })
})
