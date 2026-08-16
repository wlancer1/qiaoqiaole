import { useLocation, useNavigate } from 'react-router-dom';
import { SplitRoutePages } from './SplitRoutePages';
import { useSplitFeature } from './SplitFeatureProvider';

/**
 * Route-facing split boundary.  The app only supplies the one deliberate
 * cross-feature command: importing the completed cells into the editor.
 */
export function SplitFeatureContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const screen = location.pathname === '/split/crop'
    ? 'split-crop'
    : location.pathname === '/split/preview'
      ? 'split-preview'
      : 'split';
  const workflow = useSplitFeature();
  return <SplitRoutePages screen={screen} workflow={{
    ...workflow,
    setScreen: (next: string) => navigate(next === 'home' ? '/' : next === 'split-crop' ? '/split/crop' : next === 'split-preview' ? '/split/preview' : '/split'),
    minSplitLongSide: 2, maxSplitLongSide: 120, alignCellSize: workflow.alignCellSize, moveGridControlFrame: workflow.moveGridControlFrame, updateAlignCellSize: workflow.updateAlignCellSize,
    onNext: () => { workflow.openPreview(); navigate('/split/crop'); },
    zoomSplitCropImage: (factor: number) => workflow.setSplitImageScale(Math.max(.6, Math.min(8, workflow.splitImageScale * factor))),
    resetSplitCropImage: () => workflow.setSplitImageScale(1),
    toggleSplitBackground: workflow.toggleBackground,
    updateSplitBackgroundSensitivity: workflow.updateBackgroundSensitivity,
    previewSplitSize: workflow.isSplitCropped ? { cols: workflow.splitCropBounds.right - workflow.splitCropBounds.left, rows: workflow.splitCropBounds.bottom - workflow.splitCropBounds.top } : { cols: workflow.activeSplitCols, rows: workflow.activeSplitRows },
    confirmSplitCrop: () => { workflow.confirmCrop(); navigate('/split/preview'); },
    returnToSplitCrop: () => { workflow.returnToCrop(); navigate('/split/crop'); },
  }} />;
}
