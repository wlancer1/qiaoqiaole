import { ArrowLeft, ChevronRight, Layers3, Plus, Trash2 } from 'lucide-react';
import type { Warehouse } from '../../shared/h5Types';

type WarehouseListPageProps = Record<string, any>;

export function WarehouseListPage(props: WarehouseListPageProps) {
  const {
    status, setActiveTab, setScreen, warehouses, activeWarehouseId, openWarehouseDetail,
    showWarehouseCreateModal, setShowWarehouseCreateModal, warehouseName, setWarehouseName,
    warehouseRemark, setWarehouseRemark, createWarehouse, deleteWarehouse,
    requestConfirm, confirmDialog,
  } = props;

  return (
    <main className="warehouse-page warehouse-list-page" aria-label="豆子仓库列表">
      {status ? <p className="app-status" role="status" aria-live="polite">{status}</p> : null}
      <header className="split-topbar wh-topbar">
        <button className="split-icon-btn" aria-label="返回我的" onClick={() => { setActiveTab('profile'); setScreen('home'); }}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <h1 className="split-topbar-title">豆子仓库</h1>
      </header>

      <section className="wh-list-intro">
        <div>
          <strong>我的仓库</strong>
          <span>选择一个仓库管理拼豆库存</span>
        </div>
        {warehouses.length > 0 ? (
          <button className="wh-list-create-btn" type="button" onClick={() => setShowWarehouseCreateModal(true)}>
            <Plus aria-hidden="true" />
            新建
          </button>
        ) : null}
      </section>

      {warehouses.length > 0 ? (
        <section className="wh-list-cards" aria-label="仓库列表">
          {warehouses.map((warehouse: Warehouse) => (
            <article className={`wh-list-card${warehouse.id === activeWarehouseId ? ' active' : ''}`} key={warehouse.id}>
              <button className="wh-list-card-main" type="button" onClick={() => openWarehouseDetail(warehouse.id)}>
                <span className="wh-list-card-icon"><Layers3 aria-hidden="true" /></span>
                <span className="wh-list-card-copy">
                  <strong>{warehouse.name}</strong>
                  <small>{warehouse.remark || 'MARD 221 色库存'}</small>
                  <span className="wh-list-card-meta">
                    <em>{warehouse.stockedColorCount ?? 0} 色在库</em>
                    <em>{(warehouse.totalWarehouseStock ?? 0).toLocaleString()} 颗</em>
                  </span>
                </span>
                <ChevronRight className="wh-list-card-arrow" aria-hidden="true" />
              </button>
              <button
                className="wh-list-card-delete"
                type="button"
                aria-label={`删除${warehouse.name}`}
                onClick={() => requestConfirm({
                  title: '删除仓库？',
                  message: `确定删除“${warehouse.name}”吗？仓库里的库存和记录也会被删除。`,
                  confirmText: '删除仓库',
                  danger: true,
                  onConfirm: () => deleteWarehouse(warehouse.id),
                })}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </article>
          ))}
        </section>
      ) : (
        <section className="wh-empty-warehouse wh-list-empty">
          <div className="wh-empty-warehouse-art" aria-hidden="true"><Layers3 /></div>
          <div className="wh-empty-warehouse-copy">
            <strong>还没有豆子仓库</strong>
            <span>先创建一个仓库，之后就可以按色号<br />管理库存和出入库记录。</span>
            <button type="button" onClick={() => setShowWarehouseCreateModal(true)}>
              <Plus aria-hidden="true" />新建豆子仓库
            </button>
          </div>
        </section>
      )}

      {confirmDialog}
      {showWarehouseCreateModal ? (
        <div className="home-create-modal" role="dialog" aria-label="新建豆子仓库">
          <div className="home-create-panel">
            <div className="home-create-head">
              <strong>新建豆子仓库</strong>
              <button aria-label="关闭新建仓库" onClick={() => setShowWarehouseCreateModal(false)}>关闭</button>
            </div>
            <div className="login-form">
              <label>
                <span>仓库名称</span>
                <input type="text" aria-label="仓库名称" placeholder="例如 MARD 常用色仓库" value={warehouseName} onChange={(event) => setWarehouseName(event.target.value)} />
              </label>
              <label>
                <span>备注</span>
                <input type="text" aria-label="仓库备注" placeholder="可选" value={warehouseRemark} onChange={(event) => setWarehouseRemark(event.target.value)} />
              </label>
            </div>
            <button className="home-create-submit" onClick={() => void createWarehouse()}>创建仓库</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
