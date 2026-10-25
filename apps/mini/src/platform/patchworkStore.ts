import Taro from '@tarojs/taro'

/** 与 H5 拼布 model.ts 同构的工程结构（几何单位 mm），保证作品数据可互通。 */
export type PwPoint = { x: number; y: number }
export type PwTextureTransform = { scale: number; rotation: number; offsetX: number; offsetY: number }
export type PwMaterial = {
  presetId?: string
  sampleWidthMm?: number
  projectOnly?: boolean
  id: string
  name: string
  color: string
  texturePattern?: 'linen' | 'check' | 'stripe' | 'dot'
}
export type PwPiece = {
  paint?: { fill: 'fabric' | 'solid' | 'none'; color: string }
  id: string
  name: string
  points: PwPoint[]
  materialId: string
  locked: boolean
  visible: boolean
  seamMm: number
  texture: PwTextureTransform
}
export type PwProject = {
  schemaVersion: 1
  id: string
  kind: 'patchwork'
  name: string
  revision: number
  technique: 'raw' | 'turned' | 'pieced'
  widthMm: number
  heightMm: number
  base: { materialId: string; locked: boolean; includeInCutList: boolean }
  materials: PwMaterial[]
  pieces: PwPiece[]
  guides: Array<{ id: string; points: PwPoint[]; visible: boolean }>
}

export const PW_BUILTIN_MATERIALS: PwMaterial[] = [
  { id: 'A', name: '亚麻米白', color: '#f2e6d2' }, { id: 'B', name: '樱花粉', color: '#dc93a0' },
  { id: 'C', name: '鼠尾草绿', color: '#8eaaa0' }, { id: 'D', name: '雾霾蓝', color: '#7e9fbb' },
  { id: 'E', name: '杏仁黄', color: '#ebbf72' }, { id: 'F', name: '奶油紫', color: '#a99bc8' },
  { id: 'G', name: '暖橙', color: '#db8f61' }, { id: 'H', name: '深海蓝', color: '#42647f' },
]

export function newPwId(prefix = 'pw'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function makePwProject(widthMm: number, heightMm: number): PwProject {
  return {
    schemaVersion: 1,
    id: newPwId('patch'),
    kind: 'patchwork',
    name: '未命名拼布',
    revision: 0,
    technique: 'raw',
    widthMm,
    heightMm,
    // 按定版：新建默认无底布
    base: { materialId: '', locked: false, includeInCutList: false },
    materials: PW_BUILTIN_MATERIALS.map((m) => ({ ...m })),
    pieces: [],
    guides: [],
  }
}

export type PwMeta = { id: string; name: string; widthMm: number; heightMm: number; pieces: number; updatedAt: number }

const INDEX_KEY = 'qiaoqiaole.patchwork.index.v1'
const bodyKey = (id: string) => `qiaoqiaole.patchwork.project.${id}`

function loadIndex(): Record<string, PwMeta> {
  try { return (Taro.getStorageSync(INDEX_KEY) as Record<string, PwMeta>) || {} } catch { return {} }
}
function saveIndex(index: Record<string, PwMeta>): void {
  try { Taro.setStorageSync(INDEX_KEY, index) } catch { /* 忽略 */ }
}

export function listPwProjects(): PwMeta[] {
  return Object.values(loadIndex()).sort((a, b) => b.updatedAt - a.updatedAt)
}
export function loadPwProject(id: string): PwProject | null {
  try {
    const body = Taro.getStorageSync(bodyKey(id))
    return body ? (body as PwProject) : null
  } catch { return null }
}
export function savePwProject(project: PwProject): PwMeta {
  const meta: PwMeta = {
    id: project.id, name: project.name, widthMm: project.widthMm, heightMm: project.heightMm,
    pieces: project.pieces.length, updatedAt: Date.now(),
  }
  try { Taro.setStorageSync(bodyKey(project.id), project) } catch { /* 忽略 */ }
  const index = loadIndex()
  index[project.id] = meta
  saveIndex(index)
  return meta
}
export function deletePwProject(id: string): void {
  const index = loadIndex()
  delete index[id]
  saveIndex(index)
  try { Taro.removeStorageSync(bodyKey(id)) } catch { /* 忽略 */ }
}
