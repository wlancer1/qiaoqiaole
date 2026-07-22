# Suppress Paint Status Popups Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the H5 canvas free of floating status messages while users paint or erase, without removing feedback for other operations.

**Architecture:** Preserve the shared status renderer and suppress brush/eraser feedback at the interaction source. Clear any pre-existing transient status when a paint stroke begins, and omit status assignments from tap/no-op and completed-stroke paths while leaving mutations and history untouched.

**Tech Stack:** React 19, TypeScript, Playwright

**Specification:** `docs/superpowers/specs/2026-07-22-suppress-paint-status-design.md`

---

## File Structure

- Modify `tests/e2e/h5.spec.ts`: lock quiet feedback behavior for the DOM grid and imported-image canvas while retaining fill feedback.
- Modify `apps/h5/src/H5App.tsx`: clear old status when painting starts and stop publishing brush/eraser statuses.

No new production module is warranted because both canvas implementations already share `beginPaintStroke`, `endPaintStroke`, and `handleCellTap` in `H5App.tsx`.

## Chunk 1: Quiet Paint Feedback

### Task 1: Add failing H5 interaction coverage

**Files:**
- Modify: `tests/e2e/h5.spec.ts:109-255`
- Modify: `tests/e2e/h5.spec.ts:759-833`

- [ ] **Step 1: Assert imported-image painting clears an existing status and stays quiet**

After the imported canvas assertion that `已导入画布` is visible, select the brush and perform a pointer drag on `.h5-image-canvas`. Assert `.canvas-status` has count zero after pointer down/up. Then switch to eraser and repeat at the same canvas coordinates, again asserting no status. This path proves the image canvas uses quiet brush and eraser feedback.

- [ ] **Step 2: Assert grid painting, erasing, and no-op interactions stay quiet**

In `edits a preset H5 grid canvas with brush, eraser, fill, and bottom palette`:

```ts
await page.getByRole('button', { name: '选择色号 A7' }).click();
await expect(page.locator('.canvas-status')).toContainText('已选择色号 A7');
await page.locator('.h5-canvas-cell').nth(300).click();
await expect(page.locator('.canvas-status')).toHaveCount(0);

// Repaint the A7 cell (no-op) and keep the canvas quiet.
await page.locator('.h5-canvas-cell').nth(300).click();
await expect(page.locator('.canvas-status')).toHaveCount(0);
```

After brush drag, eraser drag, successful eraser tap, and no-op eraser tap, assert `.canvas-status` has count zero. Keep the existing `已填充` assertion to prove non-paint status feedback remains available. Replace the final assertion that expects `已绘制 ... M15` with an assertion that the target cell changed and `.canvas-status` is absent.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "uploads from the H5 home page|edits a preset H5 grid canvas"
```

Expected: FAIL because brush/eraser paths still render `已绘制`, `已擦除`, or no-op status messages, and completed drag strokes still publish status.

- [ ] **Step 4: Commit the failing test**

```bash
git add tests/e2e/h5.spec.ts
git commit -m "test: require quiet H5 painting feedback"
```

### Task 2: Suppress brush and eraser status messages

**Files:**
- Modify: `apps/h5/src/H5App.tsx:988-1040`
- Modify: `apps/h5/src/H5App.tsx:1089-1127`

- [ ] **Step 1: Clear any existing status when a stroke begins**

In `beginPaintStroke`, after confirming the active tool is `brush` or `eraser`, clear the transient message before setting up the stroke:

```ts
if (tool !== 'brush' && tool !== 'eraser') return false;
setStatus('');
```

- [ ] **Step 2: Stop completed drag strokes from publishing statuses**

In `endPaintStroke`, retain the history and future updates but remove the brush/eraser `setStatus` call:

```ts
if (stroke.changedCount > 0) {
  setHistory((items) => [...items.slice(-24), stroke.baseCells]);
  setFuture([]);
}
```

- [ ] **Step 3: Stop tap and no-op brush/eraser paths from publishing statuses**

In `handleCellTap`, leave eyedropper and fill branches unchanged. Change the eraser branch to return silently for an empty cell and commit without `nextStatus` for a non-empty cell. Change the default brush branch to return silently for an already-matching cell and commit without `nextStatus` otherwise:

```ts
if (tool === 'eraser') {
  if (cell.transparent) return;
  commitCells(
    cells.map((item) => (item.x === cell.x && item.y === cell.y
      ? { ...item, color: EMPTY_COLOR, transparent: true }
      : item)),
  );
  return;
}

// Keep the fill branch unchanged.

if (!cell.transparent && cell.color.toLowerCase() === selectedColor.toLowerCase()) return;
commitCells(replaceCell(cells, cell.x, cell.y, selectedColor));
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "uploads from the H5 home page|edits a preset H5 grid canvas"
```

Expected: both focused tests PASS.

- [ ] **Step 5: Run type/build and H5 regression verification**

Run:

```bash
npm run build:h5
npx playwright test tests/e2e/h5.spec.ts
```

Expected: build succeeds and the H5 Playwright suite passes.

- [ ] **Step 6: Review the diff for scope and whitespace issues**

Run:

```bash
git diff --check
git diff -- apps/h5/src/H5App.tsx tests/e2e/h5.spec.ts
```

Expected: no whitespace errors; production changes only affect brush/eraser status publishing and tests only add the specified coverage.

- [ ] **Step 7: Commit the implementation**

```bash
git add apps/h5/src/H5App.tsx tests/e2e/h5.spec.ts
git commit -m "fix: keep H5 canvas quiet while painting"
```
