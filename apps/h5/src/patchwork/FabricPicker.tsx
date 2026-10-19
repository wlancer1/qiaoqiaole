import { useEffect, useState, type ReactNode } from 'react';
import { Check, Pencil, Plus, Search, X } from 'lucide-react';
import type { Material } from './model';
import { getAsset } from './assets';

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

type Props = {
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
};

/** 统一的图片布料选择器：底布与底部布料列表均打开此组件。 */
export function FabricPicker({
  materials, selectedId, editMode, query, onQueryChange,
  onSelect, onEditMaterial, onEditModeChange, onCreate, onClose, warehouseContent,
}: Props) {
  const filtered = materials.filter((m) => {
    const value = query.trim().toLowerCase();
    return !value || m.name.toLowerCase().includes(value) || m.id.toLowerCase().includes(value);
  });
  return (
    <div className="pw-fab-listwrap" data-testid="shared-fabric-picker">
      <header className="pw-fab-head">
        <div className="pw-fab-title">
          <strong>{editMode ? '编辑布料' : '选择布料'}</strong>
          {editMode && <span>点击布料进行编辑</span>}
        </div>
        <button type="button" className="pw-fab-newbtn" aria-label="新增布料" onClick={onCreate}><Plus /><span>新增</span></button>
        <button type="button" className="pw-fab-editbtn" onClick={() => onEditModeChange(!editMode)}>{editMode ? '完成' : '编辑'}</button>
        <button type="button" className="pw-fab-close" aria-label="关闭布料面板" onClick={onClose}><X /></button>
      </header>
      <label className="pw-fab-search"><Search /><input value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder="搜索布料名称" /></label>
      {warehouseContent ?? (
        <div className="pw-fab-grid">
          {filtered.map((material) => {
            const selected = !editMode && selectedId === material.id;
            return (
              <button key={material.id} type="button"
                className={`pw-fabric-tile${selected ? ' on' : ''}`}
                aria-pressed={selected}
                aria-label={`${editMode ? '编辑' : '选择'}布料 ${material.name}`}
                onClick={() => editMode ? onEditMaterial(material.id) : onSelect(material.id)}>
                <span className="pw-fab-card-sw">
                  <MatSwatch m={material} />
                  {editMode
                    ? <span className="pw-fab-badge edit"><Pencil /></span>
                    : selected ? <span className="pw-fab-badge check"><Check /></span> : null}
                </span>
                <span className="pw-fab-card-name">{material.name}</span>
              </button>
            );
          })}
          {filtered.length === 0 && <p className="pw-fab-empty">没有找到匹配的布料</p>}
        </div>
      )}
    </div>
  );
}
