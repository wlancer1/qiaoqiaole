# Zoom-Sticky Canvas Rulers Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the editor's row and column ruler labels numerically aligned with the visible grid while moving the ruler to the workbench edges only when the zoomed canvas overflows the viewport.

**Architecture:** Keep the existing rulers attached to the transformed artboard for the normal, fully-visible state. Add an editor-only viewport ruler overlay that observes the transformed artboard and stage rectangles, derives each label's screen-space position from the current cell geometry, and renders only while the canvas overflows. The beading workspace continues using the existing artboard rulers unchanged.

**Tech Stack:** React, TypeScript, `react-zoom-pan-pinch`, Vitest, existing H5 CSS.

---

## Chunk 1: Pure ruler geometry

**Files:**
- Modify: `apps/h5/src/canvas/H5CanvasPreview.tsx`
- Test: `apps/h5/src/canvas/H5CanvasPreview.test.ts`

- [x] **Step 1: Write failing tests** for overflow detection and screen-aligned label positions, including a partially clipped artboard and a fully visible artboard.
- [x] **Step 2: Run the focused ruler test** and verify it fails because the geometry helpers do not exist.
- [x] **Step 3: Implement pure helpers** that calculate overflow and visible label coordinates from stage rect, artboard rect, rows, and columns. Preserve 1-based label values and the existing every-five tick policy.
- [x] **Step 4: Run the focused test** and verify it passes.

## Chunk 2: Conditional viewport ruler overlay

**Files:**
- Modify: `apps/h5/src/canvas/H5CanvasPreview.tsx`
- Modify: `apps/h5/src/pages/editor/CanvasPage.tsx`
- Test: `apps/h5/src/flow/H5FlowComponents.test.ts`

- [x] **Step 1: Add a failing structural regression test** asserting that the editor owns a stage ref and renders a viewport ruler overlay inside the transform context, while the existing artboard ruler remains available.
- [x] **Step 2: Run the focused test** and verify it fails for the missing overlay.
- [x] **Step 3: Implement the overlay** with `useTransformEffect`, `ResizeObserver`, and `requestAnimationFrame` coalescing. Measure stage and transformed artboard rectangles, derive screen-space label positions, and switch visibility only when the artboard is clipped or larger than the stage.
- [x] **Step 4: Keep the overlay non-interactive** and render top/left fixed bars with labels positioned at exact visible cell centers; hide it again when the canvas is fully visible or reset.
- [x] **Step 5: Run focused component tests** and verify they pass.

## Chunk 3: Styling and verification

**Files:**
- Modify: `apps/h5/src/styles.css`

- [x] **Step 1: Add failing style assertions** for the overlay's fixed workbench positioning, z-index above the transformed artboard, and pointer-events behavior.
- [x] **Step 2: Implement the minimum CSS** for the fixed top/left ruler bars, safe spacing around the header/tool rail, and stable label sizing without changing the existing artboard ruler styles.
- [x] **Step 3: Run focused tests, the H5 build, and the relevant browser test command if available.**
- [x] **Step 4: Inspect the final diff and confirm no beading ruler behavior changed.**
