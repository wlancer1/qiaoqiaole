import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BeadingSessionPage } from './BeadingSessionPage';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

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

  it('fits fixed toolbar controls inside a 320px viewport without hiding essential controls', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    expect(styles).toMatch(/@media \(max-width: 360px\)[\s\S]*?\.beading-toolbar\s*\{[^}]*padding:\s*env\(safe-area-inset-top\) 8px 0;[^}]*gap:\s*4px;/);
    expect(styles).toMatch(/@media \(max-width: 360px\)[\s\S]*?\.beading-toolbar-actions\s*\{[^}]*min-width:\s*0;[^}]*gap:\s*2px;/);
    expect(styles).toMatch(/@media \(max-width: 360px\)[\s\S]*?button\.beading-toolbar-capsule\s*\{[^}]*padding-inline:\s*6px;/);
    expect(styles).toMatch(/@media \(max-width: 360px\)[\s\S]*?\.beading-toolbar-label\s*\{[^}]*display:\s*none;/);
    expect(styles).toMatch(/@media \(max-width: 360px\)[\s\S]*?\.beading-timer\s*\{[^}]*min-width:\s*76px;/);

    const contentWidth = 320 - 2 * 8;
    const fixedControlWidth = 44 + 4 + 44 + 76 + 44 + 44 + 3 * 2;
    expect(fixedControlWidth).toBe(262);
    expect(fixedControlWidth).toBeLessThanOrEqual(contentWidth);
  });

  it('keeps active control text at WCAG AA contrast', () => {
    const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
    expect(styles).toMatch(/\.beading-color-revise\.is-active\s*\{[^}]*color:\s*#8a5700;/);
    expect(styles).toMatch(/\.beading-more-actions button\[aria-pressed="true"\]\s*\{[^}]*color:\s*#1859b8;/);
    expect(contrastRatio('#8a5700', '#f7f9fc')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#1859b8', '#eef5ff')).toBeGreaterThanOrEqual(4.5);
  });
});
