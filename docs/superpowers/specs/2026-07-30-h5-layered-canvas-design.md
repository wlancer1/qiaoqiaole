# H5 Layered Canvas Design

## Goal

Replace the H5 editor's SVG artwork, SVG code labels, and SVG grid path with three stacked, high-DPI Canvas layers while preserving the existing editor behavior, layout, gestures, rulers, and data model.

## Scope

The canvas artboard will contain three same-sized transparent canvases:

1. A color layer that draws transparent checkerboard cells and filled bead colors.
2. A code layer that draws bead color codes when the existing zoom threshold is met.
3. A grid layer that draws the border and cell lines and receives pointer input.

The existing `react-zoom-pan-pinch` wrapper remains responsible for panning, wheel zoom, pinch zoom, centering, and zoom controls. The existing React `cells`, history, future, tools, palette, fill, eyedropper, erase, resize, import, reference image, export, and ruler logic remain authoritative.

The migration does not introduce a custom camera, Web Worker, OffscreenCanvas, partial dirty-rectangle rendering, or a new cell storage format. Those are separate optimizations and are not required to complete this rendering change.

## Architecture

Create a focused canvas renderer module next to `H5App.tsx`. It will expose pure drawing and sizing functions so rendering behavior can be unit tested without mounting the full application.

The React canvas stack component owns three refs and uses layout effects to:

- measure the untransformed CSS artboard size from `ResizeObserverEntry.contentRect` (falling back to `clientWidth` and `clientHeight`), never from `getBoundingClientRect()`;
- size each backing store using a raster-budgeted render scale derived from `devicePixelRatio` and the current transform scale;
- apply the corresponding drawing transform;
- redraw the color layer when cells or dimensions change;
- redraw the code layer when cells, dimensions, visibility, or scale change;
- redraw the grid layer when dimensions, size, or scale change;
- redraw after fonts finish loading and after artboard resize.

All canvases fill the existing `.h5-artboard`. The first two layers ignore pointer input. The grid layer is last in DOM order, carries `canvas-artwork`, and receives the current brush and click handlers.

## Drawing Rules

The renderer uses untransformed artboard CSS pixels as its logical coordinate space. Each cell occupies `width / cols` by `height / rows` logical pixels. Cell geometry and font sizes are always expressed in these logical pixels. Zoom changes backing-store density and the parent CSS transform, but it is never multiplied into logical geometry.

The requested render scale is `devicePixelRatio * zoom`. It is capped before allocating a backing store so that no layer exceeds a 4096-pixel dimension or 16,777,216 backing pixels. The effective render scale is:

```text
max(
  1,
  min(
    devicePixelRatio * zoom,
    4096 / logicalWidth,
    4096 / logicalHeight,
    sqrt(16,777,216 / (logicalWidth * logicalHeight))
  )
)
```

The scale never drops below `1` for the supported artboard sizes. Past the cap, the existing parent CSS transform continues to zoom the capped bitmap instead of reallocating an unsafe Canvas. All three layers use the same effective render scale so they remain aligned. Tests separately verify DPR-sharp sizing below the cap and safe, aligned allocation at DPR 2 and the editor's maximum 12× zoom.

The color layer clears its backing store, draws the checkerboard background across the artboard, and then fills all non-transparent cells. Keeping transparency rendering inside Canvas prevents the artboard's CSS background from diverging from cell geometry.

The code layer clears itself whenever labels are hidden. When labels are visible, it draws only non-transparent cell codes centered in their cells. Font size is derived from the smaller displayed cell dimension and retains the existing two- versus three-character size distinction. Text color continues to use the current luminance helper.

The grid layer clears itself and draws the cell grid plus the outer border. To preserve the current non-scaling SVG appearance, its displayed stroke width remains `0.75` CSS pixels. Its logical line width is `0.75 / zoom`, which the shared render transform converts into backing pixels. Interior lines are centered on cell boundaries. The outer border is inset by half the logical line width so it is not clipped. Coordinates are aligned to backing pixels where possible without shifting cell boundaries. The layer remains transparent outside its strokes.

## Interaction

Pointer-to-cell conversion continues to use the receiving element's transformed `getBoundingClientRect()` and normalized row/column coordinates. `getBoundingClientRect()` is used only for pointer normalization, not backing-store sizing. Changing the event target from `SVGSVGElement` to `HTMLCanvasElement` does not change tool semantics.

The top grid canvas receives pointer events and uses the existing pointer-capture behavior. Multi-touch cancellation, paint interpolation, click suppression, fill, eyedropper, brush, eraser, undo, and redo remain unchanged.

## Accessibility

Only the top grid canvas is exposed as the interactive artwork with the existing Chinese accessible label. The color and code layers are `aria-hidden`. Rulers remain DOM elements so their labels and existing accessibility behavior are preserved.

## Testing

Unit tests will cover backing-store sizing and pure drawing behavior for colors, labels, and grid lines using a recording 2D context or browser-compatible canvas surface already supported by the test environment.

Presentation tests will assert the three-layer structure and removal of the old SVG renderers. End-to-end tests will click the top canvas by normalized coordinates, verify editing behavior, verify code-layer visibility around the zoom threshold, and inspect Canvas pixels or exposed layer state instead of querying SVG `<text>` nodes.

Existing tests for gestures, tools, rulers, canvas fitting, imports, export, undo, redo, and palette behavior remain in scope and must continue to pass.

## Risks and Mitigations

- **Blurry zoomed output:** increase backing density with zoom and redraw as scale changes, subject to a strict allocation budget.
- **Unsafe Canvas allocation at high zoom:** cap each backing dimension at 4096 pixels and each layer at 16,777,216 pixels, then let CSS scale the capped bitmap.
- **Double-applied zoom:** measure untransformed layout size from `ResizeObserver`/`clientWidth`; use transformed bounds only for pointer normalization.
- **Font fallback on first draw:** redraw the code layer after `document.fonts.ready` resolves.
- **Excessive redraws during zoom:** coalesce drawing through `requestAnimationFrame` and avoid changing React cell state during rendering.
- **Incorrect pointer layer:** disable pointer events on color and code canvases and keep the grid canvas last.
- **Test loss after removing SVG nodes:** test pure renderer functions and observable pixels/interaction rather than implementation-specific SVG geometry.

## Success Criteria

- The H5 artboard renders through exactly three stacked Canvas elements for colors, codes, and grid lines.
- Colors, transparency, codes, and grid lines match the current editor behavior.
- Code labels retain the existing zoom visibility threshold.
- Painting, erasing, filling, eyedropper, panning, zooming, pinch gestures, undo, redo, resizing, import, rulers, and export continue to work.
- Canvas output is DPR-sharp while the requested density is within the raster budget; after the cap is reached it remains aligned and functional with controlled CSS upscaling.
- Focused unit tests and the relevant Playwright H5 tests pass.
