# Split Crop Step Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a post-splitting crop step that auto-selects the non-transparent grid content, shows live columns × rows inside the selection, and imports only the selected cells.

**Architecture:** Keep crop state as integer grid bounds `{ top, right, bottom, left }`. A pure utility detects bounds and reindexes the selected `Cell[]`; the preview page renders an overlay whose handles snap to cell boundaries. No aspect-ratio controls are included.

**Tech Stack:** React + TypeScript, existing H5 split preview, Vitest.

---

### Task 1: Add crop boundary utilities and tests

**Files:**
- Create: `apps/h5/src/utils/splitCrop.ts`
- Create: `apps/h5/src/utils/splitCrop.test.ts`

- [ ] Test automatic bounds around non-transparent cells.
- [ ] Test all-transparent fallback to the full grid.
- [ ] Test crop reindexes selected cells to `(0, 0)` and updates dimensions.
- [ ] Run focused test and observe the expected missing-module failure.
- [ ] Implement the minimal pure helpers and rerun the focused test.

### Task 2: Add crop step state to the H5 flow

**Files:**
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/pages/split/SplitPages.tsx`

- [ ] Initialize automatic crop bounds when split cells are generated or split mode changes.
- [ ] Add a crop-step flag and route the split settings “下一步” action through it.
- [ ] Confirm crop by applying bounds to `splitPreviewCells`, updating active rows/columns, and entering the existing browse state.
- [ ] Keep reset available to restore automatically detected bounds.
- [ ] Ensure import uses the cropped cells and dimensions.

### Task 3: Render and style the grid-snapped selection

**Files:**
- Modify: `apps/h5/src/pages/split/SplitPages.tsx`
- Modify: `apps/h5/src/styles.css`

- [ ] Render a selection overlay over the preview grid with four draggable corner handles.
- [ ] Convert pointer positions to integer row/column bounds and clamp to at least one cell.
- [ ] Display live `列数 × 行数` inside the selection box.
- [ ] Do not render ratio controls or free-form ratio input.
- [ ] Add accessible labels and touch-friendly handles.

### Task 4: Verify the flow

**Files:**
- Modify: `apps/h5/src/flow/H5FlowComponents.test.ts` or relevant split tests if needed

- [ ] Run focused crop tests.
- [ ] Run `npm test`.
- [ ] Run `npm run build:h5`.
- [ ] Run `git diff --check` and inspect the scoped diff.
