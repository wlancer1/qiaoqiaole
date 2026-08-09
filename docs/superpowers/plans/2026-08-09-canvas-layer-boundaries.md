# Canvas Layer Boundaries Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate editor and beading canvas-layer coordinate orchestration while sharing the low-level renderer.

**Architecture:** Create an editor-specific layer component that retains transformed artboard offsets and a beading-specific layer component that retains the fixed viewport contract. Reuse the existing renderer and drawing helpers; update each page to use the correct adapter.

**Tech Stack:** React 19, TypeScript, Canvas 2D, Vitest, Vite.

---

## Chunk 1: Separate coordinate adapters

### Task 1: Add editor-layer regression coverage

**Files:**
- Create: `apps/h5/src/canvas/EditorCanvasLayers.test.tsx`
- Reference: `apps/h5/src/canvas/H5CanvasLayers.test.ts`

- [ ] Add a failing source/behavior test proving the editor layer owns transformed artboard geometry and does not hard-code `left: 0` / `top: 0`.
- [ ] Run `npx vitest run --config vitest.config.ts apps/h5/src/canvas/EditorCanvasLayers.test.tsx` and confirm it fails because the editor adapter does not exist.

### Task 2: Extract editor adapter

**Files:**
- Create: `apps/h5/src/canvas/EditorCanvasLayers.tsx`
- Modify: `apps/h5/src/pages/editor/CanvasPage.tsx`

- [ ] Move the editor-facing `H5CanvasLayers` usage behind `EditorCanvasLayers` without changing its props or page behavior.
- [ ] Implement editor geometry using viewport and artboard `getBoundingClientRect()` values and reuse the shared renderer utilities.
- [ ] Update `CanvasPage` to render `EditorCanvasLayers`.
- [ ] Run the editor-layer test and focused canvas tests; confirm they pass.

### Task 3: Rename/retain beading adapter

**Files:**
- Create: `apps/h5/src/canvas/BeadingCanvasLayers.tsx`
- Modify: `apps/h5/src/pages/beading/BeadingSessionPage.tsx`
- Modify: `apps/h5/src/canvas/H5CanvasLayers.test.ts`

- [ ] Move the current fixed-viewport orchestration into `BeadingCanvasLayers` and preserve overlay/grid visibility props.
- [ ] Update `BeadingSessionPage` to use `BeadingCanvasLayers`.
- [ ] Keep the existing beading layer invalidation and four-canvas behavior unchanged.
- [ ] Run the beading page and layer tests.

## Chunk 2: Verification

### Task 4: Regression verification

**Files:**
- Modify: focused tests only if coverage exposes a contract gap.

- [ ] Run `npx vitest run --config vitest.config.ts apps/h5/src/canvas/EditorCanvasLayers.test.tsx apps/h5/src/canvas/H5CanvasLayers.test.ts apps/h5/src/flow/H5FlowComponents.test.ts apps/h5/src/pages/beading/BeadingSessionPage.test.tsx`.
- [ ] Run `npm run build:h5`.
- [ ] Inspect `git diff` and verify no unrelated UI or business logic changes.
- [ ] Commit implementation as `fix(h5): isolate editor and beading canvas layers`.
