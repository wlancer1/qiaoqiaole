# H5 Palette Modal Scroll and Used-Color Priority Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the H5 palette-search results scroll reliably on mobile and order matching cards with colors used in the current drawing first.

**Architecture:** Keep filtering and usage ordering in an H5-local pure helper and add H5 unit tests to the existing Vitest configuration. Lock React integration with a dedicated ordering E2E before wiring the helper, then separately reproduce and fix the CSS scroll-container defect with a layout-focused E2E.

**Tech Stack:** TypeScript, React 19, CSS Grid, Vitest, Playwright

**Specification:** `docs/superpowers/specs/2026-07-22-h5-palette-modal-scroll-used-colors-design.md`

---

## File Structure

- Create `apps/h5/src/palette.ts`: H5-local pure filtering and usage ordering.
- Create `apps/h5/src/palette.test.ts`: ordering, normalization, transparency, noncanonical, tie, and query tests.
- Modify `vitest.config.ts`: include H5 unit tests.
- Modify `apps/h5/src/H5App.tsx`: derive modal cards from the helper and current cells.
- Modify `apps/h5/src/styles.css`: bound the three-row modal panel and make only results scroll.
- Modify `tests/e2e/h5.spec.ts`: add isolated ordering/selection and layout/scroll tests.

`H5App.tsx`, `styles.css`, and `h5.spec.ts` already contain unrelated user changes. At the beginning of execution, record their complete `git diff` output in the session as the baseline. Do not stage or commit mixed production/test files. Before handoff, inspect newly created files with `sed` and compare the target-file diff against the recorded baseline so feature hunks are explicitly identified.

## Chunk 1: Ordering and Scrollable Modal

### Task 1: Build the H5-local ordering helper

**Files:**
- Create: `apps/h5/src/palette.test.ts`
- Create: `apps/h5/src/palette.ts`
- Modify: `vitest.config.ts:5`

- [ ] **Step 1: Record the dirty-file baseline**

Run and retain the output in the execution session:

```bash
git status --short
git diff -- apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
```

Do not edit or stage anything before this output is captured.

- [ ] **Step 2: Extend Vitest discovery and write the failing unit tests**

Add `apps/h5/src/**/*.test.ts` to `vitest.config.ts`'s `include` array. Create `apps/h5/src/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterPaletteByUsage } from './palette';

const palette = [
  { code: 'A1', hex: '#Aa11Bb' },
  { code: 'A2', hex: '#cc22dd' },
  { code: 'B1', hex: '#33Ee44' },
  { code: 'B2', hex: '#556677' },
];

const cell = (color: string, transparent = false, index = 0) => ({
  color,
  transparent,
  x: index,
  y: 0,
});

describe('filterPaletteByUsage', () => {
  it('preserves canonical order for a blank canvas', () => {
    expect(filterPaletteByUsage(palette, [], '').map(({ code }) => code))
      .toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('sorts used colors by count and uses canonical order for ties', () => {
    const cells = [
      cell('#33ee44', false, 0),
      cell('#CC22DD', false, 1),
      cell('#33EE44', false, 2),
      cell('#aa11bb', false, 3),
      cell('#cc22dd', false, 4),
      cell('#556677', false, 5),
    ];
    expect(filterPaletteByUsage(palette, cells, '').map(({ code }) => code))
      .toEqual(['A2', 'B1', 'A1', 'B2']);
  });

  it('normalizes alphabetic hex case and ignores transparent and noncanonical cells', () => {
    const cells = [
      cell('#AA11BB', false, 0),
      cell('#aa11bb', false, 1),
      cell('#33EE44', false, 2),
      cell('#33ee44', true, 3),
      cell('#CC22DD', true, 4),
      cell('#abcdef', false, 5),
    ];
    expect(filterPaletteByUsage(palette, cells, '').map(({ code }) => code))
      .toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  it('filters by code or alphabetic hex before applying usage priority', () => {
    const cells = [cell('#CC22DD', false, 0), cell('#cc22dd', false, 1)];
    expect(filterPaletteByUsage(palette, cells, 'a').map(({ code }) => code))
      .toEqual(['A2', 'A1']);
    expect(filterPaletteByUsage(palette, cells, '#AA').map(({ code }) => code))
      .toEqual(['A1']);
  });
});
```

- [ ] **Step 3: Run the unit test and verify RED**

Run:

```bash
npx vitest run --config vitest.config.ts apps/h5/src/palette.test.ts
```

Expected: FAIL because `./palette` does not exist.

- [ ] **Step 4: Implement the smallest pure helper**

Create `apps/h5/src/palette.ts`:

```ts
type PaletteColor = { code: string; hex: string };
type PaletteCell = { color: string; transparent?: boolean };

export function filterPaletteByUsage(
  palette: readonly PaletteColor[],
  cells: readonly PaletteCell[],
  rawQuery: string,
): PaletteColor[] {
  const query = rawQuery.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const cell of cells) {
    if (cell.transparent) continue;
    const normalized = cell.color.toLowerCase();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return palette
    .map((color, index) => ({ color, index, count: counts.get(color.hex.toLowerCase()) ?? 0 }))
    .filter(({ color }) => !query
      || color.code.toLowerCase().includes(query)
      || color.hex.toLowerCase().includes(query))
    .sort((left, right) => {
      if ((left.count > 0) !== (right.count > 0)) return left.count > 0 ? -1 : 1;
      if (left.count > 0 && left.count !== right.count) return right.count - left.count;
      return left.index - right.index;
    })
    .map(({ color }) => color);
}
```

- [ ] **Step 5: Run the unit test and verify GREEN**

Run the Step 3 command again.

Expected: `4 passed`.

### Task 2: Lock and integrate used-color priority

**Files:**
- Modify: `tests/e2e/h5.spec.ts`
- Modify: `apps/h5/src/H5App.tsx:1-15,288-292`

- [ ] **Step 1: Add the failing ordering/selection E2E**

Add this independent test before the PNG export test:

```ts
test('prioritizes colors used in the drawing inside palette search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);

  const cells = page.locator('.h5-canvas-cell');
  await page.getByRole('button', { name: '选择色号 A7', exact: true }).click();
  for (const index of [10, 11, 12]) await cells.nth(index).click();

  await page.getByRole('button', { name: '筛选色卡' }).click();
  let dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  await dialog.getByRole('searchbox', { name: '搜索色号' }).fill('M15');
  await dialog.getByRole('button', { name: '选择色号 M15', exact: true }).click();
  await cells.nth(20).click();

  await page.getByRole('button', { name: '筛选色卡' }).click();
  dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  const results = dialog.locator('.palette-search-results');
  const resultCodes = () => results.locator('.palette-search-option strong').allTextContents();
  await expect.poll(resultCodes).toHaveLength(221);
  expect((await resultCodes()).slice(0, 2)).toEqual(['A7', 'M15']);

  const search = dialog.getByRole('searchbox', { name: '搜索色号' });
  await search.fill('A');
  await expect.poll(resultCodes).toHaveLength(26);
  expect((await resultCodes())[0]).toBe('A7');

  await dialog.getByRole('button', { name: '关闭筛选' }).click();
  await page.getByRole('button', { name: '选择色号 A1', exact: true }).click();
  await page.getByRole('button', { name: '筛选色卡' }).click();
  dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  await dialog.getByRole('searchbox', { name: '搜索色号' }).fill('M15');
  await dialog.getByRole('button', { name: '选择色号 M15', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '筛选色卡面板' })).toHaveCount(0);
  await expect(page.locator('.canvas-status')).toContainText('已选择色号 M15');
  await cells.nth(21).click();
  await expect(cells.nth(21)).toHaveCSS('background-color', 'rgb(117, 125, 120)');

  await page.getByRole('button', { name: '筛选色卡' }).click();
  await expect(page.getByRole('searchbox', { name: '搜索色号' })).toHaveValue('');
});
```

- [ ] **Step 2: Run the ordering E2E and verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "prioritizes colors used"
```

Expected: FAIL because the first cards remain canonical `A1`, `A2` rather than `A7`, `M15`.

- [ ] **Step 3: Wire the helper into H5**

Import `filterPaletteByUsage` from `./palette` and replace `filteredPaletteColors` with:

```ts
const filteredPaletteColors = useMemo(
  () => filterPaletteByUsage(MARD_221_COLORS, cells, paletteQuery),
  [cells, paletteQuery],
);
```

Keep `usedColors` unchanged because the profile summary still uses it.

- [ ] **Step 4: Run ordering E2E and build verification**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "prioritizes colors used"
npm run build:h5
```

Expected: `1 passed`; build exits 0.

### Task 3: Reproduce and fix the modal scroll container

**Files:**
- Modify: `tests/e2e/h5.spec.ts`
- Modify: `apps/h5/src/styles.css:2318-2377`

- [ ] **Step 1: Add the failing layout/scroll E2E**

Add this independent test after the ordering test:

```ts
test('scrolls palette results without moving the canvas page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);
  await page.getByRole('button', { name: '筛选色卡' }).click();

  const dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  const panel = dialog.locator('.palette-search-panel');
  const header = dialog.locator('.palette-search-head');
  const search = dialog.getByRole('searchbox', { name: '搜索色号' });
  const results = dialog.locator('.palette-search-results');
  const scrollMetrics = () => results.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    scrollTop: node.scrollTop,
    overscrollBehaviorY: getComputedStyle(node).overscrollBehaviorY,
  }));

  const initial = await scrollMetrics();
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight);
  expect(initial.clientHeight).toBeGreaterThan(0);
  expect(initial.overscrollBehaviorY).toBe('contain');
  const headerBefore = await header.boundingBox();
  const searchBefore = await search.boundingBox();
  expect(headerBefore).not.toBeNull();
  expect(searchBefore).not.toBeNull();
  const documentScrollBefore = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));

  await results.hover();
  await page.mouse.wheel(0, 700);
  await expect.poll(async () => (await scrollMetrics()).scrollTop).toBeGreaterThan(0);
  expect(await header.boundingBox()).toEqual(headerBefore);
  expect(await search.boundingBox()).toEqual(searchBefore);
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(documentScrollBefore);

  await results.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await results.hover();
  await page.mouse.wheel(0, 700);
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(documentScrollBefore);

  const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
  const resultsRule = styles.match(/\.palette-search-results\s*\{([^}]*)\}/)?.[1] ?? '';
  expect(resultsRule).toContain('-webkit-overflow-scrolling: touch');

  await page.setViewportSize({ width: 390, height: 500 });
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(panelBox!.y).toBeGreaterThanOrEqual(0);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(viewportHeight);
  const shortMetrics = await scrollMetrics();
  expect(shortMetrics.clientHeight).toBeGreaterThan(0);
  expect(shortMetrics.scrollHeight).toBeGreaterThan(shortMetrics.clientHeight);
  await expect(header).toBeVisible();
  await expect(search).toBeVisible();
});
```

- [ ] **Step 2: Run the scroll E2E and verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "scrolls palette results"
```

Expected: FAIL at `scrollHeight > clientHeight` or the missing `overscroll-behavior-y`/iOS declaration because the results row currently expands to intrinsic height.

- [ ] **Step 3: Implement the bounded panel and scroll container**

Change only the relevant declarations:

```css
.palette-search-modal {
  padding: 18px 18px max(18px, env(safe-area-inset-bottom));
}

.palette-search-panel {
  grid-template-rows: auto auto minmax(0, 1fr);
  height: min(72svh, 620px);
  height: min(72dvh, 620px);
  max-height: calc(100dvh - 18px - max(18px, env(safe-area-inset-bottom)));
}

.palette-search-results {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}
```

Preserve the current panel width/padding/radius, four-column grid, hidden scrollbars, and card styles.

- [ ] **Step 4: Run the scroll E2E and verify GREEN**

Run the Step 2 command again.

Expected: `1 passed`.

### Task 4: Full verification and safe handoff

**Files:**
- Verify all files above; do not add new scope.

- [ ] **Step 1: Run complete regression gates**

Run:

```bash
npm test -- --run
npm run build:h5
npx playwright test tests/e2e/h5.spec.ts
git diff --check
```

Expected: all Vitest tests pass including four H5 palette tests; build succeeds; full H5 E2E passes; diff check exits 0.

- [ ] **Step 2: Inspect all feature files and compare mixed-file changes to baseline**

Run:

```bash
sed -n '1,240p' apps/h5/src/palette.ts
sed -n '1,280p' apps/h5/src/palette.test.ts
git diff -- vitest.config.ts apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
git status --short
```

Compare the three mixed H5/E2E diffs to the Step 1 baseline and identify only the new import/memo, palette-modal CSS, and two E2E test blocks. Leave all implementation files unstaged and uncommitted; this is the safe alternative to per-task commits in the already-dirty main worktree.
