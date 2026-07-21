# H5 Mobile Grid Alignment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the H5 “对格子” screen to match the supplied mobile reference, including the compact step header, checkerboard stage, 36px ring handles with 48px touch areas, and two-column mobile controls.

**Architecture:** Keep the existing alignment state, canvas renderer, and import pipeline in `H5App.tsx`. Add an alignment-specific presentation branch and class names, keep quick split on its existing presentation, and express the visual system in `styles.css`. Lock the new behavior and mobile geometry through Playwright before changing production code.

**Tech Stack:** React 19, TypeScript, CSS, `react-zoom-pan-pinch`, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-13-h5-mobile-grid-alignment-design.md`

**Working-tree note:** Continue in the existing working tree because `H5App.tsx`, `styles.css`, and `h5.spec.ts` already contain relevant uncommitted alignment work. Preserve those changes and avoid unrelated files.

---

## Chunk 1: H5 Alignment Redesign

### Task 1: Add failing mobile layout and interaction contracts

**Files:**
- Modify: `tests/e2e/h5.spec.ts:217-259`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Replace obsolete alignment selectors with the desired accessible structure**

Extend the existing `aligns the split grid to an existing pixel drawing before import` test immediately after clicking “对格子”:

```ts
await expect(page.locator('.split-page')).toHaveClass(/split-page--align/);
await expect(page.getByRole('button', { name: '返回快速分割' })).toBeVisible();
await expect(page.getByRole('button', { name: '确认对齐' })).toBeVisible();
await expect(page.locator('.split-align-steps')).toContainText('2');
await expect(page.locator('.split-align-stage')).toBeVisible();
await expect(page.locator('.split-align-status')).toContainText(/px · 100%/);
await expect(page.locator('.split-align-hint')).toContainText('请使用九宫格将网格与图纸格子对齐');
await expect(page.locator('.split-align-controls')).toBeVisible();
await expect(page.locator('.split-nudge-center')).toContainText(/X \d+\.\d/);
await expect(page.locator('.split-nudge-center')).toContainText(/Y \d+\.\d/);
await expect(page.locator('.split-align-help')).toHaveText(/调整网格线间距\s*使其与图纸格线对齐/);
```

Remove expectations that require `.split-align-readout`, `.split-info-value`, or a visible mode switch while alignment mode is active. Read grid dimensions from data attributes on `.split-align-status`:

```ts
async function readAlignmentGridSize(page: import('@playwright/test').Page) {
  return page.locator('.split-align-status').evaluate((node) => ({
    cols: Number((node as HTMLElement).dataset.gridCols),
    rows: Number((node as HTMLElement).dataset.gridRows),
  }));
}
```

Replace both `gridSizeFromText(await page.locator('.split-info-value').innerText())` calls in the alignment test with `readAlignmentGridSize(page)`.

- [ ] **Step 2: Add geometry assertions for the B handle treatment**

Add a helper inside the test that measures both the 48px button and 36px inner ring:

```ts
for (const name of ['按住移动网格', '按住缩放网格']) {
  const button = page.getByLabel(name);
  const hitBox = await button.boundingBox();
  const ringBox = await button.locator('.split-grid-handle-ring').boundingBox();
  expect(hitBox).not.toBeNull();
  expect(ringBox).not.toBeNull();
  expect(hitBox!.width).toBeGreaterThanOrEqual(48);
  expect(hitBox!.height).toBeGreaterThanOrEqual(48);
  expect(ringBox!.width).toBeGreaterThanOrEqual(34);
  expect(ringBox!.width).toBeLessThanOrEqual(38);
  expect(ringBox!.height).toBeGreaterThanOrEqual(34);
  expect(ringBox!.height).toBeLessThanOrEqual(38);
}

const moveLabel = page.getByLabel('按住移动网格').locator('.split-grid-handle-label');
const scaleLabel = page.getByLabel('按住缩放网格').locator('.split-grid-handle-label');
const [moveButtonBox, moveLabelBox, scaleButtonBox, scaleLabelBox] = await Promise.all([
  page.getByLabel('按住移动网格').boundingBox(),
  moveLabel.boundingBox(),
  page.getByLabel('按住缩放网格').boundingBox(),
  scaleLabel.boundingBox(),
]);
expect(moveLabelBox!.x).toBeLessThan(moveButtonBox!.x + moveButtonBox!.width / 2);
expect(scaleLabelBox!.x).toBeGreaterThan(scaleButtonBox!.x + scaleButtonBox!.width / 2);
expect(moveButtonBox!.x - (moveLabelBox!.x + moveLabelBox!.width)).toBeLessThanOrEqual(4);
expect(scaleLabelBox!.x - (scaleButtonBox!.x + scaleButtonBox!.width)).toBeLessThanOrEqual(4);
```

- [ ] **Step 3: Add mobile containment, navigation, and transform assertions**

Assert alignment uses a fixed transform and returns to quick split without navigating home:

```ts
await page.getByRole('button', { name: '右移网格' }).click();
await expect(page.locator('.split-nudge-center')).not.toContainText('X 0.0');
const retainedStatus = await page.locator('.split-align-status').innerText();
const retainedOffsets = await page.locator('.split-nudge-center').innerText();
await expect(page.locator('.split-image-zoom-content')).toHaveCSS('transform', /matrix\(1, 0, 0, 1/);
await page.getByRole('button', { name: '返回快速分割' }).click();
await expect(page.getByRole('heading', { name: '分割' })).toBeVisible();
await expect(page.getByRole('button', { name: '对格子' })).toBeVisible();
await page.getByRole('button', { name: '对格子' }).click();
await expect(page.locator('.split-align-status')).toHaveText(retainedStatus);
await expect(page.locator('.split-nudge-center')).toHaveText(retainedOffsets);

for (const viewport of [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  await page.setViewportSize(viewport);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow, JSON.stringify(viewport)).toBe(false);
}
```

At 320×720, require actual internal overflow and scrollability, then restore 390×844 before drag assertions:

```ts
const shortScreenScroll = await page.locator('.split-align-controls-scroll').evaluate((node) => {
  const element = node as HTMLElement;
  const overflowY = getComputedStyle(element).overflowY;
  const before = element.scrollTop;
  element.scrollTop = 24;
  return {
    overflowY,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    scrolled: element.scrollTop > before,
  };
});
expect(shortScreenScroll.overflowY).toBe('auto');
expect(shortScreenScroll.scrollHeight).toBeGreaterThan(shortScreenScroll.clientHeight);
expect(shortScreenScroll.scrolled).toBe(true);
await page.setViewportSize({ width: 390, height: 844 });
```

- [ ] **Step 4: Add the opposing-axis scale regression**

After recording the status text, drag the scale handle with a dominant positive horizontal delta and a smaller negative vertical delta:

```ts
const scaleBefore = await page.locator('.split-align-status').innerText();
const scaleBox = await page.getByLabel('按住缩放网格').boundingBox();
await page.mouse.move(scaleBox!.x + 24, scaleBox!.y + 24);
await page.mouse.down();
await page.mouse.move(scaleBox!.x + 84, scaleBox!.y - 6, { steps: 5 });
await page.mouse.up();
await expect.poll(() => page.locator('.split-align-status').innerText()).not.toBe(scaleBefore);
```

- [ ] **Step 5: Add wide/tall containment and touch-drag regression coverage**

Add this helper near the other upload helpers. It creates a real PNG in the browser, then uploads it as a Playwright buffer:

```ts
async function uploadGeneratedPng(page: import('@playwright/test').Page, width: number, height: number) {
  const dataUrl = await page.evaluate(({ width: w, height: h }) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ff5b12';
    context.fillRect(0, 0, w, h);
    context.fillStyle = '#ffffff';
    context.fillRect(Math.floor(w / 4), Math.floor(h / 4), Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
    return canvas.toDataURL('image/png');
  }, { width, height });
  await page.locator('input[type="file"]').setInputFiles({
    name: `${width}x${height}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(dataUrl.split(',')[1], 'base64'),
  });
}
```

Add this parameterized test. It proves the drawing preserves its source aspect ratio, remains contained in the artboard, and keeps the full buttons and labels visible on the checkerboard:

```ts
for (const fixture of [
  { width: 640, height: 80 },
  { width: 80, height: 640 },
]) {
  test(`keeps alignment handles usable for ${fixture.width}x${fixture.height} drawings`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await uploadGeneratedPng(page, fixture.width, fixture.height);
    await page.getByRole('button', { name: '对格子' }).click();
    const artboardBox = await page.locator('.split-align-artboard').boundingBox();
    const frameBox = await page.locator('.split-image-frame').boundingBox();
    const stageBox = await page.locator('.split-align-stage').boundingBox();
    expect(artboardBox).not.toBeNull();
    expect(frameBox).not.toBeNull();
    expect(stageBox).not.toBeNull();
    expect(Math.abs(frameBox!.width / frameBox!.height - fixture.width / fixture.height)).toBeLessThan(0.03);
    expect(frameBox!.x).toBeGreaterThanOrEqual(artboardBox!.x);
    expect(frameBox!.x + frameBox!.width).toBeLessThanOrEqual(artboardBox!.x + artboardBox!.width);
    expect(frameBox!.y).toBeGreaterThanOrEqual(artboardBox!.y);
    expect(frameBox!.y + frameBox!.height).toBeLessThanOrEqual(artboardBox!.y + artboardBox!.height);
    for (const name of ['按住移动网格', '按住缩放网格']) {
      const button = page.getByLabel(name);
      const buttonBox = await button.boundingBox();
      const ringBox = await button.locator('.split-grid-handle-ring').boundingBox();
      const labelBox = await button.locator('.split-grid-handle-label').boundingBox();
      expect(buttonBox).not.toBeNull();
      expect(ringBox).not.toBeNull();
      expect(labelBox).not.toBeNull();
      const ringCenter = { x: ringBox!.x + ringBox!.width / 2, y: ringBox!.y + ringBox!.height / 2 };
      expect(ringCenter.x).toBeGreaterThanOrEqual(frameBox!.x);
      expect(ringCenter.x).toBeLessThanOrEqual(frameBox!.x + frameBox!.width);
      expect(ringCenter.y).toBeGreaterThanOrEqual(frameBox!.y);
      expect(ringCenter.y).toBeLessThanOrEqual(frameBox!.y + frameBox!.height);
      if (frameBox!.width >= 36) {
        expect(ringBox!.x).toBeGreaterThanOrEqual(frameBox!.x - 1);
        expect(ringBox!.x + ringBox!.width).toBeLessThanOrEqual(frameBox!.x + frameBox!.width + 1);
      } else {
        expect(Math.abs(ringCenter.x - (frameBox!.x + frameBox!.width / 2))).toBeLessThanOrEqual(1);
      }
      if (frameBox!.height >= 36) {
        expect(ringBox!.y).toBeGreaterThanOrEqual(frameBox!.y - 1);
        expect(ringBox!.y + ringBox!.height).toBeLessThanOrEqual(frameBox!.y + frameBox!.height + 1);
      } else {
        expect(Math.abs(ringCenter.y - (frameBox!.y + frameBox!.height / 2))).toBeLessThanOrEqual(1);
      }
      for (const box of [buttonBox!, labelBox!]) {
        expect(box.x).toBeGreaterThanOrEqual(stageBox!.x);
        expect(box.x + box.width).toBeLessThanOrEqual(stageBox!.x + stageBox!.width);
        expect(box.y).toBeGreaterThanOrEqual(stageBox!.y);
        expect(box.y + box.height).toBeLessThanOrEqual(stageBox!.y + stageBox!.height);
      }
    }
  });
}
```

In the main alignment test, use this exact CDP touch sequence on the move handle and assert the offset display changes:

```ts
const touchBefore = await page.locator('.split-nudge-center').innerText();
const touchBox = await page.getByLabel('按住移动网格').boundingBox();
const client = await page.context().newCDPSession(page);
await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
await client.send('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: touchBox!.x + 24, y: touchBox!.y + 24, id: 1 }],
});
await client.send('Input.dispatchTouchEvent', {
  type: 'touchMove',
  touchPoints: [{ x: touchBox!.x + 42, y: touchBox!.y + 36, id: 1 }],
});
await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await expect.poll(() => page.locator('.split-nudge-center').innerText()).not.toBe(touchBefore);
```

- [ ] **Step 6: Run the focused tests and verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts --project=h5-chromium --grep "aligns the split grid|keeps alignment handles usable"
```

Expected: FAIL because `.split-page--align`, `.split-align-steps`, `.split-grid-handle-ring`, and the new alignment controls do not exist yet.

- [ ] **Step 7: Commit the failing contract**

```bash
git add tests/e2e/h5.spec.ts
git commit -m "test: define h5 mobile alignment layout"
```

### Task 2: Implement the alignment-specific React structure and behavior

**Files:**
- Modify: `apps/h5/src/H5App.tsx:632-704`
- Modify: `apps/h5/src/H5App.tsx:1011-1147`
- Modify: `apps/h5/src/H5App.tsx:2015-2056`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Replace scale cancellation with dominant-axis signed movement**

Add a focused helper near the other local utilities:

```ts
function dominantSignedDelta(deltaX: number, deltaY: number): number {
  return Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : deltaY;
}
```

Use it in `continueGridHandleDrag`:

```ts
const scalarDelta = dominantSignedDelta(delta.x, delta.y);
updateAlignCellSize(splitLiveAlignCellSizeRef.current + scalarDelta, {
  deferred: true,
  silent: true,
});
```

- [ ] **Step 2: Branch the split header by mode**

Render the existing header for quick split. In align mode render:

```tsx
<header className="split-align-header">
  <button className="split-icon-btn" aria-label="返回快速分割" onClick={() => setSplitMode('quick')}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" /><path d="m12 5-7 7 7 7" />
    </svg>
  </button>
  <ol className="split-align-steps" aria-label="导入进度">
    <li className="done" aria-label="步骤 1 已完成">✓</li>
    <li className="active" aria-current="step">2</li>
    <li>3</li>
    <li>4</li>
  </ol>
  <button className="split-align-confirm" onClick={() => setScreen('split-preview')}>
    确认对齐 <span aria-hidden="true">→</span>
  </button>
</header>
```

Set the root class to `split-page split-page--align` only in alignment mode.

- [ ] **Step 3: Render an alignment-specific stage around the existing canvas**

Keep `SplitPreviewCanvas`, `TransformWrapper`, and the existing drag event handlers, but use `key={splitMode}` to reset the transform. In alignment mode set `minScale={1}`, `maxScale={1}`, `wheel={{ disabled: true }}`, `pinch={{ disabled: true }}`, and `panning={{ disabled: true }}`.

Wrap the visual area with these alignment-only elements:

```tsx
<div className="split-align-stage">
  <div className="split-align-artboard">
    <TransformWrapper
      key={splitMode}
      initialScale={1}
      minScale={1}
      maxScale={1}
      centerOnInit={true}
      doubleClick={{ disabled: true }}
      wheel={{ disabled: true }}
      pinch={{ disabled: true }}
      panning={{ disabled: true }}
    >
      {() => (
        <TransformComponent wrapperClass="split-image-zoom-wrapper" contentClass="split-image-zoom-content">
          <div
            className="split-image-frame"
            style={{
              '--align-image-ratio': uploadedSplitImage.crop.width / uploadedSplitImage.crop.height,
            } as React.CSSProperties & { '--align-image-ratio': number }}
          >
            <SplitPreviewCanvas
              imageData={uploadedSplitImage.imageData}
              crop={uploadedSplitImage.crop}
              rows={activeSplitRows}
              cols={activeSplitCols}
              alignment={alignedGrid}
            />
            <GridAlignmentHandles
              grid={alignedGrid}
              onMouseDown={handleGridHandleMouseDown}
              onTouchStart={handleGridHandleTouchStart}
              onTouchMove={handleGridHandleTouchMove}
              onTouchEnd={handleSplitMouseUp}
            />
          </div>
        </TransformComponent>
      )}
    </TransformWrapper>
  </div>
  <output
    className="split-align-status"
    data-grid-cols={alignedGrid.cols}
    data-grid-rows={alignedGrid.rows}
  >
    {alignedGrid.cellSize.toFixed(2)}px · 100%
  </output>
</div>
<div className="split-align-hint">
  <span aria-hidden="true" />
  请使用九宫格将网格与图纸格子对齐
</div>
```

Quick split retains the existing `.split-image-container` presentation.

- [ ] **Step 4: Replace the alignment control panel markup**

Keep the existing quick-split mode switch and slider in quick mode. Render this separate alignment panel in align mode:

```tsx
<div className="split-align-controls-scroll">
  <div className="split-align-controls" aria-label="对格子微调">
    <section className="split-align-nudge-group">
      <h2>微移</h2>
      <div className="split-nudge-pad" aria-label="移动网格">
        <span />
        <button aria-label="上移网格" onClick={() => nudgeAlignOffset(0, -1)}>↑</button>
        <span />
        <button aria-label="左移网格" onClick={() => nudgeAlignOffset(-1, 0)}>←</button>
        <span className="split-nudge-center">
          <span>X {alignedGrid.offsetX.toFixed(1)}</span>
          <span>Y {alignedGrid.offsetY.toFixed(1)}</span>
        </span>
        <button aria-label="右移网格" onClick={() => nudgeAlignOffset(1, 0)}>→</button>
        <span />
        <button aria-label="下移网格" onClick={() => nudgeAlignOffset(0, 1)}>↓</button>
        <span />
      </div>
    </section>
    <section className="split-align-size-group">
      <h2>调整格子大小</h2>
      <div className="split-cell-actions" aria-label="缩放网格">
        <button aria-label="减小格距" onClick={() => updateAlignCellSize(alignCellSize - 1)}>−</button>
        <output className="split-cell-size-value">
          <strong>{alignedGrid.cellSize.toFixed(2)}</strong>
          <span>格/PX</span>
        </output>
        <button aria-label="增大格距" onClick={() => updateAlignCellSize(alignCellSize + 1)}>＋</button>
      </div>
      <p className="split-align-help">调整网格线间距<br />使其与图纸格线对齐</p>
    </section>
  </div>
</div>
```

Do not render the obsolete alignment readout, reset button, or mode switch inside this branch.

- [ ] **Step 5: Give each handle separate hit-area and ring elements**

Update the anchor multipliers and compute CSS pixel-aware positions. `min(18px, 50%)` and `max(calc(100% - 18px), 50%)` collapse to the midpoint when a frame dimension is narrower than the 36px ring:

```ts
const handleAxisPosition = (value: number, max: number) => {
  const percent = (value / Math.max(1, max)) * 100;
  return `clamp(min(18px, 50%), ${percent}%, max(calc(100% - 18px), 50%))`;
};
const moveX = handleAxisPosition(grid.offsetX + grid.cellSize * 4, cropWidth);
const moveY = handleAxisPosition(grid.offsetY + grid.cellSize * 5, cropHeight);
const scaleX = handleAxisPosition(grid.offsetX + grid.cellSize * 9, cropWidth);
const scaleY = handleAxisPosition(grid.offsetY + grid.cellSize * 10, cropHeight);
```

```tsx
<button
  key={handle.id}
  type="button"
  aria-label={handle.label}
  className={`split-grid-handle ${handle.className}`}
  style={handle.style}
  onMouseDown={(event) => onMouseDown(handle.id, event)}
  onTouchStart={(event) => onTouchStart(handle.id, event)}
  onTouchMove={onTouchMove}
  onTouchEnd={onTouchEnd}
  onTouchCancel={onTouchEnd}
>
  <span className="split-grid-handle-label">{handle.text}</span>
  <span className="split-grid-handle-ring" aria-hidden="true" />
</button>
```

Keep the button as the 48px event target and the inner ring as the 36px visual.

- [ ] **Step 6: Run the focused test to confirm remaining failures are styling-only**

Run the focused Playwright command from Task 1.

Expected: markup, navigation, and dominant-axis assertions pass; geometry/style assertions may still fail until Task 3.

### Task 3: Implement reference-like mobile styling

**Files:**
- Modify: `apps/h5/src/styles.css:2103-2550`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Add alignment page tokens and header styling**

Add alignment-scoped custom properties and styles under `.split-page--align`:

```css
.split-page--align {
  --align-blue: #0877cc;
  --align-grid: rgba(27, 137, 207, 0.72);
  --align-stage: #181a1c;
  background: #fff;
}

.split-align-header {
  min-height: max(64px, calc(56px + env(safe-area-inset-top)));
  padding: env(safe-area-inset-top) 14px 0;
  display: grid;
  grid-template-columns: 52px minmax(120px, 1fr) auto;
  align-items: center;
  border-bottom: 1px solid #e7e9eb;
  background: #fff;
}
```

Style `.split-align-steps` as four compact circles: 28px for completed/active, muted 24px circles for future steps. Style `.split-align-confirm` as a blue pill with a 44px minimum height.

- [ ] **Step 2: Style the checkerboard stage, frame, status, and hint**

Use CSS gradients for the checkerboard rather than adding an image asset:

```css
.split-align-stage {
  position: relative;
  min-height: 0;
  padding: 28px 20px 22px;
  background-color: var(--align-stage);
  background-image:
    linear-gradient(45deg, rgba(255,255,255,.025) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255,255,255,.025) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255,255,255,.025) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.025) 75%);
  background-size: 24px 24px;
  background-position: 0 0, 0 12px, 12px -12px, -12px 0;
}

.split-align-artboard {
  container-type: size;
  width: 100%;
  height: clamp(220px, 46svh, 430px);
  display: grid;
  place-items: center;
  overflow: visible;
}

.split-page--align .split-image-frame {
  width: min(100cqw, calc(100cqh * var(--align-image-ratio)));
  max-width: none;
  max-height: none;
  aspect-ratio: var(--align-image-ratio);
  border-radius: 0;
  box-shadow: none;
  overflow: visible;
}
```

Set `--align-image-ratio` on `.split-image-frame` from `uploadedSplitImage.crop.width / uploadedSplitImage.crop.height` using a typed `React.CSSProperties & { '--align-image-ratio': number }` style object. Container query units make the frame choose the smaller of the width-constrained and height-constrained sizes, so wide and tall drawings remain undistorted. Keep the canvas itself clipped to its rectangular bounds. Position `.split-align-status` at bottom-right as a dark pill and `.split-align-hint` as a 44px white instruction row with a blue dot. Give `.split-align-stage` enough horizontal padding for both attached labels to remain fully within its bounds.

- [ ] **Step 3: Style B handles**

```css
.split-page--align .split-grid-handle {
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.split-grid-handle-ring {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 36px;
  height: 36px;
  border: 2px solid rgba(102, 108, 114, .92);
  border-radius: 50%;
  background: rgba(255, 255, 255, .12);
  box-shadow: 0 0 0 4px rgba(16, 133, 213, .78), 0 4px 12px rgba(0,0,0,.22);
  transform: translate(-50%, -50%);
}
```

Draw the crosshair on `.split-grid-handle-ring::before/::after`. Attach the move label with `right: calc(50% + 14px)` and the scale label with `left: calc(50% + 14px)`; use the same blue, small type, and minimal shadow as the reference. Ensure the artboard and frame do not clip labels or hit areas.

- [ ] **Step 4: Style the two-column controls for 320–430px widths**

Use an internally scrollable white region and a balanced two-column grid:

```css
.split-align-controls-scroll {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding-bottom: env(safe-area-inset-bottom);
}

.split-align-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  background: #fff;
}
```

Give the left column a subtle right divider. Use 48–52px rounded-square arrow and plus/minus surfaces, 44px minimum action sizes, a two-line numeric center, and muted 12px helper text. At widths below 350px reduce gaps and visual button size while preserving 44px hit targets. Do not stack the columns or introduce horizontal scrolling.

- [ ] **Step 5: Run focused Playwright and iterate only on failing contracts**

Run the focused command from Task 1.

Expected: PASS for the alignment test, including 34–38px ring geometry, 48px hit targets, attached labels, navigation, opposing-axis drag, and all three mobile widths.

- [ ] **Step 6: Commit the implementation**

```bash
git add apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
git commit -m "feat: match h5 alignment ui to mobile reference"
```

### Task 4: Full verification and mobile screenshot

**Files:**
- Verify: `apps/h5/src/H5App.tsx`
- Verify: `apps/h5/src/styles.css`
- Verify: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Run the complete H5 E2E project**

```bash
npx playwright test --project=h5-chromium
```

Expected: all H5 Playwright tests pass with zero failures.

- [ ] **Step 2: Run the H5 production build**

```bash
npm run build:h5
```

Expected: TypeScript and Vite exit with code 0 and no compile errors.

- [ ] **Step 3: Capture a fresh 390×844 alignment screenshot**

Start the H5 server in a persistent terminal:

```bash
npm run dev:h5 -- --host 127.0.0.1 --port 5174
```

Expected: Vite prints `Local: http://127.0.0.1:5174/`.

Then run this exact screenshot command in a second terminal:

```bash
node -e "import('playwright').then(async ({ chromium }) => { const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await page.goto('http://127.0.0.1:5174/'); await page.locator('input[type=file]').setInputFiles('image.png'); await page.getByRole('button', { name: '对格子' }).click(); await page.screenshot({ path: '/private/tmp/qiaoqiaole-h5-align-final.png', fullPage: true }); await browser.close(); })"
```

Expected: exit code 0 and `/private/tmp/qiaoqiaole-h5-align-final.png` exists.

Open that file with the image viewer and inspect it against `image copy.png`, focusing on:

- compact step header and blue confirmation action;
- dark checkerboard stage without a white rounded frame;
- 36px ring controls with left/right attached labels;
- bottom-right spacing/status pill;
- white instruction row;
- two-column controls that fit without horizontal clipping.

Expected: measurable bounds from the spec are met. Antialiasing and the different uploaded drawing content are not treated as failures.

- [ ] **Step 4: Inspect the final diff for scope and accidental changes**

```bash
git diff --check
git status --short
git diff -- apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
```

Expected: no whitespace errors; only the intended H5/test files and pre-existing user files appear.
