import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Search, Star } from 'lucide-react';
import { pointBounds } from './model';
import { BASE_SHAPE_GROUPS, shapeChoices, type BaseShapeGroup, type ShapeCategory, type ShapeChoice, type ShapePlacement, type ShapeTemplate } from './shapeLibrary';
import './add-shape-panel.css';

const SHAPE_BATCH_SIZE = 16;

const categories: Array<[ShapeCategory, string]> = [['mine', '我的形状'], ['base', '基础形状']];

function ShapePreview({ choice }: { choice: ShapeChoice }) {
  const b = pointBounds(choice.polygons.flat());
  const side = Math.max(b.width, b.height, 1) * 1.32;
  return <svg viewBox={`${b.x + b.width / 2 - side / 2} ${b.y + b.height / 2 - side / 2} ${side} ${side}`} aria-hidden="true">
    {choice.polygons.map((poly, i) => <polygon key={i} points={poly.map((p) => `${p.x},${p.y}`).join(' ')} fill="#eef0f2" stroke="#697586" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
  </svg>;
}

/** 单击形状即放到画布；选中布片后可在画布及属性面板调整尺寸、旋转和缝份。 */
export function AddShapePanel({ templates, onTemplatesChange, onImport, onPlace, onCancel, defaultSeam = 0, library }: {
  templates: ShapeTemplate[]; onTemplatesChange: (next: ShapeTemplate[]) => boolean | Promise<boolean>;
  onImport: () => void; onPlace: (choice: ShapeChoice, options: ShapePlacement) => void | Promise<void>; onCancel: () => void;
  defaultSeam?: number;
  library?: { setBrowse: (value: { query: string; filter: 'recent' | 'favorite' | 'all' }) => void; loading: boolean; saving: boolean; hasMore: boolean; loadMore: () => void; error: string; retry: () => void; accountId: string };
}) {
  const [category, setCategory] = useState<ShapeCategory>('mine');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'recent' | 'favorite' | 'all'>('recent');
  const [shapeGroup, setShapeGroup] = useState<'all' | BaseShapeGroup>('all');
  const [placing, setPlacing] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(SHAPE_BATCH_SIZE);
  const remoteLoadPending = useRef(false);
  const appendPending = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => { library?.setBrowse({ query: category === 'mine' ? query : '', filter }); }, [query, filter, category, library?.setBrowse]);

  const place = async (choice: ShapeChoice) => {
    if (placing || library?.saving) return;
    const b = pointBounds(choice.polygons.flat());
    // 沿用形状的原始长宽比例；极小轮廓保证符合布片最小尺寸限制。
    const options: ShapePlacement = {
      width: Math.max(5, Math.min(2000, Number(b.width.toFixed(2)))),
      height: Math.max(5, Math.min(2000, Number(b.height.toFixed(2)))),
      seam: defaultSeam, rotation: 0,
    };
    setPlacing(true);
    try { await onPlace(choice, options); }
    finally { setPlacing(false); }
  };

  const toggleFavorite = (id: string) => onTemplatesChange(templates.map((t) => t.id === id ? { ...t, favorite: !t.favorite } : t));
  let visible = shapeChoices(category, templates).filter((c) => !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()));
  // 搜索始终覆盖全部基础形状，不因上次分组选择漏掉结果。
  if (category === 'base' && shapeGroup !== 'all' && !query.trim()) visible = visible.filter((c) => c.group === shapeGroup);
  if (category === 'mine') {
    if (filter === 'favorite') visible = visible.filter((c) => templates.find((t) => t.id === c.templateId)?.favorite);
    if (filter === 'recent') visible = [...visible].sort((a, b) => (templates.find((t) => t.id === b.id)?.lastUsedAt || 0) - (templates.find((t) => t.id === a.id)?.lastUsedAt || 0) || templates.findIndex((t) => t.id === b.id) - templates.findIndex((t) => t.id === a.id));
  }
  const pageChoices = visible.slice(0, visibleLimit);
  const hasLocalMore = visibleLimit < visible.length;
  const hasRemoteMore = category === 'mine' && Boolean(library?.hasMore);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [category, query, filter, shapeGroup]);
  useEffect(() => { appendPending.current = false; }, [visibleLimit]);
  useEffect(() => {
    if (!library?.loading) remoteLoadPending.current = false;
  }, [library?.loading, library?.error, templates.length, category, query, filter, shapeGroup]);
  const loadOnScroll = (body: HTMLDivElement) => {
    if (body.clientHeight <= 0 || body.scrollHeight - body.scrollTop - body.clientHeight > 48) return;
    if (hasLocalMore) {
      if (appendPending.current) return;
      appendPending.current = true;
      setVisibleLimit((limit) => limit + SHAPE_BATCH_SIZE);
    } else if (hasRemoteMore && !library?.loading && !library?.saving && !library?.error && !remoteLoadPending.current) {
      // 同一批请求发出后立即加锁，避免 loading 状态更新前连续触底重复请求。
      remoteLoadPending.current = true;
      library?.loadMore();
      setVisibleLimit((limit) => limit + SHAPE_BATCH_SIZE);
    }
  };
  return <div className="pw-add-flow">
    <div className="pw-add-tabs" role="tablist" aria-label="形状分类">{categories.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={category === id} onClick={() => { setCategory(id); setShapeGroup('all'); setQuery(''); setVisibleLimit(SHAPE_BATCH_SIZE); }}>{label}</button>)}</div>
    <div className="pw-add-body" ref={bodyRef} onScroll={(event) => loadOnScroll(event.currentTarget)}>
      <div className="pw-add-search-row">
        <label className="pw-add-search"><Search /><input aria-label="搜索形状" placeholder={category === 'mine' ? '搜索我的形状…' : '搜索形状…'} value={query} onChange={(e) => { setQuery(e.target.value); setVisibleLimit(SHAPE_BATCH_SIZE); }} /></label>
        {category === 'mine' && <button type="button" className="pw-add-import" disabled={library?.saving} onClick={onImport}><ImagePlus />导入图片</button>}
      </div>
      {category === 'mine' && library && <div className="pw-add-sync" role="status">{library.error ? <>{library.error} <button type="button" onClick={library.retry}>重试</button></> : library.saving ? '正在保存…' : library.loading ? '正在加载…' : library.accountId ? '形状保存到当前账号' : '当前保存于本机，登录后同步到账号'}</div>}
      {category === 'base' && <div className="pw-add-groups" aria-label="基础形状分组">
        <button type="button" aria-pressed={shapeGroup === 'all'} onClick={() => { setShapeGroup('all'); setVisibleLimit(SHAPE_BATCH_SIZE); }}>全部</button>
        {BASE_SHAPE_GROUPS.map(({ id, label }) => <button key={id} type="button" aria-pressed={shapeGroup === id} onClick={() => { setShapeGroup(id); setVisibleLimit(SHAPE_BATCH_SIZE); }}>{label}</button>)}
      </div>}
      {category === 'mine' && <div className="pw-add-filters" aria-label="我的形状筛选">{([['recent', '最近使用'], ['favorite', '收藏'], ['all', '全部']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setVisibleLimit(SHAPE_BATCH_SIZE); }}>{label}</button>)}</div>}
      {category === 'base' && <div className="pw-add-shape-count">{query ? '搜索结果' : '点击图形直接添加'} · {visible.length} 个形状</div>}
      <div className="pw-add-grid">{pageChoices.map((choice) => {
        const favorite = Boolean(templates.find((t) => t.id === choice.templateId)?.favorite);
        return <div key={choice.id} className="pw-add-card">
          <button type="button" className="pw-add-choice" aria-label={`添加形状 ${choice.name}`} disabled={placing || library?.saving} onClick={() => { void place(choice); }}>
            <ShapePreview choice={choice} />
            <strong>{choice.name}</strong>
          </button>
          {choice.templateId && <button type="button" className="pw-add-star" disabled={library?.saving} aria-label={`${favorite ? '取消收藏' : '收藏'} ${choice.name}`} aria-pressed={favorite} onClick={() => toggleFavorite(choice.templateId!)}><Star /></button>}
        </div>;
      })}</div>
      {(visible.length > 0 || hasRemoteMore) && <div className="pw-add-load-status" role="status" aria-live="polite">
        {category === 'mine' && library?.loading ? '加载中…' : category === 'mine' && library?.error ? '加载失败，请重试' : hasLocalMore || hasRemoteMore ? '上拉加载更多' : '已显示全部形状'}
      </div>}
      {visible.length === 0 && !library?.loading && <div className="pw-add-empty"><strong>{query ? '没有匹配的形状' : filter === 'favorite' && category === 'mine' ? '还没有收藏的形状' : '还没有保存的形状'}</strong><p>{category === 'mine' ? '导入图片提取轮廓，或选中画布布片后在属性中保存。' : '试试其他关键词。'}</p></div>}
    </div>

  </div>;
}
