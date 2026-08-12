import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CanvasBackgroundTool } from './CanvasPage';

describe('CanvasBackgroundTool', () => {
  it('offers background removal and calls the workbench handler', () => {
    const onToggle = vi.fn();
    const markup = renderToStaticMarkup(createElement(CanvasBackgroundTool, {
      isProcessing: false,
      onToggle,
    }));

    expect(markup).toContain('aria-label="去除背景"');
    expect(markup).toContain('class="rail-tool"');
  });

  it('only reports processing while the operation is running', () => {
    const markup = renderToStaticMarkup(createElement(CanvasBackgroundTool, {
      isProcessing: true,
      onToggle: vi.fn(),
    }));

    expect(markup).toContain('aria-label="背景处理中"');
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain('恢复原图');
    expect(markup).not.toContain('aria-pressed');
  });
});

describe('saved image editing integration', () => {
  it('uses the grid background operation without restoring the saved source image', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');
    expect(source).toContain('removeGridEdgeBackground(current, rows, cols)');
    expect(source).toContain('commitCells((current) => removeGridEdgeBackground(current, rows, cols))');
    expect(source).not.toContain('setHistory([]);\n      setFuture([]);');
    expect(source).toContain('canRemoveGridBackground={Boolean(uploadedSplitImage || activeSavedProject?.sourceImage)}');
  });
});
