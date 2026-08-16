import { useEffect, useRef, useState } from 'react';
import type { InventoryCheck } from '../../beading/beadingSessionClient';

export function InventoryCheckSheet({ result, onClose, onStart, onWarehouseChange, warehouseId = '', warehouseOptions = [] }: {
  result: InventoryCheck;
  onClose: () => void;
  onStart: () => void;
  onWarehouseChange?: (warehouseId: string) => void | Promise<void>;
  warehouseId?: string;
  warehouseOptions?: Array<{ id: string; name: string }>;
}) {
  const changingRef = useRef(false);
  const [changing, setChanging] = useState(false);
  const close = () => { if (!changing) onClose(); };
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || changingRef.current) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  const changeWarehouse = async (warehouseId: string) => {
    if (!onWarehouseChange || changingRef.current) return;
    changingRef.current = true;
    setChanging(true);
    try { await onWarehouseChange(warehouseId); } catch { /* the feature publishes a scoped error */ } finally { changingRef.current = false; setChanging(false); }
  };
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <div className="beading-sheet-backdrop" role="presentation" onClick={close} onTouchStart={stop}>
      <section className="beading-sheet inventory-check-sheet" role="dialog" aria-modal="true" aria-label="库存检测" aria-busy={changing} onClick={stop} onTouchStart={stop}>
        <span className="beading-sheet-handle" aria-hidden="true" />
        <header className="beading-sheet-header"><div><p className="beading-eyebrow">开始拼豆前</p><h2>检测豆子库存</h2></div><button type="button" aria-label="关闭库存检测" disabled={changing} onClick={close}>×</button></header>
        {onWarehouseChange ? <label className="beading-warehouse-select">选择仓库<select disabled={changing} value={warehouseId} onChange={(event) => { void changeWarehouse(event.target.value); }}><option value="">不使用仓库</option>{(warehouseOptions || []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label> : null}
        <div className={`beading-stock-summary ${result.summary.sufficient ? 'is-sufficient' : 'is-missing'}`}>
          <strong>{result.summary.sufficient ? '库存充足，可以开始' : `有 ${result.summary.missing} 颗豆子不足`}</strong>
          <span>共需 {result.summary.required} 颗 · 当前 {result.summary.available} 颗</span>
        </div>
        <div className="beading-stock-list" aria-label="库存明细">
          {result.items.map((item) => <div className="beading-stock-row" key={item.colorCode}><span className="beading-color-code">{item.colorCode}</span><span>需要 {item.required} 颗</span><span className={item.sufficient ? 'stock-ok' : 'stock-missing'}>{item.sufficient ? `库存 ${item.available}` : `缺 ${item.missing} 颗`}</span></div>)}
        </div>
        <footer className="beading-sheet-actions"><button type="button" className="beading-secondary-btn" disabled={changing} onClick={close}>返回</button><button type="button" className="beading-primary-btn" disabled={changing} onClick={onStart}>仍然开始拼豆</button></footer>
      </section>
    </div>
  );
}
