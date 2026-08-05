import { describe, expect, test } from 'vitest';
import { warehouseViewForScreen } from './warehouseView';

describe('warehouse navigation', () => {
  test('opens the warehouse screen as a list and only shows inventory controls in detail', () => {
    expect(warehouseViewForScreen('warehouse')).toBe('list');
    expect(warehouseViewForScreen('warehouse-detail')).toBe('detail');
  });
});
