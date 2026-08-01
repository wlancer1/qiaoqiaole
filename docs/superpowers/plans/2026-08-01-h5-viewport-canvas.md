# H5 Viewport Canvas Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redraw the H5 editor's three visual Canvas layers in viewport coordinates so 108×108 drawings remain sharp at 12× zoom on DPR-3 phones.

**Architecture:** Keep `react-zoom-pan-pinch` as the camera, retain a transformed transparent artboard interaction div and DOM rulers, and place three viewport-sized visual canvases outside the transformed subtree. On camera frames, measure the transformed artboard, cull to visible row-major cells, and redraw directly at viewport × DPR resolution without reallocating backing stores.

**Tech Stack:** React 19, TypeScript, Canvas 2D, react-zoom-pan-pinch, Vitest, Playwright

**Dirty-worktree guard:** Record `git status --short` before work. The following user-owned paths must never be edited or staged: `apps/h5/src/H5FlowComponents.tsx`, `5891785564709_.pic.jpg`, `docs/superpowers/plans/2026-07-30-canvas-code-label-layout.md`, `image copy.png`, and `loading.md`. Use explicit `git add <Canvas-owned paths>` only. The working build depends on the uncommitted `SplitCanvasLoading` export, so it does not prove a clean checkout is independently buildable.

---

## Task 1: Viewport renderer primitives

**Files:**
- Modify: `apps/h5/src/H5CanvasRenderer.ts`
- Modify: `apps/h5/src/H5CanvasRenderer.test.ts`

- [ ] Write tests for half-open `visibleGridRange`: centered, clipped on each edge, completely offscreen, clamped, and terminal grid boundary.
- [ ] Run `npm test -- apps/h5/src/H5CanvasRenderer.test.ts`; expect RED because viewport APIs are missing.
- [ ] Implement `ViewportArtboard`, visible-range, and shared backing-aligned viewport boundary helpers.
- [ ] Run `npm test -- apps/h5/src/H5CanvasRenderer.test.ts`; expect the range tests to pass.
- [ ] Write recording-context tests for `drawViewportColorLayer`, `drawViewportCodeLayer`, and `drawViewportGridLayer`: only visible `cells[row * cols + col]`, offscreen clear-only behavior, shared boundaries, displayed-size fonts/maxWidth, and constant 0.75 CSS-pixel grid lines.
- [ ] Run `npm test -- apps/h5/src/H5CanvasRenderer.test.ts`; expect RED for missing viewport draw passes.
- [ ] Implement the minimal viewport draw passes and remove old artboard draw exports/tests if unused.
- [ ] Run `npm test -- apps/h5/src/H5CanvasRenderer.test.ts`; expect GREEN.
- [ ] Run `npx tsc -p tsconfig.json --noEmit` and `git diff --check`.
- [ ] Commit only renderer paths with `git add apps/h5/src/H5CanvasRenderer.ts apps/h5/src/H5CanvasRenderer.test.ts && git commit -m "feat(h5): draw canvas layers in viewport space"`.

## Task 2: Failing integration and DPR-3 sharpness tests

**Files:**
- Modify: `apps/h5/src/H5CanvasLayers.test.ts`
- Modify: `apps/h5/src/H5FlowComponents.test.ts`
- Create: `tests/e2e/h5-viewport-canvas.spec.ts`
- Modify: `playwright.config.ts`

- [ ] Add source/presentation assertions before production changes: Canvas stack appears before/outside `TransformComponent`; `.h5-canvas-interaction.canvas-artwork` is inside `.h5-artboard`; handlers/accessible label live on the div; all three visual canvases are `aria-hidden` and non-interactive; artboard checker and `image-rendering: pixelated` are absent; stack/transform/ruler/control z-order is explicit.
- [ ] Replace layer tests with viewport invalidation expectations: camera changes redraw all without configure, cells redraw color/code, visibility/font redraw code, rows/cols redraw all, viewport/DPR configure all, and camera scale never enters backing allocation. Assert stable `useCallback` transform listener, initial layout draw, ResizeObserver, window resize, DPR media-query listener, RAF cleanup, and no raster-settlement timer.
- [ ] Add Playwright project `h5-dpr3` matching only `h5-viewport-canvas.spec.ts`, with base URL 5174, viewport 390×844, and `deviceScaleFactor: 3`.
- [ ] Add a failing 108×108 test. Create the drawing, paint a known cell, advance zoom by clicking `+` once at a time and polling the actual transform matrix after each animation until it reaches `12 ± 0.05`, then wait two RAFs. Record around 2× and at 12×: viewport/canvas boxes, backing sizes, transform scale, code-ink bounding box in the target cell, and grid stroke thickness in backing pixels.
- [ ] Assert all Canvas CSS boxes equal `.react-transform-wrapper`, canvases have no non-identity camera transform, DPR-3 backing sizes equal the viewport allocation and remain unchanged, code ink grows at least 3× from ~2× to 12×, and grid stroke stays within `0.75 × effectiveRenderScale ± 1.25` backing pixels.
- [ ] Run `npm test -- apps/h5/src/H5CanvasLayers.test.ts apps/h5/src/H5FlowComponents.test.ts`; expect RED for the missing viewport contract.
- [ ] Run `npm run test:e2e -- tests/e2e/h5-viewport-canvas.spec.ts --project=h5-dpr3`; expect RED because canvases are still transformed artboard-sized bitmaps.
- [ ] Commit test-only paths with `git add apps/h5/src/H5CanvasLayers.test.ts apps/h5/src/H5FlowComponents.test.ts tests/e2e/h5-viewport-canvas.spec.ts playwright.config.ts && git commit -m "test(h5): specify viewport canvas redraw"`.

## Task 3: Transform-driven viewport integration

**Files:**
- Modify: `apps/h5/src/H5CanvasLayers.tsx`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/styles.css`

- [ ] Implement `H5CanvasLayers` with an `artboardRef`, three viewport canvases, stable `useCallback` + `useTransformEffect`, initial `useLayoutEffect` draw, ResizeObserver, window resize, DPR media-query resubscription, and one RAF scheduler. Configure backing stores only for viewport/DPR changes; camera changes redraw visible content only via the viewport renderer.
- [ ] Render the viewport stack before `TransformComponent`. Inside `.h5-artboard`, keep rulers and add `<div className="h5-canvas-interaction canvas-artwork">`; move pointer/click/accessibility props to it and retarget helpers to `HTMLElement` while preserving pointer capture and normalized artboard hit testing.
- [ ] Update CSS: viewport stack above stage background; transformed content/interaction/rulers and controls above the stack; artboard background transparent; no `image-rendering: pixelated`; all visual canvases non-interactive.
- [ ] Run `npm test -- apps/h5/src/H5CanvasRenderer.test.ts apps/h5/src/H5CanvasLayers.test.ts apps/h5/src/H5FlowComponents.test.ts`; expect GREEN.
- [ ] Run `npm run test:e2e -- tests/e2e/h5-viewport-canvas.spec.ts --project=h5-dpr3`; expect the DPR-3 108×108 sharpness test GREEN.
- [ ] Run `npm run build:h5` and `git diff --check`.
- [ ] Commit only integration paths with `git add apps/h5/src/H5CanvasLayers.tsx apps/h5/src/H5App.tsx apps/h5/src/styles.css && git commit -m "feat(h5): redraw canvas at viewport resolution"`.

## Task 4: Existing E2E migration and full verification

**Files:**
- Modify: `tests/e2e/h5.spec.ts`

- [ ] Update click/drag/touch helpers to use `.h5-canvas-interaction` bounds. Translate cell centers into viewport Canvas coordinates for pixel inspection. Run affected scenarios first and make only demonstrated test/integration fixes.
- [ ] Run `npm run test:e2e -- tests/e2e/h5.spec.ts --project=h5-chromium -g "renders every painted|shows imported canvas color codes|allows panning|edits a preset H5 grid canvas|does not paint when a two-finger pinch|does not connect brush strokes"`; expect GREEN.
- [ ] Run `npm test`, `npm run build:h5`, `npm run test:e2e -- tests/e2e/h5-viewport-canvas.spec.ts --project=h5-dpr3`, and the full `npm run test:e2e -- tests/e2e/h5.spec.ts --project=h5-chromium`. Classify known unrelated baseline/split-loading failures separately.
- [ ] Run `git diff --check`. Compare final `git status --short` and the guarded user paths with the captured starting state.
- [ ] Commit only `tests/e2e/h5.spec.ts` if changed: `git add tests/e2e/h5.spec.ts && git commit -m "test(h5): exercise viewport canvas interactions"`.
