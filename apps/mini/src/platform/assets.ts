import Taro from '@tarojs/taro'

/**
 * 素材存储层（替代 H5 的 IndexedDB assets.ts）：
 * 小程序没有 blob/IndexedDB，素材一律落盘到 USER_DATA_PATH/assets，storage 里只存索引。
 */
const DIR = `${Taro.env.USER_DATA_PATH}/assets`
const INDEX_KEY = 'qiaoqiaole.assets.index'

type AssetRecord = { id: string; path: string; createdAt: number }

function loadIndex(): Record<string, AssetRecord> {
  try {
    return (Taro.getStorageSync(INDEX_KEY) as Record<string, AssetRecord>) || {}
  } catch {
    return {}
  }
}

function saveIndex(index: Record<string, AssetRecord>): void {
  try { Taro.setStorageSync(INDEX_KEY, index) } catch { /* 索引写失败不阻断 */ }
}

function ensureDir(): void {
  const fs = Taro.getFileSystemManager()
  try {
    fs.accessSync(DIR)
  } catch {
    try { fs.mkdirSync(DIR, true) } catch { /* 已存在等情况 */ }
  }
}

function newAssetId(): string {
  return `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function getAssetPath(id: string): string {
  return loadIndex()[id]?.path || ''
}

export function listAssets(): AssetRecord[] {
  return Object.values(loadIndex()).sort((a, b) => b.createdAt - a.createdAt)
}

/** 把临时文件（chooseMedia/下载所得）登记为持久素材，返回 id 与正式路径。 */
export function saveAssetFromFile(tempFilePath: string): { id: string; path: string } {
  ensureDir()
  const id = newAssetId()
  const rawExt = (tempFilePath.split('.').pop() || 'png').toLowerCase()
  const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : 'png'
  const target = `${DIR}/${id}.${ext}`
  Taro.getFileSystemManager().copyFileSync(tempFilePath, target)
  const index = loadIndex()
  index[id] = { id, path: target, createdAt: Date.now() }
  saveIndex(index)
  return { id, path: target }
}

/** 下载远程图到本地素材库（项目素材换设备打开时用）。 */
export async function downloadAsset(url: string, token?: string): Promise<{ id: string; path: string }> {
  const res = await Taro.downloadFile({
    url,
    header: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (res.statusCode !== 200 || !res.tempFilePath) throw new Error('素材下载失败')
  return saveAssetFromFile(res.tempFilePath)
}

/** 给 canvas 用：按素材 id 创建已加载完成的图片对象。 */
export function createCanvasImage(canvas: unknown, id: string): Promise<unknown> {
  const path = getAssetPath(id)
  if (!path) return Promise.reject(new Error('素材不存在或已被清理'))
  const target = canvas as { createImage: () => { src: string; onload: () => void; onerror: (e: unknown) => void } }
  return new Promise((resolve, reject) => {
    const img = target.createImage()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e instanceof Error ? e : new Error('素材图片加载失败'))
    img.src = path
  })
}

export function removeAsset(id: string): void {
  const index = loadIndex()
  const record = index[id]
  if (!record) return
  try { Taro.getFileSystemManager().unlinkSync(record.path) } catch { /* 文件已不存在 */ }
  delete index[id]
  saveIndex(index)
}
