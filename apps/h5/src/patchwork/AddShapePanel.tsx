import { useEffect, useId, useState } from 'react';
import { Check, ImagePlus, Link2, RotateCw, Search, Star, Unlink2 } from 'lucide-react';
import { pointBounds } from './model';
import { shapeChoices, validShapePlacement, type ShapeCategory, type ShapeChoice, type ShapePlacement, type ShapeTemplate } from './shapeLibrary';
import './add-shape-panel.css';

const categories: Array<[ShapeCategory, string]> = [['mine', '我的形状'], ['base', '基础形状']];
function ShapePreview({ choice, color, rotation = 0 }: { choice: ShapeChoice; color: string; rotation?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const b = pointBounds(choice.polygons.flat());
  const side = Math.max(b.width, b.height) * 1.32;
  return <svg viewBox={`${b.x + b.width / 2 - side / 2} ${b.y + b.height / 2 - side / 2} ${side} ${side}`} aria-hidden="true">
    <defs><pattern id={id} patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill={color} /><path d="M0 0H8M0 0V8M4 0V8M0 4H8" stroke="#fff" strokeWidth=".7" opacity=".35" /></pattern></defs>
    <g transform={`rotate(${rotation} ${b.x + b.width / 2} ${b.y + b.height / 2})`}>{choice.polygons.map((poly, i) => <polygon key={i} points={poly.map((p) => `${p.x},${p.y}`).join(' ')} fill={`url(#${id})`} stroke="#59778b" strokeWidth=".5" />)}</g>
  </svg>;
}

export function AddShapePanel({ templates, onTemplatesChange, onImport, onPlace, onCancel, color = '#9db9ad', defaultSeam = 0, library }: {
  templates: ShapeTemplate[]; onTemplatesChange: (next: ShapeTemplate[]) => boolean | Promise<boolean>;
  onImport: () => void; onPlace: (choice: ShapeChoice, options: ShapePlacement) => void | Promise<void>; onCancel: () => void;
  color?: string; defaultSeam?: number;
  library?: { setBrowse: (value: { query: string; filter: 'recent' | 'favorite' | 'all' }) => void; loading: boolean; saving: boolean; hasMore: boolean; loadMore: () => void; error: string; retry: () => void; accountId: string };
}) {
  const [category, setCategory] = useState<ShapeCategory>('mine');
  const [step, setStep] = useState<'choose' | 'params'>('choose');
  const [selected, setSelected] = useState<ShapeChoice | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'recent' | 'favorite' | 'all'>('recent');
  const [placing, setPlacing] = useState(false);
  useEffect(() => { library?.setBrowse({ query: category === 'mine' ? query : '', filter }); }, [query, filter, category, library?.setBrowse]);
  const [width, setWidth] = useState('100');
  const [height, setHeight] = useState('100');
  const [seam, setSeam] = useState(String(defaultSeam));
  const [rotation, setRotation] = useState(0);
  const [linked, setLinked] = useState(true);
  const ratio = selected ? (() => { const b = pointBounds(selected.polygons.flat()); return b.height / Math.max(b.width, .001); })() : 1;
  const options: ShapePlacement = { width: Number(width), height: Number(height), seam: seam.trim() ? Number(seam) : NaN, rotation };
  const isValid = Boolean(width.trim() && height.trim() && validShapePlacement(options));
  const choose = (choice: ShapeChoice) => {
    setSelected(choice); const b = pointBounds(choice.polygons.flat());
    setWidth(String(Number(b.width.toFixed(2)))); setHeight(String(Number(b.height.toFixed(2)))); setLinked(true); setRotation(0);
  };
  const changeSize = (axis: 'width' | 'height', value: string) => {
    if (axis === 'width') setWidth(value); else setHeight(value);
    const number = Number(value);
    if (linked && value.trim() && Number.isFinite(number) && number > 0) {
      if (axis === 'width') setHeight(String(Number((number * ratio).toFixed(2))));
      else setWidth(String(Number((number / ratio).toFixed(2))));
    }
  };
  const toggleFavorite = (id: string) => onTemplatesChange(templates.map((t) => t.id === id ? { ...t, favorite: !t.favorite } : t));
  let visible = shapeChoices(category, templates).filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()));
  if (category === 'mine') {
    if (filter === 'favorite') visible = visible.filter((c) => templates.find((t) => t.id === c.templateId)?.favorite);
    if (filter === 'recent') visible = [...visible].sort((a, b) => (templates.find((t) => t.id === b.id)?.lastUsedAt || 0) - (templates.find((t) => t.id === a.id)?.lastUsedAt || 0) || templates.findIndex((t) => t.id === b.id) - templates.findIndex((t) => t.id === a.id));
  }
  return <div className="pw-add-flow">
    <div className="pw-add-tabs" role="tablist" aria-label="形状分类">{categories.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={category === id} onClick={() => { setCategory(id); setSelected(null); setStep('choose'); setQuery(''); }}>{label}</button>)}</div>
    <div className="pw-add-body">
      {step === 'params' && selected && <>
        <div className="pw-add-current"><div className="pw-add-current-art"><ShapePreview choice={selected} color={color} rotation={rotation} /></div><div><strong>当前选择：{selected.name}</strong><small>{width || '—'} × {height || '—'} mm</small></div>{selected.templateId && <button type="button" className="pw-add-star" disabled={library?.saving} aria-label={`${templates.find((t) => t.id === selected.templateId)?.favorite ? '取消收藏' : '收藏'} ${selected.name}`} aria-pressed={Boolean(templates.find((t) => t.id === selected.templateId)?.favorite)} onClick={() => toggleFavorite(selected.templateId!)}><Star /></button>}</div>
        <div className="pw-add-parameters">
          <label>宽 (mm)<input aria-label="形状宽度" type="number" min="5" max="2000" step="any" value={width} onChange={(e) => changeSize('width', e.target.value)} /></label>
          <button type="button" className="pw-add-link" aria-label="锁定宽高比例" aria-pressed={linked} onClick={() => setLinked(!linked)}>{linked ? <Link2 /> : <Unlink2 />}</button>
          <label>高 (mm)<input aria-label="形状高度" type="number" min="5" max="2000" step="any" value={height} onChange={(e) => changeSize('height', e.target.value)} /></label>
          <label>缝份 (mm)<input aria-label="形状缝份" type="number" min="0" max="50" step=".5" value={seam} onChange={(e) => setSeam(e.target.value)} /></label>
        </div>
        {!isValid && <p className="pw-add-validation" role="status">宽高需为 5–2000 mm，缝份为 0–50 mm</p>}
        <button type="button" className="pw-add-rotate" onClick={() => setRotation((r) => (r + 90) % 360)}><RotateCw />旋转 90°<span>当前 {rotation}°</span></button>
        <h3 className="pw-add-subtitle">选择其他形状</h3>
      </>}
      <div className="pw-add-search-row">
        <label className="pw-add-search"><Search /><input aria-label="搜索形状" placeholder={category === 'mine' ? '搜索我的形状…' : '搜索形状…'} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        {category === 'mine' && <button type="button" className="pw-add-import" disabled={library?.saving} onClick={onImport}><ImagePlus />导入图片</button>}
      </div>
      {category === 'mine' && library && <div className="pw-add-sync" role="status">{library.error ? <>{library.error} <button type="button" onClick={library.retry}>重试</button></> : library.saving ? '正在保存…' : library.loading ? '正在加载…' : library.accountId ? '形状保存到当前账号' : '当前保存于本机，登录后同步到账号'}</div>}
      {category === 'mine' && <div className="pw-add-filters" aria-label="我的形状筛选">{([['recent', '最近使用'], ['favorite', '收藏'], ['all', '全部']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div>}
      <div className="pw-add-grid">{visible.map((choice) => {
        const b = pointBounds(choice.polygons.flat()); const favorite = Boolean(templates.find((t) => t.id === choice.templateId)?.favorite);
        return <div key={choice.id} className={`pw-add-card${selected?.id === choice.id && selected.category === choice.category ? ' selected' : ''}`}>
          <button type="button" className="pw-add-choice" aria-label={`选择形状 ${choice.name}`} aria-pressed={selected?.id === choice.id && selected.category === choice.category} onClick={() => choose(choice)}><ShapePreview choice={choice} color={color} /><strong>{choice.name}</strong><small>{Number(b.width.toFixed(1))} × {Number(b.height.toFixed(1))} mm</small></button>
          {choice.templateId && <button type="button" className="pw-add-star" disabled={library?.saving} aria-label={`${favorite ? '取消收藏' : '收藏'} ${choice.name}`} aria-pressed={favorite} onClick={() => toggleFavorite(choice.templateId!)}><Star /></button>}
          {selected?.id === choice.id && selected.category === choice.category && <span className="pw-add-checked"><Check /></span>}
        </div>;
      })}</div>
      {category === 'mine' && library?.hasMore && <button type="button" className="pw-add-more" disabled={library.loading} onClick={library.loadMore}>{library.loading ? '加载中…' : '加载更多'}</button>}
      {visible.length === 0 && !library?.loading && <div className="pw-add-empty"><strong>{query ? '没有匹配的形状' : filter === 'favorite' && category === 'mine' ? '还没有收藏的形状' : '还没有保存的形状'}</strong><p>{category === 'mine' ? '导入图片提取轮廓，或选中画布布片后在属性中保存。' : '试试其他关键词。'}</p></div>}
    </div>
    <footer className="pw-add-footer"><button type="button" onClick={step === 'params' ? () => setStep('choose') : onCancel}>{step === 'params' ? '返回' : '取消'}</button><button type="button" className="primary" disabled={placing || library?.saving || !selected || (step === 'params' && !isValid)} onClick={() => { if (!selected) return; if (step === 'choose') setStep('params'); else if (isValid && !placing) { setPlacing(true); Promise.resolve(onPlace(selected, options)).finally(() => setPlacing(false)); } }}>{step === 'choose' ? '下一步' : '放置到画布'}</button></footer>
  </div>;
}
