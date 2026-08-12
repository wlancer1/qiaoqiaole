import { removeBackground, type BackgroundRemovalCache } from '@qiaoqiaole/core';

export type SplitImageCrop = { x: number; y: number; width: number; height: number };

export type SplitImageDerivation = {
  imageData: ImageData;
  url: string;
  crop: SplitImageCrop;
  backgroundRemoved: boolean;
};

export type SplitBackgroundProcessingOptions = {
  sensitivity?: number;
  backgroundCache?: BackgroundRemovalCache;
};

export const DEFAULT_BACKGROUND_SENSITIVITY = 0;

export function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

export function processSplitImageData(
  imageData: ImageData,
  shouldRemoveBackground: boolean,
  options: SplitBackgroundProcessingOptions = {},
): ImageData {
  if (!shouldRemoveBackground) return cloneImageData(imageData);
  return removeBackground(imageData, {
    sensitivity: options.sensitivity ?? DEFAULT_BACKGROUND_SENSITIVITY,
  }, options.backgroundCache).imageData;
}

export function deriveSplitImage(
  originalImageData: ImageData,
  backgroundRemoved: boolean,
  options: { toUrl: (imageData: ImageData) => string; getCrop: (imageData: ImageData) => SplitImageCrop },
  backgroundOptions: SplitBackgroundProcessingOptions = {},
): SplitImageDerivation {
  const imageData = processSplitImageData(originalImageData, backgroundRemoved, backgroundOptions);
  return {
    imageData,
    url: options.toUrl(imageData),
    crop: options.getCrop(imageData),
    backgroundRemoved,
  };
}
