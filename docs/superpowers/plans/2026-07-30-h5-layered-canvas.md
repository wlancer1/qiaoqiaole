# H5 Layered Canvas Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the H5 editor's SVG artwork, SVG labels, and SVG grid with three stacked, high-DPI Canvas layers without changing editor behavior.

**Architecture:** Add a pure renderer module for raster sizing and the three draw passes, plus a focused React canvas-stack component that measures the untransformed artboard and schedules redraws. Keep `react-zoom-pan-pinch`, React cell state, rulers, tools, gestures, import, and export unchanged.

**Tech Stack:** React 19, TypeScript, Canvas 2D, react-zoom-pan-pinch, Vitest, Playwright

---

## Chunk 1: Renderer primitives

### Task 1: Add tested Canvas sizing and drawing functions

**Files:**
- Create: `apps/h5/src/H5CanvasRenderer.ts`
- Create: `apps/h5/src/H5CanvasRenderer.test.ts`

- [ ] **Step 1: Write failing raster-budget tests**

Test a public `canvasRenderMetrics(width, height, dpr, zoom)` API. Assert normal DPR sizing, minimum scale 1 at zoom 0.2, a maximum of 4096 pixels per dimension, and at most 16,777,216 pixels across all three layers at DPR 2 / zoom 12.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- apps/h5/src/H5CanvasRenderer.test.ts`

Expected: FAIL because `H5CanvasRenderer` does not exist.

- [ ] **Step 3: Implement the raster-budget helper**

Implement constants for maximum backing dimension and area, return logical size, effective render scale, and integer backing dimensions, and guard zero/invalid dimensions.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- apps/h5/src/H5CanvasRenderer.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing recording-context tests for all three layers**

Use a minimal recording `CanvasRenderingContext2D` substitute to assert:

- color drawing clears the layer and fills only non-transparent cells after the checkerboard;
- code drawing clears when hidden and centers codes with readable text colors when visible;
- grid drawing emits the expected vertical/horizontal boundaries and uses logical line width `0.75 / zoom`;
- configuring a canvas applies identical backing metrics and transforms to every layer.

- [ ] **Step 6: Run the focused test and verify RED**

Run the same focused Vitest command and confirm failures name the missing drawing functions.

- [ ] **Step 7: Implement the three pure draw passes**

Implement `configureCanvas`, `drawColorLayer`, `drawCodeLayer`, and `drawGridLayer`. Accept color-code and text-color callbacks rather than duplicating palette lookup. Express all geometry in untransformed logical CSS pixels and inset the grid border by half its logical line width.

- [ ] **Step 8: Run the focused test and verify GREEN**

Run the focused Vitest command and confirm all renderer tests pass.

## Chunk 2: React and browser integration

### Task 2: Drive and implement the three-layer Canvas stack

**Files:**
- Create: `apps/h5/src/H5CanvasLayers.tsx`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/styles.css`
- Modify: `apps/h5/src/H5FlowComponents.test.ts`
- Modify: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Add Canvas-native E2E helpers before production integration**

Replace `clickVectorCanvasCell` with a normalized `.h5-grid-canvas` helper. Add normalized drag/touch helpers, color-layer pixel sampling, code-layer alpha inspection, and stack metadata reads. None may depend on per-cell DOM nodes.

- [ ] **Step 2: Migrate every obsolete renderer assertion before production integration**

Surgically replace every `.h5-vector-*`, `.h5-code-overlay`, `.h5-image-*`, `.h5-canvas-grid`, `.h5-canvas-cell`, and `格子 X,Y` assumption in `tests/e2e/h5.spec.ts`. This includes upload/import painting, responsive artboard sizing, aligned import dimensions, code visibility, rulers/layout, brush/eraser/fill/pan, pinch and stroke gaps, palette prioritization/search, and export.

Use normalized Canvas pointer operations and color-layer pixel samples for editing assertions. Derive logical cell size from `.h5-artboard` divided by metadata columns, never from backing-store dimensions. Assert codes by checking that the dedicated code layer is empty below the threshold and contains alpha above it. Assert imported dimensions using `data-grid-cols` and `data-grid-rows`.

Remove stale per-cell keyboard steps because the approved design exposes one accessible top Canvas rather than thousands of cell buttons. Replace them with an accessible-name assertion on the grid canvas and equivalent pointer-editing coverage.

- [ ] **Step 3: Add failing presentation expectations**

Update `H5FlowComponents.test.ts` to require `H5CanvasLayers` and color/code/grid class names, and reject `h5-vector-canvas`, `h5-vector-grid-lines`, and `h5-code-overlay`.

- [ ] **Step 4: Run integration expectations and verify RED**

Run: `npm test -- apps/h5/src/H5FlowComponents.test.ts`

Run:

```bash
npm run test:e2e -- tests/e2e/h5.spec.ts --project=h5-chromium -g "uploads from the H5 home page|keeps imported canvas cell size|renders every painted|shows imported canvas color codes|shows canvas row and column rulers|fits a default grid canvas|keeps editable grid cells|keeps mobile canvas labels|aligns the split grid|edits a preset H5 grid canvas|does not paint when a two-finger pinch|does not connect brush strokes|prioritizes drawing colors|prioritizes colors used|exports a coded bead pattern"
```

Expected RED: the presentation test cannot find `H5CanvasLayers`, and browser tests cannot find `.h5-color-canvas`, `.h5-code-canvas`, or `.h5-grid-canvas`. Do not proceed on syntax or environment failures.

- [ ] **Step 5: Implement `H5CanvasLayers`**

Create color/code/grid canvases in DOM order. Measure untransformed size with `ResizeObserverEntry.contentRect`, falling back to `clientWidth/clientHeight`. Coalesce redraws with animation frames, share renderer metrics, and redraw labels after `document.fonts.ready`. Expose only the grid canvas to accessibility and pointer events. Add stack-level `data-grid-cols`, `data-grid-rows`, `data-codes-visible`, and raster metadata; never create per-cell DOM nodes.

- [ ] **Step 6: Integrate the stack into `H5App`**

Remove the vector memos/helpers and `CanvasCodeOverlay`. Replace the SVG block with `H5CanvasLayers`, pass cells/dimensions/scale and palette callbacks, and retarget pointer handlers to `HTMLCanvasElement` without changing coordinate math or tools.

- [ ] **Step 7: Replace SVG CSS with layered Canvas CSS**

Add absolute full-size layer rules, correct z-order, lower-layer `pointer-events: none`, and top-layer touch/cursor behavior. Remove obsolete SVG rules while preserving the artboard, ruler, checkerboard, and transform layout.

- [ ] **Step 8: Run focused Vitest and verify GREEN**

Run: `npm test -- apps/h5/src/H5CanvasRenderer.test.ts apps/h5/src/H5FlowComponents.test.ts`

Expected: PASS.

- [ ] **Step 9: Run the exact focused Playwright command and verify GREEN**

Run the same Playwright command from Step 4. Expected: all selected scenarios pass.

- [ ] **Step 10: Run the H5 build**

Run: `npm run build:h5`

Fix only errors caused by this task.

## Chunk 3: Regression verification

### Task 3: Verify and clean up the renderer migration

**Files:**
- Modify if a demonstrated regression requires it: `tests/e2e/h5.spec.ts`, `apps/h5/src/H5CanvasLayers.tsx`, `apps/h5/src/H5CanvasRenderer.ts`, `apps/h5/src/H5App.tsx`, `apps/h5/src/styles.css`

- [ ] **Step 1: Prove obsolete renderer assumptions are gone**

Run:

```bash
rg -n "h5-vector-|h5-code-overlay|h5-image-|h5-canvas-grid|h5-canvas-cell|格子 [0-9]" tests/e2e/h5.spec.ts apps/h5/src/H5FlowComponents.test.ts
```

Expected: no matches. Preserve unrelated split-preview Canvas selectors.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run build:h5
npm run test:e2e -- tests/e2e/h5.spec.ts --project=h5-chromium
```

Record pre-existing failures separately from regressions introduced by this work.

- [ ] **Step 3: Review the final diff from the dirty starting state**

Execution starts with the user's uncommitted split-loading/import changes in all major target files. Use only surgical patches; never restore, replace wholesale, or reformat those files. Confirm unrelated user changes and untracked assets remain untouched.
