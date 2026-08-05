# Canvas Code Label Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep two- and three-character bead color codes centered inside one SVG grid cell on iPhone Safari without overlap.

**Architecture:** Preserve the existing SVG color and grid paths. Add a small label-size helper keyed by code length, and use Safari-stable SVG text alignment attributes in `CanvasCodeOverlay`.

**Tech Stack:** React, TypeScript, SVG, Vitest, Playwright

---

## Chunk 1: Label Layout

### Task 1: Fit and center SVG color codes

**Files:**
- Modify: `apps/h5/src/H5App.tsx`
- Test: `apps/h5/src/H5FlowComponents.test.ts`

- [x] **Step 1: Write the failing regression test**

Assert that the SVG label layer uses `cellCodeFontSize(code)`, `fontWeight="600"`, `dominantBaseline="middle"`, and `dy="0.04"`.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- apps/h5/src/H5FlowComponents.test.ts`

Expected: FAIL because the dynamic sizing helper and Safari alignment attributes are absent.

- [x] **Step 3: Implement the minimal layout fix**

Return `0.52` for two-character codes and `0.4` for codes of three or more characters. Render each label with centered text anchoring, middle baseline, a small vertical optical correction, and weight 600.

- [x] **Step 4: Run tests and build**

Run: `npm test -- apps/h5/src/H5FlowComponents.test.ts`

Run: `npm run build:h5`

Expected: all focused tests pass and the H5 production build succeeds.

- [x] **Step 5: Verify in an iPhone 15 viewport**

Create a filled canvas containing two- and three-character codes, zoom until labels appear, and assert each text bounding box remains within its cell width and is centered vertically.
