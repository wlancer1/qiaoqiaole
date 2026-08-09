# Canvas Layer Boundaries Design

## Goal

Prevent changes for the beading session workspace from changing the canvas behavior of the pegboard editor while continuing to reuse the low-level canvas renderer.

## Decision

Split the React canvas-layer orchestration into editor-specific and beading-specific components. Keep `H5CanvasRenderer.ts` and the pure drawing helpers shared. Do not add an `editor | beading` mode branch to one shared component.

## Boundaries

- The editor layer component measures the viewport and transformed artboard with `getBoundingClientRect()`, computes the artboard offset inside the viewport, and preserves the editor's existing coordinate contract.
- The beading layer component uses the untransformed viewport/artboard contract required by the beading session workspace, including overlay and grid visibility.
- Both components share canvas configuration, render metrics, color/code/grid drawing, and beading overlay drawing helpers.
- `CanvasPage` imports the editor-specific component. `BeadingSessionPage` imports the beading-specific component.

## Testing

- Preserve the existing renderer and beading-layer tests.
- Add an editor-layer regression test that proves the editor passes the real artboard/viewport geometry through the editor-specific path rather than forcing `left` and `top` to zero.
- Run focused canvas/editor/beading tests and the H5 build.

## Non-goals

- No visual redesign of either page.
- No change to canvas rendering colors, tool behavior, zoom limits, or session state.
- No duplication of the low-level drawing algorithms.
