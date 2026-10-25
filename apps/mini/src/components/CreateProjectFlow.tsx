import { useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text, Image } from '@tarojs/components'
import { Button, Input } from './Controls'
import { Glyph, Sheet } from './Ui'
import { fabricPresets, presetImage } from '../platform/fabricPresets'
import './create-project-flow.scss'

export type CreateKind = 'beading' | 'patchwork'
export type PatchworkCanvasOptions = { widthMm: number; heightMm: number; baseFabricId: string }
export type BeadingCanvasOptions = { cols: number; rows: number }

type Props = {
  kind: CreateKind
  onClose: () => void
  onPatchworkCreate?: (options: PatchworkCanvasOptions) => void
  onBeadingBlank?: (options: BeadingCanvasOptions) => void
  onBeadingImport?: (cols: number) => void | Promise<void>
  importing?: boolean
}

function clampNumber(value: string, defaultValue: number, min: number, max: number): number {
  const n = Number(value)
  return value.trim() && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : defaultValue
}

/**
 * H5 首页创作弹窗在微信小程序的统一实现。
 * 弹窗可从首页、加号菜单、作品页及编辑器直达路径复用。
 * 尺寸/来源选择完成之前，不会创建空项目或导航到编辑器。
 */
export function CreateProjectFlow({
  kind, onClose, onPatchworkCreate, onBeadingBlank, onBeadingImport, importing = false,
}: Props) {
  const [step, setStep] = useState<'source' | 'blank' | 'base'>('source')
  const [cols, setCols] = useState('32')
  const [rows, setRows] = useState('32')
  const [width, setWidth] = useState('40')
  const [height, setHeight] = useState('40')
  const [baseFabricId, setBaseFabricId] = useState('')

  const close = () => {
    if (importing) return
    if (step === 'base') { setStep('source'); return }
    if (kind === 'beading' && step === 'blank') { setStep('source'); return }
    onClose()
  }
  const title = kind === 'patchwork'
    ? step === 'base' ? '选择底布材料' : '新建拼布画布'
    : step === 'blank' ? '新建空白画布' : '制作拼豆图纸'
  const activePatchwork = Number(width) === Number(height) ? Number(width) : 0
  const selectedBase = fabricPresets.find(m => m.id === baseFabricId)

  return <Sheet title={title} onClose={close} className='mini-create-sheet'>
    {kind === 'patchwork' ? step === 'base' ? (
      <View className='mini-create-base-list'>
        <Button ariaLabel='无底布' className={'mini-create-base-choice' + (!baseFabricId ? ' on' : '')} onClick={() => { setBaseFabricId(''); setStep('source') }}>
          <View className='mini-create-none'><Glyph name='close' /></View>
          <Text>无底布</Text>
          {!baseFabricId && <Text className='mini-create-tick'>✓</Text>}
        </Button>
        {fabricPresets.map(item => <Button key={item.id} ariaLabel={'选择底布 ' + item.name}
          className={'mini-create-base-choice' + (baseFabricId === item.id ? ' on' : '')}
          onClick={() => { setBaseFabricId(item.id); setStep('source') }}>
          <View className='mini-create-base-swatch' style={{ backgroundColor: item.color }}>
            <Image className='mini-create-fabric-texture' src={presetImage(item.presetId) || ''} mode='aspectFill' />
          </View>
          <Text>{item.name}</Text>
          {baseFabricId === item.id && <Text className='mini-create-tick'>✓</Text>}
        </Button>)}
        <Text className='mini-create-note'>此处使用小程序已有的预设底布；用户仓库同步另行接入。</Text>
      </View>
    ) : (
      <View className='mini-create-content'>
        <View className='mini-create-presets' ariaLabel='画布尺寸快捷选项'>
          {[30, 40, 50].map(size => <Button key={size} ariaLabel={size + '×' + size + ' cm'}
            className={'mini-create-preset' + (activePatchwork === size ? ' on' : '')}
            onClick={() => { setWidth(String(size)); setHeight(String(size)) }}>{size}×{size}</Button>)}
        </View>
        <View className='mini-create-fields'>
          <View className='mini-create-field'><Text>宽度 (cm)</Text><Input type='number' ariaLabel='宽度 (cm)' value={width}
            onInput={e => setWidth(e.detail.value)} /></View>
          <View className='mini-create-field'><Text>高度 (cm)</Text><Input type='number' ariaLabel='高度 (cm)' value={height}
            onInput={e => setHeight(e.detail.value)} /></View>
        </View>
        <View className='mini-create-base-label'>底布材料</View>
        <Button ariaLabel='选择底布材料' className='mini-create-base-trigger' onClick={() => setStep('base')}>
          <View className='mini-create-base-swatch' style={{ backgroundColor: selectedBase?.color || '#f4f6f9' }}>
            {selectedBase ? <Image className='mini-create-fabric-texture' src={selectedBase.image} mode='aspectFill'/> : <Glyph name='close' />}
          </View>
          <Text>{selectedBase?.name || '无底布'}</Text>
          <Text className='mini-create-chevron'>›</Text>
        </Button>
        <Button className='mini-create-submit' ariaLabel='创建拼布画布' onClick={() => onPatchworkCreate?.({
          widthMm: clampNumber(width, 40, 10, 300) * 10,
          heightMm: clampNumber(height, 40, 10, 300) * 10,
          baseFabricId,
        })}>创建画布</Button>
      </View>
    ) : step === 'source' ? (
      <View className='mini-create-content mini-create-source-list'>
        <Button className='mini-create-option' ariaLabel='新建空白画布' disabled={importing} onClick={() => setStep('blank')}>
          <View className='mini-create-source-icon'><Glyph name='brush' /></View>
          <View className='mini-create-source-copy'>
            <Text className='mini-create-option-name'>新建空白画布</Text>
            <Text className='mini-create-option-desc'>选择尺寸，从空白网格开始创作</Text>
          </View>
          <Text className='mini-create-chevron'>›</Text>
        </Button>
        <Button className='mini-create-option' ariaLabel='从相册或拍照选择' disabled={importing}
          onClick={() => { void onBeadingImport?.(clampNumber(cols, 32, 2, 120)) }}>
          <View className='mini-create-source-icon'><Glyph name='export' /></View>
          <View className='mini-create-source-copy'>
            <Text className='mini-create-option-name'>{importing ? '正在读取图片…' : '从相册或拍照选择'}</Text>
            <Text className='mini-create-option-desc'>图片转换为 MARD 拼豆图纸</Text>
          </View>
          <Text className='mini-create-chevron'>›</Text>
        </Button>
        <View className='mini-create-import-precision'>
          <Text>图纸精度（列）</Text>
          <View className='mini-create-precision-input'><Input ariaLabel='图纸精度' type='number' value={cols}
            onInput={e => setCols(e.detail.value)} /><Text>列</Text></View>
        </View>
      </View>
    ) : (
      <View className='mini-create-content'>
        <View className='mini-create-presets' ariaLabel='画布尺寸快捷选项'>
          {[32, 52, 104].map(size => <Button key={size}
            className={'mini-create-preset' + (Number(cols) === size && Number(rows) === size ? ' on' : '')}
            onClick={() => { setCols(String(size)); setRows(String(size)) }}>{size}×{size}</Button>)}
        </View>
        <View className='mini-create-fields'>
          <View className='mini-create-field'><Text>宽度列数</Text><Input type='number' ariaLabel='宽度列数'
            value={cols} onInput={e => setCols(e.detail.value)} /></View>
          <View className='mini-create-field'><Text>高度行数</Text><Input type='number' ariaLabel='高度行数'
            value={rows} onInput={e => setRows(e.detail.value)} /></View>
        </View>
        <Button className='mini-create-submit' ariaLabel='创建拼豆画布' onClick={() => onBeadingBlank?.({
          cols: clampNumber(cols, 32, 2, 120), rows: clampNumber(rows, 32, 2, 120),
        })}>创建画布</Button>
      </View>
    )}
  </Sheet>
}

/** 首页卡片与底部加号共用：先弹选择面板，再进入编辑器。 */
export function CreateProjectEntry({ kind, onClose }: { kind: CreateKind; onClose: () => void }) {
  const [importing, setImporting] = useState(false)
  const enter = (url: string) => {
    onClose()
    void Taro.navigateTo({ url })
  }
  const chooseImage = async (cols: number) => {
    if (importing) return
    setImporting(true)
    try {
      const media = await Taro.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'] })
      const filePath = media.tempFiles?.[0]?.tempFilePath
      if (!filePath) return
      enter('/pages/beading/index?create=import&cols=' + cols + '&src=' + encodeURIComponent(filePath))
    } catch (e) {
      if (!/cancel/i.test(String((e as any)?.errMsg || (e as any)?.message || ''))) {
        Taro.showToast({ title: '无法选择图片，请重试', icon: 'none' })
      }
    } finally { setImporting(false) }
  }
  return <CreateProjectFlow kind={kind} onClose={onClose} importing={importing}
    onPatchworkCreate={opts => enter('/pages/patchwork/index?create=blank&w=' + opts.widthMm
      + '&h=' + opts.heightMm + '&base=' + encodeURIComponent(opts.baseFabricId))}
    onBeadingBlank={opts => enter('/pages/beading/index?create=blank&cols=' + opts.cols + '&rows=' + opts.rows)}
    onBeadingImport={chooseImage} />
}
