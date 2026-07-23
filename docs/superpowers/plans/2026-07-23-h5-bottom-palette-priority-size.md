# H5 Bottom Palette Priority and Compact Size Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Order the H5 bottom palette by colors used in the current drawing and reduce bottom cards and filter control to 44 × 44px.

**Architecture:** Refactor the existing H5 palette helper so usage ordering and query-only filtering are independently reusable. Compute one full prioritized list from cells, render the bottom strip from it, and filter that ordered list for the modal without another cell scan. Keep sizing and horizontal scroll behavior in the existing bottom-palette CSS.

**Tech Stack:** TypeScript, React 19, CSS flexbox, Vitest, Playwright

**Specification:** `docs/superpowers/specs/2026-07-23-h5-bottom-palette-priority-size-design.md`

---

## File Structure

- Modify `apps/h5/src/palette.ts`: add query-only filtering and compose existing behavior from it.
- Modify `apps/h5/src/palette.test.ts`: prove query-only filtering preserves the supplied priority order.
- Modify `apps/h5/src/H5App.tsx`: derive one prioritized list, reuse it for the bottom strip and modal filter.
- Modify `apps/h5/src/styles.css`: apply fixed 44px controls across base and responsive branches.
- Modify `tests/e2e/h5.spec.ts`: verify live bottom ordering, modal parity, 44px geometry at three widths, and contained horizontal scroll.

The three H5/E2E files are already heavily modified. Before editing, capture their complete diff in the execution session. Do not stage or commit mixed implementation files; compare final feature hunks against that baseline.

## Chunk 1: Prioritized Compact Bottom Palette

### Task 1: Extract query-only palette filtering

**Files:**
- Modify: `apps/h5/src/palette.test.ts`
- Modify: `apps/h5/src/palette.ts`

- [ ] **Step 1: Capture the dirty-file baseline**

Run and retain output before edits:

```bash
git status --short
git diff -- apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
```

- [ ] **Step 2: Add the failing query-only unit test**

Import `filterPaletteByQuery` beside the existing helper and add:

```ts
it('filters an already prioritized list without changing its order', () => {
  const prioritized = [palette[2], palette[0], palette[3], palette[1]];
  expect(filterPaletteByQuery(prioritized, 'b').map(({ code }) => code))
    .toEqual(['B1', 'B2']);
  expect(filterPaletteByQuery(prioritized, '#AA').map(({ code }) => code))
    .toEqual(['A1']);
  expect(filterPaletteByQuery(prioritized, '').map(({ code }) => code))
    .toEqual(['B1', 'A1', 'B2', 'A2']);
});
```

- [ ] **Step 3: Run the focused unit test and verify RED**

Run:

```bash
npx vitest run --config vitest.config.ts apps/h5/src/palette.test.ts
```

Expected: FAIL because `filterPaletteByQuery` is not exported.

- [ ] **Step 4: Implement the query-only helper and refactor composition**

Add to `palette.ts`:

```ts
export function filterPaletteByQuery(
  palette: readonly PaletteColor[],
  rawQuery: string,
): PaletteColor[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [...palette];
  return palette.filter((color) =>
    color.code.toLowerCase().includes(query)
    || color.hex.toLowerCase().includes(query));
}
```

Change `filterPaletteByUsage` to order the full decorated palette first, map it back to colors, and then return `filterPaletteByQuery(ordered, rawQuery)`. Do not change count, normalization, tie, or transparency semantics.

- [ ] **Step 5: Run unit verification and diff check**

Run:

```bash
npx vitest run --config vitest.config.ts apps/h5/src/palette.test.ts
git diff --check
```

Expected: `6 passed`; diff check exits 0.

### Task 2: Integrate one prioritized list into bottom strip and modal

**Files:**
- Modify: `tests/e2e/h5.spec.ts`
- Modify: `apps/h5/src/H5App.tsx:17,289-292,1632-1647`

- [ ] **Step 1: Add the failing live-order E2E**

Add this independent test before the existing palette priority test:

```ts
test('prioritizes drawing colors in the bottom palette and updates after undo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);

  const cells = page.locator('.h5-canvas-cell');
  const strip = page.locator('.palette-strip');
  const bottomCodes = () => strip.locator('.palette-code-label').allTextContents();

  await page.getByRole('button', { name: '选择色号 A7', exact: true }).click();
  for (const index of [10, 11, 12]) await cells.nth(index).click();

  await page.getByRole('button', { name: '筛选色卡' }).click();
  let dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  await dialog.getByRole('searchbox', { name: '搜索色号' }).fill('M15');
  await dialog.getByRole('button', { name: '选择色号 M15', exact: true }).click();
  await cells.nth(20).click();

  await expect.poll(async () => (await bottomCodes()).slice(0, 2)).toEqual(['A7', 'M15']);
  await expect(strip.getByRole('button', { name: '选择色号 C8', exact: true })).toHaveCount(1);

  await page.getByRole('button', { name: '筛选色卡' }).click();
  dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  const modalCodes = await dialog.locator('.palette-search-option strong').allTextContents();
  expect(modalCodes.slice(0, 2)).toEqual(['A7', 'M15']);
  await dialog.getByRole('button', { name: '关闭筛选' }).click();

  await page.getByRole('button', { name: '撤销' }).click();
  await expect.poll(async () => (await bottomCodes()).slice(0, 2)).toEqual(['A7', 'A1']);
});
```

- [ ] **Step 2: Run the focused E2E and verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "prioritizes drawing colors in the bottom palette"
```

Expected: FAIL because the bottom strip remains canonical `A1, A2`.

- [ ] **Step 3: Wire one prioritized list into H5**

Import both helpers:

```ts
import { filterPaletteByQuery, filterPaletteByUsage } from './palette';
```

Replace the current modal-only memo with:

```ts
const prioritizedPaletteColors = useMemo(
  () => filterPaletteByUsage(MARD_221_COLORS, cells, ''),
  [cells],
);
const filteredPaletteColors = useMemo(
  () => filterPaletteByQuery(prioritizedPaletteColors, paletteQuery),
  [paletteQuery, prioritizedPaletteColors],
);
```

Change only the bottom-strip map source from `MARD_221_COLORS` to `prioritizedPaletteColors`.

- [ ] **Step 4: Run focused integration and build verification**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "prioritizes drawing colors in the bottom palette"
npm run build:h5
```

Expected: `1 passed`; build exits 0.

### Task 3: Apply 44px geometry and contained horizontal scrolling

**Files:**
- Modify: `tests/e2e/h5.spec.ts`
- Modify: `apps/h5/src/styles.css:2183-2245,2280-2298,3048-3058`

- [ ] **Step 1: Add the failing geometry and scroll E2E**

Add this independent test after the live-order test:

```ts
test('keeps compact bottom palette controls scrollable at H5 breakpoints', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);

  const strip = page.locator('.palette-strip');
  const firstCard = strip.locator('.palette-code').first();
  const filterButton = page.getByRole('button', { name: '筛选色卡' });
  const geometry = async () => ({
    card: await firstCard.boundingBox(),
    filter: await filterButton.boundingBox(),
  });

  for (const width of [600, 390, 350]) {
    await page.setViewportSize({ width, height: 844 });
    const current = await geometry();
    expect(current.card).not.toBeNull();
    expect(current.filter).not.toBeNull();
    expect(current.card!.width).toBeCloseTo(44, 0);
    expect(current.card!.height).toBeCloseTo(44, 0);
    expect(current.filter!.width).toBeCloseTo(44, 0);
    expect(current.filter!.height).toBeCloseTo(44, 0);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(firstCard.locator('.palette-code-label')).toHaveCSS('font-size', '12px');
  const indicator = firstCard.locator('.palette-active-indicator');
  const indicatorBox = await indicator.boundingBox();
  expect(indicatorBox).not.toBeNull();
  expect(indicatorBox!.width).toBeCloseTo(12, 0);
  expect(indicatorBox!.height).toBeCloseTo(3, 0);

  const initial = await strip.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    scrollLeft: node.scrollLeft,
    overscrollBehaviorX: getComputedStyle(node).overscrollBehaviorX,
  }));
  expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth);
  expect(initial.overscrollBehaviorX).toBe('contain');
  await strip.hover();
  await page.mouse.wheel(600, 0);
  await expect.poll(() => strip.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);

  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.dataset.horizontalScrollFixture = 'true';
    Object.assign(spacer.style, {
      position: 'absolute', left: '0', top: '0', width: '2000px', height: '1px', pointerEvents: 'none',
    });
    document.body.append(spacer);
    document.documentElement.style.overflowX = 'auto';
    window.scrollTo(300, 0);
  });
  const documentX = await page.evaluate(() => window.scrollX);
  expect(documentX).toBeGreaterThan(0);
  await strip.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  await strip.hover();
  await page.mouse.wheel(600, 0);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => window.scrollX)).toBe(documentX);
});
```

- [ ] **Step 2: Run the focused geometry E2E and verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "compact bottom palette controls"
```

Expected: FAIL because current cards are 52/48/46px and the strip lacks horizontal overscroll containment.

- [ ] **Step 3: Implement fixed compact sizing**

Update base declarations:

```css
.palette-strip {
  gap: 6px;
  overscroll-behavior-x: contain;
}

.palette-code {
  flex: 0 0 44px;
  min-width: 44px;
  height: 44px;
}

.palette-code-label { font-size: 12px; }

.palette-active-indicator {
  bottom: 4px;
  width: 12px;
  height: 3px;
}

.filter-button {
  width: 44px;
  height: 44px;
}
```

In `@media (max-width: 480px)`, remove the calculated six-card `flex-basis`/`min-width` and 48px heights, or replace them explicitly with 44px. In `@media (max-width: 360px)`, remove the 46px card-height override. Preserve safe-area padding, filter icon, footer grid, scrolling, and hidden scrollbars.

- [ ] **Step 4: Run focused geometry and bottom-order tests**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "bottom palette"
```

Expected: both new bottom-palette tests pass.

### Task 4: Full verification and safe handoff

**Files:**
- Verify all feature files only.

- [ ] **Step 1: Run regression gates**

Run:

```bash
npm test -- --run
npm run build:h5
npx playwright test tests/e2e/h5.spec.ts -g "palette"
npx playwright test tests/e2e/h5.spec.ts
git diff --check
```

Expected: unit tests, build, and all palette-focused E2Es pass. The complete H5 suite may retain the already-diagnosed unrelated assertion that expects brush active while dirty canvas-pan work initializes pan; report its exact status without changing tool behavior.

- [ ] **Step 2: Compare feature hunks to baseline and leave unstaged**

Run:

```bash
sed -n '1,240p' apps/h5/src/palette.ts
sed -n '1,300p' apps/h5/src/palette.test.ts
git diff -- apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
git status --short
```

Identify only the query helper, prioritized/filtered memos, bottom map source, compact sizing declarations, containment declaration, and focused tests as this feature's changes. Leave mixed files unstaged and uncommitted.
