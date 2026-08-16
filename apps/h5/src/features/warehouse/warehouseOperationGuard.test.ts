import { describe, expect, it } from 'vitest';
import { isWarehouseOperationCurrent } from './warehouseOperationGuard';

describe('isWarehouseOperationCurrent', () => {
  it('rejects a response after its route scope or session changes', () => {
    expect(isWarehouseOperationCurrent({ operation: 2, currentOperation: 2, scope: 'one', currentScope: 'two', token: 'a', currentToken: 'a' })).toBe(false);
    expect(isWarehouseOperationCurrent({ operation: 2, currentOperation: 2, scope: 'one', currentScope: 'one', token: 'a', currentToken: 'b' })).toBe(false);
    expect(isWarehouseOperationCurrent({ operation: 2, currentOperation: 2, scope: 'one', currentScope: 'one', token: 'a', currentToken: 'a' })).toBe(true);
  });
});
