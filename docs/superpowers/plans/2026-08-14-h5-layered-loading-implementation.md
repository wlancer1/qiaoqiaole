# H5 Layered Loading Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved centered pixel route fallback and page-specific skeleton loading states to the H5 application.

**Architecture:** Keep loading presentation in focused reusable components under `apps/h5/src/loading`. A delayed-loading hook controls the 300ms reveal and minimum visibility window. React Router renders the brand fallback while existing page-level loading flags select skeleton variants; local operations retain their existing feedback.

**Tech Stack:** React 19, React Router DOM, TypeScript, Vitest, existing H5 CSS tokens.

---

## Chunk 1: Loading primitives

### Task 1: Delayed loading state

**Files:**
- Create: `apps/h5/src/loading/useDelayedLoading.ts`
- Test: `apps/h5/src/loading/useDelayedLoading.test.tsx`

- [ ] Write tests for the 300ms delay, 250ms minimum visibility, cancellation, and unmount cleanup.
- [ ] Run the focused test and confirm it fails because the hook is missing.
- [ ] Implement the hook with timer cleanup and no state updates after unmount.
- [ ] Run the focused test and confirm it passes.

### Task 2: Brand fallback and skeleton components

**Files:**
- Create: `apps/h5/src/loading/H5LoadingStates.tsx`
- Test: `apps/h5/src/loading/H5LoadingStates.test.tsx`
- Modify: `apps/h5/src/styles.css`

- [ ] Write component tests for centered 3×3 pixels, status semantics, hidden skeleton shapes, page variants, retry, and loaded content.
- [ ] Run the focused test and confirm it fails because the components are missing.
- [ ] Implement `RouteLoadingFallback`, `PageSkeleton`, and `PageLoadBoundary`.
- [ ] Add responsive CSS, reduced-motion handling, and content fade-in.
- [ ] Run focused tests and confirm they pass.

## Chunk 2: Application integration

### Task 3: Route and page loading integration

**Files:**
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx`
- Test: `apps/h5/src/H5App.auth.test.ts`
- Test: `apps/h5/src/patterns/H5PatternPages.test.ts`

- [ ] Add failing source/component tests requiring the route fallback and skeleton boundaries.
- [ ] Replace plain “正在加载” placeholders with matching page skeletons.
- [ ] Use skeletons for author, follow lists, community detail, warehouse detail, and editor deep-link loads.
- [ ] Keep comments, load-more, buttons, background removal, and split generation local.
- [ ] Run focused tests and confirm they pass.

## Chunk 3: Verification

### Task 4: Full H5 verification

**Files:**
- Verify all files above plus existing dirty route changes.

- [ ] Run `npx vitest run apps/h5/src`.
- [ ] Run `npm run build:h5`.
- [ ] Run `git diff --check`.
- [ ] Inspect `git status --short` and report unrelated pre-existing changes separately.
