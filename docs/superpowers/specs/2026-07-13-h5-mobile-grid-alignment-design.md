# H5 Mobile Grid Alignment UI Design

## Goal

Bring the H5 “对格子” screen materially closer to the supplied mobile reference while preserving the current grid-alignment calculations, import flow, and desktop mouse support. The visual target is the web content in the reference image; Safari browser chrome is out of scope.

## Scope

- Modify only the H5 application under `apps/h5` and its H5 end-to-end coverage in `tests/e2e/h5.spec.ts`.
- Redesign only the `splitMode === 'align'` presentation. The quick-split mode and downstream preview/import behavior stay functionally unchanged.
- Preserve the existing alignment state and update functions: `alignCellSize`, `alignOffsetX`, `alignOffsetY`, `nudgeAlignOffset`, `updateAlignCellSize`, and `cellsFromAlignedGrid`.
- Do not change the Web application under `apps/web`.

## Mobile-First Layout

### Header

The alignment screen uses a white, compact step header inspired by the reference:

- A 44px back target on the left.
- A centered four-step progress indicator with step two active and step one complete.
- A blue “确认对齐” action on the right that invokes the current next-step behavior.

The existing title-based split header remains available to quick-split mode. Browser address bars and bottom browser controls are not recreated.

### Alignment Canvas

The alignment canvas sits on a dark checkerboard work surface and uses most of the available mobile width. The source drawing remains rendered by the existing `SplitPreviewCanvas`; only its surrounding composition changes.

- Remove the white rounded-card appearance and heavy frame shadow in alignment mode.
- Keep the drawing’s aspect ratio and center it within the available stage.
- Render the alignment grid as thin blue lines.
- Add a bottom-right dark status pill showing the current grid spacing and view scale.
- Add a compact instruction row beneath the stage with a blue dot and the text “请使用九宫格将网格与图纸格子对齐”.

### Direct-Manipulation Handles

Use the selected “B” treatment: reference-like visuals with a larger invisible touch target.

- Visible ring diameter: 36px.
- Interactive hit area: at least 48px by 48px.
- Visual treatment: translucent center, neutral inner ring/crosshair, blue outer halo, restrained shadow.
- The “移动” label attaches to the left edge of the move ring.
- The “缩放” label attaches to the right edge of the scale ring.
- Initial positions remain proportional to the drawing area, approximately 22%/26% for move and 52%/58% for scale, so they remain meaningful across image aspect ratios.
- The visual ring must not be implemented as a filled button or use the current 56px presentation.

### Bottom Controls

In alignment mode, replace the current mode switch, large readout card, and large reset action with the reference-style two-column control area:

- Left column: “微移” label and a compact four-direction nudge pad.
- Right column: “调整格子大小” label, decrement control, numeric grid-spacing readout, and increment control, followed by a two-line helper description.
- Controls keep 44px minimum touch targets even when their visual surfaces are smaller.
- The controls may scroll internally on short screens, but the page must not overflow horizontally.

Quick-split retains its current controls because the requested reference describes the alignment workflow.

## Interaction and Data Flow

1. Uploading an image continues to initialize quick split and alignment state through `loadSplitImage`.
2. Entering “对格子” displays the redesigned alignment composition without resetting the current alignment values.
3. Dragging the move handle converts screen deltas into source-image deltas through `alignDeltaFromScreen`, then updates the two offsets.
4. Dragging the scale handle converts the drag delta into cell-size changes through `updateAlignCellSize`.
5. Handle movement continues to be coalesced with `requestAnimationFrame` via the existing deferred commit path.
6. Direction buttons nudge the offsets. Minus and plus buttons adjust the cell size.
7. “确认对齐” uses the existing transition to split preview, and import continues to call `cellsFromAlignedGrid`.

No new alignment model, persistence layer, API request, or asset is introduced.

## Responsive and Accessibility Requirements

- Primary target: 390×844 CSS pixels.
- Supported phone width range: 320–430 CSS pixels.
- No horizontal document overflow at supported widths.
- All actionable controls expose an accessible name and a touch target of at least 44px; the two direct-manipulation handles use a 48px hit area.
- Pointer and touch dragging remain supported.
- `touch-action: none` is limited to the interactive canvas/handle region so the control panel can scroll when necessary.
- Respect safe-area insets at the top and bottom.
- Desktop remains usable with a mouse, but no separate desktop visual redesign is required.

## Error and Edge Handling

- The alignment screen is rendered only when an uploaded image exists, matching the existing screen flow.
- Very wide or tall drawings are contained without distortion; handle positions remain relative to the visible drawing frame.
- Grid size remains clamped by the existing alignment functions, preventing zero or negative cell sizes.
- Short screens prioritize the header, stage, and primary action; secondary controls may scroll vertically.
- The UI does not recreate device/browser chrome, avoiding viewport assumptions that fail in standalone or embedded browsers.

## Verification Strategy

Add or update Playwright coverage before production styling changes:

- Assert the alignment screen exposes the step header and “确认对齐” action.
- Assert visible handle rings are approximately 36px while their interactive buttons are at least 48px.
- Assert move and scale labels are horizontally attached on the expected side of their rings.
- Assert the dark work surface, instruction row, status pill, nudge controls, and grid-spacing controls are present in alignment mode.
- Assert the document has no horizontal overflow at 320×720, 390×844, and 430×932.
- Retain the existing behavioral test proving drag-to-move, drag-to-scale, preview, and import still work.
- Run the focused H5 Playwright test, the H5 build, and a fresh mobile screenshot comparison before completion.

## Files and Boundaries

- `apps/h5/src/H5App.tsx`: alignment-mode markup and accessible structure; existing alignment state and behavior remain the source of truth.
- `apps/h5/src/styles.css`: alignment-stage, handle, header, responsive, and control styling.
- `tests/e2e/h5.spec.ts`: mobile layout and interaction regression coverage.

No new component file is required for this focused change. The existing `H5App.tsx` is already monolithic, but splitting unrelated application areas is outside scope.
