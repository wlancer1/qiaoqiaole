import { CoverImage, CoverView } from '@tarojs/components'
import './patchwork-canvas-overlays.scss'
const selectIcon = '/assets/patchwork-tools/select-normal.png'
const selectActive = '/assets/patchwork-tools/select-active.png'
const brushIcon = '/assets/patchwork-tools/brush-normal.png'
const brushActive = '/assets/patchwork-tools/brush-active.png'
const addIcon = '/assets/patchwork-tools/add-normal.png'
const addActive = '/assets/patchwork-tools/add-active.png'
const fillIcon = '/assets/patchwork-tools/fill-normal.png'
const fillActive = '/assets/patchwork-tools/fill-active.png'
const layersIcon = '/assets/patchwork-tools/layers-normal.png'
const layersActive = '/assets/patchwork-tools/layers-active.png'
const trashIcon = '/assets/patchwork-tools/trash-normal.png'
const rotateIcon = '/assets/patchwork-tools/rotate-normal.png'
const copyIcon = '/assets/patchwork-tools/copy-normal.png'
const fabricIcon = '/assets/patchwork-tools/fabric-blue.png'

export type PatchworkTool = 'select' | 'brush' | 'add' | 'fill' | 'layers'
export type FillMode = 'fabric' | 'color'

const TOOL_ENTRIES: Array<{ key: PatchworkTool; label: string; icon: string; activeIcon: string }> = [
  { key: 'select', label: '选择', icon: selectIcon, activeIcon: selectActive },
  { key: 'brush', label: '画笔', icon: brushIcon, activeIcon: brushActive },
  { key: 'add', label: '添加', icon: addIcon, activeIcon: addActive },
  { key: 'fill', label: '填充', icon: fillIcon, activeIcon: fillActive },
  { key: 'layers', label: '图层', icon: layersIcon, activeIcon: layersActive },
]

type Props = {
  tool: PatchworkTool
  canClear: boolean
  fillMenu: boolean
  fillMode: FillMode
  selectedPiece: boolean
  zoom: number
  onTool: (tool: PatchworkTool) => void
  onClear: () => void
  onFillMode: (mode: FillMode) => void
  onRotate: () => void
  onCopy: () => void
  onMoveUp: () => void
  onChooseFabric: () => void
  onDelete: () => void
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
}

/**
 * 微信原生 Canvas 上方只能可靠地用 cover-view / cover-image 放交互控件。
 * 不要在 cover-view 中嵌套普通 View/Text/Glyph 或 Taro Button。
 * H5 专用绘制区域可继续用 View；小程序的浮动控制都在此处。
 */
export function PatchworkCanvasOverlays(props: Props) {
  const {
    tool, canClear, fillMenu, fillMode, selectedPiece, zoom,
    onTool, onClear, onFillMode, onRotate, onCopy, onMoveUp,
    onChooseFabric, onDelete, onZoomOut, onZoomIn, onFit,
  } = props

  return <>
    <CoverView className='pw-cover-toolbar' ariaLabel='拼布编辑工具栏'>
      {TOOL_ENTRIES.map(entry =>
        <CoverView key={entry.key} className={'pw-cover-tool' + (tool === entry.key ? ' on' : '')}
          ariaLabel={entry.label} ariaRole='button' onClick={() => onTool(entry.key)}>
          <CoverImage className='pw-cover-tool-icon' src={tool === entry.key ? entry.activeIcon : entry.icon} />
          <CoverView className='pw-cover-tool-label'>{entry.label}</CoverView>
        </CoverView>)}
      <CoverView className='pw-cover-tool-divider' />
      <CoverView className={'pw-cover-tool pw-cover-clear' + (canClear ? '' : ' disabled')}
        ariaLabel='清空画布' ariaRole='button' onClick={() => { if (canClear) onClear() }}>
        <CoverImage className='pw-cover-tool-icon' src={trashIcon} />
        <CoverView className='pw-cover-tool-label'>清空</CoverView>
      </CoverView>
    </CoverView>

    {fillMenu && <CoverView className='pw-cover-fill-menu' ariaLabel='选择填充方式'>
      <CoverView ariaRole='button' ariaLabel='填布'
        className={'pw-cover-fill-option' + (fillMode === 'fabric' ? ' on' : '')}
        onClick={() => onFillMode('fabric')}>
        <CoverImage className='pw-cover-fill-icon' src={fabricIcon} />
        <CoverView>填布</CoverView>
      </CoverView>
      <CoverView ariaRole='button' ariaLabel='填色'
        className={'pw-cover-fill-option' + (fillMode === 'color' ? ' on' : '')}
        onClick={() => onFillMode('color')}>
        <CoverImage className='pw-cover-fill-icon' src={fillIcon} />
        <CoverView>填色</CoverView>
      </CoverView>
    </CoverView>}

    {tool === 'brush' && <CoverView className='pw-cover-hint'>画笔 · 自由形状</CoverView>}
    {tool === 'fill' && <CoverView className='pw-cover-hint'>
      {fillMode === 'fabric' ? '填布 · 点击布片填充' : '填色 · 点击布片填充'}
    </CoverView>}

    {tool === 'select' && selectedPiece && <CoverView className='pw-cover-selection'>
      {[
        { label:'旋转90度', title:'旋转', icon:rotateIcon, action:onRotate },
        { label:'复制布片', title:'复制', icon:copyIcon, action:onCopy },
        { label:'上移布片', title:'上移', icon:layersIcon, action:onMoveUp },
        { label:'换布料', title:'换布', icon:fabricIcon, action:onChooseFabric },
        { label:'删除布片', title:'删除', icon:trashIcon, action:onDelete },
      ].map(entry=><CoverView key={entry.label} ariaRole='button' ariaLabel={entry.label}
        className='pw-cover-selection-item' onClick={entry.action}>
        <CoverImage className='pw-cover-selection-icon' src={entry.icon} />
        <CoverView>{entry.title}</CoverView>
      </CoverView>)}
    </CoverView>}

    <CoverView className='pw-cover-zoom' ariaLabel='画布缩放'>
      <CoverView className='pw-cover-zoom-button' ariaLabel='缩小' ariaRole='button' onClick={onZoomOut}>−</CoverView>
      <CoverView className='pw-cover-zoom-percent'>{zoom}%</CoverView>
      <CoverView className='pw-cover-zoom-button' ariaLabel='放大' ariaRole='button' onClick={onZoomIn}>＋</CoverView>
      <CoverView className='pw-cover-zoom-fit' ariaLabel='适应画布' ariaRole='button' onClick={onFit}>适应</CoverView>
    </CoverView>
  </>
}
