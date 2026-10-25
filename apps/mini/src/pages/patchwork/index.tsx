import { Button,Input } from '../../components/Controls'
import { useEffect, useRef, useState } from 'react'
import { View, Text, Canvas, ScrollView, Image} from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  makePwProject, loadPwProject, savePwProject,
  newPwId, type PwProject, type PwPiece, type PwPoint,
} from '../../platform/patchworkStore'
import { polygonAreaMm2, pointInPolygon, simplifyStroke } from '../../platform/patchworkGeo'
import { BASE_SHAPE_GROUPS, shapeChoices, type BaseShapeGroup } from '../../../../h5/src/patchwork/shapeLibrary'
import { drawPatchworkWorkspace, exportArtworkMetrics } from '../../platform/patchworkCanvas'
import { fabricPresets, presetImage } from '../../platform/fabricPresets'
import { Sheet, Glyph } from '../../components/Ui'
import { CreateProjectFlow, type PatchworkCanvasOptions } from '../../components/CreateProjectFlow'
import { PatchworkCanvasOverlays } from '../../components/PatchworkCanvasOverlays'
import './index.scss'

type Tool = 'select' | 'brush' | 'add' | 'fill' | 'layers'

const EXTRA_COLORS: Array<{ name: string; color: string }> = [
  { name: '纯白', color: '#ffffff' }, { name: '炭黑', color: '#333333' }, { name: '正红', color: '#c0392b' },
  { name: '酒红', color: '#8e3b46' }, { name: '藏青', color: '#2e4057' }, { name: '牛仔蓝', color: '#5b7fa6' },
  { name: '薄荷绿', color: '#9fd8c9' }, { name: '墨绿', color: '#3f6212' }, { name: '姜黄', color: '#d9a441' },
  { name: '奶茶棕', color: '#b08968' }, { name: '浅灰', color: '#c9c9c9' }, { name: '藕粉', color: '#e3b7c8' },
]

const MIN_PIECE_AREA_MM2 = 100 // 太小的碎片直接丢弃（定版偏好）
const BUILTIN_SHAPES = shapeChoices('base', [])
function polygonPreview(points: PwPoint[]) {
  if (points.length < 3) return 'none'
  const minX=Math.min(...points.map(p=>p.x)), minY=Math.min(...points.map(p=>p.y))
  const w=Math.max(1,Math.max(...points.map(p=>p.x))-minX)
  const h=Math.max(1,Math.max(...points.map(p=>p.y))-minY)
  return 'polygon('+points.map(p=>((10+(p.x-minX)/w*80).toFixed(1)+'% '+(10+(p.y-minY)/h*80).toFixed(1)+'%')).join(',')+')'
}

export default function PatchworkPage() {
  const [project, setProject] = useState<PwProject | null>(null)
  const [tool, setToolState] = useState<Tool>('select')
  const [currentMatId, setCurrentMatId] = useState('B')
  const [selectedId, setSelectedId] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [cutOpen, setCutOpen] = useState(false)
  const [fillMode,setFillMode]=useState<'fabric'|'color'>('fabric')
  const [fillColor,setFillColor]=useState<string|null>('#dca1aa')
  const [fillMenu,setFillMenu]=useState(false)
  const [addOpen,setAddOpen]=useState(false)
  const [layersOpen,setLayersOpen]=useState(false)
  const [baseOpen,setBaseOpen]=useState(false)
  const [baseName,setBaseName]=useState('')
  const [baseWidth,setBaseWidth]=useState('40')
  const [baseHeight,setBaseHeight]=useState('40')
  const [shapeGroup,setShapeGroup]=useState<'all' | BaseShapeGroup>('all')
  const [zoom,setZoom]=useState(100)
  const [pickerTarget,setPickerTarget]=useState<'fabric'|'color'|'base'>('fabric')
  const [fabricQuery,setFabricQuery]=useState('')
  const [fabricLimit,setFabricLimit]=useState(16)
  const imageCache=useRef<Record<string,any>>({})
  const [dirty, setDirty] = useState(false)

  const canvasNodeRef = useRef<any>(null)
  const ctxRef = useRef<any>(null)
  const rectRef = useRef({ left: 0, top: 0, width: 0, height: 0 })
  const viewRef = useRef({ scale: 0.8, ox: 0, oy: 0 })
  const fitScaleRef = useRef(0.8)
  const gestureRef = useRef<{ mode:'idle'|'brush'|'drag'|'pan'|'pinch'; lastX:number; lastY:number; startDist:number; startScale:number; startOx:number; startOy:number; centerX:number; centerY:number; original?:PwProject; moved:boolean }>({mode:'idle',lastX:0,lastY:0,startDist:0,startScale:1,startOx:0,startOy:0,centerX:0,centerY:0,moved:false})
  const projectRef = useRef<PwProject | null>(null)
  const toolRef = useRef<Tool>('brush')
  const matRef = useRef('B')
  const selectedRef = useRef('')
  const strokeRef = useRef<PwPoint[]>([])
  const undoRef = useRef<PwProject[]>([])
  const redoRef = useRef<PwProject[]>([])
  const [historyCount,setHistoryCount]=useState(0)
  const [futureCount,setFutureCount]=useState(0)

  const setTool = (t: Tool) => { toolRef.current = t; setToolState(t) }
  const setSelected = (id: string) => { selectedRef.current = id; setSelectedId(id) }
  const setCurrentMat = (id: string) => { matRef.current = id; setCurrentMatId(id) }

  const materialOf = (p: PwProject, id: string) => p.materials.find((m) => m.id === id)

  const paintPath=(ctx:any,p:PwProject,materialId:string,paint:PwPiece['paint'],scale:number,ox:number,oy:number)=>{
    if(paint?.fill==='none')return
    const mat=materialOf(p,materialId)
    ctx.fillStyle=paint?.fill==='solid'?paint.color:(mat?.color||'#d8d8d8')
    ctx.fill()
    const img=mat?.presetId&&imageCache.current[mat.presetId]
    if(paint?.fill!=='solid'&&img){
      ctx.save();ctx.clip()
      const tile=Math.max(8,(mat?.sampleWidthMm||64)*scale)
      for(let y=oy;y<oy+p.heightMm*scale;y+=tile)for(let x=ox;x<ox+p.widthMm*scale;x+=tile)ctx.drawImage(img,x,y,tile,tile)
      ctx.restore()
    }
  }
  const openPicker=(target:'fabric'|'color'|'base')=>{setPickerTarget(target);setFabricQuery('');setFabricLimit(16);setFillMenu(false);setPickerOpen(true)}
  const applyFill=(id:string,mode=fillMode,color=fillColor,materialId=currentMatId)=>{
    const p=projectRef.current
    if(!p||!p.pieces.some(pc=>pc.id===id&&!pc.locked))return
    pushUndo()
    commit({...p,revision:p.revision+1,pieces:p.pieces.map(pc=>pc.id===id&&!pc.locked?{...pc,materialId:mode==='fabric'?materialId:pc.materialId,paint:{fill:mode==='fabric'?'fabric':color===null?'none':'solid',color:color||pc.paint?.color||'#dca1aa'}}:pc)})
    setSelected(id)
  }
  const chooseColor=(color:string|null)=>{setFillColor(color);if(selectedId)applyFill(selectedId,'color',color)}
  const chooseMaterial=(id:string)=>{setCurrentMat(id);if(pickerTarget==='base')setBaseFromPicker(id);else if(selectedId)applyFill(selectedId,'fabric',fillColor,id);setPickerOpen(false)}

  // ---------- 绘制 ----------
  const drawAll = () => {
    const ctx = ctxRef.current
    const p = projectRef.current
    if (!ctx || !p) return
    drawPatchworkWorkspace(ctx, p, { ...rectRef.current, ...viewRef.current }, {
      selectedId: selectedRef.current, stroke: strokeRef.current, images: imageCache.current,
    })
  }

  const fitView = (p: PwProject) => {
    const { width, height } = rectRef.current
    if (!width || !height) {
      // 初始化节点前恢复显示状态，待 selectorQuery 得到真实尺寸后再居中。
      viewRef.current = {scale:fitScaleRef.current,ox:0,oy:0}
      setZoom(100)
      return
    }
    // 与 H5 metrics 一致：四边保留尺标/刻度，不把画布放大到工具栏下。
    const scale = Math.max(0.01, Math.min((width - 76) / p.widthMm, (height - 80) / p.heightMm))
    fitScaleRef.current = scale
    viewRef.current = { scale, ox: (width - p.widthMm * scale) / 2, oy: (height - p.heightMm * scale) / 2 }
    setZoom(100)
  }

  const zoomAt = (factor: number, cx = rectRef.current.width / 2, cy = rectRef.current.height / 2) => {
    const v = viewRef.current
    const next = Math.max(fitScaleRef.current * .2, Math.min(fitScaleRef.current * 6, v.scale * factor))
    if (!(next > 0)) return
    const ratio = next / v.scale
    viewRef.current = { scale: next, ox: cx - (cx - v.ox) * ratio, oy: cy - (cy - v.oy) * ratio }
    setZoom(Math.round(next / fitScaleRef.current * 100))
    drawAll()
  }

  const applyProject = (p: PwProject | null, fit = false) => {
    if(p)p={...p,materials:[...p.materials,...fabricPresets.filter(m=>!p!.materials.some(old=>old.id===m.id)).map(({image,...m})=>m)]}
    if(p&&!p.materials.find(m=>m.id===matRef.current)?.presetId)setCurrentMat(fabricPresets[0].id)
    projectRef.current = p
    setProject(p)
    setSelected('')
    strokeRef.current = []
    undoRef.current = []
    redoRef.current = []
    setHistoryCount(0)
    setFutureCount(0)
    if (p && fit) fitView(p)
    drawAll()
  }

  const initCanvas = () => {
    const query = Taro.createSelectorQuery()
    query.select('#pwCanvas').fields({ node: true, size: true, rect: true }, (res: any) => {
      if (!res || !res.node || !(res.width > 0 && res.height > 0)) return
      const canvas = res.node
      // Canvas2D bitmap is physical pixels, interactions/layout are CSS pixels.
      const dpr = Math.min(3, (Taro.getWindowInfo ? Taro.getWindowInfo().pixelRatio : 2) || 2)
      canvas.width = Math.round(res.width * dpr)
      canvas.height = Math.round(res.height * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      canvasNodeRef.current = canvas
      ctxRef.current = ctx
      rectRef.current = { left: res.left, top: res.top, width: res.width, height: res.height }
      if (projectRef.current) { fitView(projectRef.current); drawAll() }
      if(canvas.createImage)for(const mat of fabricPresets){
        if(imageCache.current[mat.presetId])continue
        const img=canvas.createImage()
        img.onload=()=>{imageCache.current[mat.presetId]=img;drawAll()}
        img.src=mat.image
      }
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

  useEffect(() => { drawAll() }, [project, selectedId, currentMatId])

  // 微信原生导航栏返回、切页卸载时同样落本机草稿；不只依赖自定义「返回」按钮。
  useEffect(() => () => {
    const latest = projectRef.current
    if (latest) savePwProject(latest)
  }, [])

  const commit = (next: PwProject) => {
    projectRef.current = next
    setProject(next)
    setDirty(true)
    drawAll()
  }

  const pushUndo = () => {
    const p = projectRef.current
    if (!p) return
    undoRef.current = [...undoRef.current.slice(-79), p]
    redoRef.current = []
    setHistoryCount(undoRef.current.length)
    setFutureCount(0)
  }

  const undo = () => {
    const p = projectRef.current
    const prev = undoRef.current.pop()
    if (!p || !prev) return
    redoRef.current.push(p)
    setHistoryCount(undoRef.current.length)
    setFutureCount(redoRef.current.length)
    setSelected('')
    commit({ ...prev, revision: p.revision + 1 })
  }
  const redo = () => {
    const p = projectRef.current
    const next = redoRef.current.pop()
    if (!p || !next) return
    undoRef.current.push(p)
    setHistoryCount(undoRef.current.length)
    setFutureCount(redoRef.current.length)
    setSelected('')
    commit({ ...next, revision: p.revision + 1 })
  }

  // ---------- 手势 ----------
  const toMm = (clientX: number, clientY: number): PwPoint => {
    const { left, top } = rectRef.current
    const { scale, ox, oy } = viewRef.current
    return { x: (clientX - left - ox) / scale, y: (clientY - top - oy) / scale }
  }

  const topPieceAt = (pt: PwPoint): PwPiece | undefined => {
    const p = projectRef.current
    if (!p) return undefined
    for (let i = p.pieces.length - 1; i >= 0; i -= 1) {
      const piece = p.pieces[i]
      if (piece.visible && piece.points.length >= 3 && pointInPolygon(pt, piece.points)) return piece
    }
    return undefined
  }

  const onTouchStart = (e: any) => {
    if (pickerOpen || cutOpen || addOpen || layersOpen || baseOpen) return
    if (fillMenu) { setFillMenu(false); return }
    const touches = e.touches || []
    const p = projectRef.current
    if (!p || !touches.length) return
    const point = (t: any) => ({ x: t.clientX ?? t.pageX, y: t.clientY ?? t.pageY })
    if (touches.length >= 2) {
      const a = point(touches[0]), b = point(touches[1])
      const v = viewRef.current
      gestureRef.current = { mode:'pinch', lastX:0, lastY:0, moved:false,
        startDist:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),
        startScale:v.scale, startOx:v.ox, startOy:v.oy,
        centerX:(a.x+b.x)/2-rectRef.current.left, centerY:(a.y+b.y)/2-rectRef.current.top }
      strokeRef.current = []
      drawAll()
      return
    }
    const { x, y } = point(touches[0])
    const pt = toMm(x, y)
    const hit = topPieceAt(pt)
    const t = toolRef.current
    const v = viewRef.current
    gestureRef.current = { mode:'idle', lastX:x, lastY:y, moved:false, startDist:0,
      startScale:v.scale, startOx:v.ox, startOy:v.oy, centerX:0, centerY:0 }
    if (t === 'brush') {
      gestureRef.current.mode = 'brush'
      strokeRef.current = [pt]
    } else if (t === 'select') {
      setSelected(hit?.id || '')
      gestureRef.current.mode = hit && !hit.locked ? 'drag' : 'pan'
      drawAll()
    } else if (t === 'fill' && hit && !hit.locked) {
      applyFill(hit.id)
    }
  }

  const onTouchMove = (e: any) => {
    const touches = e.touches || []
    if (!touches.length) return
    const point = (t: any) => ({ x: t.clientX ?? t.pageX, y: t.clientY ?? t.pageY })
    const g = gestureRef.current
    if (touches.length >= 2) {
      if (g.mode !== 'pinch') return
      const a = point(touches[0]), b = point(touches[1])
      const dist = Math.max(1, Math.hypot(b.x-a.x,b.y-a.y))
      const next = Math.max(fitScaleRef.current * .2, Math.min(fitScaleRef.current * 6, g.startScale * dist / g.startDist))
      const cx = (a.x+b.x)/2-rectRef.current.left
      const cy = (a.y+b.y)/2-rectRef.current.top
      const worldX = (g.centerX-g.startOx)/g.startScale
      const worldY = (g.centerY-g.startOy)/g.startScale
      viewRef.current = { scale:next, ox:cx-worldX*next, oy:cy-worldY*next }
      setZoom(Math.round(next / fitScaleRef.current * 100))
      drawAll()
      return
    }
    if (g.mode === 'idle' || g.mode === 'pinch') return
    const { x, y } = point(touches[0])
    const dx = x - g.lastX, dy = y - g.lastY
    if (g.mode === 'brush') {
      const pt = toMm(x, y)
      const last = strokeRef.current[strokeRef.current.length - 1]
      if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 2.5) {
        strokeRef.current = [...strokeRef.current, pt]
        drawAll()
      }
    } else if (g.mode === 'pan') {
      viewRef.current = { ...viewRef.current, ox: viewRef.current.ox + dx, oy: viewRef.current.oy + dy }
      drawAll()
    } else if (g.mode === 'drag' && selectedRef.current) {
      const p = projectRef.current
      if (p && Math.abs(dx) + Math.abs(dy) > 0) {
        if (!g.moved) { pushUndo(); g.moved = true }
        const id = selectedRef.current
        const scale = viewRef.current.scale
        commit({ ...p, revision:p.revision+1, pieces:p.pieces.map(piece => piece.id === id
          ? { ...piece, points:piece.points.map(pt=>({x:pt.x+dx/scale,y:pt.y+dy/scale})) }
          : piece) })
      }
    }
    g.lastX = x
    g.lastY = y
  }

  const onTouchEnd = (e?: any) => {
    const g = gestureRef.current
    const touches = e?.touches || []
    if (touches.length > 0) return
    const finishedMode = g.mode
    gestureRef.current.mode = 'idle'
    if (finishedMode !== 'brush') { strokeRef.current=[];drawAll();return }
    const p = projectRef.current
    const raw = strokeRef.current
    strokeRef.current = []
    if (!p || raw.length < 3) { drawAll(); return }
    // 钳制到画布范围内
    const clamped = raw.map((pt) => ({
      x: Math.min(p.widthMm, Math.max(0, pt.x)),
      y: Math.min(p.heightMm, Math.max(0, pt.y)),
    }))
    const points = simplifyStroke(clamped, 3)
    if (points.length < 3 || polygonAreaMm2(points) < MIN_PIECE_AREA_MM2) {
      Taro.showToast({ title: '布片太小，已忽略', icon: 'none' })
      drawAll()
      return
    }
    pushUndo()
    const piece: PwPiece = {
      id: newPwId('piece'),
      name: `布片${p.pieces.length + 1}`,
      points,
      materialId: matRef.current,
      locked: false,
      visible: true,
      paint:{fill:'solid',color:'#dca1aa'},
      seamMm: 0,
      texture: { scale: 1, rotation: 0, offsetX: 0, offsetY: 0 },
    }
    commit({ ...p, revision: p.revision + 1, pieces: [...p.pieces, piece] })
    setSelected(piece.id)
  }

  // ---------- 选中布片操作 ----------
  const selectedPiece = project?.pieces.find((pc) => pc.id === selectedId)

  const applyCurrentToSelected = () => openPicker('fabric')

  const deleteSelected = async () => {
    const p = projectRef.current
    if (!p || !selectedId) return
    const res = await Taro.showModal({ title: '删除布片', content: '删除选中的布片？' })
    if (!res.confirm) return
    pushUndo()
    commit({ ...p, revision: p.revision + 1, pieces: p.pieces.filter((pc) => pc.id !== selectedId) })
    setSelected('')
  }

  const moveSelected = (dir: 1 | -1) => {
    const p = projectRef.current
    if (!p) return
    const idx = p.pieces.findIndex((pc) => pc.id === selectedId)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= p.pieces.length) return
    pushUndo()
    const pieces = [...p.pieces]
    const [item] = pieces.splice(idx, 1)
    pieces.splice(swap, 0, item)
    commit({ ...p, revision: p.revision + 1, pieces })
  }

  const setBaseFromPicker = (materialId: string) => {
    const p = projectRef.current
    if (!p || p.base.materialId === materialId) return
    pushUndo()
    commit({
      ...p, revision: p.revision + 1,
      base: { ...p.base, materialId, includeInCutList: Boolean(materialId) },
    })
  }

  // ---------- H5 对齐的画布工具 ----------
  const addShape = (choice: ReturnType<typeof shapeChoices>[number]) => {
    const p = projectRef.current
    const polygon = choice.polygons[0]
    if (!p || !polygon || polygon.length < 3) return
    const xs = polygon.map(pt => pt.x), ys = polygon.map(pt => pt.y)
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const w = Math.max(1, Math.max(...xs) - minX), h = Math.max(1, Math.max(...ys) - minY)
    const width = Math.min(110, p.widthMm * .34)
    const height = Math.min(p.heightMm * .34, width * h / w)
    const cx = p.widthMm / 2, cy = p.heightMm / 2
    const points = polygon.map(pt => ({
      x: cx - width / 2 + (pt.x - minX) * width / w,
      y: cy - height / 2 + (pt.y - minY) * height / h,
    }))
    const piece: PwPiece = {
      id:newPwId('piece'), name:choice.name, points, materialId:matRef.current,
      visible:true, locked:false, seamMm:0,
      paint:{fill:'solid',color:fillColor || '#dca1aa'},
      texture:{scale:1,rotation:0,offsetX:0,offsetY:0},
    }
    pushUndo()
    commit({ ...p, revision:p.revision+1, pieces:[...p.pieces, piece] })
    setAddOpen(false)
    setTool('select')
    setSelected(piece.id)
  }
  const openBaseSettings = () => {
    const p = projectRef.current
    if (!p) return
    setBaseName(p.name)
    setBaseWidth(String(p.widthMm / 10))
    setBaseHeight(String(p.heightMm / 10))
    setBaseOpen(true)
  }
  const applyBaseSettings = () => {
    const p = projectRef.current
    if (!p) return
    const cm = (v: string, fallback: number) => {
      const n = Number(v)
      return Number.isFinite(n) && n >= 10 && n <= 300 ? Math.round(n * 10) : fallback
    }
    const widthMm = cm(baseWidth,p.widthMm), heightMm = cm(baseHeight,p.heightMm)
    const name = baseName.trim() || '未命名拼布'
    if (widthMm !== p.widthMm || heightMm !== p.heightMm || name !== p.name) {
      pushUndo()
      commit({ ...p, revision:p.revision+1, widthMm, heightMm, name })
      if (widthMm !== p.widthMm || heightMm !== p.heightMm) fitView({ ...p,widthMm,heightMm })
    }
    setBaseOpen(false)
  }
  const toggleLayer = (id: string, key: 'locked' | 'visible') => {
    const p = projectRef.current
    if (!p) return
    pushUndo()
    commit({ ...p, revision:p.revision+1,
      pieces:p.pieces.map(piece => piece.id === id ? { ...piece, [key]:!piece[key] } : piece) })
  }
  const rotateSelected = () => {
    const p = projectRef.current
    const piece = p?.pieces.find(pc => pc.id === selectedRef.current)
    if (!p || !piece || piece.locked) return
    const xs = piece.points.map(pt => pt.x), ys = piece.points.map(pt => pt.y)
    const cx = (Math.min(...xs)+Math.max(...xs))/2, cy = (Math.min(...ys)+Math.max(...ys))/2
    pushUndo()
    commit({ ...p, revision:p.revision+1, pieces:p.pieces.map(pc => pc.id===piece.id
      ? { ...pc, points:pc.points.map(pt=>({x:cx-(pt.y-cy),y:cy+(pt.x-cx)})) } : pc) })
  }
  const duplicateSelected = () => {
    const p = projectRef.current
    const piece = p?.pieces.find(pc => pc.id===selectedRef.current)
    if (!p || !piece) return
    const duplicate:PwPiece = { ...piece, id:newPwId('piece'), name:piece.name+' 副本',
      points:piece.points.map(pt=>({x:pt.x+12,y:pt.y+12})), locked:false }
    pushUndo()
    commit({ ...p, revision:p.revision+1, pieces:[...p.pieces,duplicate] })
    setSelected(duplicate.id)
  }
  const confirmClear = async () => {
    const p = projectRef.current
    if (!p || (!p.pieces.length && !p.guides.length)) return
    const result = await Taro.showModal({
      title:'清空画布', content:'清空所有布片和辅助线？可使用撤销恢复。', confirmColor:'#c0392b',
    })
    if (!result.confirm) return
    pushUndo()
    commit({ ...p, revision:p.revision+1, pieces:[], guides:[] })
    setSelected('')
    setTool('select')
  }

  // ---------- 存档 / 导出 ----------
  const saveNow = () => {
    const p = projectRef.current
    if (!p) return
    savePwProject(p)
    setDirty(false)
    Taro.showToast({ title: '已保存到本机', icon: 'success' })
  }

  const exportImage = async () => {
    const p = projectRef.current
    if (!p) return
    if(p.materials.some(m=>m.presetId&&!imageCache.current[m.presetId]&&(m.id===p.base.materialId||p.pieces.some(pc=>pc.materialId===m.id&&(!pc.paint||pc.paint.fill==='fabric'))))){Taro.showToast({title:'布料加载中，请稍后导出',icon:'none'});return}
    try {
      Taro.showLoading({ title: '生成图片…' })
      const { scale: pxPerMm, width, height } = exportArtworkMetrics(p.widthMm, p.heightMm)
      const off: any = Taro.createOffscreenCanvas({ type: '2d', width, height })
      const octx = off.getContext('2d')
      const baseMat = p.base.materialId ? materialOf(p, p.base.materialId) : undefined
      if(baseMat){octx.beginPath();octx.rect(0,0,p.widthMm*pxPerMm,p.heightMm*pxPerMm);paintPath(octx,p,baseMat.id,undefined,pxPerMm,0,0)}
      for (const piece of p.pieces) {
        if (!piece.visible || piece.points.length < 3) continue
          octx.beginPath()
        piece.points.forEach((pt, i) => {
          if (i === 0) octx.moveTo(pt.x * pxPerMm, pt.y * pxPerMm); else octx.lineTo(pt.x * pxPerMm, pt.y * pxPerMm)
        })
        octx.closePath()
        paintPath(octx,p,piece.materialId,piece.paint,pxPerMm,0,0)
      }
      const out = await Taro.canvasToTempFilePath({ canvas: off })
      Taro.hideLoading()
      await Taro.saveImageToPhotosAlbum({ filePath: out.tempFilePath })
      Taro.showToast({ title: '已存入相册', icon: 'success' })
    } catch {
      Taro.hideLoading()
      Taro.showToast({ title: '导出失败（相册需授权）', icon: 'none' })
    }
  }

  const backToWorks = () => {
    if (dirty) saveNow()
    void Taro.redirectTo({ url: '/pages/works/index' })
  }

  const openProject = (id: string) => {
    const p = loadPwProject(id)
    if (!p) { Taro.showToast({ title: '工程数据不存在', icon: 'none' }); return }
    if (p.materials.length) setCurrentMat(p.materials[0].id === 'A' && p.materials[1] ? p.materials[1].id : p.materials[0].id)
    setDirty(false)
    setTool('select')
    applyProject(p, true)
  }

  const createProject = (options: PatchworkCanvasOptions) => {
    const p = makePwProject(options.widthMm, options.heightMm)
    if (options.baseFabricId) p.base = { ...p.base, materialId: options.baseFabricId, includeInCutList: true }
    savePwProject(p)
    setCurrentMat('B')
    setDirty(false)
    setTool('select')
    applyProject(p, true)
  }

  // 带 id 直达旧工程；由首页创建弹窗确认后带 create=blank 直达新工程。
  useEffect(() => {
    const params = Taro.getCurrentInstance().router?.params || {}
    if (params.id) openProject(params.id)
    else if (params.create === 'blank') {
      const size = (raw: string | undefined) => {
        const v = Number(raw)
        return Number.isFinite(v) && v >= 100 && v <= 3000 ? Math.round(v) : 400
      }
      createProject({ widthMm: size(params.w), heightMm: size(params.h), baseFabricId: params.base || '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 无参数进入时也先显示创建设置。旧本地工程从「最近项目 / 我的作品」管理。
  if (!project) return <View className='pw-create-entry'>
    <CreateProjectFlow kind='patchwork' onClose={backToWorks} onPatchworkCreate={createProject} />
  </View>

  // ---------- 编辑态 ----------
  const overlayDialogOpen = pickerOpen || cutOpen || addOpen || layersOpen || baseOpen
  const usedMats = project.materials.filter((m) => m.presetId && (project.pieces.some((pc) => pc.materialId === m.id && (!pc.paint || pc.paint.fill==='fabric')) || project.base.materialId === m.id))

  const cutRows = project.materials
    .map((m) => {
      const pcs = project.pieces.filter((pc) => pc.materialId === m.id && (!pc.paint || pc.paint.fill==='fabric'))
      const areaCm2 = pcs.reduce((s, pc) => s + polygonAreaMm2(pc.points), 0) / 100
      const isBase = project.base.materialId === m.id && project.base.includeInCutList
      return { mat: m, count: pcs.length + (isBase ? 1 : 0), areaCm2: areaCm2 + (isBase ? (project.widthMm * project.heightMm) / 100 : 0), isBase }
    })
    .filter((r) => r.count > 0)

  return (
    <View className={'pw-page pw-editor'+(selectedPiece?' has-selection':'')}>
      <View className='pw-topbar'>
        <View className='pw-top-left'>
          <Button className='pw-icon-button pw-back' ariaLabel='返回作品列表' onClick={backToWorks}><Glyph name='back'/></Button>
          <Button className='pw-size-button' ariaLabel='作品尺寸' onClick={openBaseSettings}>
            <Text>{project.widthMm / 10} × {project.heightMm / 10} cm</Text>
            <Text className='pw-size-chevron'>⌄</Text>
          </Button>
        </View>
        <View className='pw-top-center'>
          <Button className='pw-icon-button' ariaLabel='撤销' disabled={!historyCount} onClick={undo}><Glyph name='undo'/></Button>
          <Button className='pw-icon-button' ariaLabel='重做' disabled={!futureCount} onClick={redo}><View className='pw-redo-glyph'><Glyph name='undo'/></View></Button>
        </View>
        <View className='pw-top-right'>
          <Button className='pw-top-export' ariaLabel='导出' onClick={exportImage}><Glyph name='export'/><Text>导出</Text></Button>
          <Button className='pw-top-save' ariaLabel='保存' onClick={saveNow}><Glyph name='check'/><Text>保存{dirty ? '·' : ''}</Text></Button>
        </View>
      </View>
      <View className='pw-stage'>
        <Canvas id='pwCanvas' canvasId='pwCanvas' type='2d' className='pw-canvas'
          hidden={overlayDialogOpen} style={{ visibility: overlayDialogOpen ? 'hidden' : 'visible' }} disableScroll
          onTouchStart={onTouchStart} onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => {gestureRef.current.mode='idle';strokeRef.current=[];drawAll()}} />
        {!overlayDialogOpen && <PatchworkCanvasOverlays
          tool={tool} canClear={Boolean(project.pieces.length || project.guides.length)}
          fillMenu={fillMenu} fillMode={fillMode}
          selectedPiece={Boolean(selectedPiece)} zoom={zoom}
          onTool={(next) => {
            if (next==='add') {setTool('add');setAddOpen(true);setFillMenu(false);return}
            if (next==='layers') {setTool('layers');setLayersOpen(true);setFillMenu(false);return}
            if (next==='fill') {setTool('fill');setFillMenu(tool==='fill'?!fillMenu:true);return}
            setTool(next);setFillMenu(false)
          }}
          onClear={()=>void confirmClear()}
          onFillMode={(mode)=>{setFillMode(mode);setFillMenu(false)}}
          onRotate={rotateSelected} onCopy={duplicateSelected}
          onMoveUp={()=>moveSelected(1)} onChooseFabric={applyCurrentToSelected}
          onDelete={()=>void deleteSelected()}
          onZoomOut={()=>zoomAt(1/1.25)} onZoomIn={()=>zoomAt(1.25)}
          onFit={()=>{const p=projectRef.current;if(p){fitView(p);drawAll()}}}
        />}
      </View>
      {tool==='brush'&&<View className='pw-brushbar'>
        <View className='pw-brushbar-detail'><Glyph name='brush'/><View><Text className='pw-brushbar-name'>自由绘制</Text><Text className='pw-brushbar-note'>画出闭合轮廓，松手生成布片</Text></View></View>
        <Button className='pw-brushbar-action' ariaLabel='选择画笔布料' onClick={()=>openPicker('fabric')}><Glyph name='grid'/><Text>布料</Text></Button>
      </View>}
      {tool==='fill'&&fillMode==='fabric'&&<View className='pw-matbar'>
        <Button className='pw-matbar-btn' ariaLabel='打开布料列表' onClick={()=>openPicker('fabric')}><Glyph name='grid'/><Text>布料</Text></Button>
        <ScrollView scrollX className='pw-matbar-scroll'><View className='pw-matbar-row'>
          {usedMats.map(m=><Button key={m.id} ariaLabel={'布料 '+m.name} className={'pw-swatch'+(m.id===currentMatId?' on':'')} onClick={()=>{setCurrentMat(m.id);if(selectedId)applyFill(selectedId,'fabric',fillColor,m.id)}}><Image src={presetImage(m.presetId)||''} mode='aspectFill'/></Button>)}
        </View></ScrollView>
      </View>}
      {tool==='fill'&&fillMode==='color'&&<View className='pw-matbar'>
        <Button className='pw-matbar-btn' ariaLabel='打开颜色列表' onClick={()=>openPicker('color')}><Glyph name='fill'/><Text>颜色</Text></Button>
        <ScrollView scrollX className='pw-matbar-scroll'><View className='pw-matbar-row'>
          {[null,'#dca1aa',...EXTRA_COLORS.map(c=>c.color)].map(color=><Button key={color||'none'} ariaLabel={color?'填色 '+color:'无填充'} className={'pw-swatch'+(color===fillColor?' on':'')} style={{backgroundColor:color||'#fff'}} onClick={()=>chooseColor(color)}>{color===null&&<View className='pw-none-icon'/>}</Button>)}
        </View></ScrollView>
      </View>}
      {addOpen&&<Sheet title='添加形状' className='pw-editor-sheet' onClose={()=>{setAddOpen(false);setTool('select')}}>
        <View className='pw-shape-sheet'>
          <ScrollView scrollX className='pw-shape-groups'>
            <View className='pw-shape-groups-row'>
              {[{id:'all' as const,label:'全部'},...BASE_SHAPE_GROUPS].map(group=><Button key={group.id}
                className={'pw-shape-filter'+(shapeGroup===group.id?' on':'')}
                onClick={()=>setShapeGroup(group.id)}>{group.label}</Button>)}
            </View>
          </ScrollView>
          <Text className='pw-shape-caption'>点击图形直接放入画布 · {BUILTIN_SHAPES.filter(c=>shapeGroup==='all'||c.group===shapeGroup).length} 个</Text>
          <View className='pw-shape-grid'>
            {BUILTIN_SHAPES.filter(c=>shapeGroup==='all'||c.group===shapeGroup).map(choice=>
              <Button key={choice.id} className='pw-shape-item' ariaLabel={'添加形状 '+choice.name} onClick={()=>addShape(choice)}>
                <View className='pw-shape-tile'><View className='pw-shape-polygon' style={{clipPath:polygonPreview(choice.polygons[0]),backgroundColor:'#7ba9d7'}} /></View>
                <Text>{choice.name}</Text>
              </Button>)}
          </View>
        </View>
      </Sheet>}
      {layersOpen&&<Sheet title='图层' className='pw-editor-sheet' onClose={()=>{setLayersOpen(false);setTool('select')}}>
        <View className='pw-layers-panel'>
          <Text className='pw-panel-note'>点击布片选中 · 可锁定或隐藏图层</Text>
          {!project.pieces.length&&<Text className='pw-panel-empty'>还没有布片，使用「添加」或「画笔」创建。</Text>}
          {[...project.pieces].reverse().map(piece=>
            <View className={'pw-layer-row'+(selectedId===piece.id?' on':'')} key={piece.id}>
              <Button className='pw-layer-main' ariaLabel={'选中图层 '+piece.name} onClick={()=>{setSelected(piece.id);setLayersOpen(false);setTool('select')}}>
                <View className='pw-layer-dot' style={{backgroundColor:piece.paint?.fill==='solid'?piece.paint.color:materialOf(project,piece.materialId)?.color||'#ddd'}}/>
                <Text>{piece.name}</Text>
              </Button>
              <Button className='pw-layer-toggle' ariaLabel={piece.visible?'隐藏 '+piece.name:'显示 '+piece.name}
                onClick={()=>toggleLayer(piece.id,'visible')}><Text>{piece.visible?'可见':'隐藏'}</Text></Button>
              <Button className='pw-layer-toggle' ariaLabel={piece.locked?'解锁 '+piece.name:'锁定 '+piece.name}
                onClick={()=>toggleLayer(piece.id,'locked')}><Text>{piece.locked?'已锁':'锁定'}</Text></Button>
            </View>)}
          <Button className='pw-layer-cut' ariaLabel='裁片清单' onClick={()=>{setLayersOpen(false);setTool('select');setCutOpen(true)}}><Glyph name='list'/><Text>查看裁片清单</Text></Button>
        </View>
      </Sheet>}
      {baseOpen&&<Sheet title='底布与项目设置' className='pw-editor-sheet' onClose={()=>setBaseOpen(false)}>
        <View className='pw-settings-panel'>
          <View className='pw-settings-field'><Text>项目名称</Text><Input ariaLabel='项目名称' value={baseName} onInput={e=>setBaseName(e.detail.value)} /></View>
          <View className='pw-settings-cols'>
            <View className='pw-settings-field'><Text>底布宽度 (cm)</Text><Input ariaLabel='底布宽度' type='number' value={baseWidth} onInput={e=>setBaseWidth(e.detail.value)} /></View>
            <View className='pw-settings-field'><Text>底布高度 (cm)</Text><Input ariaLabel='底布高度' type='number' value={baseHeight} onInput={e=>setBaseHeight(e.detail.value)} /></View>
          </View>
          <Text className='pw-settings-caption'>底布材料</Text>
          <Button className='pw-base-trigger' ariaLabel='选择底布' onClick={()=>{setBaseOpen(false);openPicker('base')}}>
            <View className='pw-layer-dot' style={{backgroundColor:materialOf(project,project.base.materialId)?.color||'#f0f3f6'}}/>
            <Text>{materialOf(project,project.base.materialId)?.name||'无底布'}</Text><Text className='pw-size-chevron'>›</Text>
          </Button>
          <Button className='pw-settings-submit' ariaLabel='应用设置' onClick={applyBaseSettings}>应用设置</Button>
        </View>
      </Sheet>}
      {pickerOpen&&<Sheet title={pickerTarget==='color'?'选择填充颜色':pickerTarget==='base'?'选择底布':'选择布料'} onClose={()=>setPickerOpen(false)}>
       {pickerTarget==='color'?<View className='pw-chips'>{[null,'#dca1aa',...EXTRA_COLORS.map(c=>c.color)].map(color=><Button key={color||'none'} className={'pw-matcard'+(color===fillColor?' on':'')} ariaLabel={color?'填色 '+color:'无填充'} onClick={()=>{chooseColor(color);setPickerOpen(false)}}><View className='pw-matcard-color' style={{background:color||'#fff'}}>{color===null&&<View className='pw-none-icon'/>}</View><Text className='pw-matcard-name'>{color||'无填充'}</Text></Button>)}</View>:<>
        <View className='page-search'><Glyph name='search'/><Input value={fabricQuery} placeholder='搜索布料名称' onInput={e=>{setFabricQuery(e.detail.value);setFabricLimit(16)}}/></View>
        <ScrollView scrollY className='pw-fabric-scroll' onScrollToLower={()=>setFabricLimit(n=>n+16)}>
        <View className='pw-chips'>
         {pickerTarget==='base'&&!fabricQuery&&<Button className='pw-matcard' onClick={()=>{setBaseFromPicker('');setPickerOpen(false)}}><View className='pw-matcard-color'><View className='pw-none-icon'/></View><Text className='pw-matcard-name'>无底布</Text></Button>}
         {project.materials.filter(m=>m.presetId&&m.name.includes(fabricQuery.trim())).slice(0,fabricLimit).map(m=><Button key={m.id} className={'pw-matcard'+((pickerTarget==='base'?project.base.materialId:currentMatId)===m.id?' on':'')} onClick={()=>chooseMaterial(m.id)}><Image className='pw-matcard-color' src={presetImage(m.presetId)||''} mode='aspectFill'/><Text className='pw-matcard-name'>{m.name}</Text></Button>)}
        </View>
        <Text className='page-state'>{project.materials.filter(m=>m.presetId&&m.name.includes(fabricQuery.trim())).length>fabricLimit?'上拉加载更多':'已显示全部布料'}</Text>
        </ScrollView>
       </>}
      </Sheet>}
      {cutOpen && (
        <Sheet title='裁片清单' onClose={()=>setCutOpen(false)}>
          {cutRows.length === 0
            ? <Text className='pw-picker-sub'>还没有布片。</Text>
            : cutRows.map((r) => (
              <View key={r.mat.id} className='pw-cutrow'>
                <View className='pw-cutrow-color' style={{ background: r.mat.color }} />
                <Text className='pw-cutrow-name'>{r.mat.name}{r.isBase ? '（含底布）' : ''}</Text>
                <Text className='pw-cutrow-meta'>{r.count} 片 · {r.areaCm2.toFixed(1)} cm²</Text>
              </View>
            ))}
        </Sheet>
      )}
    </View>
  )
}
