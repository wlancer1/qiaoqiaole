# H5 Split Figma Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the H5 split-settings and grid-alignment screens match the approved Figma layouts while preserving the existing alignment, preview, and import behavior.

**Architecture:** Keep the existing split state and handlers in `H5App.tsx`, but replace the stale quick/align control markup with two Figma-aligned mode panels that share one shell. Use dedicated CSS classes for the shared preview, bottom-anchored segmented control, full-width quick controls, and two-column alignment controller. Update Playwright assertions first so the DOM structure, geometry, responsive behavior, and interactions are regression-tested.

**Tech Stack:** React 19, TypeScript, CSS, Vite, Vitest, Playwright

---

## Chunk 1: Lock the Figma contract in tests

### Task 1: Update split-flow E2E expectations

**Files:**
- Modify: `tests/e2e/h5.spec.ts:254-440`

- [ ] **Step 1: Write failing assertions for the quick-split layout**

Update the upload/split flow test to assert:

```ts
await expect(page.getByRole('heading', { name: '分割设置' })).toBeVisible();
await expect(page.getByRole('button', { name: '下一步' })).toBeVisible();
await expect(quickPanel.locator('.split-pattern-summary')).toHaveCount(0);
await expect(quickPanel.locator('.split-quick-controls')).toBeVisible();
await expect(page.getByRole('slider', { name: '长边格数' })).toHaveAttribute('min', '24');
await expect(page.getByRole('slider', { name: '长边格数' })).toHaveAttribute('max', '144');
await expect(page.getByRole('slider', { name: '长边格数' })).toHaveValue('72');
await expect(page.getByText('默认众数投票生成主色')).toBeVisible();
```

- [ ] **Step 2: Write failing assertions for the align layout**

After switching to `对格子`, assert the mode-specific header, four direction buttons, non-interactive center readout, grid-size controls, and removed legacy UI:

```ts
await expect(page.getByRole('heading', { name: '对格子' })).toBeVisible();
await expect(page.getByRole('button', { name: '完成' })).toBeVisible();
await expect(page.locator('.split-align-readout')).toHaveCount(0);
await expect(page.getByRole('button', { name: '重置对格' })).toHaveCount(0);
await expect(page.locator('.split-nudge-readout')).toBeVisible();
await expect(page.locator('.split-grid-size-output')).toBeVisible();
await expect(page.locator('.split-nudge-pad button')).toHaveCount(4);
await expect(page.getByRole('status', { name: '网格偏移' })).not.toHaveAttribute('tabindex');
await expect(page.getByRole('status', { name: '格距' })).toBeVisible();
```

- [ ] **Step 3: Add geometry assertions shared by both modes**

At 414×940, read bounding boxes for `.flow-segmented`, `.split-controls-card`, and `.split-image-container`; assert the segmented-to-controller gap is 8–16px, both mode controllers share the same width/height/bottom baseline, the controller bottom is within the safe-area layout bottom, and portrait preview height is at least 300px. Assert four direction buttons and the center readout are each 52×52px, their centers share exact horizontal/vertical axes, grid-size buttons are 48×48px, and the quick step buttons have at least 44px-high hit boxes. Assert accessible names “减小格距” and “增大格距”.

- [ ] **Step 4: Add 320px and landscape assertions**

At 320px width, assert `.split-nudge-pad button` is 44px square and the document has no horizontal overflow. At the existing landscape viewport, assert the preview is at least 96px high and the control page remains vertically scrollable.

- [ ] **Step 5: Migrate all legacy split selectors and actions**

Search the complete test file for `.split-info-value`, `.split-align-readout`, `重置对格`, the old default `18`, and align-mode clicks on `下一步`. Update every occurrence, including the alignment regression around lines 1556–1705 and the profile upload default assertion around line 1774, to use the new outputs/default and the align action label `完成`. Remove reset-specific steps rather than recreating the retired control.

- [ ] **Step 6: Run the targeted tests and verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "uploads from the H5 home page|links split mode tabs|keeps alignment controls usable at 320px width|keeps the alignment canvas usable at 844 by 390 landscape|aligns the split grid to an existing pixel drawing before import"
```

Expected: FAIL because the current page still renders the legacy summaries, default 18/range 4–80, old align controls, and mismatched geometry.

- [ ] **Step 7: Review the test diff**

Use `git diff -- tests/e2e/h5.spec.ts` and confirm only task-related hunks were added. Do not stage or commit because the file already contains user changes and the user did not request commits.

## Chunk 2: Implement the shared Figma screen shell

### Task 2: Update split state and mode-specific header

**Files:**
- Create: `apps/h5/src/splitConfig.ts`
- Create: `apps/h5/src/splitConfig.test.ts`
- Modify: `apps/h5/src/H5App.tsx:25-175`
- Modify: `apps/h5/src/H5App.tsx:1519-1720`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Write a failing unit test for the Figma split configuration**

Create `splitConfig.test.ts` asserting `MIN_SPLIT_LONG_SIDE === 24`, `MAX_SPLIT_LONG_SIDE === 144`, `DEFAULT_SPLIT_LONG_SIDE === 72`, `clampSplitLongSide` clamps below/above range while preserving in-range values, and `gridSizeFromSplitBounds(width, height, 144)` produces an actual long side of 144. Run `npm test -- apps/h5/src/splitConfig.test.ts`; expected FAIL because the module does not exist.

- [ ] **Step 2: Add the Figma-approved split range and default**

Create `splitConfig.ts` with explicit constants and helper, then import them into `H5App.tsx`:

```ts
export const MIN_SPLIT_LONG_SIDE = 24;
export const MAX_SPLIT_LONG_SIDE = 144;
export const DEFAULT_SPLIT_LONG_SIDE = 72;

export function clampSplitLongSide(value: number) {
  return Math.min(MAX_SPLIT_LONG_SIDE, Math.max(MIN_SPLIT_LONG_SIDE, Math.round(value)));
}

export function gridSizeFromSplitBounds(width: number, height: number, longSide: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const safeLongSide = clampSplitLongSide(longSide);
  const scale = safeLongSide / Math.max(safeWidth, safeHeight);
  return {
    cols: Math.max(1, Math.round(safeWidth * scale)),
    rows: Math.max(1, Math.round(safeHeight * scale)),
  };
}
```

Ensure `updateSplitLongSide` uses the exported clamp/config helper, both split-image initialization and updates use `gridSizeFromSplitBounds`, and the range input uses the same constants. Remove the split-only dependency on the old `MAX_AUTO_GRID_SIDE = 120` clamp without changing unrelated canvas normalization limits.

- [ ] **Step 3: Run the unit test and verify GREEN**

Run `npm test -- apps/h5/src/splitConfig.test.ts`; expected PASS.

- [ ] **Step 4: Render mode-specific header copy**

Pass `splitMode === 'quick' ? '分割设置' : '对格子'` to `FlowTopbar.title`, and `下一步`/`完成` to the existing action while retaining `setScreen('split-preview')`.

- [ ] **Step 5: Keep one shared preview and segmented control**

Preserve `SplitPreviewCanvas`, `GridAlignmentHandles`, transform settings, touch/pointer handlers, and accessible tab semantics. Add stable shell classes only where needed for layout.

- [ ] **Step 6: Run the targeted test to confirm the header/range assertions pass**

Run the same targeted Playwright command. Expected: header/range assertions PASS; control-layout assertions still FAIL.

### Task 3: Replace quick-split controls

**Files:**
- Modify: `apps/h5/src/H5App.tsx:1635-1670`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Remove the legacy result summary markup**

Delete `.split-pattern-summary` from the split-settings screen only. Do not alter the later split-preview page.

- [ ] **Step 2: Add the full-width quick controller**

Render `.split-quick-controls` with label, dominant-vote hint, dynamic `splitLongSide` output, a recommendation pill whose default/recommended value is 72, full-width range, min/max labels, and two separate buttons calling `updateSplitLongSide(splitLongSide ± 1)`.

- [ ] **Step 3: Preserve accessibility**

Keep `aria-label="长边格数"`, `减少格数`, and `增加格数`; bind the visible numeric output to the slider using `aria-describedby` when practical.

- [ ] **Step 4: Run the targeted E2E test**

Expected: quick structure and behavior PASS; alignment and geometry assertions may still fail.

### Task 4: Replace alignment controls

**Files:**
- Modify: `apps/h5/src/H5App.tsx:1671-1715`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Remove legacy readout/reset markup**

Delete `.split-align-readout` and the reset button from this screen.

- [ ] **Step 2: Build the two-column controller**

Left: `.split-nudge-section`, four buttons calling `moveGridControlFrame`, and a non-interactive `<output className="split-nudge-readout" aria-label="网格偏移">` containing formatted X/Y offset values. The output must not have `tabIndex` and must remain exposed in the accessibility tree.

Right: `.split-grid-size-section`, two buttons calling `updateAlignCellSize`, `<output className="split-grid-size-output" aria-label="格距">` containing `alignedGrid.cellSize.toFixed(2)`, unit text, and the Figma helper copy.

- [ ] **Step 3: Preserve stable E2E observability**

Add `data-offset-x`, `data-offset-y`, `data-cell-size`, `data-grid-rows`, and `data-grid-cols` to the two outputs so tests can verify offsets, spacing, generated dimensions, and imported canvas dimensions without reintroducing removed status cards.

- [ ] **Step 4: Run the targeted E2E test**

Expected: structure and interaction assertions PASS; remaining failures are CSS geometry only.

- [ ] **Step 5: Review the JSX/state diff**

Run `git diff -- apps/h5/src/H5App.tsx tests/e2e/h5.spec.ts`. Preserve all pre-existing user changes and do not stage or commit whole files.

Also inspect the untracked new files explicitly with `sed -n '1,240p' apps/h5/src/splitConfig.ts` and `sed -n '1,240p' apps/h5/src/splitConfig.test.ts` (or `git diff --no-index /dev/null <file>`), because ordinary `git diff` does not include untracked files.

## Chunk 3: Match Figma geometry and responsive behavior

### Task 5: Replace legacy split-screen CSS

**Files:**
- Modify: `apps/h5/src/styles.css:3602-4290`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Define the shared screen geometry**

Style `.split-page`, `.split-main`, `.split-flow-inner`, and `.split-mode-panel` as a white mobile screen with a large preview and bottom control stack. Use pure `#0A84FF`, 16–18px card radii, the existing safe-area variables, and no gradients in this workflow.

- [ ] **Step 2: Match the preview and segmented control**

Set portrait preview height to the Figma proportion (minimum 300px, approximately 350px at a 940px viewport). Place the segmented control immediately above `.split-controls-card` with 8–16px gap, equal widths, and a 45px overall height.

- [ ] **Step 3: Style the full-width quick controller**

Use the entire 382px Figma content width at 414px viewport, a 244px shared controller height, full-width slider, compact recommendation pill, and 72×44px step-button hit boxes.

- [ ] **Step 4: Style the alignment controller**

Use a two-column grid with a subtle center divider. At 361px+, use 52px nudge cells and 48px grid-size buttons. Align the four directions and center readout on exact horizontal/vertical axes.

- [ ] **Step 5: Add 320–360px responsive rules**

Reduce nudge cells to 44px and controller padding/gaps while retaining two columns, no overlap, no horizontal overflow, and 44px minimum interactive targets.

- [ ] **Step 6: Add landscape behavior**

Keep preview height at least 96px and allow vertical page scrolling. Do not shrink any interactive target below 44px.

- [ ] **Step 7: Remove or neutralize obsolete split CSS**

Remove stale rules for the deleted summary, legacy readout, reset action, and old alignment grid layout when no longer used elsewhere. Keep split-preview/browser styles intact.

- [ ] **Step 8: Run targeted E2E and verify GREEN**

```bash
npx playwright test tests/e2e/h5.spec.ts -g "uploads from the H5 home page|links split mode tabs|keeps alignment controls usable at 320px width|keeps the alignment canvas usable at 844 by 390 landscape|aligns the split grid to an existing pixel drawing before import"
```

Expected: all selected tests PASS.

- [ ] **Step 9: Review the CSS/test diff**

Run `git diff -- apps/h5/src/styles.css tests/e2e/h5.spec.ts`, verify unrelated user changes remain intact, and do not stage or commit whole files.

## Chunk 4: Regression and visual verification

### Task 6: Run the full validation suite

**Files:**
- Verify only

- [ ] **Step 1: Run H5/component unit tests**

```bash
npm test -- apps/h5/src/splitConfig.test.ts apps/h5/src/H5FlowComponents.test.ts apps/h5/src/palette.test.ts packages/core/src/domain/grid.test.ts
```

Expected: all selected Vitest tests PASS.

- [ ] **Step 2: Run the full H5 E2E suite**

```bash
npx playwright test tests/e2e/h5.spec.ts
```

Expected: all H5 Playwright tests PASS.

- [ ] **Step 3: Build the H5 application**

```bash
npm run build:h5
```

Expected: TypeScript and Vite exit 0.

- [ ] **Step 4: Capture and inspect phone screenshots**

Add a temporary or permanent Playwright screenshot step to the upload flow after quick mode renders and again after switching to align mode:

```ts
await page.setViewportSize({ width: 414, height: 940 });
await page.screenshot({ path: 'test-results/h5-split-quick.png', fullPage: true });
await alignGridTab.click();
await page.screenshot({ path: 'test-results/h5-split-align.png', fullPage: true });
```

Run that test and compare `test-results/h5-split-quick.png` against Figma node `14:628` and `test-results/h5-split-align.png` against node `16:2086`, checking header text, preview proportion, segmented-control spacing, full-width quick controller, aligned nudge cross, button sizes, pure theme blue, and bottom anchoring. Remove temporary screenshot-only code after inspection unless the existing visual-regression section is extended deliberately.

- [ ] **Step 5: Review the final diff**

```bash
git diff --check
git status --short
git diff -- apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
sed -n '1,240p' apps/h5/src/splitConfig.ts
sed -n '1,240p' apps/h5/src/splitConfig.test.ts
```

Expected: no whitespace errors; only scoped H5/test changes, the two reviewed split-config files, and pre-existing user changes are present.
