# Fast Background Removal Design

## Goal

Replace the split-flow flat-background remover with a local, configurable background-removal algorithm and expose a 0–100 sensitivity control in the H5 split preview.

## Architecture

`packages/core` owns the pure image algorithm. It samples opaque pixels from all four edges at an interval that yields roughly 20–40 samples per side, without sampling corners twice. It quantizes those samples into up to three weighted background colour clusters, then applies multi-source edge flood fill. A pixel is accepted only when it remains close to the background model, or is both reasonably close to the model and close to its connected background parent. The middle 60% of the image has a lower global acceptance threshold to reduce accidental deletion of central subjects. When no cluster has sufficient edge-sample support, the algorithm tightens its threshold rather than guessing, favouring under-removal over subject loss.

Flood fill produces a connected background mask (255 background, 0 subject). A one-pixel local feather softens only the connected boundary, and near-background semi-transparent edge pixels have their alpha reduced to reduce halo. The returned image always uses a cloned buffer.

For sources exceeding a 256px longest side, the algorithm runs analysis and flood fill at the downscaled working size, upscales the resulting mask with bilinear interpolation to the current processing image, then applies the 1px feather and halo reduction at output resolution. Sources at or below that size use one resolution throughout. This keeps mobile computation bounded while preserving full-resolution output edges.

`splitImageProcessing` is the H5 adapter: it retains an immutable image at the current pipeline point after crop and any basic adjustments, produces either that unchanged processed clone or the core algorithm result, and can accept a prepared cache. `H5App` owns enabled/sensitivity state and coalesces slider updates with `requestAnimationFrame`; it uses the existing split-preview job sequence to discard stale work. The slider remains operable during updates; only stale pending work is replaced. `SplitPreviewPage` renders the accessible slider only while removal is enabled.

## Data Flow

`originalImageData` → existing crop/preview derivation → basic split processing → fast background removal → split sampling/colour mapping/merge → preview cells.

The original decoded image is retained. The removal source cache represents the image at the current pipeline point; turning removal off derives the corresponding unremoved version from that cache and then continues the existing downstream flow. Sensitivity changes reuse one prepared background model rather than decoding again. Any crop, resize, or basic-colour adjustment that changes removal-input pixels invalidates and rebuilds the prepared model; the H5 caller owns this invalidation lifecycle.

## Public Core API

```ts
export interface RemoveBackgroundOptions {
  sensitivity: number;
  feather?: number;
  protectCenter?: boolean;
}

export interface RemoveBackgroundResult {
  imageData: ImageData;
  mask: Uint8Array;
}

export interface BackgroundRemovalCache {
  /* source dimensions, source identity/version, analysis dimensions, and background clusters */
}

export function prepareBackgroundRemoval(imageData: ImageData): BackgroundRemovalCache;
export function removeBackground(
  imageData: ImageData,
  options: RemoveBackgroundOptions,
  cache?: BackgroundRemovalCache,
): RemoveBackgroundResult;
```

The cache is valid only for the exact source width, height, and pixel-data version used to create it; callers invalidate it whenever their prior processing stage changes source pixels. Analysis is constrained to a longest side of 256px; its mask is bilinearly upsampled before full-resolution feathering and output alpha application.

## Error Handling and Accessibility

Invalid/tiny image buffers safely return cloned data and a zero mask. Existing transparency remains transparent and is excluded from the background model. The range control has the explicit Chinese accessible name “去背景灵敏度”, min 0, max 100, step 1, and an output readout. Processing disables repeat actions; stale asynchronous work is rejected using the established job ID.

## Tests

Core tests cover white and gradual backgrounds, enclosed background-colour details, a subject touching an edge, sensitivity monotonicity, transparent/tiny input, source immutability, and a non-flaky 256px performance guard. H5 processing tests cover restore-from-cache behavior. Preview markup tests assert default-off rendering, conditional sensitivity UI, control metadata, and disabled processing action.
