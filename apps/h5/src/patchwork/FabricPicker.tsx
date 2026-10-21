import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ban, Check, Pencil, Plus, Search, X } from 'lucide-react';
import { unifiedFabrics, matchesMaterialFabric } from '../fabrics/fabricCatalog';
import type { Material } from './model';
import { getAsset } from './assets';
import { fabricBadgeInfo, fabricSpecLabel, type FabricItem } from './fabricInventory';

/** 图片/颜色缩略图：底栏、底布入口与布料选择器共用。 */
export function MatSwatch({ m }: { m: Material }) {
  const [url, setUrl] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onReady = () => setTick((value) => value + 1);
    window.addEventListener('pw-asset-ready', onReady);
    return () => window.removeEventListener('pw-asset-ready', onReady);
  }, []);
  useEffect(() => {
    let live = true;
    let created = '';
    setUrl('');
    if (m.assetId) {
      void getAsset(m.assetId).then((blob) => {
        if (!blob || !live) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      }).catch(() => { /* 若图片丢失则显示颜色 */ });
    }
    return () => {
      live = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [m.assetId, tick]);
  if (url) return <span className="pw-swatch"><img src={url} alt="" /></span>;
  return <span className="pw-swatch" style={{ background: m.color }}>{m.assetId ? '布' : ''}</span>;
}

export type FabricPickerProps = {
  materials: Material[];
  selectedId: string;
  editMode: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (materialId: string) => void;
  onEditMaterial: (materialId: string) => void;
  onEditModeChange: (enabled: boolean) => void;
  onCreate: () => void;
  onClose: () => void;
  warehouseContent?: ReactNode;
  remoteCatalog?: {hasMore:boolean;loading:boolean;error:boolean;ownedPresetIds:string[];loadMore:()=>void;retry:()=>void};
  warehouseFabrics?: FabricItem[];
  allowNone?: boolean;
  hideEditorActions?: boolean;
  onSelectWarehouseFabric?: (fabric: FabricItem) => void;
  onEditWarehouseFabric?: (fabric: FabricItem) => void;
};

/** One catalog, regardless of where the fabric originated. */
export function FabricPicker({
  materials, selectedId, editMode, query, onQueryChange,
  onSelect, onEditMaterial, onEditModeChange, onCreate, onClose, warehouseContent,
  warehouseFabrics, onSelectWarehouseFabric, onEditWarehouseFabric, allowNone, hideEditorActions, remoteCatalog,
}: FabricPickerProps) {
  const [limit, setLimit] = useState(16);
  const scrollRef = useRef<HTMLDivElement>(null);
  const appendPending = useRef(false);
  const remotePending = useRef(false);
  const touchStartY = useRef<number | null>(null);
  useEffect(() => { setLimit(16); if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [query]);
  useEffect(() => { appendPending.current = false; }, [limit]);
  useEffect(() => { if (!remoteCatalog?.loading) remotePending.current = false; }, [remoteCatalog?.loading, warehouseFabrics?.length, query]);
  const normalizedQuery = query.trim().toLowerCase();
  const catalog = unifiedFabrics(warehouseFabrics ?? []).filter(f => !remoteCatalog?.ownedPresetIds.includes(f.presetId || '') || !f.id.startsWith('preset:'));
  type Entry = { key: string; name: string; material?: Material; fabric?: FabricItem };
  const fabricEntry = (fabric: FabricItem): Entry => ({ key: fabric.id, name: fabric.name, fabric, material: materials.find(m => matchesMaterialFabric(m, fabric)) });
  const personal = (warehouseFabrics ?? []).map(fabricEntry);
  const standalone = materials.filter(m => !catalog.some(f => matchesMaterialFabric(m,f)))
    .map(material => ({ key: `material:${material.id}`, name: material.name, material } as Entry));
  const personalIds = new Set((warehouseFabrics ?? []).map(f => f.id));
  const entries = [...personal, ...(remoteCatalog?.hasMore ? [] : standalone), ...(remoteCatalog?.hasMore ? [] : catalog.filter(f => !personalIds.has(f.id)).map(fabricEntry))]
    .filter(e => !normalizedQuery || `${e.name} ${e.fabric?.category || ''} ${e.fabric?.note || ''}`.toLowerCase().includes(normalizedQuery));
  const loadAtBottom = (el: HTMLDivElement) => {
    if (el.clientHeight <= 0 || el.scrollHeight - el.scrollTop - el.clientHeight >= 48) return;
    if (limit < entries.length && !appendPending.current) {
      appendPending.current = true; setLimit(n => n + 16);
    } else if (remoteCatalog?.hasMore && !remoteCatalog.loading && !remoteCatalog.error && !remotePending.current) {
      remotePending.current = true; remoteCatalog.loadMore(); setLimit(n => n + 16);
    }
  };
  return (
    <div className="pw-fab-listwrap" data-testid="shared-fabric-picker">
      <header className="pw-fab-head">
        <div className="pw-fab-title"><strong>{editMode ? '编辑布料' : '选择布料'}</strong>{editMode && <span>选择布料编辑或录入库存</span>}</div>
        {!hideEditorActions && <button type="button" className="pw-fab-newbtn" aria-label="新增布料" onClick={onCreate}><Plus /><span>新增</span></button>}
        {!hideEditorActions && <button type="button" className="pw-fab-editbtn" onClick={() => onEditModeChange(!editMode)}>{editMode ? '完成' : '编辑'}</button>}
        <button type="button" className="pw-fab-close" aria-label="关闭布料面板" onClick={onClose}><X /></button>
      </header>
      <label className="pw-fab-search"><Search /><input value={query} onChange={e => onQueryChange(e.target.value)} placeholder="搜索布料名称" /></label>
      {warehouseContent ?? <div className="pw-fab-scroll" ref={scrollRef}
        onScroll={e => loadAtBottom(e.currentTarget)}
        onWheel={e => { if (e.deltaY > 0) loadAtBottom(e.currentTarget); }}
        onTouchStart={e => { touchStartY.current = e.touches[0]?.clientY ?? null; }}
        onTouchEnd={e => {
          const end = e.changedTouches[0]?.clientY;
          if (touchStartY.current !== null && end !== undefined && touchStartY.current - end > 24) loadAtBottom(e.currentTarget);
          touchStartY.current = null;
        }}>
        <div className="pw-fab-grid">
          {allowNone && !editMode && !normalizedQuery && <button type="button" className={`pw-fabric-tile${selectedId === '' ? ' on' : ''}`} aria-pressed={selectedId === ''} aria-label="不使用底布" onClick={() => onSelect('')}>
            <span className="pw-fab-card-sw"><span className="pw-swatch pw-fab-none"><Ban /></span>{selectedId === '' && <span className="pw-fab-badge check"><Check /></span>}</span>
            <span className="pw-fab-card-name">无底布</span>
          </button>}
          {entries.slice(0,limit).map(({ key, name, material, fabric }) => {
            const selected = !editMode && material?.id === selectedId;
            const badge = fabric ? fabricBadgeInfo(fabric) : null;
            return <button key={key} type="button" className={`pw-fabric-tile${selected ? ' on' : ''}`} aria-pressed={selected}
              aria-label={`${editMode ? '编辑' : '选择'}布料 ${name}`} onClick={() => {
                if (editMode) {
                  if (material) onEditMaterial(material.id);
                  else if (fabric) onEditWarehouseFabric?.(fabric);
                } else if (material) onSelect(material.id);
                else if (fabric) onSelectWarehouseFabric?.(fabric);
              }}>
              <span className="pw-fab-card-sw">
                {material ? <MatSwatch m={material} /> : fabric?.image ? <span className="pw-swatch"><img src={fabric.image} alt="" loading="lazy" /></span> : <span className="pw-swatch" style={{background:fabric?.color || '#d9c8a9'}} />}
                {editMode ? <span className="pw-fab-badge edit"><Pencil /></span> : selected ? <span className="pw-fab-badge check"><Check /></span> : null}
              </span>
              <span className="pw-fab-card-name">{name}</span>
              <small className="pw-fab-card-sub">{fabric ? badge?.tone === 'own' || badge?.tone === 'out' ? badge.label : fabricSpecLabel(fabric) : '未录入库存'}</small>
            </button>;
          })}
        </div>
        {remoteCatalog?.error ? <p className="pw-fab-load-status">加载失败，<button type="button" onClick={remoteCatalog.retry}>重试</button></p> : remoteCatalog?.loading ? <p className="pw-fab-load-status" role="status">加载中…</p> : entries.length === 0 ? <p className="pw-fab-empty">没有找到匹配的布料</p> : <p className="pw-fab-load-status" role="status">{limit < entries.length || remoteCatalog?.hasMore ? '上拉加载更多' : '已显示全部布料'}</p>}
      </div>}
    </div>
  );
}
