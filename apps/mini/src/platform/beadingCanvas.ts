import type { Cell } from '@qiaoqiaole/core'

export type BeadingCanvasViewport = { width: number; height: number; scale: number; ox: number; oy: number }
export type BeadingCanvasProject = { cols: number; rows: number; cells: Cell[] }

/** Canvas2D 拼豆工作区：统一使用 CSS px；由宿主组件设置 DPR 变换。
 * 真实画布为白色，单元格线与孔位分别绘制，画布外为浅灰蓝工作台。
 */
export function drawBeadingWorkspace(
  ctx: any, project: BeadingCanvasProject, view: BeadingCanvasViewport,
  codeOf: (hex: string) => string, luminance: (hex: string) => number,
) {
  const {width, height, scale, ox, oy} = view
  if (!(width > 0 && height > 0 && scale > 0)) return
  const boardW = project.cols * scale, boardH = project.rows * scale
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#f2f5fd'
  ctx.fillRect(0, 0, width, height)

  // 工作台十字背景，避免用户分不清画布边界。
  ctx.strokeStyle = 'rgba(133,163,198,.16)'
  ctx.lineWidth = 1
  for (let x = 12; x < width; x += 25) {
    for (let y = 12; y < height; y += 25) {
      ctx.beginPath()
      ctx.moveTo(x - 2, y);ctx.lineTo(x + 2, y)
      ctx.moveTo(x, y - 2);ctx.lineTo(x, y + 2)
      ctx.stroke()
    }
  }

  ctx.save()
  ctx.shadowBlur = 13
  ctx.shadowColor = 'rgba(35,62,94,.16)'
  ctx.fillStyle = '#fff'
  ctx.fillRect(ox, oy, boardW, boardH)
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, oy, boardW, boardH)
  ctx.clip()

  // 网格精度随缩放变化：避免大尺寸图纸缩小时密集线条变黑。
  if (scale >= 5) {
    const startX = Math.max(0, Math.floor(-ox/scale))
    const endX = Math.min(project.cols, Math.ceil((width-ox)/scale))
    const startY = Math.max(0, Math.floor(-oy/scale))
    const endY = Math.min(project.rows, Math.ceil((height-oy)/scale))
    for (let x = startX; x <= endX; x++) {
      const px=ox+x*scale
      ctx.beginPath();ctx.moveTo(px,oy);ctx.lineTo(px,oy+boardH)
      ctx.strokeStyle = x%10===0 ? '#ccd7e6' : '#e8edf5'
      ctx.lineWidth = x%10===0 ? 1.15 : .65
      ctx.stroke()
    }
    for (let y = startY; y <= endY; y++) {
      const py=oy+y*scale
      ctx.beginPath();ctx.moveTo(ox,py);ctx.lineTo(ox+boardW,py)
      ctx.strokeStyle = y%10===0 ? '#ccd7e6' : '#e8edf5'
      ctx.lineWidth = y%10===0 ? 1.15 : .65
      ctx.stroke()
    }
  }

  const radius = Math.max(1.3, scale*.37)
  for (const cell of project.cells) {
    const cx = ox+(cell.x+.5)*scale, cy=oy+(cell.y+.5)*scale
    if (cx < -scale || cx > width+scale || cy < -scale || cy > height+scale) continue
    ctx.beginPath()
    ctx.arc(cx,cy,radius,0,Math.PI*2)
    if (cell.transparent) {
      ctx.strokeStyle='#d7dce5'
      ctx.lineWidth = Math.max(.55,scale*.065)
      ctx.stroke()
    } else {
      ctx.fillStyle=cell.color
      ctx.fill()
      if (scale>=18) {
        const code=codeOf(cell.color)
        if (code) {
          ctx.fillStyle=luminance(cell.color)>.62?'#26303d':'#fff'
          ctx.font=`${Math.min(12,Math.max(7,scale*.27))}px sans-serif`
          ctx.textAlign='center';ctx.textBaseline='middle'
          ctx.fillText(code,cx,cy)
        }
      }
    }
  }
  ctx.restore()

  // 板边/每10颗刻度方便对齐真实拼豆板。
  ctx.strokeStyle = '#aab9ca';ctx.lineWidth = 1.3
  ctx.strokeRect(ox,oy,boardW,boardH)
  if (scale >= 5) {
    ctx.font = '10px sans-serif'
    ctx.fillStyle = '#8196aa'
    ctx.textAlign = 'center';ctx.textBaseline = 'middle'
    for(let x=0;x<=project.cols;x+=10) {
      const px=ox+x*scale
      if(px>=16&&px<=width-16) ctx.fillText(String(x),px,Math.max(10,oy-13))
    }
    for(let y=0;y<=project.rows;y+=10) {
      const py=oy+y*scale
      if(py>=12&&py<=height-10) {ctx.textAlign='right';ctx.fillText(String(y),Math.max(22,ox-9),py)}
    }
  }
}
