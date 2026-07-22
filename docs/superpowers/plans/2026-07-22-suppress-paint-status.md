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
- Modify: `tests/e2e/h5.spec.ts:791-864`

- [ ] **Step 1: Assert imported-image painting clears an existing status and stays quiet**

Keep the existing `已导入画布` and `paintedPixels === totalPixels` assertions in their current order. Immediately after the full-opacity `importedCanvas` assertion, add these helpers and interactions. They select a paint color different from the first source pixel, verify the selection status is initially visible, verify that the first brush interaction clears it, then verify tap and drag mutations for both tools:

```ts
const imageCanvas = page.locator('.h5-image-canvas');
const firstPixel = await imageCanvas.evaluate((node) => {
  const context = (node as HTMLCanvasElement).getContext('2d')!;
  return Array.from(context.getImageData(0, 0, 1, 1).data);
});
const brushColor = firstPixel[0] === 254 && firstPixel[1] === 139 && firstPixel[2] === 76
  ? { code: 'C8', rgba: [15, 84, 192, 255] }
  : { code: 'A7', rgba: [254, 139, 76, 255] };
await page.getByRole('button', { name: `选择色号 ${brushColor.code}`, exact: true }).click();
await expect(page.locator('.canvas-status')).toContainText(`已选择色号 ${brushColor.code}`);

const imageCellPoint = async (x: number, y: number) => {
  const box = await imageCanvas.boundingBox();
  expect(box).not.toBeNull();
  const size = await imageCanvas.evaluate((node) => ({
    cols: (node as HTMLCanvasElement).width,
    rows: (node as HTMLCanvasElement).height,
  }));
  return {
    x: box!.x + ((x + 0.5) / size.cols) * box!.width,
    y: box!.y + ((y + 0.5) / size.rows) * box!.height,
  };
};
const imagePixel = (x: number, y: number) => imageCanvas.evaluate((node, point) => {
  const context = (node as HTMLCanvasElement).getContext('2d')!;
  return Array.from(context.getImageData(point.x, point.y, 1, 1).data);
}, { x, y });

const brushTap = await imageCellPoint(0, 0);
await page.mouse.click(brushTap.x, brushTap.y);
expect(await imagePixel(0, 0)).toEqual(brushColor.rgba);
await expect(page.locator('.canvas-status')).toHaveCount(0);

const brushDragStart = await imageCellPoint(0, 1);
const brushDragEnd = await imageCellPoint(2, 1);
await page.mouse.move(brushDragStart.x, brushDragStart.y);
await page.mouse.down();
await page.mouse.move(brushDragEnd.x, brushDragEnd.y, { steps: 8 });
await page.mouse.up();
expect(await imagePixel(0, 1)).toEqual(brushColor.rgba);
expect(await imagePixel(2, 1)).toEqual(brushColor.rgba);
await expect(page.locator('.canvas-status')).toHaveCount(0);

await page.getByRole('button', { name: '橡皮工具' }).click();
await page.mouse.click(brushTap.x, brushTap.y);
expect((await imagePixel(0, 0))[3]).toBe(0);
await expect(page.locator('.canvas-status')).toHaveCount(0);

await page.mouse.move(brushDragStart.x, brushDragStart.y);
await page.mouse.down();
await page.mouse.move(brushDragEnd.x, brushDragEnd.y, { steps: 8 });
await page.mouse.up();
expect((await imagePixel(0, 1))[3]).toBe(0);
expect((await imagePixel(2, 1))[3]).toBe(0);
await expect(page.locator('.canvas-status')).toHaveCount(0);
```

- [ ] **Step 2: Assert grid painting, erasing, and no-op interactions stay quiet**

In `edits a preset H5 grid canvas with brush, eraser, fill, and bottom palette`, add the following assertions at the corresponding existing operations:

```ts
await page.getByRole('button', { name: '选择色号 A7' }).click();
await expect(page.locator('.canvas-status')).toContainText('已选择色号 A7');
await page.locator('.h5-canvas-cell').nth(300).click();
await expect(page.locator('.canvas-status')).toHaveCount(0);
await expect(page.locator('.h5-canvas-cell').nth(300)).not.toHaveClass(/transparent/);

// Repaint the A7 cell (no-op) and keep the canvas quiet.
await page.locator('.h5-canvas-cell').nth(300).click();
await expect(page.locator('.canvas-status')).toHaveCount(0);

await dragAcrossGridCells(dragCellIndexes);
await expect(page.locator('.canvas-status')).toHaveCount(0);

await page.getByRole('button', { name: '橡皮工具' }).click();
await dragAcrossGridCells(dragCellIndexes);
await expect(page.locator('.canvas-status')).toHaveCount(0);

const singleClickCell = page.locator('.h5-canvas-cell').nth(301);
// Keep the existing paint, undo, repaint, and mutation assertions.
await page.getByRole('button', { name: '橡皮工具' }).click();
await singleClickCell.click();
await expect(singleClickCell).toHaveClass(/transparent/);
await expect(page.locator('.canvas-status')).toHaveCount(0);

// Re-erase the empty cell (no-op) and keep the canvas quiet.
await singleClickCell.click();
await expect(page.locator('.canvas-status')).toHaveCount(0);

await page.getByRole('button', { name: '填充工具' }).click();
await page.locator('.h5-canvas-cell').nth(0).click();
await expect(page.locator('.canvas-status')).toContainText(/已填充/);

// After selecting M15 through the existing palette dialog:
await page.locator('.h5-canvas-cell').nth(301).click();
await expect(page.locator('.h5-canvas-cell').nth(301)).toHaveCSS('background-color', 'rgb(117, 125, 120)');
await expect(page.locator('.canvas-status')).toHaveCount(0);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts -g "uploads from the H5 home page|edits a preset H5 grid canvas"
```

Expected: both tests FAIL because brush/eraser paths still render `已绘制`, `已擦除`, or no-op status messages, and completed drag strokes still publish status.

- [ ] **Step 4: Preserve the failing-test diff without committing unrelated work**

Do not stage or commit `tests/e2e/h5.spec.ts`: it contains pre-existing uncommitted work that belongs to the user. Confirm the intended test hunks with `git diff -- tests/e2e/h5.spec.ts` and continue to Task 2 with the RED evidence recorded in the session.

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

Expected: Playwright reports `2 passed` (timing may vary).

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

- [ ] **Step 7: Leave mixed files unstaged for user review**

Do not stage or commit `apps/h5/src/H5App.tsx` or `tests/e2e/h5.spec.ts`: both contain substantial pre-existing uncommitted work. Report the exact feature hunks and verification results to the user, leaving all mixed-file changes unstaged.
