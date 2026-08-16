import { describe, expect, it } from 'vitest';
import { parseWarehouseRoute } from './warehouseRoute';

describe('parseWarehouseRoute', () => {
  it('only accepts a single encoded warehouse id segment', () => {
    expect(parseWarehouseRoute('/warehouses')).toEqual({ kind: 'list' });
    expect(parseWarehouseRoute('/warehouses/warehouse-1')).toEqual({ kind: 'detail', warehouseId: 'warehouse-1' });
    expect(parseWarehouseRoute('/warehouses/%E4%BB%93%E5%BA%93')).toEqual({ kind: 'detail', warehouseId: '仓库' });
    expect(parseWarehouseRoute('/warehouses/a/b')).toBeNull();
    expect(parseWarehouseRoute('/projects/a')).toBeNull();
  });
});
