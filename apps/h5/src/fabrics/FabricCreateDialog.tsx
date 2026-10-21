import { CompositionSafeInput } from '../shared/CompositionSafeInput';
import { isImeComposing } from '../shared/ime';
import { useEffect, useRef, useState } from 'react';
import { Crop, Upload } from 'lucide-react';
import { useAppOverlay } from '../app/overlays/AppOverlayContext';
import { useBodyScrollLock } from '../app/overlays/useBodyScrollLock';
import { FabricImageCropper } from './FabricImageCropper';
import type { FabricCreateResult } from './fabricCreate';
import type { FabricCropRect } from './fabricPhoto';
import './fabric-create.css';

type Props = { allowProjectOnly?: boolean; onClose: () => void; onSave: (value: FabricCreateResult) => Promise<void> };
export function FabricCreateDialog({ allowProjectOnly = false, onClose, onSave }: Props) {
 const { setOverlaySlot } = useAppOverlay();
 const [name, setName] = useState('');
 const [color, setColor] = useState('#d98a9e');
 const [image, setImage] = useState('');
 const [sampleWidth, setSampleWidth] = useState('');
 const [width, setWidth] = useState('');
 const [height, setHeight] = useState('');
 const [quantity, setQuantity] = useState('1');
 const [note, setNote] = useState('');
 const [local, setLocal] = useState(false);
 const [busy, setBusy] = useState(false);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');
 const [crop, setCrop] = useState<{ image: HTMLImageElement; url: string; rect?: FabricCropRect } | null>(null);
 const [sourcePhoto, setSourcePhoto] = useState<{ image: HTMLImageElement; url: string; rect?: FabricCropRect } | null>(null);
 const fileRef = useRef<HTMLInputElement>(null);
 const panelRef = useRef<HTMLDivElement>(null);
 const savingRef = useRef(false);
 const aliveRef = useRef(true);
 const photoSeqRef = useRef(0);
 const cropUrlRef = useRef('');
 useBodyScrollLock(true);

 const revokePhotoUrl = () => {
  if (cropUrlRef.current) URL.revokeObjectURL(cropUrlRef.current);
  cropUrlRef.current = '';
 };
 const cancelCropStep = () => {
  ++photoSeqRef.current;
  setCrop(null);
  setLoading(false);
  if (!image) {
   revokePhotoUrl();
   setSourcePhoto(null);
  }
 };
 const close = () => {
  if (savingRef.current) return;
  if (crop || loading) {
   cancelCropStep();
   return;
  }
  onClose();
 };
 useEffect(() => {
  aliveRef.current = true;
  return () => {
   aliveRef.current = false;
   ++photoSeqRef.current;
   revokePhotoUrl();
  };
 }, []);
 useEffect(() => {
  const previous = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);
  const timer = setTimeout(() => panelRef.current?.querySelector<HTMLElement>('input,button')?.focus(), 0);
  return () => {
   clearTimeout(timer);
   previous?.focus?.();
  };
 }, []);
 useEffect(() => {
  if (typeof window === 'undefined') return;
  const handler = (event: KeyboardEvent) => {
   if (isImeComposing(event)) return;
   if (typeof document !== 'undefined' && document.querySelector?.('[data-overlay-slot="login"] [role="dialog"]')) return;
   if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation?.();
    close();
    return;
   }
   if (event.key === 'Tab' && panelRef.current) {
    const items = [
     ...panelRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)',
     ),
    ].filter(e => !e.hidden && e.getClientRects().length);
    const first = items[0];
    const last = items.at(-1);
    if (!first) return;
    if (!panelRef.current.contains(document.activeElement)) {
     event.preventDefault();
     first.focus();
     return;
    }
    if (event.shiftKey && document.activeElement === first) {
     event.preventDefault();
     last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
     event.preventDefault();
     first.focus();
    }
   }
  };
  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
 });

 const choosePhoto = async (file: File) => {
  if (savingRef.current) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
   setError('请选择 JPG、PNG 或 WebP 图片');
   return;
  }
  if (file.size > 15 * 1024 * 1024) {
   setError('图片不能超过 15 MB');
   return;
  }
  ++photoSeqRef.current;
  const seq = photoSeqRef.current;
  revokePhotoUrl();
  const url = URL.createObjectURL(file);
  cropUrlRef.current = url;
  setLoading(true);
  setError('');
  try {
   const img = new Image();
   await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('图片读取失败，请重新选择'));
    img.src = url;
   });
   if (!aliveRef.current || seq !== photoSeqRef.current) return;
   const nextPhoto = { image: img, url };
   setSourcePhoto(nextPhoto);
   setCrop(nextPhoto);
  } catch (e) {
   if (aliveRef.current && seq === photoSeqRef.current) {
    revokePhotoUrl();
    setSourcePhoto(null);
    setCrop(null);
    setError(e instanceof Error ? e.message : '图片读取失败');
   }
  } finally {
   if (aliveRef.current && seq === photoSeqRef.current) setLoading(false);
  }
 };

 const submit = async () => {
  if (savingRef.current || loading || crop) return;
  const positive = (value: string, label: string) => {
   const n = Number(value);
   if (!value.trim() || !Number.isFinite(n) || n <= 0) throw new Error(label + '必须大于 0');
   return n;
  };
  let result: FabricCreateResult;
  try {
   if (!name.trim()) throw new Error('请输入布料名称');
   if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('请输入有效的颜色值');
   const hasWidth = Boolean(width.trim());
   const hasHeight = Boolean(height.trim());
   if (!local && hasWidth !== hasHeight) throw new Error('请同时填写布料的宽和高');
   const stockMode = !local && hasWidth && hasHeight ? 'size' : 'own';
   const w = stockMode === 'size' ? Math.round(positive(width, '布料宽度') * 10) : null;
   const h = stockMode === 'size' ? Math.round(positive(height, '布料高度') * 10) : null;
   const qty = positive(quantity, '数量');
   if (stockMode === 'size' && (!w || !h)) throw new Error('尺寸不能小于 0.1 cm');
   const available = stockMode === 'size' ? Math.round(w! * h! * qty) : null;
   if (available !== null && (!Number.isSafeInteger(available) || available < 1)) throw new Error('库存面积超出有效范围');
   const sample = sampleWidth.trim()
    ? positive(sampleWidth, '纹理校准宽度')
    : image && w
     ? w
     : null;
   result = {
    payload: {
     name: name.trim(),
     color,
     category: '棉布',
     image: image || null,
     sampleWidthMm: sample,
     stockMode,
     widthMm: w,
     heightMm: h,
     quantity: qty,
     availableAreaMm2: available,
     note: note.trim() || null,
    },
    projectOnly: local,
   };
  } catch (e) {
   setError(e instanceof Error ? e.message : '请核对布料信息');
   return;
  }
  savingRef.current = true;
  setBusy(true);
  setError('');
  try {
   if (!aliveRef.current) return;
   await onSave(result);
  } catch (e) {
   if (aliveRef.current) {
    setError((local ? '保存失败：' : '未保存到布料仓库，请重试：') + (e instanceof Error ? e.message : '保存失败'));
   }
  } finally {
   savingRef.current = false;
   if (aliveRef.current) setBusy(false);
  }
 };

 const defaultCropWidthMm = sampleWidth.trim()
  ? sampleWidth
  : width.trim() && Number(width) > 0
   ? String(Number((Number(width) * 10).toFixed(1)))
   : '100';
 const defaultCropHeightMm = !sampleWidth.trim() && height.trim() && Number(height) > 0
  ? String(Number((Number(height) * 10).toFixed(1)))
  : undefined;

 const modal = (
  <div
   className="home-create-modal fabric-modal fabric-create-backdrop"
   role="presentation"
   onClick={close}
   onTouchStart={e => e.stopPropagation()}
  >
   <div
    className="home-create-panel fabric-modal-panel fabric-create-panel"
    ref={panelRef}
    role="dialog"
    aria-modal="true"
    aria-label={crop ? '截取布料图片' : '新增布料'}
    onClick={e => e.stopPropagation()}
    onTouchStart={e => e.stopPropagation()}
   >
    <header className="home-create-head fabric-create-header">
     <strong>{crop ? '截取布料图片' : '新增布料入库'}</strong>
     <button type="button" aria-label="关闭布料表单" disabled={busy} onClick={close}>关闭</button>
    </header>
    {crop ? (
     <FabricImageCropper
      image={crop.image}
      url={crop.url}
      initialRect={crop.rect}
      defaultAspect={crop.rect ? 'free' : '1:1'}
      initialWidthMm={defaultCropWidthMm}
      initialHeightMm={defaultCropHeightMm}
      onCancel={cancelCropStep}
      onApply={(value, sample) => {
       setImage(value.image);
       setColor(value.color);
       setSampleWidth(sample);
       if (value.rect) {
        setSourcePhoto(prev => (prev ? { ...prev, rect: value.rect } : prev));
       }
       setCrop(null);
      }}
     />
    ) : (
     <>
      <fieldset className="fabric-form login-form fabric-create-body" disabled={busy || loading}>
       <div className="fabric-form-preview fabric-create-photo">
        {image ? (
         <img src={image} alt="截取后的布料预览" />
        ) : (
         <span className="fabric-swatch" style={{ background: color }} />
        )}
        <div className="fabric-form-preview-actions">
         <div className="fabric-create-photo-btns">
          <button type="button" onClick={() => fileRef.current?.click()}>
           <Upload size={16} />上传照片
          </button>
          {image && sourcePhoto && (
           <button type="button" onClick={() => setCrop(sourcePhoto)}>
            <Crop size={15} />重新截取
           </button>
          )}
          {image && (
           <button
            type="button"
            onClick={() => {
             setImage('');
             setSampleWidth('');
             revokePhotoUrl();
             setSourcePhoto(null);
            }}
           >
            移除照片
           </button>
          )}
         </div>
         <small>
          {image && sampleWidth && Number(sampleWidth) > 0
           ? `已校准花纹宽度：${Number((Number(sampleWidth) / 10).toFixed(2))} cm（${Math.round(Number(sampleWidth))} mm）`
           : '选择图片后可截取花纹区域并校准实际尺寸，自动提取主色'}
         </small>
        </div>
       </div>
       <label className="fabric-create-field">
        名称
        <CompositionSafeInput
         value={name}
         onValueChange={setName}
         placeholder="如：复古红碎花棉布"
         maxLength={80}
        />
       </label>
       <div className="fabric-form-row fabric-create-row fabric-create-dimensions">
        <label className="fabric-create-field">
         宽（cm）
         <input
          aria-label="布料宽度"
          disabled={local}
          type="number"
          min=".1"
          step="0.1"
          value={width}
          onChange={e => setWidth(e.target.value)}
          placeholder="50"
         />
        </label>
        <label className="fabric-create-field">
         高（cm）
         <input
          aria-label="布料高度"
          disabled={local}
          type="number"
          min=".1"
          step="0.1"
          value={height}
          onChange={e => setHeight(e.target.value)}
          placeholder="35"
         />
        </label>
        <label className="fabric-create-field">
         数量
         <input
          aria-label="布料数量"
          type="number"
          min=".5"
          step=".5"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
         />
        </label>
       </div>
       {!local && width.trim() && height.trim() && Number(width) > 0 && Number(height) > 0 && Number(quantity) > 0 ? (
        <p className="fabric-area-calc">
         折合可用面积：
         <strong>{Math.round(Number(width) * Number(height) * Number(quantity) * 100) / 100} cm²</strong>
        </p>
       ) : (
        <p className="fabric-create-hint">宽高填写实际布块尺寸；未填写时仅记录拥有，数量待核实。</p>
       )}

       <label className="fabric-create-field">
        备注
        <CompositionSafeInput
         value={note}
         onValueChange={setNote}
         placeholder="如：宜家购入，做裙子剩的"
        />
       </label>
       {allowProjectOnly && (
        <label className="fabric-create-local">
         <input
          aria-label="仅用于本作品"
          type="checkbox"
          checked={local}
          onChange={e => setLocal(e.target.checked)}
         />
         仅用于本作品（不加入布料仓库）
        </label>
       )}
      </fieldset>
      {loading && <p role="status" className="fabric-create-hint">正在读取图片…</p>}
      {error && <p role="alert" className="fabric-create-error">{error}</p>}
      <footer className="fabric-form-actions fabric-create-submit">
       <button
        type="button"
        className="primary home-create-submit"
        disabled={busy || loading}
        onClick={submit}
       >
        {busy ? '保存中…' : '保存布料'}
       </button>
      </footer>
     </>
    )}
    <input
     ref={fileRef}
     type="file"
     accept="image/jpeg,image/png,image/webp"
     hidden
     onChange={e => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) void choosePhoto(file);
     }}
    />
   </div>
  </div>
 );
 useEffect(() => {
  setOverlaySlot('inventory', modal);
 });
 useEffect(() => () => setOverlaySlot('inventory', null), [setOverlaySlot]);
 return null;
}
