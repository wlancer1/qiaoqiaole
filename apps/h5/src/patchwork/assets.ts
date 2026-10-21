import { presetAssetUrl } from '../fabrics/fabricCatalog';
import { newPatchworkId } from './ids';

/** 图片字节存 IndexedDB；作品 JSON 只存稳定的 assetId。 */
const DB = 'qiaoqiaole-patchwork-v1';
const STORE = 'assets';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
export async function putAssetWithId(id: string, blob: Blob) {
  const db = await openDb();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('素材写入被中止')); }); }
  finally { db.close(); }
}
export async function putAsset(blob: Blob) {
  const id = newPatchworkId(); await putAssetWithId(id, blob);
  return id;
}
export async function deleteAsset(id: string) {
  const db = await openDb();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('素材删除被中止')); }); }
  finally { db.close(); }
}
export async function getAsset(id: string): Promise<Blob | undefined> {
  const presetUrl = presetAssetUrl(id);
  if (presetUrl) { const response = await fetch(presetUrl); if (!response.ok) throw new Error('布料图案加载失败'); return response.blob(); }
  const db = await openDb();
  try { return await new Promise<Blob | undefined>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined); req.onerror = () => reject(req.error);
  }); } finally { db.close(); }
}
export async function loadImage(id: string): Promise<HTMLImageElement | null> {
  const blob = await getAsset(id); if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url;
    await img.decode(); return img;
  } finally { URL.revokeObjectURL(url); }
}
export function saveDraft(project: unknown, id: string) {
  // 纯路径、尺寸和素材 ID；草稿独立于云端保存
  try { localStorage.setItem(`qiaoqiaole:patchwork:${id}`, JSON.stringify(project)); localStorage.setItem('qiaoqiaole:patchwork:last', id); return true; }
  catch { return false; }
}
export function readDraft(id: string): unknown {
  try { return JSON.parse(localStorage.getItem(`qiaoqiaole:patchwork:${id}`) || 'null') as unknown; } catch { return null; }
}
export function latestDraftId() { try { return localStorage.getItem('qiaoqiaole:patchwork:last'); } catch { return null; } }
