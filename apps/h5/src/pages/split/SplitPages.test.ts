import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SplitCropPage } from './SplitPages';

describe('SplitCropPage', () => {
  it('renders the entire crop workspace as one canvas without DOM image or handle layers', () => {
    const markup = renderToStaticMarkup(createElement(SplitCropPage, {
      setScreen: vi.fn(),
      splitPreviewLoading: false,
      splitPreviewCells: [
        { x: 0, y: 0, color: '#ff0000' },
        { x: 1, y: 0, color: '#00ff00' },
        { x: 0, y: 1, color: '#0000ff' },
        { x: 1, y: 1, color: '#ffffff' },
      ],
      uploadedSplitImage: {
        imageData: { width: 49, height: 64, data: new Uint8ClampedArray(49 * 64 * 4) },
        crop: { x: 0, y: 0, width: 49, height: 64 },
        url: 'data:image/png;base64,source-image',
      },
      splitMode: 'quick',
      alignedGrid: undefined,
      splitImageScale: 1,
      onZoomStep: vi.fn(),
      onZoomChange: vi.fn(),
      onResetImageZoom: vi.fn(),
      activeSplitCols: 49,
      activeSplitRows: 64,
      splitLoadingStage: '',
      splitLoadingProgress: 100,
      splitMergeThreshold: 0,
      deferredSplitMergeThreshold: 0,
      cropBounds: { top: 0, right: 49, bottom: 64, left: 0 },
      onCropBoundsChange: vi.fn(),
      onConfirmCrop: vi.fn(),
      onResetCrop: vi.fn(),
    }));

    expect((markup.match(/<canvas/g) ?? [])).toHaveLength(1);
    expect(markup).toContain('class="split-crop-editor-canvas"');
    expect(markup).toContain('aria-label="单画布裁剪编辑器 49列 × 64行"');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('split-crop-grid-overlay');
    expect(markup).not.toContain('data-crop-handle');
  });
});
