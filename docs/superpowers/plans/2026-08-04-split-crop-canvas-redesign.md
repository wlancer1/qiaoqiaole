# Split Crop Canvas Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the independent crop page with a visible Canvas-rendered grid, eight grid-snapped handles, and a bottom-right columns × rows marker.

**Architecture:** A focused `SplitCropCanvas` component owns high-DPI rendering of `Cell[]`. `SplitCropPage` owns zoom and composes the canvas artboard with a full-size DOM interaction layer; crop bounds remain integer grid coordinates and continue using the existing crop utilities.

**Tech Stack:** React, TypeScript, Canvas 2D, Vitest, existing H5 CSS.

---

## Chunk 1: Rendering contract

### Task 1: Add a failing crop page rendering test

**Files:**
- Create: `apps/h5/src/pages/split/SplitPages.test.tsx`
- Modify: `apps/h5/src/pages/split/SplitPages.tsx`

- [ ] Render `SplitCropPage` with sample cells.
- [ ] Assert a Canvas exists, eight handles exist, and the size marker uses the requested Chinese format.
- [ ] Run the focused test and confirm it fails against the current DOM-grid implementation.

### Task 2: Implement high-DPI Canvas drawing

**Files:**
- Create: `apps/h5/src/canvas/SplitCropCanvas.tsx`
- Modify: `apps/h5/src/pages/split/SplitPages.tsx`

- [ ] Draw every grid cell with transparent-cell fallback.
- [ ] Draw grid lines only when display cell size is large enough.
- [ ] Resize for device pixel ratio and container changes.
- [ ] Replace crop-page DOM cells with the Canvas component.

## Chunk 2: Crop interaction and visual structure

### Task 3: Rebuild selection layer and controls

**Files:**
- Modify: `apps/h5/src/pages/split/SplitPages.tsx`
- Modify: `apps/h5/src/styles.css`

- [ ] Make the interaction layer cover the entire artboard so pointer-to-grid conversion uses full-grid dimensions.
- [ ] Add top, right, bottom, and left handles in addition to the four corners.
- [ ] Move the size marker to the selection's bottom-right corner.
- [ ] Add dark checkerboard workspace, outside mask, instruction strip, reset, zoom controls, and 100% readout.
- [ ] Keep all touch targets at least 44px.

## Chunk 3: Verification

### Task 4: Run regression checks

**Files:**
- Test: `apps/h5/src/pages/split/SplitPages.test.tsx`
- Test: `apps/h5/src/utils/splitCrop.test.ts`

- [ ] Run focused crop tests.
- [ ] Run `npm test`.
- [ ] Run `npm run build:h5`.
- [ ] Run `git diff --check`.
