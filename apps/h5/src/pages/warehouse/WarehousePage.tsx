import { ArrowLeft, Check, Minus, Package, PackageOpen, Plus, Search } from 'lucide-react';
type WarehousePageProps = Record<string, any>;

export function WarehousePage(props: WarehousePageProps) {
  const {
    status, onBack, activeWarehouse, stockedColorCount, totalWarehouseStock, missingColorCount,
    warehouseLetters, warehouseSearch, setWarehouseSearch, warehouseLetter, setWarehouseLetter, setSelectedWarehouseCodes,
    selectedWarehouseCodes,
    selectedWarehouseCount, selectVisibleWarehouseColors, invertVisibleWarehouseColors, warehouseColors, beadStock,
    toggleWarehouseCode,
    warehouseUnit, setWarehouseUnit, warehouseAmount, setWarehouseAmount, applyWarehouseChange, beadsPerGram,
  } = props;
return (
  <main className="warehouse-page" aria-label="豆子仓库">
    {status ? (
      <p className="app-status" role="status" aria-live="polite">{status}</p>
    ) : null}
    {/* Topbar */}
    <header className="split-topbar wh-topbar">
      <button className="split-icon-btn" aria-label="返回仓库列表" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
      </button>
      <h1 className="split-topbar-title">{activeWarehouse?.name ?? '豆子仓库'}</h1>
      <div className="wh-topbar-meta">
        <span>{stockedColorCount}</span>
        <small>种在库</small>
      </div>
    </header>

    {/* Stats strip */}
    <div className="wh-stats-strip">
      <div className="wh-stat-card">
        <strong>{totalWarehouseStock.toLocaleString()}</strong>
        <span>总库存颗</span>
      </div>
      <div className="wh-stat-card">
        <strong>{stockedColorCount}</strong>
        <span>有库存色</span>
      </div>
      <div className="wh-stat-card wh-stat-warn">
        <strong>{missingColorCount}</strong>
        <span>缺货色</span>
      </div>
    </div>

    {/* Search + letter tabs */}
      <div className="wh-filter-bar">
        <div className="wh-search-wrap">
          <Search className="wh-search-icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索仓库色号"
            placeholder="搜索色号…"
            value={warehouseSearch}
            onChange={(event) => setWarehouseSearch(event.target.value)}
          />
        </div>
      </div>

      {/* Letter tabs - horizontal scroll */}
      <div className="wh-letter-tabs" aria-label="色号字母筛选">
          {warehouseLetters.map((letter: string) => (
        <button
          key={letter}
          className={warehouseLetter === letter ? 'active' : ''}
          onClick={() => setWarehouseLetter(letter)}
        >
          {letter}
        </button>
      ))}
      </div>

      {/* Selection bar */}
      <div className="wh-select-bar">
        <span className="wh-select-info">
          已选 <em>{selectedWarehouseCount}</em> 色
        </span>
        <div className="wh-select-actions">
          <button onClick={selectVisibleWarehouseColors}><Check aria-hidden="true" />全选</button>
          <button onClick={invertVisibleWarehouseColors}>反选</button>
          <button onClick={() => setSelectedWarehouseCodes([])}>清除</button>
        </div>
      </div>

      {/* Color grid */}
      <div className="wh-grid-scroll" aria-label="仓库色卡">
        <div className="wh-color-grid">
            {warehouseColors.map((color: { code: string; hex: string }) => {
          const selected = selectedWarehouseCodes.includes(color.code);
          const stock = beadStock[color.code] ?? 0;
          return (
            <button
              key={color.code}
              className={`wh-color-card${selected ? ' selected' : ''}${stock === 0 ? ' empty' : ''}`}
              aria-label={`${color.code} 库存 ${stock} 颗`}
              onClick={() => toggleWarehouseCode(color.code)}
            >
              <span className="wh-swatch" style={{ background: color.hex }}>
                {selected && <i className="wh-check" aria-hidden="true">✓</i>}
              </span>
              <span className="wh-code">{color.code}</span>
              <span className="wh-stock">{stock > 0 ? `${stock}颗` : '—'}</span>
            </button>
          );
        })}
        </div>
      </div>

      {/* Bottom action card */}
      <div className="wh-action-card">
      <div className="wh-action-top">
        <span className="wh-action-desc">
          {selectedWarehouseCount > 0
            ? `已选 ${selectedWarehouseCount} 色`
            : '请先选择色号'}
        </span>
        <div className="wh-unit-toggle" role="group" aria-label="库存单位">
          <button className={warehouseUnit === 'count' ? 'active' : ''} onClick={() => setWarehouseUnit('count')}>按颗</button>
          <button className={warehouseUnit === 'gram' ? 'active' : ''} onClick={() => setWarehouseUnit('gram')}>按克</button>
        </div>
      </div>
      <div className="wh-action-row">
        <div className="wh-amount-field">
              <button className="wh-amount-step" aria-label="减少数量" onClick={() => setWarehouseAmount((v: string) => String(Math.max(1, Number(v) - 1)))}><Minus aria-hidden="true" /></button>
          <input
            type="number"
            min={1}
            aria-label="数量"
            value={warehouseAmount}
            onChange={(event) => setWarehouseAmount(event.target.value)}
          />
              <button className="wh-amount-step" aria-label="增加数量" onClick={() => setWarehouseAmount((v: string) => String(Number(v) + 1))}><Plus aria-hidden="true" /></button>
        </div>
        <button className="wh-out-btn" onClick={() => applyWarehouseChange('out')}><PackageOpen aria-hidden="true" />出库</button>
        <button className="wh-in-btn" onClick={() => applyWarehouseChange('in')}><Package aria-hidden="true" />入库</button>
      </div>
      {warehouseUnit === 'gram' && (
            <p className="wh-unit-hint">1g ≈ {beadsPerGram} 颗豆子</p>
      )}
      </div>
  </main>
);

}
