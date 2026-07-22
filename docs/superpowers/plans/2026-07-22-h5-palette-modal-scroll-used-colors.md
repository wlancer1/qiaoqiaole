# H5 Palette Modal Scroll and Used-Color Priority Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the H5 palette-search results scroll reliably on mobile and order matching palette cards with currently used drawing colors first.

**Architecture:** Put deterministic palette filtering and usage ordering in a pure core-domain helper with unit coverage, then consume it from the H5 canvas. Fix the modal's grid sizing so the header/search remain fixed and the results row becomes the only scroll container; use Playwright for layout, wheel containment, short-screen behavior, ordering integration, search, and selection.

**Tech Stack:** TypeScript, React 19, CSS Grid, Vitest, Playwright

**Specification:** `docs/superpowers/specs/2026-07-22-h5-palette-modal-scroll-used-colors-design.md`

---

## File Structure

- Create `packages/core/src/domain/palette.ts`: pure filtering and used-color-priority ordering.
- Create `packages/core/src/domain/palette.test.ts`: deterministic unit coverage for normalization, transparent/noncanonical cells, counts, ties, and queries.
- Modify `packages/core/src/index.ts`: export the palette helper.
- Modify `apps/h5/src/H5App.tsx`: derive the modal list from the helper and current cells.
- Modify `apps/h5/src/styles.css`: define a bounded three-row panel and scrollable result grid.
- Modify `tests/e2e/h5.spec.ts`: verify ordering, real scroll behavior, short viewport layout, search, and selection.

The production H5 and E2E files already contain unrelated uncommitted user work. Do not stage or commit those mixed files. New core files may remain unstaged with the complete implementation so the user can review one coherent working tree.

## Chunk 1: Ordering and Scrollable Modal

### Task 1: Add and integrate deterministic palette ordering

**Files:**
- Create: `packages/core/src/domain/palette.test.ts`
- Create: `packages/core/src/domain/palette.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/h5/src/H5App.tsx:288-292`

- [ ] **Step 1: Write the failing unit tests**

Create `packages/core/src/domain/palette.test.ts` with a small canonical palette and cells that exercise all ordering rules:

```ts
import { describe, expect, it } from 'vitest';
import { filterPaletteByUsage } from './palette';

const palette = [
  { code: 'A1', hex: '#111111' },
  { code: 'A2', hex: '#222222' },
  { code: 'B1', hex: '#333333' },
  { code: 'B2', hex: '#444444' },
];

const cell = (color: string, transparent = false, index = 0) => ({
  x: index,
  y: 0,
  color,
  transparent,
});

describe('filterPaletteByUsage', () => {
  it('preserves canonical order for a blank canvas', () => {
    expect(filterPaletteByUsage(palette, [], '').map(({ code }) => code))
      .toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('sorts used colors by count and canonical order for ties', () => {
    const cells = [
      cell('#333333', false, 0),
      cell('#222222', false, 1),
      cell('#333333', false, 2),
      cell('#111111', false, 3),
      cell('#222222', false, 4),
      cell('#444444', false, 5),
    ];
    expect(filterPaletteByUsage(palette, cells, '').map(({ code }) => code))
      .toEqual(['A2', 'B1', 'A1', 'B2']);
  });

  it('normalizes hex case and ignores transparent and noncanonical cells', () => {
    const cells = [
      cell('#333333', false, 0),
      cell('#333333', true, 1),
      cell('#222222', true, 2),
      cell('#111111'.toUpperCase(), false, 3),
      cell('#abcdef', false, 4),
    ];
    expect(filterPaletteByUsage(palette, cells, '').map(({ code }) => code))
      .toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  it('filters by code or hex before applying usage priority', () => {
    const cells = [cell('#222222', false, 0), cell('#222222', false, 1)];
    expect(filterPaletteByUsage(palette, cells, 'a').map(({ code }) => code))
      .toEqual(['A2', 'A1']);
    expect(filterPaletteByUsage(palette, cells, '#11').map(({ code }) => code))
      .toEqual(['A1']);
  });
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```bash
npx vitest run --config vitest.config.ts packages/core/src/domain/palette.test.ts
```

Expected: FAIL because `./palette` does not exist.

- [ ] **Step 3: Implement the smallest pure helper**

Create `packages/core/src/domain/palette.ts`:

```ts
import type { BeadColor } from './mard221';
import type { Cell } from './types';

export function filterPaletteByUsage(
  palette: readonly BeadColor[],
  cells: readonly Cell[],
  rawQuery: string,
): BeadColor[] {
  const query = rawQuery.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const item of cells) {
    if (item.transparent) continue;
    const normalized = item.color.toLowerCase();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return palette
    .map((color, index) => ({ color, index, count: counts.get(color.hex.toLowerCase()) ?? 0 }))
    .filter(({ color }) => !query
      || color.code.toLowerCase().includes(query)
      || color.hex.toLowerCase().includes(query))
    .sort((left, right) => {
      const leftUsed = left.count > 0;
      const rightUsed = right.count > 0;
      if (leftUsed !== rightUsed) return leftUsed ? -1 : 1;
      if (leftUsed && left.count !== right.count) return right.count - left.count;
      return left.index - right.index;
    })
    .map(({ color }) => color);
}
```

Export it from `packages/core/src/index.ts`:

```ts
export * from './domain/palette';
```

- [ ] **Step 4: Run the unit test and verify GREEN**

Run the Step 2 command again.

Expected: `4 passed`.

- [ ] **Step 5: Integrate the helper into H5**

Import `filterPaletteByUsage` from `@qiaoqiaole/core` and replace the current `filteredPaletteColors` memo with:

```ts
const filteredPaletteColors = useMemo(
  () => filterPaletteByUsage(MARD_221_COLORS, cells, paletteQuery),
  [cells, paletteQuery],
);
```

Do not change the separate `usedColors` calculation because the home/profile summary still consumes it.

- [ ] **Step 6: Run unit and type verification**

Run:

```bash
npx vitest run --config vitest.config.ts packages/core/src/domain/palette.test.ts
npm run build:h5
```

Expected: `4 passed`; H5 build exits 0.

### Task 2: Make the modal scroll and verify integration

**Files:**
- Modify: `tests/e2e/h5.spec.ts:1111-1128`
- Modify: `apps/h5/src/styles.css:2318-2377`

- [ ] **Step 1: Add failing E2E ordering and scroll assertions**

Extend `edits a preset H5 grid canvas with brush, eraser, fill, and bottom palette` after the existing fill assertion. Use the existing A7-filled canvas, select M15 through the modal, paint one cell M15, then reopen the modal and assert:

```ts
const paletteDialog = page.getByRole('dialog', { name: '筛选色卡面板' });
const paletteResults = paletteDialog.locator('.palette-search-results');
const resultCodes = () => paletteResults.locator('.palette-search-option strong').allTextContents();

await expect.poll(resultCodes).toEqual(expect.arrayContaining(['A7', 'M15']));
expect((await resultCodes()).slice(0, 2)).toEqual(['A7', 'M15']);
```

For search priority, fill the search box with `A` and assert the first result is A7 even though A1 is canonical first. Clear the query before scroll checks.

Record the header/search bounds and document scroll position, hover the results, and send `page.mouse.wheel(0, 700)`. Assert `scrollTop` becomes positive, header/search remain visible and keep the same bounds, document scroll does not change, and computed `overscrollBehaviorY` is `contain`. Move the results to its bottom boundary, wheel again, and assert document scroll remains unchanged.

Read `apps/h5/src/styles.css` with the already-imported `fs` and `path` modules and assert the `.palette-search-results` rule contains `-webkit-overflow-scrolling: touch`.

Resize to `{ width: 390, height: 500 }` while the modal remains open. Assert the dialog/panel rectangle stays within `window.innerHeight`, the results `clientHeight` is positive, and `scrollHeight > clientHeight`. Restore `{ width: 390, height: 844 }`, choose M15 from a filtered result, and retain the existing assertion that painting applies `rgb(117, 125, 120)`.

- [ ] **Step 2: Run the focused E2E and verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "edits a preset H5 grid canvas"
```

Expected: FAIL before CSS implementation because `.palette-search-results` does not form a bounded scrolling row; ordering assertions pass after Task 1 integration.

- [ ] **Step 3: Implement the bounded panel and scroll container**

Update the modal styles:

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

Keep the existing panel width/padding/radius, four-column grid, hidden scrollbars, and card styles.

- [ ] **Step 4: Run focused E2E and verify GREEN**

Run the Step 2 command again.

Expected: `1 passed`.

- [ ] **Step 5: Run full regression verification**

Run:

```bash
npm test
npm run build:h5
npx playwright test tests/e2e/h5.spec.ts
git diff --check
```

Expected: all unit tests pass including the four new palette tests; H5 build succeeds; full H5 E2E suite passes; diff check exits 0.

- [ ] **Step 6: Inspect scope and leave mixed files unstaged**

Run:

```bash
git status --short
git diff -- packages/core/src/domain/palette.ts packages/core/src/domain/palette.test.ts packages/core/src/index.ts apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
```

Expected: feature changes match this plan. Do not stage or commit the production/test files because the H5 targets contain pre-existing user work.
