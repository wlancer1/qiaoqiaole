import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useAppOverlay } from '../../app/overlays/AppOverlayContext';

export type FabricItem = {
  id: string;
  name: string;
  color: string | null;
  image: string | null;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number;
  note: string | null;
  updatedAt: string;
};

export function WarehouseSectionSwitch({ section, onChange }: { section: 'beads' | 'fabrics'; onChange: (section: 'beads' | 'fabrics') => void }) {
  return (
    <nav className="wh-section-switch" aria-label="仓库类型">
      <button type="button" className={section === 'beads' ? 'active' : ''} onClick={() => onChange('beads')}>拼豆仓库</button>
      <button type="button" className={section === 'fabrics' ? 'active' : ''} onClick={() => onChange('fabrics')}>布料仓库</button>
    </nav>
  );
}

type FabricRequest = <T>(path: string, init: RequestInit, token?: string) => Promise<T>;

const EMPTY_FORM = { name: '', color: '#d98a9e', widthMm: '', heightMm: '', quantity: '1', note: '', image: '' };

export function FabricWarehousePage({ token, onBack, onSwitchSection, request, withLogin }: {
  token: string | null;
  onBack: () => void;
  onSwitchSection: () => void;
  request: FabricRequest;
  withLogin: (work: (token: string) => void) => unknown;
}) {
  const { openConfirm } = useAppOverlay();
  const [fabrics, setFabrics] = useState<FabricItem[]>([]);
  const [loading, setLoading] = useState(Boolean(token));
  const [editing, setEditing] = useState<FabricItem | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!token) { setLoading(false); return; }
    void (async () => {
      try {
        const payload = await request<{ fabrics: FabricItem[] }>('/fabrics', {}, token);
        setFabrics(Array.isArray(payload.fabrics) ? payload.fabrics : []);
      } catch { setStatus('布料仓库读取失败，请稍后重试'); }
      finally { setLoading(false); }
    })();
  }, [request, token]);
  useEffect(load, [load]);

  const openEdit = (fabric: FabricItem | 'new') => {
    if (fabric === 'new') { setForm(EMPTY_FORM); setEditing('new'); return; }
    setForm({
      name: fabric.name,
      color: fabric.color || '#d98a9e',
      widthMm: fabric.widthMm ? String(fabric.widthMm) : '',
      heightMm: fabric.heightMm ? String(fabric.heightMm) : '',
      quantity: String(fabric.quantity || 1),
      note: fabric.note || '',
      image: fabric.image || '',
    });
    setEditing(fabric);
  };

  const submit = () => {
    const name = form.name.trim();
    if (!name) { setStatus('请输入布料名称'); return; }
    const body = {
      name,
      color: form.color || null,
      image: form.image || null,
      widthMm: Number(form.widthMm) > 0 ? Number(form.widthMm) : null,
      heightMm: Number(form.heightMm) > 0 ? Number(form.heightMm) : null,
      quantity: Number(form.quantity) > 0 ? Number(form.quantity) : 1,
      note: form.note.trim() || null,
    };
    withLogin((nextToken) => {
      void (async () => {
        try {
          if (editing === 'new') {
            const { fabric } = await request<{ fabric: FabricItem }>('/fabrics', { method: 'POST', body: JSON.stringify(body) }, nextToken);
            setFabrics((list) => [fabric, ...list]);
          } else if (editing) {
            const { fabric } = await request<{ fabric: FabricItem }>(`/fabrics/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: JSON.stringify(body) }, nextToken);
            setFabrics((list) => list.map((item) => (item.id === fabric.id ? fabric : item)));
          }
          setEditing(null);
          setStatus('');
        } catch (error) { setStatus(error instanceof Error ? error.message : '保存失败，请稍后重试'); }
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
              setFabrics((list) => list.filter((item) => item.id !== fabric.id));
              if (editing && editing !== 'new' && editing.id === fabric.id) setEditing(null);
            } catch (error) { setStatus(error instanceof Error ? error.message : '删除失败，请稍后重试'); }
          })();
        });
      },
    });
  };

  const onPhoto = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('图片读取失败')); img.src = url; });
      const scale = Math.min(1, 480 / Math.max(1, Math.max(img.naturalWidth, img.naturalHeight)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      setForm((current) => ({ ...current, image: canvas.toDataURL('image/jpeg', 0.82) }));
    } catch { setStatus('图片读取失败'); }
    finally { URL.revokeObjectURL(url); }
  };

  return (
    <main className="warehouse-page fabric-page" aria-label="布料仓库">
      <header className="split-topbar wh-topbar">
        <button className="split-icon-btn" aria-label="返回我的" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <h1 className="split-topbar-title">布料仓库</h1>
      </header>
      <WarehouseSectionSwitch section="fabrics" onChange={(next) => { if (next === 'beads') onSwitchSection(); }} />

      <section className="wh-list-intro">
        <div>
          <strong>我的布料</strong>
          <span>囤的布先放这里，拼布时从仓库取用</span>
        </div>
        <button className="wh-list-create-btn" type="button" onClick={() => withLogin(() => openEdit('new'))}>
          <Plus aria-hidden="true" />
          新增
        </button>
      </section>

      {status ? <p className="app-status" role="status" aria-live="polite">{status}</p> : null}

      {editing ? (
        <section className="fabric-form" aria-label={editing === 'new' ? '新增布料' : '编辑布料'}>
          <div className="fabric-form-preview">
            {form.image ? <img src={form.image} alt="" /> : <span className="fabric-swatch" style={{ background: form.color }} />}
            <button type="button" onClick={() => fileRef.current?.click()}><Upload aria-hidden="true" />上传照片</button>
            {form.image ? <button type="button" onClick={() => setForm((current) => ({ ...current, image: '' }))}>移除照片</button> : null}
          </div>
          <label>名称<input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="如：碎花棉布" /></label>
          <label>颜色<input type="color" value={form.color} onChange={(e) => setForm((current) => ({ ...current, color: e.target.value }))} /></label>
          <div className="fabric-form-row">
            <label>宽 (mm)<input type="number" min={0} value={form.widthMm} onChange={(e) => setForm((current) => ({ ...current, widthMm: e.target.value }))} placeholder="500" /></label>
            <label>高 (mm)<input type="number" min={0} value={form.heightMm} onChange={(e) => setForm((current) => ({ ...current, heightMm: e.target.value }))} placeholder="350" /></label>
            <label>数量<input type="number" min={0} step="0.5" value={form.quantity} onChange={(e) => setForm((current) => ({ ...current, quantity: e.target.value }))} /></label>
          </div>
          <label>备注<input value={form.note} onChange={(e) => setForm((current) => ({ ...current, note: e.target.value }))} placeholder="如：宜家购入，做裙子剩的" /></label>
          <div className="fabric-form-actions">
            <button type="button" className="primary" onClick={submit}>保存布料</button>
            <button type="button" onClick={() => setEditing(null)}>取消</button>
            {editing !== 'new' ? <button type="button" className="danger" onClick={() => remove(editing)}><Trash2 aria-hidden="true" />删除</button> : null}
          </div>
        </section>
      ) : null}

      {loading ? <p className="fabric-empty">正在加载布料…</p> : fabrics.length === 0 && !editing ? (
        <section className="fabric-empty">
          <strong>布料仓库还是空的</strong>
          <span>点右上角「新增」，把囤的布登记进来：名称、颜色或照片、尺寸和数量。</span>
        </section>
      ) : (
        <section className="fabric-grid" aria-label="布料列表">
          {fabrics.map((fabric) => (
            <article className="fabric-card" key={fabric.id}>
              <button className="fabric-card-main" type="button" onClick={() => openEdit(fabric)}>
                {fabric.image ? <img src={fabric.image} alt="" /> : <span className="fabric-swatch" style={{ background: fabric.color || '#d9c8a9' }} />}
                <strong>{fabric.name}</strong>
                <small>{fabric.widthMm && fabric.heightMm ? `${fabric.widthMm}×${fabric.heightMm} mm · ` : ''}库存 {fabric.quantity}</small>
                {fabric.note ? <small className="fabric-note">{fabric.note}</small> : null}
              </button>
              <button className="fabric-card-edit" type="button" aria-label={`编辑 ${fabric.name}`} onClick={() => openEdit(fabric)}><Pencil aria-hidden="true" /></button>
            </article>
          ))}
        </section>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onPhoto(f); }} />
    </main>
  );
}
