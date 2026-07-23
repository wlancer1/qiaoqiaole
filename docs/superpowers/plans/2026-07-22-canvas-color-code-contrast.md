# Canvas Color-Code Contrast Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render canvas color codes as plain black or white text with no label background.

**Architecture:** Add one luminance-based text-color helper beside the existing color-code lookup and reuse it in both editable-grid and imported-image render paths. CSS will only control compact typography and visibility; React inline color will select black or white from each cell's actual fill.

**Tech Stack:** React, TypeScript, CSS, Playwright

---

## Chunk 1: Contrast Text Without Label Backgrounds

### Task 1: Apply shared black-or-white color-code contrast

**Files:**
- Modify: `apps/h5/src/H5App.tsx:1589,2349-2362,2789`
- Modify: `apps/h5/src/styles.css:1829-1863,1890-1911`
- Test: `tests/e2e/h5.spec.ts:378-429`

- [ ] **Step 1: Write the failing browser assertions**

For the editable grid, paint one deterministic `#ffffff` cell and one deterministic `#000000` cell. For the imported image, read the rendered canvas pixels by overlay index and select one cell above the luminance threshold and one below it. Then verify both render paths with explicit light and dark labels:

```ts
await expect(lightCode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
await expect(lightCode).toHaveCSS('color', 'rgb(0, 0, 0)');
await expect(darkCode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
await expect(darkCode).toHaveCSS('color', 'rgb(255, 255, 255)');
```

Also assert `getComputedStyle(code, '::before').backgroundColor` is transparent for imported codes so the pseudo-element cannot recreate the label background.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "shows bead color codes|shows imported canvas color codes"
```

Expected: FAIL because the current code labels use translucent white backgrounds and a fixed dark text color.

- [ ] **Step 3: Add the minimal contrast helper and apply it to both render paths**

Add a helper near `colorCodeOf` that parses a six-digit hex color, converts RGB channels to relative luminance, and returns `'#ffffff'` for dark colors or `'#000000'` for light colors. Apply its result as the inline `color` of `.h5-cell-code` and `.h5-image-cell-code`.

Remove the background declarations from both label classes, remove `.h5-image-cell-code:not(:empty)::before`, and remove the visible imported-code background. Keep the existing font size, zoom visibility threshold, and text shadow.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "shows bead color codes|shows imported canvas color codes|keeps mobile canvas labels compact"
```

Expected: 3 passed.

- [ ] **Step 5: Verify the H5 build and diff**

Run:

```bash
npm run build:h5
git diff --check -- apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
```

Expected: build exits 0 and `git diff --check` produces no output.

- [ ] **Step 6: Commit only the scoped implementation files when requested**

```bash
git add apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts docs/superpowers/plans/2026-07-22-canvas-color-code-contrast.md
git commit -m "fix: simplify canvas color code labels"
```
