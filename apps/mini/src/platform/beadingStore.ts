import Taro from '@tarojs/taro'
import type { Project } from '@qiaoqiaole/core'

/**
 * 拼豆工程本地存储：索引与正文分开存（单个 key 上限 1MB，正文按工程拆 key）。
 * 正文就是 core 的 Project 结构，与 H5 工程同构，后续可直接同步到云端 projects API。
 */
export type BeadingMeta = {
  id: string
  title: string
  rows: number
  cols: number
  updatedAt: number
}

const INDEX_KEY = 'qiaoqiaole.beading.index.v1'
const bodyKey = (id: string) => `qiaoqiaole.beading.project.${id}`

function loadIndex(): Record<string, BeadingMeta> {
  try {
    return (Taro.getStorageSync(INDEX_KEY) as Record<string, BeadingMeta>) || {}
  } catch {
    return {}
  }
}

function saveIndex(index: Record<string, BeadingMeta>): void {
  try { Taro.setStorageSync(INDEX_KEY, index) } catch { /* 存储满等情况不阻断编辑 */ }
}

export function listBeadingProjects(): BeadingMeta[] {
  return Object.values(loadIndex()).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function loadBeadingProject(id: string): Project | null {
  try {
    const body = Taro.getStorageSync(bodyKey(id))
    return body ? (body as Project) : null
  } catch {
    return null
  }
}

export function saveBeadingProject(project: Project, title?: string): BeadingMeta {
  const index = loadIndex()
  const meta: BeadingMeta = {
    id: project.id,
    title: title || index[project.id]?.title || '未命名拼豆',
    rows: project.rows,
    cols: project.cols,
    updatedAt: Date.now(),
  }
  try { Taro.setStorageSync(bodyKey(project.id), project) } catch { /* 忽略 */ }
  index[project.id] = meta
  saveIndex(index)
  return meta
}

export function deleteBeadingProject(id: string): void {
  const index = loadIndex()
  delete index[id]
  saveIndex(index)
  try { Taro.removeStorageSync(bodyKey(id)) } catch { /* 忽略 */ }
}

export function newBeadingProjectId(): string {
  return `bead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
