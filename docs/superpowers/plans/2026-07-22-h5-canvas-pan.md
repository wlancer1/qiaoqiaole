# H5 Canvas Pan Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working explicit hand-drag canvas movement tool in the H5 canvas without changing drawing semantics.

**Architecture:** Reuse the existing `pan` tool and `react-zoom-pan-pinch` transform owner. Configure one-pointer panning to be available only through the hand tool while preserving brush and eraser drag painting on the artwork.

**Tech Stack:** React, TypeScript, react-zoom-pan-pinch, Playwright.

---

## Chunk 1: Canvas Hand Drag

### File Structure

- Modify `apps/h5/src/H5App.tsx`: adjust the pan tool label, toolbar selected state, transform panning configuration, canvas stage state class, and canvas artwork classes.
- Modify `apps/h5/src/styles.css`: add pointer-device cursor feedback for the active hand tool.
- Modify `tests/e2e/h5.spec.ts`: add focused regression coverage for one-pointer hand drag and brush drag separation.

### Task 1: Add Hand-Drag Regression Coverage

**Files:**
- Modify: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Write the failing test**

Add assertions near the existing H5 grid canvas editing test:

```ts
const transformMatrix = async () =>
  page.locator('.react-transform-component').evaluate((node) => getComputedStyle(node).transform);

const dragStage = async (dx: number, dy: number) => {
  const box = await page.locator('.h5-canvas-grid').boundingBox();
  expect(box, 'grid box for pan drag').not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
};

const beforePanMatrix = await transformMatrix();
const panDragCells = [360, 361, 362];
for (const index of panDragCells) {
  await expect(page.locator('.h5-canvas-cell').nth(index), `pan precheck ${index}`).toHaveClass(/transparent/);
}

await page.getByRole('button', { name: '手抓移动工具' }).click();
await expect(page.getByRole('button', { name: '手抓移动工具' })).toHaveAttribute('aria-pressed', 'true');
await dragStage(48, 28);
await expect.poll(transformMatrix).not.toBe(beforePanMatrix);
for (const index of panDragCells) {
  await expect(page.locator('.h5-canvas-cell').nth(index), `pan leaves cell ${index}`).toHaveClass(/transparent/);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/h5.spec.ts -g "edits a preset H5 grid canvas"`

Expected: FAIL because the toolbar still exposes `拖拽工具` and no `aria-pressed` selected state exists.

### Task 2: Implement Existing Pan Tool Behavior

**Files:**
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/styles.css`

- [ ] **Step 1: Update toolbar semantics**

Change the pan tool label to `手抓移动工具` and add `aria-pressed={tool === item.tool}` to each canvas tool button.

- [ ] **Step 2: Configure transform panning**

Change the canvas editor `TransformWrapper` from:

```tsx
panning={{ disabled: tool !== 'pan' }}
```

to:

```tsx
panning={{ disabled: false, excluded: tool === 'pan' ? [] : ['canvas-artwork'] }}
pinch={{ disabled: false, allowPanning: true, excluded: [] }}
```

Add `canvas-artwork` to both drawing targets:

```tsx
className="h5-image-canvas canvas-artwork"
className="h5-canvas-grid canvas-artwork"
```

- [ ] **Step 3: Add cursor feedback**

Add `is-pan-tool` to `.canvas-stage` when the hand tool is active, then add pointer-only CSS:

```css
@media (any-pointer: fine) {
  .canvas-stage.is-pan-tool {
    cursor: grab;
  }

  .canvas-stage.is-pan-tool:active {
    cursor: grabbing;
  }
}
```

- [ ] **Step 4: Run the focused test**

Run: `npx playwright test tests/e2e/h5.spec.ts -g "edits a preset H5 grid canvas"`

Expected: PASS.

### Task 3: Verify Build and Status

**Files:**
- Verify only.

- [ ] **Step 1: Run H5 build**

Run: `npm run build:h5`

Expected: exit code 0.

- [ ] **Step 2: Review diff**

Run: `git diff -- apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts docs/superpowers/plans/2026-07-22-h5-canvas-pan.md`

Expected: only hand-drag implementation, focused test changes, and this plan.
