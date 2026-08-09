import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BeadingSessionPage } from './BeadingSessionPage';

describe('BeadingSessionPage', () => {
  it('renders reference-aligned controls and color progress', () => {
    const markup = renderToStaticMarkup(createElement(BeadingSessionPage, { session: { id: 's1', projectId: 'p1', projectName: '小熊', requirements: [{ colorCode: 'A14', required: 3 }], warehouseId: null, warehouseName: null, status: 'in_progress', completedColorCodes: [], progress: { completed: 0, total: 1, percent: 0 }, elapsedSeconds: 0, timerStartedAt: null, inventoryDeducted: false, version: 1 } as any, cells: [{ color: '#ff0000', transparent: false }] as any, rows: 1, cols: 1, getCode: () => 'A14', onPatch: vi.fn(), onPrepareCompletion: vi.fn(), onComplete: vi.fn(), onExit: vi.fn() }));
    expect(markup).toContain('开始拼豆');
    expect(markup).toContain('A14');
    expect(markup).toContain('完成当前色');
    expect(markup).toContain('aria-label="完成 0/1"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="0"');
  });

  it('ships minimum styles for the split session control DOM', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    expect(styles).toMatch(/\.beading-toolbar-capsule\s*\{[^}]*min-height:\s*44px/s);
    expect(styles).toContain('.beading-toolbar-actions button.beading-toolbar-capsule');
    expect(styles).toMatch(/\.beading-progress-fill\s*\{[^}]*display:\s*block/s);
    expect(styles).toMatch(/\.beading-color-chip\s*\{[^}]*min-width:\s*64px;[^}]*min-height:\s*68px/s);
    expect(styles).toMatch(/\.beading-tool-panel-backdrop\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*90;[^}]*align-items:\s*flex-end/s);
    expect(styles).toContain('.beading-color-actions');
    expect(styles).toContain('.beading-color-complete-badge');
    expect(styles).toContain('.beading-search-results');
    expect(styles).toContain('.beading-more-actions');
  });
});
