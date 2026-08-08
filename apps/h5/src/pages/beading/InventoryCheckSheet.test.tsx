import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InventoryCheckSheet } from './InventoryCheckSheet';

const result = { projectRevision: 1, warehouseId: 'w1', items: [{ colorCode: 'A14', required: 5, available: 3, missing: 2, sufficient: false }], summary: { required: 5, available: 3, missing: 2, sufficient: false } };
describe('InventoryCheckSheet', () => {
  it('shows missing text and still-start action', () => {
    const markup = renderToStaticMarkup(createElement(InventoryCheckSheet, { result, onClose: vi.fn(), onStart: vi.fn() }));
    expect(markup).toContain('缺 2 颗');
    expect(markup).toContain('仍然开始拼豆');
  });
});
