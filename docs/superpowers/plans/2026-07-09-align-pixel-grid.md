# Align Pixel Grid Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a split-page mode that lets users align the app grid to an existing pixel/grid drawing before previewing and importing.

**Architecture:** Keep the feature inside the existing H5 split workflow. Add an alignment mode with source-image-coordinate `cellSize`, `offsetX`, and `offsetY`; render the overlay from those values; generate preview/import cells from the aligned grid instead of uniform crop division when alignment mode is active.

**Tech Stack:** React, TypeScript, canvas, existing Playwright E2E.

---

## Chunk 1: H5 Aligned Grid Workflow

### Task 1: Add regression coverage

**Files:**
- Modify: `tests/e2e/h5.spec.ts`

- [ ] Add an E2E assertion that the split page has a `对格子` mode.
- [ ] In that mode, drag the preview and verify offset text changes.
- [ ] Adjust cell size and verify grid count changes.
- [ ] Continue to preview/import and verify the canvas dimensions match the aligned grid.

### Task 2: Add alignment state and derivation

**Files:**
- Modify: `apps/h5/src/H5App.tsx`

- [ ] Add split mode state: `quick | align`.
- [ ] Add alignment state: `cellSize`, `offsetX`, `offsetY`.
- [ ] Initialize alignment from uploaded image crop and default split count.
- [ ] Derive aligned rows/cols from crop, cell size, and offsets.

### Task 3: Render and manipulate aligned grid

**Files:**
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/styles.css`

- [ ] Add mode segmented control on the split page.
- [ ] In `对格子` mode, single-finger drag adjusts grid offset.
- [ ] In `对格子` mode, two-finger pinch adjusts cell size.
- [ ] Add compact micro-controls for offset arrows, cell-size +/- and reset.
- [ ] Render grid overlay using aligned offset and cell size.

### Task 4: Use aligned sampling

**Files:**
- Modify: `apps/h5/src/H5App.tsx`

- [ ] Add `cellsFromAlignedGrid`.
- [ ] Use aligned rows/cols in preview and import when split mode is `align`.
- [ ] Keep existing quick split behavior unchanged.

### Task 5: Verify

- [ ] Run targeted E2E for upload/split flow.
- [ ] Run `node --check apps/api/src/server.mjs`.
- [ ] Run `npm test`.
- [ ] Run `npm run build:h5`.
- [ ] Run `npm run test:e2e -- --project h5-chromium`.
