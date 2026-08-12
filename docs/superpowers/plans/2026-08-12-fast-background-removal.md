# Fast Background Removal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a local, connected-region background remover with an H5 sensitivity slider for split-image previews.

**Architecture:** Keep algorithmic code pure in `packages/core/src/domain/grid.ts` beside the existing replacement implementation, and expose it through the core barrel. Keep H5 state, animation-frame coalescing, and rendering in the existing split flow; source image data remains cached in `UploadedSplitImage`.

**Tech Stack:** TypeScript, Canvas `ImageData`, React 19, Vitest, Vite.

---

## Chunk 1: Pure background-removal algorithm

### Task 1: Specify and implement the core API

**Files:**
- Modify: `packages/core/src/domain/grid.ts`
- Modify: `packages/core/src/domain/grid.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing Vitest cases** for connected white background removal, gradual edge-connected background, enclosed same-colour subject detail, edge-touching subject, transparent/tiny input, threshold monotonicity, source immutability, and a 256×256 performance guard.
- [ ] **Step 2: Run** `npm test -- packages/core/src/domain/grid.test.ts` and confirm the new cases fail because the new API is absent.
- [ ] **Step 3: Add the minimal pure implementation.** Export types plus `prepareBackgroundRemoval`, four-edge 20–40-point sampling without duplicate corners, weighted RGB distance, 16-step clustered background model with conservative low-confidence threshold tightening, sensitivity mapping, typed-array multi-source BFS with local region growing and centre protection, a ≤256px analysis resolution with bilinear mask upsampling, output-resolution 1px feathering, halo alpha reduction, and cloned output.
- [ ] **Step 4: Export the API** from `packages/core/src/index.ts` if needed by H5.
- [ ] **Step 5: Run** `npm test -- packages/core/src/domain/grid.test.ts` and confirm all core tests pass.

## Chunk 2: Split-flow integration and UI

### Task 2: Thread sensitivity and prepared analysis through split processing

**Files:**
- Modify: `apps/h5/src/pages/split/splitImageProcessing.ts`
- Modify: `apps/h5/src/pages/split/splitImageProcessing.test.ts`
- Modify: `apps/h5/src/shared/h5Types.ts`
- Modify: `apps/h5/src/H5App.tsx`

- [ ] **Step 1: Write failing H5 processing tests** proving background-on uses configured sensitivity while background-off returns the immutable original without recomputation.
- [ ] **Step 2: Run** `npm test -- apps/h5/src/pages/split/splitImageProcessing.test.ts` and confirm the tests fail for the missing options/cache plumbing.
- [ ] **Step 3: Add minimal adapter/state changes.** Add sensitivity default 30 and prepared cache/source-version metadata to uploaded split state; prepare once for the current cropped/basic-adjusted image; update `deriveSplitImage` to receive sensitivity/cache; coalesce sensitivity requests with `requestAnimationFrame`; preserve crop/grid behavior; invalidate the cache whenever an upstream image transformation changes pixels; and invalidate stale split jobs without disabling live slider input.
- [ ] **Step 4: Run** `npm test -- apps/h5/src/pages/split/splitImageProcessing.test.ts` and confirm it passes.

### Task 3: Render an accessible sensitivity control

**Files:**
- Modify: `apps/h5/src/pages/split/SplitPages.tsx`
- Modify: `apps/h5/src/pages/split/SplitPages.test.ts`
- Modify: `apps/h5/src/styles.css`

- [ ] **Step 1: Write failing markup tests** for default-off hidden control and enabled 0–100/step-1 “去背景灵敏度” control with current readout.
- [ ] **Step 2: Run** `npm test -- apps/h5/src/pages/split/SplitPages.test.ts` and confirm the tests fail for the missing UI.
- [ ] **Step 3: Add the conditional slider and compact styling** matching the existing threshold-control visual system; forward its callback from `H5App`.
- [ ] **Step 4: Run** `npm test -- apps/h5/src/pages/split/SplitPages.test.ts` and confirm it passes.

## Chunk 3: Full verification

### Task 4: Verify repository changes

**Files:**
- Verify only

- [ ] **Step 1: Run relevant tests**: `npm test -- packages/core/src/domain/grid.test.ts apps/h5/src/pages/split/splitImageProcessing.test.ts apps/h5/src/pages/split/SplitPages.test.ts`.
- [ ] **Step 2: Run H5 build**: `npm run build:h5`.
- [ ] **Step 3: Run** `git diff --check` and inspect `git diff --` limited to task files, ensuring existing unrelated edits are preserved.
