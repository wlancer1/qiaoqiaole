import { useEffect, useState } from 'react';
import { useAppOverlay } from '../app/overlays/AppOverlayContext';
import { useBodyScrollLock } from '../app/overlays/useBodyScrollLock';
import { Ban, ChevronRight } from 'lucide-react';
import { type Material } from './model';
import { ConnectedFabricPicker as FabricPicker } from '../fabrics/ConnectedFabricPicker';
import type { FabricItem } from './fabricInventory';

export type PatchworkCreateConfig = { widthMm: number; heightMm: number; baseFabricId: string };

const clampCm = (raw: string, fallback: number) => {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(300, Math.max(10, n)) : fallback;
};

/** 新建拼布前置弹窗：先选画布大小；底布材料通过通用布料选择器选择（默认无底布）。 */
export function PatchworkCreateDialog({ onCancel, onConfirm, warehouseFabrics = [] }: {
  onCancel: () => void;
  onConfirm: (cfg: PatchworkCreateConfig) => void;
  warehouseFabrics?: FabricItem[];
}) {
  const { setOverlaySlot } = useAppOverlay();
  useBodyScrollLock(true);
  const [w, setW] = useState('40');
  const [h, setH] = useState('40');
  const [baseFabric, setBaseFabric] = useState<FabricItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const pickerMaterials: Material[] = baseFabric
    ? [{ id: 'PW-BASE', name: baseFabric.name, color: baseFabric.color || '#d9c8a9', inventoryFabricId: baseFabric.id }]
    : [];
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (pickerOpen) setPickerOpen(false); else onCancel();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [pickerOpen, onCancel]);
  const modal = (
    <div className="home-create-modal" role="presentation" onClick={onCancel} onTouchStart={e => e.stopPropagation()}>
      <div className="home-create-panel" role="dialog" aria-modal="true" aria-label="新建拼布画布" onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
        <div className="home-create-head">
          <strong>新建拼布画布</strong>
          <button aria-label="关闭新建拼布画布" onClick={onCancel}>关闭</button>
        </div>
        <div className="home-create-presets" aria-label="画布尺寸快捷选项">
          {[30, 40, 50].map((size) => (
            <button key={size} type="button" className={Number(w) === size && Number(h) === size ? 'active' : ''} onClick={() => { setW(String(size)); setH(String(size)); }}>{size}×{size}</button>
          ))}
        </div>
        <div className="home-create-form">
          <label>
            <span>宽度 (cm)</span>
            <input type="number" min={10} max={300} value={w} aria-label="宽度 (cm)" onChange={(e) => setW(e.target.value)} onBlur={() => setW(String(clampCm(w, 40)))} />
          </label>
          <label>
            <span>高度 (cm)</span>
            <input type="number" min={10} max={300} value={h} aria-label="高度 (cm)" onChange={(e) => setH(e.target.value)} onBlur={() => setH(String(clampCm(h, 40)))} />
          </label>
        </div>
        <div className="pw-create-base">
          <span className="pw-create-base-label">底布材料</span>
          <button type="button" className="pw-create-base-btn" aria-label="选择底布材料" onClick={() => setPickerOpen(true)}>
            {baseFabric
              ? <><span className="pw-create-base-dot" style={{ background: baseFabric.color || '#d9c8a9' }} /><span className="pw-create-base-name">{baseFabric.name}</span></>
              : <><Ban /><span className="pw-create-base-name">无底布</span></>}
            <ChevronRight className="pw-create-chevron" />
          </button>
        </div>
        <button className="home-create-submit" onClick={() => onConfirm({ widthMm: clampCm(w, 40) * 10, heightMm: clampCm(h, 40) * 10, baseFabricId: baseFabric?.id || '' })}>创建画布</button>
      </div>
      {pickerOpen && (
        <div className="patchwork-overlay pw-create-picker-overlay" onClick={() => setPickerOpen(false)} onTouchStart={(e) => e.stopPropagation()}>
          <div className="patchwork-panel fabricsheet" role="dialog" aria-modal="true" aria-label="选择底布" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
            <FabricPicker
              materials={pickerMaterials}
              selectedId={baseFabric ? 'PW-BASE' : ''}
              editMode={false}
              query={query}
              onQueryChange={setQuery}
              onSelect={(id) => { if (id === '') setBaseFabric(null); setPickerOpen(false); }}
              onEditMaterial={() => { /* 创建前不编辑布料 */ }}
              onEditModeChange={() => { /* 创建前不切换编辑模式 */ }}
              onCreate={() => { /* 创建前不新增布料 */ }}
              onClose={() => setPickerOpen(false)}
              warehouseFabrics={warehouseFabrics}
              onSelectWarehouseFabric={(f) => { setBaseFabric(f); setPickerOpen(false); }}
              allowNone
              hideEditorActions
            />
          </div>
        </div>
      )}
    </div>
  );
  useEffect(() => { setOverlaySlot('patchworkCreate', modal); });
  useEffect(() => () => setOverlaySlot('patchworkCreate', null), [setOverlaySlot]);
  return null;
}
