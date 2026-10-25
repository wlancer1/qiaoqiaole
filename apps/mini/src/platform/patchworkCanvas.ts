import type { PwPoint, PwProject, PwMaterial } from './patchworkStore'

export type CanvasViewport = { width: number; height: number; scale: number; ox: number; oy: number }

/** Limit offscreen artwork memory on phones; keep the correct physical aspect ratio. */
export function exportArtworkMetrics(widthMm: number, heightMm: number) {
  const maxSide = 3072
  const mmPerPixel = Math.min(4, maxSide / Math.max(widthMm, heightMm))
  return {
    scale: mmPerPixel,
    width: Math.max(1, Math.round(widthMm * mmPerPixel)),
    height: Math.max(1, Math.round(heightMm * mmPerPixel)),
  }
}
export type CanvasScene = { selectedId: string; stroke: PwPoint[]; images: Record<string, any> }

const crossStep = 22
const checkerSize = 12

/**
 * Same drawing hierarchy as the H5 patchwork canvas:
 * dotted workbench -> base/transparent checkerboard -> clipping + fabrics
 * -> pieces/selection -> centimetre rulers.
 * Geometry is millimetres. Viewport and drawing units are CSS/device-independent pixels;
 * the calling Canvas2D owner applies DPR exactly once.
 */
export function drawPatchworkWorkspace(ctx: any, project: PwProject, view: CanvasViewport, scene: CanvasScene) {
  const { width: w, height: h, scale, ox, oy } = view
  if (!(w > 0 && h > 0 && scale > 0)) return
  const bw = project.widthMm * scale
  const bh = project.heightMm * scale
  const onScreen = (p: PwPoint) => ({ x: ox + p.x * scale, y: oy + p.y * scale })
  const startPath = (points: PwPoint[], close = true) => {
    ctx.beginPath()
    points.forEach((p, i) => {
      const { x, y } = onScreen(p)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    if (close && points.length >= 3) ctx.closePath()
  }
  const drawTexture = (mat: PwMaterial | undefined, path: () => void) => {
    const image = mat?.presetId && scene.images[mat.presetId]
    if (!image || !mat) return
    const tile = Math.max(10, (mat.sampleWidthMm || 64) * scale)
    ctx.save()
    path()
    ctx.clip()
    // Texture tiles are anchored to the base, not the screen, and clipped to the shape.
    const xStart = ox + Math.floor((Math.max(0, ox) - ox) / tile) * tile
    const yStart = oy + Math.floor((Math.max(0, oy) - oy) / tile) * tile
    let tiles = 0
    for (let y = yStart; y < Math.min(h, oy + bh); y += tile) {
      for (let x = xStart; x < Math.min(w, ox + bw); x += tile) {
        if (++tiles > 3000) break
        ctx.drawImage(image, x, y, tile, tile)
      }
      if (tiles > 3000) break
    }
    ctx.restore()
  }
  const material = (id: string) => project.materials.find(m => m.id === id)

  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#edf3f7'
  ctx.fillRect(0, 0, w, h)
  // Subtle workbench crosses visible outside the cloth, as in H5.
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(130,165,190,.20)'
  for (let x = 11; x < w + crossStep; x += crossStep) {
    for (let y = 11; y < h + crossStep; y += crossStep) {
      ctx.beginPath()
      ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y)
      ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3)
      ctx.stroke()
    }
  }
  const base = material(project.base.materialId)
  ctx.save()
  ctx.shadowColor = 'rgba(37,47,60,.12)'
  ctx.shadowBlur = 16
  ctx.fillStyle = base?.color || '#ffffff'
  ctx.fillRect(ox, oy, bw, bh)
  ctx.restore()

  // A blank base must still be visible. The transparent checkerboard is a visual guide,
  // not persisted fabric or a fill to include in exported artwork.
  ctx.save()
  ctx.beginPath();ctx.rect(ox, oy, bw, bh);ctx.clip()
  if (!base) {
    ctx.fillStyle = '#edf0f3'
    const colFirst = Math.max(0, Math.floor(-ox / checkerSize))
    const colLast = Math.min(Math.ceil(bw / checkerSize), Math.ceil((w - ox) / checkerSize))
    const rowFirst = Math.max(0, Math.floor(-oy / checkerSize))
    const rowLast = Math.min(Math.ceil(bh / checkerSize), Math.ceil((h - oy) / checkerSize))
    for (let col = colFirst; col < colLast; col++) for (let row = rowFirst; row < rowLast; row++) {
      if ((col + row) % 2 === 0) ctx.fillRect(ox + col * checkerSize, oy + row * checkerSize, checkerSize, checkerSize)
    }
  } else {
    drawTexture(base, () => {ctx.beginPath();ctx.rect(ox, oy, bw, bh)})
    const step = project.widthMm > 900 ? 100 : 25
    ctx.strokeStyle = 'rgba(127,121,108,.13)'
    ctx.lineWidth = 1
    for (let x = step; x < project.widthMm; x += step) {
      ctx.beginPath();ctx.moveTo(ox + x * scale, oy);ctx.lineTo(ox + x * scale, oy + bh);ctx.stroke()
    }
    for (let y = step; y < project.heightMm; y += step) {
      ctx.beginPath();ctx.moveTo(ox, oy + y * scale);ctx.lineTo(ox + bw, oy + y * scale);ctx.stroke()
    }
  }
  ctx.restore()

  for (const guide of project.guides.filter(g => g.visible && g.points.length > 1)) {
    startPath(guide.points, false)
    ctx.strokeStyle = '#6295a6'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4]);ctx.stroke();ctx.setLineDash([])
  }

  for (const piece of project.pieces) {
    if (!piece.visible || piece.points.length < 3) continue
    const mat = material(piece.materialId)
    const paint = piece.paint
    startPath(piece.points)
    if (paint?.fill !== 'none') {
      ctx.fillStyle = paint?.fill === 'solid' ? paint.color : mat?.color || '#d8d8d8'
      ctx.fill()
      if (!paint || paint.fill === 'fabric') drawTexture(mat, () => startPath(piece.points))
    }
    startPath(piece.points)
    ctx.strokeStyle = 'rgba(96,74,58,.28)'
    ctx.lineWidth = 1
    ctx.stroke()
    if (scene.selectedId !== piece.id) continue
    const xs = piece.points.map(p => p.x), ys = piece.points.map(p => p.y)
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys)
    const x = ox + left * scale, y = oy + top * scale
    const ww = (right - left) * scale, hh = (bottom - top) * scale
    startPath(piece.points);ctx.strokeStyle = '#208edc';ctx.lineWidth = 2.2;ctx.stroke()
    ctx.strokeStyle = 'rgba(32,142,220,.75)';ctx.lineWidth = 1;ctx.strokeRect(x, y, ww, hh)
    const points = [[x,y],[x+ww/2,y],[x+ww,y],[x+ww,y+hh/2],[x+ww,y+hh],[x+ww/2,y+hh],[x,y+hh],[x,y+hh/2]]
    for (const [px, py] of points) {
      ctx.fillStyle = '#ffffff';ctx.fillRect(px-3.5,py-3.5,7,7)
      ctx.strokeStyle = '#208edc';ctx.lineWidth = 1.3;ctx.strokeRect(px-3.5,py-3.5,7,7)
    }
    ctx.fillStyle = '#22384c'
    ctx.font = '11px sans-serif';ctx.textAlign = 'center';ctx.textBaseline = 'middle'
    ctx.fillText(piece.name, x + ww / 2, y + hh / 2)
  }

  if (scene.stroke.length > 1) {
    startPath(scene.stroke, false)
    ctx.strokeStyle = '#208edc';ctx.lineWidth = 2
    ctx.setLineDash([5,4]);ctx.stroke();ctx.setLineDash([])
  }

  // Both axes use mm geometry but display whole centimetres.
  ctx.strokeStyle = 'rgba(125,147,168,.5)';ctx.lineWidth = 1
  for (let x = 0; x <= project.widthMm; x += 10) {
    const px = ox + x * scale
    if (px < 4 || px > w - 4) continue
    const tick = x % 50 === 0 ? 6 : 3
    ctx.beginPath();ctx.moveTo(px, oy - tick);ctx.lineTo(px, oy);ctx.stroke()
  }
  for (let y = 0; y <= project.heightMm; y += 10) {
    const py = oy + y * scale
    if (py < 4 || py > h - 4) continue
    const tick = y % 50 === 0 ? 6 : 3
    ctx.beginPath();ctx.moveTo(ox - tick, py);ctx.lineTo(ox, py);ctx.stroke()
  }
  const major = project.widthMm > 1000 ? 200 : 100
  ctx.fillStyle = '#7d93a8';ctx.font = '10px sans-serif';ctx.textBaseline = 'middle'
  for (let x = 0; x <= project.widthMm; x += major) {
    const px = ox + x * scale
    if (px < 15 || px > w - 32) continue
    ctx.textAlign = 'center'
    ctx.fillText(String(x / 10), px, Math.max(12, oy - 15))
  }
  for (let y = 0; y <= project.heightMm; y += major) {
    const py = oy + y * scale
    if (py < 12 || py > h - 28) continue
    ctx.textAlign = 'right'
    ctx.fillText(String(y / 10), Math.max(25, ox - 10), py)
  }
  ctx.textAlign = 'left'
  ctx.fillText('(cm)', Math.min(w - 36, ox + bw + 6), Math.max(12, oy - 15))
  ctx.fillText('(cm)', Math.max(25, ox - 26), Math.min(h - 14, oy + bh + 15))
  ctx.strokeStyle = '#a5adb0';ctx.lineWidth = 1
  ctx.strokeRect(ox, oy, bw, bh)
}
