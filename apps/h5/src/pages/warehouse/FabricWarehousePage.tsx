import { CompositionSafeInput } from '../../shared/CompositionSafeInput';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, History, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useAppOverlay } from '../../app/overlays/AppOverlayContext';
import { FabricStockDialog, recordFabricStock } from '../../fabrics/FabricStockDialog';
import { FabricCreateDialog } from '../../fabrics/FabricCreateDialog';
import type { FabricCreateResult } from '../../fabrics/fabricCreate';
import { useBodyScrollLock } from '../../app/overlays/useBodyScrollLock';
import {
  FABRIC_CATEGORIES,
  FABRIC_STATUS_FILTERS,
  extractDominantColorFromRgba,
  fabricAvailableAreaMm2,
  fabricBadgeInfo,
  fabricSpecLabel,
  fabricStockFilterCategory,
  formatCm2,
  type FabricCategory,
  type FabricItem,
  type FabricStatusFilter,
  type FabricStockMode,
  type FabricTransaction,
} from '../../patchwork/fabricInventory';

export type { FabricItem };

type FabricRequest = <T>(path: string, init: RequestInit, token?: string) => Promise<T>;

type FabricFormState = {
  name: string;
  color: string;
  category: FabricCategory;
  stockMode: FabricStockMode;
  widthMm: string;
  heightMm: string;
  quantity: string;
  availableAreaCm2: string;
  note: string;
  image: string;
};

const EMPTY_FORM: FabricFormState = {
  name: '',
  color: '#d98a9e',
  category: '棉布',
  stockMode: 'size',
  widthMm: '500',
  heightMm: '350',
  quantity: '1',
  availableAreaCm2: '1750',
  note: '',
  image: '',
};

export function FabricWarehousePage({ token, onBack, request, withLogin }: {
  token: string | null;
  onBack: () => void;
  onSwitchSection?: () => void;
  request: FabricRequest;
  withLogin: (work: (token: string) => void) => unknown;
}) {
  const { openConfirm, setOverlaySlot } = useAppOverlay();
  const [fabrics, setFabrics] = useState<FabricItem[]>([]);
  const [transactions, setTransactions] = useState<FabricTransaction[]>([]);
  const [showTransactions, setShowTransactions] = useState(false);
  const [loading, setLoading] = useState(Boolean(token));
  const [editing, setEditing] = useState<FabricItem | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [stockFabric, setStockFabric] = useState<FabricItem | null>(null);
  const [form, setForm] = useState<FabricFormState>(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FabricStatusFilter>('全部');
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const newFabricTokenRef = useRef('');
  const mountedRef = useRef(true);
  const accountTokenRef = useRef(token);
  accountTokenRef.current = token;
  useEffect(() => { setStockFabric(null); setFabrics([]); }, [token]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const payload = await request<{ fabrics: FabricItem[] }>('/fabrics', {}, token);
        if (!mountedRef.current || accountTokenRef.current !== token) return;
        setFabrics(Array.isArray(payload.fabrics) ? payload.fabrics : []);
      } catch {
        if (mountedRef.current) setStatus('布料仓库读取失败，请稍后重试');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, [request, token]);

  useEffect(load, [load]);

  const loadTransactions = useCallback(() => {
    if (!token) return;
    void (async () => {
      try {
        const payload = await request<{ transactions: FabricTransaction[] }>('/fabrics/transactions', {}, token);
        if (mountedRef.current) {
          setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
        }
      } catch {
        if (mountedRef.current) setStatus('出入库记录读取失败');
      }
    })();
  }, [request, token]);

  const openEdit = (fabric: FabricItem | 'new') => {
    if (fabric === 'new') {
      setForm(EMPTY_FORM);
      setEditing('new');
      return;
    }
    const areaMm2 = fabricAvailableAreaMm2(fabric);
    const mode: FabricStockMode = fabric.stockMode === 'area' || fabric.stockMode === 'own' || fabric.stockMode === 'size'
      ? fabric.stockMode
      : (fabric.widthMm && fabric.heightMm ? 'size' : typeof fabric.availableAreaMm2 === 'number' ? 'area' : 'own');
    const category = (FABRIC_CATEGORIES.includes(fabric.category as FabricCategory) ? fabric.category : '棉布') as FabricCategory;
    setForm({
      name: fabric.name,
      color: fabric.color || '#d98a9e',
      category,
      stockMode: mode,
      widthMm: fabric.widthMm ? String(fabric.widthMm) : '500',
      heightMm: fabric.heightMm ? String(fabric.heightMm) : '350',
      quantity: String(fabric.quantity ?? 1),
      availableAreaCm2: areaMm2 !== null ? String(Math.round(areaMm2 / 100)) : '0',
      note: fabric.note || '',
      image: fabric.image || '',
    });
    setEditing(fabric);
  };

  const submit = () => {
    if (saving) return;
    const name = form.name.trim();
    if (!name) {
      setStatus('请输入布料名称');
      return;
    }
    const mode = editing === 'new' ? 'size' : form.stockMode;
    const widthMm = mode === 'size' && Number(form.widthMm) > 0 ? Math.round(Number(form.widthMm)) : null;
    const heightMm = mode === 'size' && Number(form.heightMm) > 0 ? Math.round(Number(form.heightMm)) : null;
    const quantity = Number.isFinite(Number(form.quantity)) && Number(form.quantity) >= 0 ? Number(form.quantity) : 1;
    const stockUnchanged = editing && editing !== 'new' && mode === editing.stockMode && widthMm === editing.widthMm && heightMm === editing.heightMm && quantity === editing.quantity;
    const availableAreaMm2 = mode === 'size' && stockUnchanged
      ? editing.availableAreaMm2
      : mode === 'size'
      ? (widthMm && heightMm ? Math.round(widthMm * heightMm * quantity) : 0)
      : mode === 'area'
        ? Math.max(0, Math.round((Number(form.availableAreaCm2) || 0) * 100))
        : null;

    const body = {
      name,
      color: form.color || null,
      category: form.category || '棉布',
      stockMode: mode,
      image: form.image || null,
      widthMm,
      heightMm,
      quantity,
      availableAreaMm2,
      note: form.note.trim() || null,
    };

    withLogin((nextToken) => {
      void (async () => {
        setSaving(true);
        try {
          if (editing === 'new') {
            const { fabric } = await request<{ fabric: FabricItem }>('/fabrics', { method: 'POST', body: JSON.stringify(body) }, nextToken);
            if (!mountedRef.current) return;
            setFabrics((list) => [fabric, ...list]);
          } else if (editing) {
            const { fabric } = await request<{ fabric: FabricItem }>(`/fabrics/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: JSON.stringify(body) }, nextToken);
            if (!mountedRef.current) return;
            setFabrics((list) => list.map((item) => (item.id === fabric.id ? fabric : item)));
          }
          setEditing(null);
          setStatus('');
        } catch (error) {
          if (mountedRef.current) setStatus(error instanceof Error ? error.message : '保存失败，请稍后重试');
        } finally {
          if (mountedRef.current) setSaving(false);
        }
      })();
    });
  };

  const remove = (fabric: FabricItem) => {
    openConfirm({
      title: '删除布料',
      message: `确定删除布料「${fabric.name}」吗？删除后无法恢复。`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => {
        withLogin((nextToken) => {
          void (async () => {
            try {
              await request(`/fabrics/${encodeURIComponent(fabric.id)}`, { method: 'DELETE' }, nextToken);
              if (!mountedRef.current) return;
              setFabrics((list) => list.filter((item) => item.id !== fabric.id));
              if (editing && editing !== 'new' && editing.id === fabric.id) setEditing(null);
            } catch (error) {
              if (mountedRef.current) setStatus(error instanceof Error ? error.message : '删除失败，请稍后重试');
            }
          })();
        });
      },
    });
  };

  const onPhoto = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('图片读取失败'));
        img.src = url;
      });
      const scale = Math.min(1, 480 / Math.max(1, Math.max(img.naturalWidth, img.naturalHeight)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      let dominant = form.color;
      try {
        const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
        if (imgData?.data) {
          dominant = extractDominantColorFromRgba(imgData.data);
        }
      } catch {
        // Ignore security/canvas read errors in mock environments
      }
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      if (mountedRef.current) {
        setForm((current) => ({ ...current, image: dataUrl, color: dominant || current.color }));
      }
    } catch {
      if (mountedRef.current) setStatus('图片读取失败');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const stats = useMemo(() => {
    let totalAreaMm2 = 0;
    let lowOrDepleted = 0;
    for (const fabric of fabrics) {
      const area = fabricAvailableAreaMm2(fabric);
      if (typeof area === 'number' && area > 0) totalAreaMm2 += area;
      const cat = fabricStockFilterCategory(fabric);
      if (cat === '库存不足' || cat === '已用完') lowOrDepleted += 1;
    }
    return {
      totalCount: fabrics.length,
      totalAreaMm2,
      lowOrDepleted,
    };
  }, [fabrics]);

  const filteredFabrics = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fabrics.filter((fabric) => {
      if (statusFilter !== '全部' && fabricStockFilterCategory(fabric) !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const target = `${fabric.name} ${fabric.category || ''} ${fabric.note || ''} ${fabric.color || ''}`.toLowerCase();
      return target.includes(q);
    });
  }, [fabrics, search, statusFilter]);

  const previewAreaCm2 = useMemo(() => {
    if (form.stockMode === 'size') {
      const w = Math.max(0, Number(form.widthMm) || 0);
      const h = Math.max(0, Number(form.heightMm) || 0);
      const q = Math.max(0, Number(form.quantity) || 0);
      return formatCm2(w * h * q);
    }
    if (form.stockMode === 'area') {
      return formatCm2((Number(form.availableAreaCm2) || 0) * 100);
    }
    return null;
  }, [form.availableAreaCm2, form.heightMm, form.quantity, form.stockMode, form.widthMm]);

  const formModal = editing && editing !== 'new' ? (
    <div className="home-create-modal fabric-modal" role="presentation" onClick={() => { if (!saving) setEditing(null); }} onTouchStart={(e) => e.stopPropagation()}>
      <div className="home-create-panel fabric-modal-panel" role="dialog" aria-modal="true" aria-label={'编辑布料'} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
        <section className="fabric-form login-form">
          <div className="home-create-head">
              <strong>{'编辑布料'}</strong>
              <button type="button" aria-label="关闭布料表单" disabled={saving} onClick={() => setEditing(null)}>关闭</button>
            </div>
          <div className="fabric-form-preview">
            {form.image ? <img src={form.image} alt="" /> : <span className="fabric-swatch" style={{ background: form.color }} />}
            <div className="fabric-form-preview-actions">
              <button type="button" onClick={() => fileRef.current?.click()}><Upload aria-hidden="true" />上传照片</button>
              {form.image ? <button type="button" onClick={() => setForm((current) => ({ ...current, image: '' }))}>移除照片</button> : null}
              <small>上传照片会自动提取主色，便于缺料同色系智能推荐</small>
            </div>
          </div>
          <div className="fabric-form-row-2">
            <label style={undefined}>
              名称
              <CompositionSafeInput value={form.name} onValueChange={(value) => setForm((current) => ({ ...current, name: value }))} placeholder="如：复古红碎花棉布" />
            </label>
            {true ? (
            <label>
              分类
              <select aria-label="分类" value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value as FabricCategory }))}>
                {FABRIC_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            ) : null}
          </div>
          {true ? (
          <label>
            主色系（用于缺布同色推荐与纯色预览）
            <div className="fabric-color-row">
              <input aria-label="颜色" type="color" value={form.color} onChange={(e) => setForm((current) => ({ ...current, color: e.target.value }))} />
              <input aria-label="颜色色值" type="text" value={form.color} onChange={(e) => setForm((current) => ({ ...current, color: e.target.value }))} />
            </div>
          </label>
          ) : null}
          {true ? (
          <div className="fabric-mode-field">
            <span>库存计量方式</span>
            <div className="fabric-mode-seg" role="radiogroup" aria-label="库存计量方式">
              {([
                ['size', '按尺寸块数'],
                ['area', '按剩余面积'],
                ['own', '未录入库存'],
              ] as const).map(([modeKey, label]) => (
                <button
                  key={modeKey}
                  type="button"
                  className={form.stockMode === modeKey ? 'active' : ''}
                  aria-pressed={form.stockMode === modeKey}
                  onClick={() => setForm((current) => ({ ...current, stockMode: modeKey }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          ) : null}

          {form.stockMode === 'size' ? (
            <div className="fabric-form-row">
              <label>宽 (cm)<input type="number" min={0} step="0.1" value={form.widthMm === '' ? '' : String(Number(form.widthMm) / 10)} onChange={(e) => setForm((current) => ({ ...current, widthMm: e.target.value === '' ? '' : String(Math.round(Number(e.target.value) * 10)) }))} placeholder="50" /></label>
              <label>高 (cm)<input type="number" min={0} step="0.1" value={form.heightMm === '' ? '' : String(Number(form.heightMm) / 10)} onChange={(e) => setForm((current) => ({ ...current, heightMm: e.target.value === '' ? '' : String(Math.round(Number(e.target.value) * 10)) }))} placeholder="35" /></label>
              <label>数量<input type="number" min={0} step="0.5" value={form.quantity} onChange={(e) => setForm((current) => ({ ...current, quantity: e.target.value }))} /></label>
            </div>
          ) : form.stockMode === 'area' ? (
            <div className="fabric-form-row-2">
              <label>
                可用总面积 (cm²)
                <input
                  type="number"
                  min={0}
                  aria-label="可用总面积 (cm²)"
                  value={form.availableAreaCm2}
                  onChange={(e) => setForm((current) => ({ ...current, availableAreaCm2: e.target.value }))}
                  placeholder="1200"
                />
              </label>
              <label>
                块数备注
                <input type="number" min={0} step="0.5" value={form.quantity} onChange={(e) => setForm((current) => ({ ...current, quantity: e.target.value }))} />
              </label>
            </div>
          ) : (
            <div className="fabric-form-row-2">
              <label>
                块数
                <input type="number" min={0} step="1" value={form.quantity} onChange={(e) => setForm((current) => ({ ...current, quantity: e.target.value }))} />
              </label>
              <p className="fabric-own-hint">可先用于设计，买到布料后再录入实际库存。</p>
            </div>
          )}

          {previewAreaCm2 !== null ? (
            <p className="fabric-area-calc">折合可用面积：<strong>{previewAreaCm2} cm²</strong></p>
          ) : null}

          <label>备注<CompositionSafeInput value={form.note} onValueChange={(value) => setForm((current) => ({ ...current, note: value }))} placeholder="如：宜家购入，做裙子剩的" /></label>
          <div className="fabric-form-actions">
            <button type="button" className="primary home-create-submit" disabled={saving} onClick={submit}>{saving ? '保存中…' : '保存布料'}</button>
            {true ? <button type="button" className="danger" disabled={saving} onClick={() => remove(editing)}><Trash2 aria-hidden="true" />删除</button> : null}
          </div>
        </section>
      </div>
    </div>
  ) : null;

  useBodyScrollLock(Boolean(editing));
  useEffect(() => {
    if (!editing || typeof window === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) setEditing(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing, saving]);
  useEffect(() => { if (editing !== 'new' && !stockFabric) setOverlaySlot('inventory', formModal); });
  useEffect(() => () => setOverlaySlot('inventory', null), [setOverlaySlot]);

  return (
    <main className="warehouse-page fabric-page" aria-label="布料仓库">
      <header className="split-topbar wh-topbar">
        <button className="split-icon-btn" type="button" aria-label="返回我的" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <h1 className="split-topbar-title">布料仓库</h1>
        <button
          className="split-icon-btn"
          type="button"
          aria-label="查看布料出入库记录"
          onClick={() => {
            const next = !showTransactions;
            setShowTransactions(next);
            if (next) loadTransactions();
          }}
        >
          <History aria-hidden="true" />
        </button>
      </header>

      <section className="wh-list-intro">
        <div>
          <strong>我的布料仓库</strong>
          <span>拍照登记花色与余量，拼布算料与缺布替换直接联动</span>
        </div>
        <button className="wh-list-create-btn" type="button" onClick={() => withLogin((t) => { newFabricTokenRef.current = t; openEdit('new'); })}>
          <Plus aria-hidden="true" />
          新增布料
        </button>
      </section>

      <section className="fabric-stats-strip" aria-label="布料库存概览">
        <div className="fabric-stat-item">
          <span>仓库布料</span>
          <strong>{stats.totalCount} 块</strong>
        </div>
        <div className="fabric-stat-item">
          <span>可用总面积</span>
          <strong>{formatCm2(stats.totalAreaMm2)} cm²</strong>
        </div>
        <div className="fabric-stat-item">
          <span>偏低 / 用完</span>
          <strong>{stats.lowOrDepleted} 块</strong>
        </div>
      </section>

      <section className="fabric-filter-bar" aria-label="布料搜索与筛选">
        <label className="fabric-search-box">
          <Search aria-hidden="true" />
          <CompositionSafeInput
            type="search"
            aria-label="搜索布料名称、色系或分类"
            placeholder="搜索布料名称、花色、备注…"
            value={search}
            onValueChange={setSearch}
          />
        </label>
        <div className="fabric-filter-chips" role="tablist" aria-label="库存状态筛选">
          {FABRIC_STATUS_FILTERS.map((chip) => (
            <button
              key={chip}
              type="button"
              role="tab"
              aria-selected={statusFilter === chip}
              className={statusFilter === chip ? 'active' : ''}
              onClick={() => setStatusFilter(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      </section>

      {status ? <p className="app-status" role="status" aria-live="polite">{status}</p> : null}

      {showTransactions ? (
        <section className="fabric-transactions-card" aria-label="布料出入库记录">
          <div className="fabric-transactions-head">
            <strong>最近裁片扣减记录</strong>
            <button type="button" onClick={() => setShowTransactions(false)}>收起</button>
          </div>
          {transactions.length === 0 ? (
            <p className="fabric-transactions-empty">暂无裁片扣减记录。在拼布图纸「用料与配布」中确认裁剪后会记录在这里。</p>
          ) : (
            <ul className="fabric-transactions-list">
              {transactions.slice(0, 12).map((tx) => {
                const matched = fabrics.find((item) => item.id === tx.fabricId);
                return (
                  <li key={tx.id}>
                    <div>
                      <strong>{matched?.name || '已删除布料'}</strong>
                      <small>{tx.projectName || '拼布图纸'} · {tx.createdAt.slice(0, 16).replace('T', ' ')}</small>
                    </div>
                    <span className="fabric-tx-delta">-{formatCm2(tx.consumedAreaMm2)} cm²</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {loading ? <p className="fabric-empty">正在加载布料…</p> : fabrics.length === 0 && !editing ? (
        <section className="fabric-empty">
          <strong>布料仓库还是空的</strong>
          <span>点右上角「新增布料」，把囤的布登记进来：名称、分类、照片或主色、尺寸与余量。</span>
        </section>
      ) : filteredFabrics.length === 0 && !editing ? (
        <section className="fabric-empty">
          <strong>没有符合筛选条件的布料</strong>
          <span>试试切换筛选状态或清空搜索关键词。</span>
        </section>
      ) : (
        <section className="fabric-grid" aria-label="布料列表">
          {filteredFabrics.map((fabric) => {
            const badge = fabricBadgeInfo(fabric);
            return (
              <article className={`fabric-card is-${badge.tone}`} key={fabric.id}>
                <button className="fabric-card-main" type="button" onClick={() => openEdit(fabric)}>
                  <div className="fabric-card-visual">
                    {fabric.image ? <img src={fabric.image} alt="" /> : <span className="fabric-swatch" style={{ background: fabric.color || '#d9c8a9' }} />}
                    <span className={`fabric-stock-badge is-${badge.tone}`}>{badge.label}</span>
                  </div>
                  <div className="fabric-card-title-row">
                    <strong>{fabric.name}</strong>
                    {fabric.category ? <em className="fabric-cat-pill">{fabric.category}</em> : null}
                  </div>
                  <small>{fabricSpecLabel(fabric)}</small>
                  {fabric.note ? <small className="fabric-note">{fabric.note}</small> : null}
                </button>
                {fabricAvailableAreaMm2(fabric) === null && <button type="button" className="fabric-record-stock" onClick={() => setStockFabric(fabric)} aria-label={`录入库存 ${fabric.name}`}>录入库存</button>}
                <button className="fabric-card-edit" type="button" aria-label={`编辑 ${fabric.name}`} onClick={() => openEdit(fabric)}><Pencil aria-hidden="true" /></button>
              </article>
            );
          })}
        </section>
      )}
      {stockFabric && <FabricStockDialog key={stockFabric.id} fabric={stockFabric} onClose={() => setStockFabric(null)} onSave={async stock => {
        if (!token) throw new Error('请先登录后录入库存');
        const saved = await recordFabricStock(request, token, stockFabric, stock);
        if (!mountedRef.current || accountTokenRef.current !== token) return;
        setFabrics(list => list.map(item => item.id === saved.id ? saved : item));
      }} />}
      {editing === 'new' && <FabricCreateDialog onClose={() => setEditing(null)} onSave={async ({ payload }: FabricCreateResult) => {
        const t = newFabricTokenRef.current || token;
        if (!t) throw new Error('请先登录后保存到布料仓库');
        const { fabric } = await request<{ fabric: FabricItem }>('/fabrics', { method: 'POST', body: JSON.stringify(payload) }, t);
        if (!fabric?.id) throw new Error('未获取到仓库保存结果，请核实后重试');
        if (!mountedRef.current) return;
        setFabrics((list) => [fabric, ...list.filter((item) => item.id !== fabric.id)]);
        setEditing(null);
        setStatus('');
      }} />}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onPhoto(f); }} />
    </main>
  );
}
