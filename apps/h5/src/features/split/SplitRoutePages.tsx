import { SplitCropPage, SplitPreviewPage, SplitSettingsPage } from '../../pages/split/SplitPages';
import type { AppScreen } from '../../shared/h5Types';

/**
 * The split pages deliberately receive their view model here rather than from
 * the application shell.  The workflow itself remains local to the split
 * feature; this adapter is the only place that knows which controls belong to
 * each step.
 */
export function SplitRoutePages({ screen, workflow }: { screen: AppScreen; workflow: Record<string, any> }) {
  if (!workflow.uploadedSplitImage) return null;

  if (screen === 'split') {
    return <SplitSettingsPage
      splitMode={workflow.splitMode} setScreen={workflow.setScreen} setSplitMode={workflow.setSplitMode}
      uploadedSplitImage={workflow.uploadedSplitImage} splitImageScale={workflow.splitImageScale} splitImageOffset={workflow.splitImageOffset}
      handleSplitTouchStart={workflow.handleSplitTouchStart} handleSplitTouchMove={workflow.handleSplitTouchMove} handleSplitTouchEnd={workflow.handleSplitTouchEnd}
      handleSplitWheel={workflow.handleSplitWheel} handleSplitClick={workflow.handleSplitClick}
      handleSplitPointerDown={workflow.handleSplitPointerDown} handleSplitPointerMove={workflow.handleSplitPointerMove} handleSplitPointerEnd={workflow.handleSplitPointerEnd}
      activeSplitRows={workflow.activeSplitRows} activeSplitCols={workflow.activeSplitCols} alignedGrid={workflow.alignedGrid} gridFrameOrigin={workflow.gridFrameOrigin}
      handleGridHandlePointerDown={workflow.handleGridHandlePointerDown} handleGridHandlePointerMove={workflow.handleGridHandlePointerMove} handleGridHandlePointerEnd={workflow.handleGridHandlePointerEnd}
      updateSplitLongSide={workflow.updateSplitLongSide} splitLongSide={workflow.splitLongSide} minSplitLongSide={workflow.minSplitLongSide} maxSplitLongSide={workflow.maxSplitLongSide}
      alignCellSize={workflow.alignCellSize} moveGridControlFrame={workflow.moveGridControlFrame} updateAlignCellSize={workflow.updateAlignCellSize} onNext={workflow.onNext}
    />;
  }

  if (screen === 'split-crop') {
    return <SplitCropPage
      setScreen={workflow.setScreen} splitPreviewLoading={workflow.splitPreviewLoading} splitPreviewCells={workflow.splitPreviewCells}
      uploadedSplitImage={workflow.uploadedSplitImage} splitMode={workflow.splitMode} alignedGrid={workflow.flowAlignedGrid}
      splitImageScale={workflow.splitImageScale} onZoomStep={workflow.zoomSplitCropImage} onZoomChange={workflow.setSplitImageScale} onResetImageZoom={workflow.resetSplitCropImage}
      activeSplitCols={workflow.activeSplitCols} activeSplitRows={workflow.activeSplitRows} splitLoadingStage={workflow.splitLoadingStage} splitLoadingProgress={workflow.splitLoadingProgress}
      splitMergeThreshold={workflow.splitMergeThreshold} deferredSplitMergeThreshold={workflow.deferredSplitMergeThreshold}
      cropBounds={workflow.splitCropBounds} onCropBoundsChange={workflow.setSplitCropBounds} onConfirmCrop={workflow.confirmSplitCrop} onResetCrop={workflow.resetSplitCrop}
    />;
  }

  if (screen === 'split-preview') {
    return <SplitPreviewPage
      setScreen={workflow.setScreen} splitPreviewLoading={workflow.splitPreviewLoading} splitMergeThreshold={workflow.splitMergeThreshold}
      setSplitMergeThreshold={workflow.setSplitMergeThreshold} deferredSplitMergeThreshold={workflow.deferredSplitMergeThreshold}
      splitPreviewCells={workflow.splitPreviewCells} importSplitToCanvas={workflow.importSplitToCanvas}
      activeSplitCols={workflow.activeSplitCols} activeSplitRows={workflow.activeSplitRows} splitLoadingStage={workflow.splitLoadingStage} splitLoadingProgress={workflow.splitLoadingProgress}
      splitColorList={workflow.splitColorList} backgroundRemoved={Boolean(workflow.uploadedSplitImage.backgroundRemoved)} isBackgroundProcessing={workflow.isBackgroundProcessing}
      onToggleBackground={workflow.toggleSplitBackground} backgroundSensitivity={workflow.uploadedSplitImage.backgroundSensitivity}
      onBackgroundSensitivityChange={workflow.updateSplitBackgroundSensitivity} setSplitPreviewTab={workflow.setSplitPreviewTab} splitPreviewTab={workflow.splitPreviewTab}
      previewCols={workflow.previewSplitSize.cols} previewRows={workflow.previewSplitSize.rows} onBackToCrop={workflow.returnToSplitCrop}
    />;
  }
  return null;
}
