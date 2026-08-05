export type WarehouseView = 'list' | 'detail';

export function warehouseViewForScreen(screen: string): WarehouseView {
  return screen === 'warehouse-detail' ? 'detail' : 'list';
}
