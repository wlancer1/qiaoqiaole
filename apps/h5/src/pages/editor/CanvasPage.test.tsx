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
  it('delegates saved-image background removal through the editor command seam', () => {
    const source = fs.readFileSync(path.resolve('apps/h5/src/app/H5Application.tsx'), 'utf8');
    expect(source).toContain('editorCommandsRef.current?.replaceCanvas');
    expect(source).toContain('removeGridEdgeBackground(snapshot.cells, snapshot.rows, snapshot.cols)');
    expect(source).toContain('sourceImagePresent={Boolean(splitCommandsRef.current?.getSourceImage())}');
    expect(source).not.toContain('commitCells((current) => removeGridEdgeBackground');
  });
});
