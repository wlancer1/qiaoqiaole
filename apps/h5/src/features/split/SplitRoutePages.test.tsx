import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SplitRoutePages } from './SplitRoutePages';

const image = {
  imageData: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
  crop: { x: 0, y: 0, width: 1, height: 1 },
  url: 'data:image/png;base64,image',
};

const workflow = {
  splitMode: 'quick', setScreen: vi.fn(), setSplitMode: vi.fn(), uploadedSplitImage: image,
  splitImageScale: 1, splitImageOffset: { x: 0, y: 0 },
  handleSplitTouchStart: vi.fn(), handleSplitTouchMove: vi.fn(), handleSplitTouchEnd: vi.fn(),
  handleSplitWheel: vi.fn(), handleSplitClick: vi.fn(), handleSplitPointerDown: vi.fn(), handleSplitPointerMove: vi.fn(), handleSplitPointerEnd: vi.fn(),
  activeSplitRows: 1, activeSplitCols: 1, alignedGrid: { rows: 1, cols: 1, cellSize: 1, offsetX: 0, offsetY: 0, cropWidth: 1, cropHeight: 1 },
  gridFrameOrigin: { x: 0, y: 0 }, handleGridHandlePointerDown: vi.fn(), handleGridHandlePointerMove: vi.fn(), handleGridHandlePointerEnd: vi.fn(),
  updateSplitLongSide: vi.fn(), splitLongSide: 1, minSplitLongSide: 1, maxSplitLongSide: 120, alignCellSize: 1,
  moveGridControlFrame: vi.fn(), updateAlignCellSize: vi.fn(), onNext: vi.fn(), splitPreviewLoading: false, splitPreviewCells: [],
  flowAlignedGrid: { rows: 1, cols: 1, cellSize: 1, offsetX: 0, offsetY: 0, cropWidth: 1, cropHeight: 1 }, splitLoadingStage: '', splitLoadingProgress: 100,
  splitMergeThreshold: 0, deferredSplitMergeThreshold: 0, splitCropBounds: { top: 0, right: 1, bottom: 1, left: 0 },
  setSplitCropBounds: vi.fn(), confirmSplitCrop: vi.fn(), resetSplitCrop: vi.fn(), zoomSplitCropImage: vi.fn(), setSplitImageScale: vi.fn(), resetSplitCropImage: vi.fn(),
  setSplitMergeThreshold: vi.fn(), importSplitToCanvas: vi.fn(), splitColorList: [], isBackgroundProcessing: false,
  toggleSplitBackground: vi.fn(), updateSplitBackgroundSensitivity: vi.fn(), setSplitPreviewTab: vi.fn(), splitPreviewTab: 'settings', previewSplitSize: { cols: 1, rows: 1 }, returnToSplitCrop: vi.fn(),
};

describe('SplitRoutePages', () => {
  it('chooses the route-local preview page without making H5App assemble its prop bundle', () => {
    const markup = renderToStaticMarkup(createElement(SplitRoutePages, { screen: 'split-preview', workflow }));
    expect(markup).toContain('aria-label="分割浏览预览"');
  });
});
