import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SplitCropPage, SplitPreviewPage } from './SplitPages';

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

describe('SplitPreviewPage', () => {
  it('disables importing while background processing is pending', () => {
    const markup = renderToStaticMarkup(createElement(SplitPreviewPage, {
      setScreen: vi.fn(),
      splitPreviewLoading: false,
      splitMergeThreshold: 0,
      deferredSplitMergeThreshold: 0,
      splitPreviewCells: [{ x: 0, y: 0, color: '#ff0000', transparent: false }],
      importSplitToCanvas: vi.fn(),
      activeSplitCols: 1,
      activeSplitRows: 1,
      splitLoadingStage: '',
      splitLoadingProgress: 100,
      splitColorList: [],
      setSplitPreviewTab: vi.fn(),
      splitPreviewTab: 'settings',
      backgroundRemoved: false,
      isBackgroundProcessing: true,
      onToggleBackground: vi.fn(),
      backgroundSensitivity: 30,
      onBackgroundSensitivityChange: vi.fn(),
      previewCols: 1,
      previewRows: 1,
      onBackToCrop: vi.fn(),
    }));

    expect(markup).toContain('<button class="split-action-btn split-action-btn--primary" type="button" disabled="">导入画布</button>');
    expect(markup).not.toContain('aria-label="去背景灵敏度"');
  });

  it('shows the background sensitivity range and readout after background removal is enabled', () => {
    const markup = renderToStaticMarkup(createElement(SplitPreviewPage, {
      setScreen: vi.fn(),
      splitPreviewLoading: false,
      splitMergeThreshold: 0,
      setSplitMergeThreshold: vi.fn(),
      deferredSplitMergeThreshold: 0,
      splitPreviewCells: [
        { x: 0, y: 0, color: '#ff0000', transparent: false },
        { x: 1, y: 0, color: '#000000', transparent: true },
      ],
      importSplitToCanvas: vi.fn(),
      activeSplitCols: 1,
      activeSplitRows: 1,
      splitLoadingStage: '',
      splitLoadingProgress: 100,
      splitColorList: [],
      setSplitPreviewTab: vi.fn(),
      splitPreviewTab: 'settings',
      backgroundRemoved: true,
      isBackgroundProcessing: false,
      onToggleBackground: vi.fn(),
      backgroundSensitivity: 72,
      onBackgroundSensitivityChange: vi.fn(),
      previewCols: 1,
      previewRows: 1,
      onBackToCrop: vi.fn(),
    }));

    expect(markup).toContain('aria-label="去背景灵敏度"');
    expect(markup).toContain('min="0" max="100" step="1" value="72"');
    expect(markup).toContain('>72<');
    expect(markup).toContain('data-background-removed="true"');
    expect(markup).toContain('class="split-background-preview-status"');
    expect(markup).toContain('class="split-preview-cell transparent"');
  });
});
