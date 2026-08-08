import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BeadingSessionPage } from './BeadingSessionPage';

describe('BeadingSessionPage', () => {
  it('renders reference-aligned controls and color progress', () => {
    const markup = renderToStaticMarkup(createElement(BeadingSessionPage, { session: { id: 's1', projectId: 'p1', projectName: '小熊', requirements: [{ colorCode: 'A14', required: 3 }], warehouseId: null, warehouseName: null, status: 'in_progress', completedColorCodes: [], progress: { completed: 0, total: 1, percent: 0 }, elapsedSeconds: 0, timerStartedAt: null, inventoryDeducted: false, version: 1 } as any, cells: [{ color: '#ff0000', transparent: false }] as any, rows: 1, cols: 1, getCode: () => 'A14', onPatch: vi.fn(), onPrepareCompletion: vi.fn(), onComplete: vi.fn(), onExit: vi.fn() }));
    expect(markup).toContain('开始拼豆');
    expect(markup).toContain('A14');
    expect(markup).toContain('完成当前色');
    expect(markup).toContain('aria-label="完成 0/1"');
  });
});
