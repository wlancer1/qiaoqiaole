import { returnFromEditor } from '../../platform/editorNavigation'
import { Button } from '../../components/Controls'
import { useEffect, useRef, useState } from 'react'
import { View, Text, Canvas, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  MARD_221_COLORS,
  MARD_221_HEX,
  DEFAULT_SETTINGS,
  buildCellsFromSamples,
  sampleDominantColor,
  bucketFill,
  getCell,
  uniquePalette,
  type Cell,
  type Project,
} from '@qiaoqiaole/core'
import {
  loadBeadingProject,
  saveBeadingProject,
  newBeadingProjectId,
} from '../../platform/beadingStore'
import { Sheet, Glyph } from '../../components/Ui'
import { CreateProjectFlow, type BeadingCanvasOptions } from '../../components/CreateProjectFlow'
import { BeadingCanvasOverlays } from '../../components/BeadingCanvasOverlays'
import { drawBeadingWorkspace } from '../../platform/beadingCanvas'
import './index.scss'

const HEX_TO_CODE = new Map(MARD_221_COLORS.map((c) => [c.hex.toLowerCase(), c.code]))
const SAMPLE_PER_CELL = 6

type Tool = 'draw' | 'erase' | 'fill' | 'pick' | 'pan'
type TouchMode = 'idle' | 'paint' | 'pinch'

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

export default function BeadingPage() {
  const [importing,setImporting]=useState(false)
  const [zoom,setZoom]=useState(100)
  const historyRef=useRef<Cell[][]>([])
  const futureRef=useRef<Cell[][]>([])
  const gestureRecorded=useRef(false)
  const [project, setProject] = useState<Project | null>(null)
  const [tool, setToolState] = useState<Tool>('draw')
  const [color, setColor] = useState<string>(MARD_221_COLORS[0].hex)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [used, setUsed] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)

  const canvasNodeRef = useRef<any>(null)
  const ctxRef = useRef<any>(null)
  const rectRef = useRef({ left: 0, top: 0, width: 0, height: 0 })
  const viewRef = useRef({ scale: 8, ox: 0, oy: 0 })
  const fitScaleRef = useRef(8)
  const projectRef = useRef<Project | null>(null)
  const toolRef = useRef<Tool>('draw')
  const colorRef = useRef<string>(color)
  const touchRef = useRef<{ mode: TouchMode; lastDist: number; lastCx: number; lastCy: number; lastCell: string }>({
    mode: 'idle', lastDist: 0, lastCx: 0, lastCy: 0, lastCell: '',
  })

  const setTool = (t: Tool) => { toolRef.current = t; setToolState(t) }
  const pickColor = (hex: string) => { colorRef.current = hex; setColor(hex) }

  const refreshUsed = (p: Project | null) => {
    if (!p) { setUsed([]); return }
    setUsed(uniquePalette(p.cells.filter((c) => !c.transparent), MARD_221_HEX as unknown as string[]))
  }

  const applyProject = (p: Project | null, fit = false) => {
    projectRef.current = p
    setProject(p)
    refreshUsed(p)
    if (p && fit) fitView(p)
    historyRef.current=[];futureRef.current=[]
    requestDraw()
  }

  const fitView = (p: Project) => {
    const { width, height } = rectRef.current
    if (!width || !height) {
      setZoom(100)
      return
    }
    const scale = Math.max(.8,Math.min((width-76) / p.cols, (height-80) / p.rows))
    fitScaleRef.current = scale
    setZoom(100)
    viewRef.current = {
      scale,
      ox: (width - p.cols * scale) / 2,
      oy: (height - p.rows * scale) / 2,
    }
  }

  const drawAll = () => {
    const ctx = ctxRef.current
    const p = projectRef.current
    if (!ctx || !p) return
    drawBeadingWorkspace(ctx, p, { ...rectRef.current, ...viewRef.current },
      hex => HEX_TO_CODE.get(hex.toLowerCase()) || '', luminance)
  }

  const requestDraw = () => { drawAll() }

  // ---------- canvas 初始化（编辑态挂载后跑；回列表会卸载，需重跑） ----------
  const initCanvas = () => {
    const query = Taro.createSelectorQuery()
    query.select('#beadCanvas').fields({ node: true, size: true, rect: true }, (res: any) => {
      if (!res || !res.node || !(res.width > 0 && res.height > 0)) return
      const canvas = res.node
      const dpr = Math.min(3,(Taro.getWindowInfo ? Taro.getWindowInfo().pixelRatio : 2) || 2)
      canvas.width = Math.round(res.width * dpr)
      canvas.height = Math.round(res.height * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      canvasNodeRef.current = canvas
      ctxRef.current = ctx
      rectRef.current = { left: res.left, top: res.top, width: res.width, height: res.height }
      if (projectRef.current) { fitView(projectRef.current); drawAll() }
    }).exec()
  }

  useEffect(() => {
    if (project) {
      ctxRef.current = null
      const timer = setTimeout(initCanvas, 30)
      Taro.onWindowResize(initCanvas)
      return () => {clearTimeout(timer);Taro.offWindowResize(initCanvas)}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  useEffect(() => { drawAll() }, [project])

  useEffect(() => () => {
    if(projectRef.current) saveBeadingProject(projectRef.current)
  }, [])

  // ---------- 手势 ----------
  const toCell = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const p = projectRef.current
    if (!p) return null
    const { left, top } = rectRef.current
    const { scale, ox, oy } = viewRef.current
    const x = Math.floor((clientX - left - ox) / scale)
    const y = Math.floor((clientY - top - oy) / scale)
    if (x < 0 || y < 0 || x >= p.cols || y >= p.rows) return null
    return { x, y }
  }

  const mutateCells = (next: Cell[]) => {
    const p = projectRef.current
    if (!p) return
    if(!gestureRecorded.current){historyRef.current=[...historyRef.current.slice(-29),p.cells];futureRef.current=[];gestureRecorded.current=true}
    const updated = { ...p, cells: next }
    projectRef.current = updated
    setProject(updated)
    refreshUsed(updated)
    setDirty(true)
    drawAll()
  }

  const restoreHistory=(redo=false)=>{
    const p=projectRef.current;if(!p)return
    const from=redo?futureRef:historyRef,to=redo?historyRef:futureRef
    const cells=from.current.pop();if(!cells)return
    to.current.push(p.cells);const next={...p,cells}
    projectRef.current=next;setProject(next);refreshUsed(next);setDirty(true);drawAll()
  }
  const zoomBy=(factor:number)=>{
    const v=viewRef.current,{width,height}=rectRef.current
    const scale=Math.max(fitScaleRef.current*.2,Math.min(fitScaleRef.current*8,v.scale*factor)),k=scale/v.scale
    viewRef.current={scale,ox:width/2-(width/2-v.ox)*k,oy:height/2-(height/2-v.oy)*k}
    setZoom(Math.round(scale/fitScaleRef.current*100));drawAll()
  }
  const applyToolAt = (clientX: number, clientY: number, isStart: boolean) => {
    const p = projectRef.current
    if (!p) return
    const pos = toCell(clientX, clientY)
    if (!pos) return
    const key = cellKey(pos.x, pos.y)
    const t = toolRef.current
    if(t==='pan')return
    if (t === 'pick') {
      const cell = getCell(p.cells, pos.x, pos.y)
      if (cell && !cell.transparent) { pickColor(cell.color); setTool('draw') }
      return
    }
    if (!isStart && touchRef.current.lastCell === key) return
    touchRef.current.lastCell = key
    if (t === 'fill') {
      if (!isStart) return
      mutateCells(bucketFill(p.cells, p.rows, p.cols, pos.x, pos.y, colorRef.current))
      return
    }
    const target = getCell(p.cells, pos.x, pos.y)
    if (t === 'draw') {
      if (target && !target.transparent && target.color.toLowerCase() === colorRef.current.toLowerCase()) return
      mutateCells(p.cells.map((c) => (c.x === pos.x && c.y === pos.y ? { ...c, color: colorRef.current, transparent: false } : c)))
    } else if (t === 'erase') {
      if (target?.transparent) return
      mutateCells(p.cells.map((c) => (c.x === pos.x && c.y === pos.y ? { ...c, transparent: true } : c)))
    }
  }

  const pinchCenter = (touches: any[]) => ({
    cx: (touches[0].clientX + touches[1].clientX) / 2,
    cy: (touches[0].clientY + touches[1].clientY) / 2,
    dist: Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY),
  })

  const onTouchStart = (e: any) => {
    if (paletteOpen) return
    const touches = e.touches || []
    if (touches.length >= 2) {
      const { cx, cy, dist } = pinchCenter(touches)
      touchRef.current = { mode: 'pinch', lastDist: dist, lastCx: cx, lastCy: cy, lastCell: '' }
      return
    }
    if (touches.length === 1) {
      gestureRecorded.current=false
      touchRef.current.lastCx=touches[0].clientX;touchRef.current.lastCy=touches[0].clientY
      touchRef.current.mode = 'paint'
      touchRef.current.lastCell = ''
      applyToolAt(touches[0].clientX, touches[0].clientY, true)
    }
  }

  const onTouchMove = (e: any) => {
    const touches = e.touches || []
    const state = touchRef.current
    if (state.mode === 'pinch' && touches.length >= 2) {
      const { cx, cy, dist } = pinchCenter(touches)
      const view = viewRef.current
      const { left, top } = rectRef.current
      const ratio = state.lastDist > 0 ? dist / state.lastDist : 1
      const nextScale = Math.min(fitScaleRef.current*8, Math.max(fitScaleRef.current*.2, view.scale * ratio))
      // 以双指中心为锚点缩放，并跟随中心平移
      const ax = state.lastCx - left
      const ay = state.lastCy - top
      const k = nextScale / view.scale
      view.ox = ax - (ax - view.ox) * k + (cx - state.lastCx)
      view.oy = ay - (ay - view.oy) * k + (cy - state.lastCy)
      view.scale = nextScale
      touchRef.current = { mode: 'pinch', lastDist: dist, lastCx: cx, lastCy: cy, lastCell: '' }
      setZoom(Math.round(view.scale/fitScaleRef.current*100))
      drawAll()
      return
    }
    if (state.mode === 'paint' && touches.length === 1) {
      if(toolRef.current==='pan'){viewRef.current.ox+=touches[0].clientX-state.lastCx;viewRef.current.oy+=touches[0].clientY-state.lastCy;state.lastCx=touches[0].clientX;state.lastCy=touches[0].clientY;drawAll();return}
      applyToolAt(touches[0].clientX, touches[0].clientY, false)
    }
  }

  const onTouchEnd = () => { touchRef.current.mode = 'idle' }

  // ---------- 新建 / 导入 ----------
  const openProject = (id: string) => {
    const p = loadBeadingProject(id)
    if (!p) { Taro.showToast({ title: '工程数据不存在', icon: 'none' }); return }
    setDirty(false)
    applyProject(p, true)
  }

  const createBlank = (options: BeadingCanvasOptions) => {
    const cols=Math.max(2,Math.min(120,Math.round(options.cols)||32))
    const rows=Math.max(2,Math.min(120,Math.round(options.rows)||32))
    const cells = buildCellsFromSamples(rows, cols, () => '#ffffff').map((c) => ({ ...c, transparent: true }))
    const p: Project = {
      id: newBeadingProjectId(), imageUrl: '', rows, cols, cells,
      settings: { ...DEFAULT_SETTINGS }, createdAt: new Date().toISOString(),
    }
    saveBeadingProject(p)
    setDirty(false)
    applyProject(p, true)
  }

  const importImage = async (existingFilePath?: string, columns = 32) => {
    if(importing)return
    setImporting(true)
    try {
      const cols = Math.max(2,Math.min(120,Math.round(Number(columns)||32)))
      const filePath = existingFilePath || (await Taro.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'] })).tempFiles[0].tempFilePath
      const info = await Taro.getImageInfo({ src: filePath })
      const rows = Math.min(96, Math.max(8, Math.round((cols * info.height) / info.width)))
      Taro.showLoading({ title: '转图纸中…' })
      const S = SAMPLE_PER_CELL
      const off: any = Taro.createOffscreenCanvas({ type: '2d', width: cols * S, height: rows * S })
      const octx = off.getContext('2d')
      const img = off.createImage()
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = reject; img.src = filePath })
      octx.drawImage(img, 0, 0, cols * S, rows * S)
      const data: Uint8ClampedArray = octx.getImageData(0, 0, cols * S, rows * S).data
      const transparentKeys = new Set<string>()
      const sampleAt = (x: number, y: number): string => {
        const block: number[] = []
        let opaque = 0
        for (let yy = y * S; yy < (y + 1) * S; yy += 1) {
          for (let xx = x * S; xx < (x + 1) * S; xx += 1) {
            const i = (yy * cols * S + xx) * 4
            block.push(data[i], data[i + 1], data[i + 2], data[i + 3])
            if (data[i + 3] >= 128) opaque += 1
          }
        }
        if (opaque / (S * S) < 0.4) transparentKeys.add(cellKey(x, y))
        return sampleDominantColor(block, MARD_221_HEX as unknown as string[])
      }
      const cells = buildCellsFromSamples(rows, cols, sampleAt).map((c) => (
        transparentKeys.has(cellKey(c.x, c.y)) ? { ...c, transparent: true } : c
      ))
      const p: Project = {
        id: newBeadingProjectId(), imageUrl: '', rows, cols, cells,
        settings: { ...DEFAULT_SETTINGS }, createdAt: new Date().toISOString(),
      }
      saveBeadingProject(p)
        setDirty(false)
      applyProject(p, true)
      Taro.hideLoading()
    } catch (e) {
      Taro.hideLoading()
      if (/cancel/i.test(String((e as any)?.errMsg||(e as any)?.message||''))) return
      Taro.showToast({ title: '导入失败，请换张图片试试', icon: 'none' })
    } finally {setImporting(false)}
  }

  const saveNow = () => {
    const p = projectRef.current
    if (!p) return
    saveBeadingProject(p)
    setDirty(false)
    Taro.showToast({ title: '已保存到本机', icon: 'success' })
  }

  const exportImage = async () => {
    const p = projectRef.current
    if (!p) return
    try {
      Taro.showLoading({ title: '生成图纸…' })
      const cellPx = 16
      const off: any = Taro.createOffscreenCanvas({ type: '2d', width: p.cols * cellPx, height: p.rows * cellPx })
      const octx = off.getContext('2d')
      octx.fillStyle = '#ffffff'
      octx.fillRect(0, 0, p.cols * cellPx, p.rows * cellPx)
      for (const cell of p.cells) {
        if (cell.transparent) continue
        const cx = (cell.x + 0.5) * cellPx
        const cy = (cell.y + 0.5) * cellPx
        octx.beginPath()
        octx.fillStyle = cell.color
        octx.arc(cx, cy, cellPx * 0.44, 0, Math.PI * 2)
        octx.fill()
        const code = HEX_TO_CODE.get(cell.color.toLowerCase()) || ''
        octx.fillStyle = luminance(cell.color) > 0.62 ? '#333' : '#fff'
        octx.font = `${cellPx * 0.3}px sans-serif`
        octx.textAlign = 'center'
        octx.textBaseline = 'middle'
        octx.fillText(code, cx, cy)
      }
      const out = await Taro.canvasToTempFilePath({ canvas: off })
      Taro.hideLoading()
      await Taro.saveImageToPhotosAlbum({ filePath: out.tempFilePath })
      Taro.showToast({ title: '图纸已存入相册', icon: 'success' })
    } catch {
      Taro.hideLoading()
      Taro.showToast({ title: '导出失败（相册需授权）', icon: 'none' })
    }
  }

  const closeCanvas = () => {if(dirty)saveNow();returnFromEditor()}

  // 「我的作品」可带 id 直达；首页弹窗确认后带 create 参数直接进入画布。
  useEffect(() => {
    const params = Taro.getCurrentInstance().router?.params || {}
    if (params.id) openProject(params.id)
    else if (params.create === 'blank') {
      createBlank({ cols: Number(params.cols) || 32, rows: Number(params.rows) || 32 })
    } else if (params.create === 'import' && params.src) {
      void importImage(params.src, Number(params.cols) || 32)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 直接打开编辑页时也呈现与首页一致的创建弹窗，不再显示占满屏的旧空白列表。
  if (!project) return <View className='canvas-entry'>
    <CreateProjectFlow kind='beading' importing={importing}
      onClose={() => { returnFromEditor() }}
      onBeadingBlank={createBlank} onBeadingImport={cols => importImage(undefined, cols)} />
  </View>

  // ---------- 编辑态 ----------

  return (
    <View className='bead-page bead-editor'>
      <View className='editor-header'>
        <Button className='editor-icon' ariaLabel='关闭画布，返回上一页' onClick={closeCanvas}><Glyph name='close'/></Button>
        <Text className='editor-size'>{project.cols}×{project.rows}</Text>
        <View className='editor-history'><Button className='editor-icon' ariaLabel='撤销' disabled={!historyRef.current.length} onClick={()=>restoreHistory()}><Glyph name='undo'/></Button><Button className='editor-icon' ariaLabel='重做' disabled={!futureRef.current.length} onClick={()=>restoreHistory(true)}><View className='icon-flip'><Glyph name='undo'/></View></Button></View>
        <Button className='editor-icon' ariaLabel='导出图纸' onClick={exportImage}><Glyph name='export'/></Button>
        <Button className='editor-save' onClick={saveNow}>保存{dirty?'·':''}</Button>
      </View>
      <View className='bead-stage'>
      <Canvas
        id='beadCanvas'
        canvasId='beadCanvas'
        type='2d'
        className='bead-canvas'
        hidden={paletteOpen}
        style={{visibility:paletteOpen?'hidden':'visible'}}
        disableScroll
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      />
      {!paletteOpen && <BeadingCanvasOverlays
        tool={tool} zoom={zoom} onTool={setTool}
        onZoomOut={()=>zoomBy(.8)} onZoomIn={()=>zoomBy(1.25)}
        onFit={()=>{fitView(project);drawAll()}}
      />}
      </View>
      <View className='bead-footer'><Button className='palette-trigger' onClick={()=>setPaletteOpen(true)}><View className='palette-color' style={{background:color}}/><Text>颜色</Text></Button><ScrollView scrollX className='bead-quick-scroll'><View className='bead-quick-row'>{(used.length?used:MARD_221_COLORS.slice(0,12).map(c=>c.hex)).map(hex=><Button key={hex} className={'bead-quick-color'+(hex===color?' on':'')} style={{background:hex,color:luminance(hex)>.62?'#333':'#fff'}} onClick={()=>pickColor(hex)}>{HEX_TO_CODE.get(hex.toLowerCase())}</Button>)}</View></ScrollView></View>
      {paletteOpen && (
        <Sheet title='选择颜色 · MARD 221' onClose={()=>setPaletteOpen(false)}>
          {used.length > 0 && (
            <>
              <Text className='bead-palette-sub'>已用颜色</Text>
              <View className='bead-chips'>
                {used.map((hex) => (
                  <View key={hex} className='bead-chip' style={{ background: hex }} onClick={() => { pickColor(hex); setPaletteOpen(false) }} />
                ))}
              </View>
            </>
          )}
          <Text className='bead-palette-sub'>全部色卡</Text>
          <ScrollView scrollY className='bead-palette-scroll'>
            <View className='bead-chips'>
              {MARD_221_COLORS.map((c) => (
                <View key={c.code} className='bead-chip big' style={{ background: c.hex }} onClick={() => { pickColor(c.hex); setPaletteOpen(false) }}>
                  <Text className='bead-chip-code' style={{ color: luminance(c.hex) > 0.62 ? '#333' : '#fff' }}>{c.code}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Sheet>
      )}
    </View>
  )
}
