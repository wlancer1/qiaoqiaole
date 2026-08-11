import {
  centeredAlignmentOffset,
  centeredGridControlOrigin,
  initialAlignCellSize,
} from '../../canvas/H5CanvasPreview';
import { clampCropBounds, type CropBounds } from '../../utils/splitCrop';
import { defaultSplitLongSideFromBounds, gridSizeFromSplitBounds } from '../../utils/splitConfig';
import type { SplitImageCrop } from './splitImageProcessing';

export type DefaultSplitGeometry = {
  longSide: number;
  rows: number;
  cols: number;
  alignCellSize: number;
  alignOffset: { x: number; y: number };
  gridFrameOrigin: { x: number; y: number };
};

export function defaultSplitGeometryFromCrop(crop: SplitImageCrop): DefaultSplitGeometry {
  const longSide = defaultSplitLongSideFromBounds(crop.width, crop.height);
  const { rows, cols } = gridSizeFromSplitBounds(crop.width, crop.height, longSide);
  const alignCellSize = initialAlignCellSize(crop, cols, rows);
  const alignOffset = centeredAlignmentOffset(crop, alignCellSize);
  return {
    longSide,
    rows,
    cols,
    alignCellSize,
    alignOffset,
    gridFrameOrigin: centeredGridControlOrigin(crop, alignCellSize, alignOffset),
  };
}

export function scaleCropBoundsToGrid(
  bounds: CropBounds,
  from: { cols: number; rows: number },
  to: { cols: number; rows: number },
): CropBounds {
  const fromCols = Math.max(1, from.cols);
  const fromRows = Math.max(1, from.rows);
  return clampCropBounds({
    left: Math.floor((bounds.left / fromCols) * to.cols),
    right: Math.ceil((bounds.right / fromCols) * to.cols),
    top: Math.floor((bounds.top / fromRows) * to.rows),
    bottom: Math.ceil((bounds.bottom / fromRows) * to.rows),
  }, to.cols, to.rows);
}
