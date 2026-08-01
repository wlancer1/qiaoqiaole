# H5 Viewport Canvas Redraw Design

## Goal

Keep the H5 editor's color, code, and grid rendering sharp at every supported zoom level, including 108×108 drawings, without allocating artboard-sized high-resolution backing stores.

## Root Cause

The current canvases have the untransformed artboard's CSS size and live inside the element scaled by `react-zoom-pan-pinch`. A 108-column drawing on a phone starts at roughly 2.7 CSS pixels per cell. At 12× zoom on a DPR-3 phone, sharp output requests roughly 36 backing pixels per logical CSS pixel. The aggregate memory budget caps the current canvases far below that density, so Safari enlarges a lower-resolution bitmap. Nearest-neighbor presentation removes interpolation blur but cannot add glyph or line detail.

The supplied reference instead uses three viewport-sized canvases whose CSS dimensions match the phone viewport and whose backing dimensions match viewport × DPR. Zoom changes drawing coordinates, not Canvas element scale. The visible cells, labels, and lines are redrawn directly at their final screen size.

## Architecture

Retain `TransformWrapper` as the gesture/camera authority. Its `TransformComponent` contains a transparent artboard interaction surface and the existing DOM rulers. It no longer contains the three visual canvases.

Place one viewport-sized three-layer Canvas stack directly inside the transform wrapper but outside the transformed component:

1. Color layer.
2. Code layer.
3. Grid layer.

The visual layers have no pointer events. A transparent artboard interaction `<div>` inside `TransformComponent` receives the existing brush, eraser, fill, eyedropper, pointer-capture, and click handlers. Pointer-to-cell normalization continues to use that transformed artboard's bounding rectangle.

The Canvas stack observes transform changes through `useTransformEffect`. On every animation frame that contains a camera update, it measures:

- the viewport stack rectangle;
- the transformed artboard rectangle;
- the artboard rectangle relative to the viewport stack.

It then redraws the visible portion of all three layers in viewport coordinates. Canvas elements themselves are never CSS-scaled by the camera.

## Viewport Rendering

Each backing store is `viewport CSS size × devicePixelRatio`, subject only to the existing aggregate safety cap for unusually large browser viewports. Zoom is not included in backing-store density.

The renderer receives:

```ts
type ViewportArtboard = {
  left: number;
  top: number;
  width: number;
  height: number;
};
```

Displayed cell dimensions are:

```text
cellWidth  = artboard.width / cols
cellHeight = artboard.height / rows
```

Visible row and column ranges are derived by intersecting the artboard with the viewport. Drawing loops visit only those cells. Boundaries are aligned to backing pixels through the viewport DPR render scale and shared by the color, code, and grid passes.

The color layer draws the checkerboard and opaque cell colors for visible cells. The code layer draws visible, non-transparent codes using font sizes derived from displayed cell dimensions, with `maxWidth` constrained to 90% of the displayed cell width. The grid layer draws displayed 0.75 CSS-pixel lines directly in viewport space. No line-width division by camera zoom is required.

## Redraw and Allocation Policy

Camera pan/zoom changes schedule a single `requestAnimationFrame` and redraw visible content without changing Canvas `width` or `height`.

Backing stores are reconfigured only when viewport logical size or device pixel ratio changes. Cell/content changes redraw color and code. Code visibility or font readiness redraws code. Row/column changes redraw all layers.

The previous 120ms raster-density settlement is removed because zoom no longer affects backing density. This prevents both temporary blur during zoom and delayed sharpness after zoom.

## Layering and Interaction

The viewport Canvas stack sits visually above the checkerboard stage background and below the transformed transparent interaction surface, rulers, zoom controls, tool rail, reference window, and status UI.

The three visual canvases are `aria-hidden` and `pointer-events: none`. The transparent interaction surface carries the existing accessible artwork label and `canvas-artwork` exclusion class used by `react-zoom-pan-pinch`.

The artboard DOM background becomes transparent so it cannot duplicate the color layer. Its shadow and rulers remain visible.

## Testing

Pure renderer tests cover:

- visible row/column range calculation;
- shared viewport boundary alignment;
- culling of offscreen cells;
- displayed-size code centers, font sizing, and maximum width;
- constant displayed grid line width;
- artboards partially and completely outside the viewport.

Component/invalidation tests cover:

- transform changes redraw without reconfiguring backing stores;
- viewport size/DPR changes configure and redraw all layers;
- cell, code visibility, font, and dimension invalidation boundaries;
- pending animation-frame cleanup.

Playwright coverage verifies:

- all three Canvas CSS sizes equal the editor viewport rather than the artboard;
- backing sizes equal viewport × DPR within the safety budget;
- after zooming a 108×108 drawing, the visible cell width and label ink are generated at screen-space resolution;
- pan, brush, eraser, fill, pinch cancellation, rulers, palette, import, and export continue working;
- Canvas backing dimensions remain stable while zoom changes.

## Success Criteria

- A 108×108 drawing remains sharp at maximum zoom on an iPhone-class DPR-3 viewport.
- Zoom and pan redraw visible cells directly in viewport coordinates.
- Canvas backing dimensions do not grow with camera zoom.
- Only three visual Canvas elements are used.
- Existing editor tools and gestures remain functional.
- Focused renderer/component tests, H5 build, and Canvas Playwright scenarios pass.
