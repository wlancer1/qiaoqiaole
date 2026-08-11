import { removeFlatBackground } from '@qiaoqiaole/core';

export type SplitImageCrop = { x: number; y: number; width: number; height: number };

export type SplitImageDerivation = {
  imageData: ImageData;
  url: string;
  crop: SplitImageCrop;
  backgroundRemoved: boolean;
};

export function cloneImageData(imageData: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

export function processSplitImageData(imageData: ImageData, removeBackground: boolean): ImageData {
  const source = cloneImageData(imageData);
  if (!removeBackground) return source;
  source.data.set(removeFlatBackground(source.data, source.width, source.height));
  return source;
}

export function deriveSplitImage(
  originalImageData: ImageData,
  backgroundRemoved: boolean,
  options: { toUrl: (imageData: ImageData) => string; getCrop: (imageData: ImageData) => SplitImageCrop },
): SplitImageDerivation {
  const imageData = processSplitImageData(originalImageData, backgroundRemoved);
  return {
    imageData,
    url: options.toUrl(imageData),
    crop: options.getCrop(imageData),
    backgroundRemoved,
  };
}
