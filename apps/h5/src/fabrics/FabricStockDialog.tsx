import { isImeComposing } from '../shared/ime';
import { useEffect, useRef, useState } from 'react';
import { useAppOverlay } from '../app/overlays/AppOverlayContext';
import { useBodyScrollLock } from '../app/overlays/useBodyScrollLock';
import type { FabricItem } from '../patchwork/fabricInventory';
import type { FabricCatalogRequest } from './fabricCatalog';
import { ensurePersonalFabric } from './fabricCatalog';
import './fabric-create.css';

export type FabricStockInput = { stockMode: 'size'; widthMm: number; heightMm: number; quantity: number; availableAreaMm2: number };
export async function recordFabricStock(request: FabricCatalogRequest | undefined, token: string, fabric: FabricItem, stock: FabricStockInput) {
 const personal = await ensurePersonalFabric(request, token, fabric);
 const { fabric: saved } = await request!<{ fabric: FabricItem }>(`/fabrics/${encodeURIComponent(personal.id)}`, { method: 'PATCH', body: JSON.stringify(stock) }, token);
 if (!saved?.id) throw new Error('库存保存失败，请重试');
 return saved;
}

/** Both warehouse and editor use the same stock-only form. Pattern calibration is never stock. */
export function FabricStockDialog({ fabric, onSave, onClose }: {
 fabric: FabricItem; onSave: (stock: FabricStockInput) => Promise<void>; onClose: () => void;
}) {
 const { setOverlaySlot } = useAppOverlay();
 const [width, setWidth] = useState(fabric.widthMm ? String(fabric.widthMm / 10) : '');
 const [height, setHeight] = useState(fabric.heightMm ? String(fabric.heightMm / 10) : '');
 const [quantity, setQuantity] = useState(String(fabric.quantity || 1));
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState('');
 const busy = useRef(false);
 const alive = useRef(true);
 useBodyScrollLock(true);
 useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
 useEffect(() => {
  const key = (event: KeyboardEvent) => { if (!isImeComposing(event) && event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!busy.current) onClose(); } };
  window.addEventListener('keydown', key, true);
  return () => window.removeEventListener('keydown', key, true);
 }, [onClose]);
 const save = async () => {
  if (busy.current) return;
  const w = Number(width), h = Number(height), q = Number(quantity);
  if (!width.trim() || !height.trim() || !quantity.trim() || !Number.isFinite(w) || !Number.isFinite(h) || w < .1 || h < .1 || !Number.isSafeInteger(q) || q < 1 || !Number.isSafeInteger(Math.round(w * h * q * 100))) {
   setError('请填写大于等于 0.1 cm 的宽高，以及大于 0 的整数数量'); return;
  }
  busy.current = true; setSaving(true); setError('');
  try {
   const widthMm = Math.round(w * 10), heightMm = Math.round(h * 10);
   await onSave({ stockMode: 'size', widthMm, heightMm, quantity: q, availableAreaMm2: widthMm * heightMm * q });
   if (alive.current) onClose();
  } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : '库存保存失败，请重试'); }
  finally { busy.current = false; if (alive.current) setSaving(false); }
 };
 const close = () => { if (!busy.current) onClose(); };
 const modal = <div className="home-create-modal fabric-modal fabric-create-backdrop" role="presentation" onClick={close} onTouchStart={e => e.stopPropagation()}>
  <div className="home-create-panel fabric-modal-panel" role="dialog" aria-modal="true" aria-label="录入库存" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
   <header className="home-create-head fabric-create-header"><strong>录入库存</strong><button type="button" aria-label="关闭库存录入" disabled={saving} onClick={close}>关闭</button></header>
   <fieldset className="fabric-form login-form fabric-create-body" disabled={saving}>
    <strong>{fabric.name}</strong>
    <p className="fabric-create-hint">填写手中布料的实际尺寸和数量，作为当前库存。花纹大小保持不变。</p>
    <div className="fabric-form-row fabric-create-row">
     <label>宽（cm）<input autoFocus aria-label="库存布料宽度" type="number" min=".1" step=".1" value={width} onChange={e => setWidth(e.target.value)} placeholder="50" /></label>
     <label>高（cm）<input aria-label="库存布料高度" type="number" min=".1" step=".1" value={height} onChange={e => setHeight(e.target.value)} placeholder="35" /></label>
     <label>数量（块）<input aria-label="库存布料数量" type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
    </div>
   </fieldset>
   {error && <p role="alert" className="fabric-create-error">{error}</p>}
   <footer className="fabric-create-footer"><button type="button" disabled={saving} onClick={close}>取消</button><button type="button" className="primary" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存库存'}</button></footer>
  </div>
 </div>;
 useEffect(() => { setOverlaySlot('inventory', modal); });
 useEffect(() => () => setOverlaySlot('inventory', null), [setOverlaySlot]);
 return null;
}
