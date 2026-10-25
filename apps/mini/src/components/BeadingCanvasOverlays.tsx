import { CoverView, CoverImage } from '@tarojs/components'
const panNormal = '/assets/patchwork-tools/bead-pan-normal.png'
const panActive = '/assets/patchwork-tools/bead-pan-active.png'
const drawNormal = '/assets/patchwork-tools/bead-draw-normal.png'
const drawActive = '/assets/patchwork-tools/bead-draw-active.png'
const eraseNormal = '/assets/patchwork-tools/bead-erase-normal.png'
const eraseActive = '/assets/patchwork-tools/bead-erase-active.png'
const fillNormal = '/assets/patchwork-tools/bead-fill-normal.png'
const fillActive = '/assets/patchwork-tools/bead-fill-active.png'
const pickNormal = '/assets/patchwork-tools/bead-pick-normal.png'
const pickActive = '/assets/patchwork-tools/bead-pick-active.png'
import './beading-canvas-overlays.scss'

export type BeadingTool = 'draw' | 'erase' | 'fill' | 'pick' | 'pan'
type Props = {
  tool: BeadingTool
  zoom: number
  onTool: (tool: BeadingTool) => void
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
}

const ENTRIES: Array<{key: BeadingTool; label: string; icon: string; active: string}> = [
  {key:'pan',label:'移动',icon:panNormal,active:panActive},
  {key:'draw',label:'画笔',icon:drawNormal,active:drawActive},
  {key:'erase',label:'橡皮',icon:eraseNormal,active:eraseActive},
  {key:'fill',label:'填充',icon:fillNormal,active:fillActive},
  {key:'pick',label:'取色',icon:pickNormal,active:pickActive},
]

/** 画布之上使用微信原生 cover-view / cover-image，避免被 Canvas2D 覆盖。 */
export function BeadingCanvasOverlays({tool,zoom,onTool,onZoomOut,onZoomIn,onFit}: Props) {
  return <>
    <CoverView className='bead-cover-toolbar' ariaLabel='拼豆编辑工具栏'>
      {ENTRIES.map(entry=><CoverView key={entry.key}
        className={'bead-cover-tool'+(tool===entry.key?' on':'')}
        ariaLabel={entry.label} ariaRole='button' onClick={()=>onTool(entry.key)}>
        <CoverImage className='bead-cover-tool-icon' src={tool===entry.key?entry.active:entry.icon}/>
        <CoverView className='bead-cover-tool-name'>{entry.label}</CoverView>
      </CoverView>)}
    </CoverView>
    <CoverView className='bead-cover-zoom' ariaLabel='拼豆画布缩放'>
      <CoverView className='bead-cover-zoom-button' ariaLabel='缩小画布' ariaRole='button' onClick={onZoomOut}>−</CoverView>
      <CoverView className='bead-cover-zoom-percent'>{zoom}%</CoverView>
      <CoverView className='bead-cover-zoom-button' ariaLabel='放大画布' ariaRole='button' onClick={onZoomIn}>＋</CoverView>
      <CoverView className='bead-cover-zoom-fit' ariaLabel='适应画布' ariaRole='button' onClick={onFit}>适应</CoverView>
    </CoverView>
  </>
}
