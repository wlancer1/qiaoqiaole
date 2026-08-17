# H5 Reference UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the H5 home, split setup, and split preview screens to closely match `image copy.png` while preserving all current image, grid, color-merge, and import behavior.

**Architecture:** Keep business state and gesture logic in `H5App`; add small presentational helpers for the upload hero, flow top bar, segmented controls, and threshold control. Define shared visual tokens in CSS, then migrate the three screens one at a time behind existing state and callbacks. Use Playwright assertions as the primary UI contract and retain the core color-domain tests for merge edge cases.

**Tech Stack:** React 19, TypeScript, CSS, Canvas 2D, react-zoom-pan-pinch, Vitest, Playwright.

**Design spec:** `docs/superpowers/specs/2026-07-28-h5-reference-ui-redesign-design.md`

**Reference image:** `image copy.png`

**Working-tree constraint:** The target files already contain uncommitted work that this redesign depends on. Before every commit, inspect `git diff` and stage only changes owned by the current task. If ownership cannot be isolated safely, do not commit overlapping user changes; record the verified task result and continue without a task commit.

---

## File Map

- Modify `apps/h5/src/H5App.tsx`
  - Keep all existing state, upload, Canvas, gestures, grid alignment, color merge, and import handlers.
  - Recompose the home, split, and split-preview JSX with those helpers.
- Create `apps/h5/src/H5FlowComponents.tsx`
  - Own `HomeUploadHero`, `FlowTopbar`, `SegmentedControl`, `ThresholdControl`, and `SplitBeadList` only.
  - Accept data and callbacks via props; own no business state.
- Create `apps/h5/src/H5FlowComponents.test.ts`
  - Use `react-dom/server` static rendering to verify disabled actions, segmented semantics, threshold boundaries, and the empty bead-list contract without test-only application routes.
- Modify `apps/h5/src/styles.css`
  - Add shared flow tokens.
  - Replace home, split setup, and split-preview visual rules with the approved reference-driven system.
  - Keep Canvas geometry selectors and grid handle positioning behavior intact.
- Modify `tests/e2e/h5.spec.ts`
  - Add visual-structure, accessibility, responsive-size, and flow assertions for all three screens.
  - Retain existing interaction coverage for upload, alignment, image pan/zoom, and import.
- Modify `packages/core/src/domain/grid.test.ts`
  - Add the no-common-color candidate edge case only; do not alter production merge logic unless the new test exposes a mismatch.

---

## Chunk 1: Contracts, Primitives, and Home

### Task 1: Lock the current behavior and add the merge edge-case contract

**Files:**
- Modify: `packages/core/src/domain/grid.test.ts`
- Test: `packages/core/src/domain/grid.test.ts`

- [ ] **Step 1: Add a test for the no-common-color candidate case**

Add this test beside the existing `mergeSimilarCells` test:

```ts
it('keeps original colors when every color is below the usage threshold', () => {
  const cells = [
    { x: 0, y: 0, color: '#ff0000' },
    { x: 1, y: 0, color: '#00ff00' },
    { x: 0, y: 1, color: '#0000ff' },
  ];

  expect(mergeSimilarCells(cells, 5)).toEqual(cells);
});
```

- [ ] **Step 2: Run the focused test**

Run:

```bash
npm test -- --run packages/core/src/domain/grid.test.ts
```

Expected: PASS. If it fails, change only `mergeSimilarCells` so an empty candidate set preserves normalized original colors.

- [ ] **Step 3: If the edge-case test is RED, apply the bounded production fix and rerun GREEN**

Only if Step 2 fails because `mergeSimilarCells` has no frequent-color candidate, modify `packages/core/src/domain/grid.ts` so that branch returns the normalized original cells unchanged. Then rerun:

```bash
npm test -- --run packages/core/src/domain/grid.test.ts
```

Expected: PASS. If Step 2 already passes, make no production change and continue.

- [ ] **Step 4: Record the baseline UI flow**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts --grep "uploads from the H5 home page|aligns the split grid|zooms the image outside|pans the image"
```

Expected: the current related tests pass before structural UI work begins. Record any existing unrelated failure rather than changing behavior.

- [ ] **Step 5: Commit the isolated core change when safe**

```bash
git diff -- packages/core/src/domain/grid.test.ts packages/core/src/domain/grid.ts
git add -p packages/core/src/domain/grid.test.ts packages/core/src/domain/grid.ts
git commit -m "test: cover rare color merge fallback"
```

Stage the test hunk and, only when Step 3 required it, the bounded production hunk. Skip the commit if those hunks cannot be isolated from pre-existing user changes.

### Task 2: Add failing E2E contracts for the approved home screen

**Files:**
- Modify: `tests/e2e/h5.spec.ts`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Add a focused home visual-contract test**

Add a test near the first upload-flow test:

```ts
test('shows the reference-driven home hierarchy with only real tools', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('.home-brand-hero')).toBeVisible();
  await expect(page.getByRole('heading', { name: '超级拼' })).toBeVisible();
  await expect(page.getByRole('button', { name: '上传图片制作拼豆图纸' })).toBeVisible();
  await expect(page.getByRole('button', { name: '消息中心' })).toHaveCount(0);
  await expect(page.locator('.home-creation-tools .quick-action-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '创建拼豆图纸' })).toBeVisible();
  await expect(page.getByRole('button', { name: '创建敲豆图纸' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建空白画布' })).toBeVisible();
  await expect(page.getByText('最近项目')).toHaveCount(0);
  await expect(page.getByText('热门图纸')).toHaveCount(0);
});
```

- [ ] **Step 2: Add touch-target and overflow assertions**

In the same test, use this concrete selector and assertion, including the central bottom upload button:

```ts
const homeTargets = await page.locator(
  '.home-upload-hero, .home-creation-tools .quick-action-card, .bottom-tabs button',
).evaluateAll((nodes) => nodes.map((node) => {
  const rect = node.getBoundingClientRect();
  return { label: node.getAttribute('aria-label') ?? node.textContent?.trim(), width: rect.width, height: rect.height };
}));
for (const target of homeTargets) {
  expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
  expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
}
await expectNoPageScrollbar(page);
```

- [ ] **Step 3: Verify the new hero opens the real upload dialog**

```ts
await page.getByRole('button', { name: '上传图片制作拼豆图纸' }).click();
await expect(page.getByRole('dialog', { name: '上传图纸' })).toBeVisible();
```

- [ ] **Step 4: Add the existing invalid-file feedback contract**

Add a separate test that calls the existing file input with an invalid MIME type and checks the current status message:

```ts
test('keeps invalid upload feedback visible on the redesigned home', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'not-an-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('invalid image'),
  });
  await expect(page.getByRole('status')).toContainText('请上传 PNG、JPG 或 WebP 图片');
});
```

- [ ] **Step 5: Run the new tests to verify RED**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts --grep "reference-driven home hierarchy|keeps invalid upload feedback"
```

Expected: the hierarchy test FAILS because `.home-brand-hero`, the new upload hero label, and `.home-creation-tools` do not exist yet; the invalid-file feedback test PASSES because behavior already exists.

### Task 3: Add the shared visual tokens and presentational primitives

**Files:**
- Create: `apps/h5/src/H5FlowComponents.tsx`
- Create: `apps/h5/src/H5FlowComponents.test.ts`
- Modify: `apps/h5/src/H5App.tsx` imports
- Modify: `apps/h5/src/styles.css` near `.h5-home-shell` and `.split-page`
- Test: `apps/h5/src/H5FlowComponents.test.ts`

- [ ] **Step 1: Add the complete component contract tests first**

Create `apps/h5/src/H5FlowComponents.test.ts` (not `.tsx`, because the current `vitest.config.ts` collects `apps/h5/src/**/*.test.ts`). Use `createElement` instead of JSX:

```ts
import { Children, createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FlowTopbar, getImportAction, SegmentedControl, SplitBeadList, ThresholdControl } from './H5FlowComponents';

describe('H5 flow presentation components', () => {
  it('derives an unavailable browse import action from an empty preview', () => {
    const onClick = vi.fn();
    const action = getImportAction(0, onClick);
    expect(action).toMatchObject({ label: '导入画布', disabled: true, primary: true });
    expect(action.onClick).toBe(onClick);
  });

  it('renders a disabled action without an invokable callback', () => {
    const onClick = vi.fn();
    const tree = FlowTopbar({ title: '浏览', backLabel: '返回', onBack: () => {}, action: { label: '导入画布', onClick, disabled: true } });
    const action = Children.toArray(tree.props.children)[2] as ReactElement<{ disabled?: boolean; onClick?: () => void }>;
    expect(action.props.disabled).toBe(true);
    expect(action.props.onClick).toBeUndefined();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders selected tab semantics and roving tabindex', () => {
    const markup = renderToStaticMarkup(createElement(SegmentedControl, { label: '分割模式', value: 'quick', options: [{ value: 'quick', label: '快速分割' }, { value: 'align', label: '对格子' }], onChange: () => {} }));
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('tabindex="-1"');
  });

  it('disables threshold decrement at the minimum', () => {
    const markup = renderToStaticMarkup(createElement(ThresholdControl, { value: 0, min: 0, max: 20, onChange: () => {} }));
    expect(markup).toContain('aria-label="降低合并阈值" disabled');
  });

  it('renders the real empty bead totals', () => {
    const markup = renderToStaticMarkup(createElement(SplitBeadList, { colors: [], totalBeads: 0 }));
    expect(markup).toContain('0 种颜色');
    expect(markup).toContain('共 0 颗豆子');
  });
});
```

- [ ] **Step 2: Run the component contracts to verify RED**

```bash
npm test -- --run apps/h5/src/H5FlowComponents.test.ts
```

Expected: FAIL because `H5FlowComponents.tsx` and its exports do not exist yet. Do not create implementation stubs before this run.

- [ ] **Step 3: Add the shared CSS tokens**

Define these variables on `.h5-home-shell, .split-page`:

```css
--flow-brand-deep: #071c48;
--flow-brand: #146cff;
--flow-brand-soft: #eaf2ff;
--flow-bg: #f4f7fc;
--flow-surface: #ffffff;
--flow-text: #101828;
--flow-muted: #718096;
--flow-line: #e6edf7;
--flow-shadow-card: 0 10px 28px rgba(27, 61, 101, 0.08);
--flow-shadow-action: 0 14px 30px rgba(20, 108, 255, 0.25);
--flow-content-max: 720px;
```

Use `env(safe-area-inset-top)` only in top bars and `env(safe-area-inset-bottom)` only in the fixed bottom panel or bottom navigation, so nested children do not add the safe area twice.

- [ ] **Step 4: Add `HomeUploadHero`**

Use this interface:

```ts
export function HomeUploadHero({ onUpload }: { onUpload: () => void }) {
  return (
    <button className="home-upload-hero" aria-label="上传图片制作拼豆图纸" onClick={onUpload}>
      <span className="home-upload-copy">
        <strong>上传图片<br />制作拼豆图纸</strong>
        <small>支持 PNG / JPG / WebP</small>
      </span>
      <span className="home-upload-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </span>
    </button>
  );
}
```

The entire card is one button. Do not nest a second button inside it.

- [ ] **Step 5: Add `FlowTopbar` and the browse-action derivation helper**

Use a concrete non-generic action interface:

```ts
type FlowTopbarProps = {
  title: string;
  backLabel: string;
  onBack: () => void;
  action?: { label: string; onClick: () => void; disabled?: boolean; primary?: boolean };
};

export function getImportAction(cellCount: number, onClick: () => void): NonNullable<FlowTopbarProps['action']> {
  return { label: '导入画布', onClick, disabled: cellCount === 0, primary: true };
}

export function FlowTopbar({ title, backLabel, onBack, action }: FlowTopbarProps) {
  return (
    <header className="split-topbar">
      <button type="button" className="split-icon-btn" aria-label={backLabel} onClick={onBack}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" /><path d="m12 5-7 7 7 7" />
        </svg>
      </button>
      <h1 className="split-topbar-title">{title}</h1>
      {action ? (
        <button type="button" className={action.primary ? 'split-action-btn split-action-btn--primary' : 'split-action-btn'} disabled={action.disabled} onClick={action.disabled ? undefined : action.onClick}>
          {action.label}
        </button>
      ) : <span className="split-topbar-spacer" aria-hidden="true" />}
    </header>
  );
}
```

- [ ] **Step 6: Add `SegmentedControl<T>`**

Use a `tablist`/`tab` contract so the implementation matches the approved `aria-selected` requirement:

```ts
type SegmentedOption<T extends string> = { value: T; label: string; badge?: number };

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
}) {
  const selectRelative = (currentIndex: number, delta: number, container: HTMLDivElement | null) => {
    const nextIndex = (currentIndex + delta + options.length) % options.length;
    onChange(options[nextIndex].value);
    container?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  };
  return (
    <div className="flow-segmented" role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            selectRelative(index, event.key === 'ArrowRight' ? 1 : -1, event.currentTarget.parentElement as HTMLDivElement | null);
          }}
        >
          <span>{option.label}</span>
          {option.badge === undefined ? null : <strong>{option.badge}</strong>}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Add `ThresholdControl`**

Use this interface:

```ts
type ThresholdControlProps = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

export function ThresholdControl({ value, min, max, onChange }: ThresholdControlProps) {
  return (
    <section className="split-threshold-control" aria-label="颜色合并设置">
      <div className="split-threshold-head">
        <div><strong>去杂色合并</strong><span>按使用数量替换低用量颜色</span></div>
        <output htmlFor="split-merge-threshold">≤ {value}</output>
      </div>
      <div className="split-threshold-label"><span>合并阈值</span><span>≤ {value} 颗</span></div>
      <div className="split-threshold-row">
        <button type="button" aria-label="降低合并阈值" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <input id="split-merge-threshold" aria-label="颜色合并阈值" type="range" min={min} max={max} step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <button type="button" aria-label="提高合并阈值" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>＋</button>
      </div>
      <p className="split-threshold-help">使用数量 ≤ {value} 颗的颜色将替换为最接近的常用颜色；若没有常用颜色，则保留原色。</p>
    </section>
  );
}
```

Clamp button changes to `[min, max]` and disable the corresponding button at each boundary.

- [ ] **Step 8: Add `SplitBeadList`**

```tsx
export type BeadColorItem = { color: string; code: string; count: number };

export function SplitBeadList({ colors, totalBeads }: { colors: BeadColorItem[]; totalBeads: number }) {
  return (
    <section className="split-bead-list-panel" aria-label="豆子清单">
      <header className="split-bead-list-summary"><strong>{colors.length} 种颜色</strong><span>共 {totalBeads} 颗豆子</span></header>
      <div className="split-bead-list">
        {colors.map(({ color, code, count }) => (
          <div className="split-bead-row" data-count={count} key={color}>
            <strong className="split-bead-code">{code}</strong>
            <span className="split-bead-swatch" style={{ background: color }} aria-label={`颜色 ${color.toUpperCase()}`} />
            <span className="split-bead-hex">{color.toUpperCase()}</span>
            <strong className="split-bead-count">× {count}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 9: Run component tests and TypeScript to verify GREEN**

Run:

```bash
npm test -- --run apps/h5/src/H5FlowComponents.test.ts
npm run build:h5
```

Expected: component tests PASS and H5 build PASS.

- [ ] **Step 10: Enforce the component-size boundary**

Run:

```bash
wc -l apps/h5/src/H5FlowComponents.tsx
```

Expected: the complete presentation-only file remains under 260 lines and each exported component remains under approximately 100 lines. If either boundary is exceeded, split bead-list presentation into `apps/h5/src/SplitBeadList.tsx` before continuing.

- [ ] **Step 11: Run TypeScript before using the helpers**

Run:

```bash
npm run build:h5
```

Expected: PASS with helpers compiling even if they are not all wired into screens yet.

- [ ] **Step 12: Commit the isolated presentation primitives when safe**

```bash
git add apps/h5/src/H5FlowComponents.tsx apps/h5/src/H5FlowComponents.test.ts
git add -p apps/h5/src/H5App.tsx apps/h5/src/styles.css
git commit -m "feat: add h5 flow presentation primitives"
```

Inspect the diff first and omit `H5App.tsx` or `styles.css` from this commit if they still contain inseparable pre-existing hunks.

### Task 4: Recompose and style the home screen

**Files:**
- Modify: `apps/h5/src/H5App.tsx` home render branch beginning at `return <main className="h5-home-shell">`
- Modify: `apps/h5/src/styles.css` home selector blocks beginning at `.h5-home-shell`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Replace the home header with the brand hero**

Replace the existing `.home-header` and quick-action grid with this exact hierarchy; remove the no-op message button:

```tsx
<div className="home-scroll-content">
  <header className="home-brand-hero">
    <div className="home-brand-copy"><h1>超级拼</h1><p>让拼豆创作更简单</p></div>
    <HomeUploadHero onUpload={() => openUpload('bead')} />
  </header>
  <section className="home-creation-tools" aria-labelledby="home-tools-title">
      <div className="home-section-title"><h2 id="home-tools-title">创作工具</h2></div>
      <div className="quick-action-grid">
        {quickTools.map((item) => (
          <button key={item.title} className="quick-action-card" aria-label={`创建${item.title}`} onClick={() => openUpload(item.mode)}>
            <span className="qa-icon"><Icon name={item.icon} /></span><strong>{item.title}</strong><span>{item.description}</span>
          </button>
        ))}
        <button className="quick-action-card qa-new" aria-label="新建空白画布" onClick={openCreateCanvasModal}>
          <span className="qa-icon"><Icon name="plus" /></span><strong>空白画布</strong><span>自由绘制创作</span>
        </button>
      </div>
  </section>
  {usedColors.length > 0 ? <div className="home-color-strip">{usedColors.slice(0, 8).map(([color, count]) => <span key={color} title={`${colorCodeOf(color)} × ${count}`}><i style={{ background: color }} /></span>)}</div> : null}
</div>
```

Keep the existing create-canvas, upload, and login modal JSX unchanged as siblings immediately after `.home-scroll-content`.

- [ ] **Step 2: Insert `HomeUploadHero` below the brand copy**

Call `openUpload('bead')` from `onUpload`. This preserves the current upload modal and file flow.

- [ ] **Step 3: Limit creation tools to the three real actions**

Render exactly three cards in this order: bead upload, peg upload, blank canvas. Preserve `openUpload('bead')`, `openUpload('peg')`, and `openCreateCanvasModal`. Give the first two cards accessible names `创建拼豆图纸` and `创建敲豆图纸`; keep `新建空白画布` for the third. Do not render a fourth upload card.

Normalize the existing `quickTools` peg title from `敲豆豆图纸` to `敲豆图纸`; this is display copy only and does not change `mode: 'peg'`.

- [ ] **Step 4: Preserve the conditional used-color strip**

Keep `usedColors.length > 0` as the only render condition. Restyle it as a compact white strip below creation tools.

- [ ] **Step 5: Restyle the bottom navigation**

Keep current callbacks and labels. Use `.bottom-tabs` height `calc(64px + env(safe-area-inset-bottom))`; reserve the same height as bottom padding on `.home-page`. Make `.plus-tab` 56 × 56px, circular, and elevated; other navigation buttons remain at least 44 × 44px. Apply the bottom safe area only on `.bottom-tabs`.

- [ ] **Step 6: Implement home responsive styles**

Implement these measurable layout rules:

```css
.h5-home-shell { background: var(--flow-bg); }
.home-page { min-height: 100svh; padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
.home-scroll-content { width: min(100%, var(--flow-content-max)); margin: 0 auto; }
.home-brand-hero { min-height: 250px; padding: calc(22px + env(safe-area-inset-top)) 16px 20px; background: var(--flow-brand-deep); color: #fff; }
.home-brand-copy h1 { margin: 0; font-size: clamp(38px, 11vw, 52px); line-height: .95; }
.home-brand-copy p { margin: 12px 0 0; color: rgba(255,255,255,.68); }
.home-upload-hero { width: 100%; min-height: 132px; margin-top: 24px; padding: 22px; border-radius: 22px; background: var(--flow-brand); color: #fff; box-shadow: var(--flow-shadow-action); }
.home-upload-arrow { width: 48px; height: 48px; border-radius: 50%; background: #fff; color: var(--flow-brand); }
.home-creation-tools { padding: 24px 16px 0; }
.quick-action-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.quick-action-card { min-width: 0; min-height: 118px; padding: 14px 8px; border: 1px solid var(--flow-line); border-radius: 16px; background: #fff; }
```

At >480px, keep the 720px centered content cap; the navy background may span the viewport via a pseudo-element or outer background, but content remains capped. Add `:focus-visible` outlines, `:active` scale feedback, `text-wrap: pretty`, and reduced-motion overrides.

- [ ] **Step 7: Run the home test to verify GREEN**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts --grep "reference-driven home hierarchy|keeps invalid upload feedback"
```

Expected: both the new hierarchy contract and the preserved invalid-file feedback contract PASS.

- [ ] **Step 8: Run existing home modal tests**

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts --grep "opens upload drawing modal and extracts an image|opens the upload modal from the profile tab|shows STL export only"
```

Expected: PASS; the visual hierarchy must not change upload modes or modal behavior.

- [ ] **Step 9: Commit the home chunk when safe**

```bash
git diff -- apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
git add -p apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
git commit -m "feat: redesign h5 home around upload flow"
```

Do not stage pre-existing unrelated hunks.

---

## Chunk 2: Split Setup, Browse, and Verification

### Task 5: Add failing E2E contracts for split setup layout

**Files:**
- Modify: `tests/e2e/h5.spec.ts`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Extend the main upload flow with split layout assertions**

After upload, assert:

```ts
await expect(page.getByRole('heading', { name: '分割设置' })).toBeVisible();
await expect(page.getByRole('tablist', { name: '分割模式' })).toBeVisible();
await expect(page.getByRole('tab', { name: '快速分割' })).toHaveAttribute('aria-selected', 'true');
await expect(page.locator('.split-pattern-summary')).toContainText(/\d+ × \d+/);
```

Assert the preview Canvas remains visible and the fixed panel bottom equals the viewport bottom within 1px.

Use this executable position assertion:

```ts
const panelPosition = await page.locator('.split-controls-card').evaluate((node) => ({
  bottom: node.getBoundingClientRect().bottom,
  viewportBottom: window.innerHeight,
}));
expect(Math.abs(panelPosition.bottom - panelPosition.viewportBottom)).toBeLessThanOrEqual(1);
```

- [ ] **Step 2: Add desktop geometry assertions**

At 1280 × 800, use the exact `.split-flow-inner` wrapper and this geometry assertion:

```ts
const desktopGeometry = await page.locator('.split-flow-inner').evaluate((node) => {
  const wrapper = node.getBoundingClientRect();
  const preview = node.querySelector('.split-image-container')?.getBoundingClientRect();
  return { wrapperWidth: wrapper.width, previewHeight: preview?.height ?? 0 };
});
expect(desktopGeometry.wrapperWidth).toBeLessThanOrEqual(720);
expect(desktopGeometry.previewHeight).toBeGreaterThanOrEqual(360);
```

- [ ] **Step 3: Add phone panel-height contracts before implementation**

At 390 × 844, assert both mode-specific caps in the same split-layout test:

```ts
const quickPanelHeight = await page.locator('.split-controls-card').evaluate((node) => node.getBoundingClientRect().height);
expect(quickPanelHeight).toBeLessThanOrEqual(190);
await page.getByRole('tab', { name: '对格子' }).click();
const alignPanelHeight = await page.locator('.split-controls-card').evaluate((node) => node.getBoundingClientRect().height);
expect(alignPanelHeight).toBeLessThanOrEqual(260);
```

- [ ] **Step 4: Run the focused split tests to verify RED**

```bash
npx playwright test tests/e2e/h5.spec.ts --grep "uploads from the H5 home page|aligns the split grid"
```

Expected: FAIL on the new heading, summary, or geometry contracts while existing Canvas behavior remains intact.

### Task 6: Recompose and style the split setup screen

**Files:**
- Modify: `apps/h5/src/H5App.tsx` split branch beginning at `if (screen === 'split' && uploadedSplitImage)`
- Modify: `apps/h5/src/styles.css` split-setup selector blocks beginning at `.split-page`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Replace the split header with `FlowTopbar`**

Use title `分割设置`, back label `返回首页`, and action label `下一步`. Keep `setScreen('home')` and `setScreen('split-preview')` callbacks.

- [ ] **Step 2: Move the split mode control above the Canvas preview**

Use `SegmentedControl<SplitMode>` with `快速分割` and `对格子`. Keep the same `setSplitMode` callback. Wrap the mode control and Canvas in the exact centered `.split-flow-inner` container capped at 720px.

- [ ] **Step 3: Preserve the Canvas subtree exactly**

Do not change `TransformWrapper`, `SplitPreviewCanvas`, `GridAlignmentHandles`, pointer handlers, wheel handlers, image scale, or image offset props. Only move their existing containing elements.

- [ ] **Step 4: Recompose quick-mode controls**

Add `.split-pattern-summary` showing current dimensions and total cells:

```tsx
<div className="split-pattern-summary">
  <span>预计格子尺寸</span>
  <strong>{activeSplitCols} × {activeSplitRows}</strong>
  <small>共 {activeSplitCols * activeSplitRows} 格</small>
</div>
```

Keep the existing minus/range/plus callbacks. Visually promote `splitLongSide` as the primary value.

- [ ] **Step 5: Recompose align-mode controls**

Keep the readout, nudge buttons, cell-size controls, and reset callback. Use two compact groups inside the fixed bottom panel. Do not change button labels used by existing tests.

- [ ] **Step 6: Apply fixed-panel and safe-area rules**

Top safe area belongs to `FlowTopbar`. Bottom safe area belongs to `.split-controls-card`. Set `--split-controls-space: 190px` in quick mode and `260px` in align mode, then implement the fixed-panel CSS so the Task 5 bottom-position and height-cap assertions pass. If content exceeds either cap, reduce internal spacing or font sizes while preserving 44px interactive targets; do not increase the cap.

- [ ] **Step 7: Run split layout and interaction tests**

```bash
npx playwright test tests/e2e/h5.spec.ts --grep "uploads from the H5 home page|aligns the split grid|zooms the image outside|clicks outside|pans the image"
```

Expected: PASS.

- [ ] **Step 8: Commit the split setup chunk when safe**

```bash
git diff -- apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
git add -p apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
git commit -m "feat: redesign h5 split setup"
```

### Task 7: Add failing E2E contracts for the browse layout

**Files:**
- Modify: `tests/e2e/h5.spec.ts`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Extend the upload flow after clicking next**

Assert the simplified structure:

```ts
await expect(page.getByRole('heading', { name: '浏览' })).toBeVisible();
await expect(page.locator('.split-preview-eyebrow')).toHaveCount(0);
await expect(page.locator('.split-pattern-meta')).toContainText(/\d+ × \d+/);
await expect(page.getByRole('tablist', { name: '浏览设置页签' })).toBeVisible();
await expect(page.getByText('众数投票')).toBeVisible();
await expect(page.getByText('若没有常用颜色，则保留原色')).toBeVisible();
```

- [ ] **Step 2: Assert preview ratio and import-button contracts**

Keep the current aspect-ratio assertion based on active columns and rows. In the normal E2E flow assert `导入画布` is enabled because preview cells exist. The Task 3 component tests cover `getImportAction(0, ...)` and disabled-button rendering. Add this source-level architecture contract to ensure the browse branch actually binds the real preview-cell count to that tested helper without a test-only application route:

```ts
test('binds browse import availability to the real preview cells', async () => {
  const appSource = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');
  expect(appSource).toContain('action={getImportAction(splitPreviewCells.length, importSplitToCanvas)}');
});
```

- [ ] **Step 3: Assert bead-list data columns**

Switch to 豆子清单 and use exact selectors:

```ts
const rows = page.locator('.split-bead-row');
await expect(rows.first().locator('.split-bead-code')).toHaveText(/^[A-Z]+\d+$/);
await expect(rows.first().locator('.split-bead-swatch')).toHaveAttribute('aria-label', /^颜色 #[0-9A-F]{6}$/);
await expect(rows.first().locator('.split-bead-hex')).toHaveText(/^#[0-9A-F]{6}$/);
await expect(rows.first().locator('.split-bead-count')).toHaveText(/^× \d+$/);
const counts = await rows.evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('data-count'))));
expect(counts).toEqual([...counts].sort((left, right) => right - left));
```

Switch back and assert the merge slider value is unchanged. Cover `0 种颜色 / 共 0 颗豆子` with the static `SplitBeadList` test from Task 3.

- [ ] **Step 4: Add the scroll-ownership contract**

In the main upload flow after entering browse, add:

```ts
const scrollOwnership = await page.locator('.split-preview-page').evaluate((node) => ({
  pageOverflow: getComputedStyle(node).overflow,
  contentOverflowY: getComputedStyle(node.querySelector('.split-browser-container')!).overflowY,
  documentOverflow: document.documentElement.scrollHeight > window.innerHeight,
}));
expect(scrollOwnership).toEqual({ pageOverflow: 'hidden', contentOverflowY: 'auto', documentOverflow: false });
```

- [ ] **Step 5: Add the long-filename contract before styling it**

Add a separate test that uploads a valid copy of `uploadFixture` with a long filename and explicitly waits for asynchronous image decoding before advancing:

```ts
test('ellipsizes a long pattern name in browse without page overflow', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: `${'very-long-pattern-name-'.repeat(6)}.png`,
    mimeType: 'image/png',
    buffer: fs.readFileSync(uploadFixture),
  });
  await expect(page.getByRole('heading', { name: '分割设置' })).toBeVisible();
  const nextButton = page.getByRole('button', { name: '下一步' });
  await expect(nextButton).toBeVisible();
  await expect(nextButton).toBeEnabled();
  await nextButton.click();
  await expect(page.getByRole('heading', { name: '浏览' })).toBeVisible();
  const nameStyle = await page.locator('.split-pattern-name').evaluate((node) => ({
    overflow: getComputedStyle(node).overflow,
    textOverflow: getComputedStyle(node).textOverflow,
    overflows: node.scrollWidth > node.clientWidth,
  }));
  expect(nameStyle).toMatchObject({ overflow: 'hidden', textOverflow: 'ellipsis', overflows: true });
  await expectNoPageScrollbar(page);
});
```

- [ ] **Step 6: Add the disabled-action visual contract**

In the source-level architecture test, also assert the disabled selector exists before implementation:

```ts
const cssSource = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
expect(cssSource).toMatch(/\.split-action-btn:disabled\s*\{/);
```

- [ ] **Step 7: Run all browse contracts to verify RED**

```bash
npx playwright test tests/e2e/h5.spec.ts --grep "uploads from the H5 home page|binds browse import availability|ellipsizes a long pattern name"
```

Expected: FAIL because the old eyebrow/meta hierarchy, non-shared tabs, cell-count action binding, scroll ownership, long-name style, and disabled selector are not implemented yet.

### Task 8: Recompose and style the browse screen

**Files:**
- Modify: `apps/h5/src/H5App.tsx` browse branch beginning at `if (screen === 'split-preview' && uploadedSplitImage)`
- Modify: `apps/h5/src/styles.css` browse selector blocks beginning at `.split-preview-page`
- Test: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Replace the browse header with `FlowTopbar`**

Use title `浏览`, back label `返回分割`, and `action={getImportAction(splitPreviewCells.length, importSplitToCanvas)}`. This keeps the import callback unchanged while binding disabled state to the real preview-cell count through the Task 3 tested helper.

- [ ] **Step 2: Replace the large preview intro with compact pattern metadata**

Render `.split-pattern-meta` immediately above the preview. Show `uploadedSplitImage.name` with ellipsis and `activeSplitCols × activeSplitRows`. Remove `PATTERN PREVIEW` and the long explanatory paragraph.

- [ ] **Step 3: Keep the preview grid implementation unchanged**

Preserve the CSS grid template columns, rows, active aspect ratio, keys, transparent class, and cell background behavior.

- [ ] **Step 4: Replace browse navigation with `SegmentedControl<SplitPreviewTab>`**

Use `role="tablist"`, `role="tab"`, `aria-selected`, labels `参数设置` and `豆子清单`, and the real `splitColorList.length` badge.

- [ ] **Step 5: Add the real active-method summary**

In settings, render a non-interactive `.split-method-summary` that states `众数投票` and explains that each cell uses the most frequent sampled palette color. Remove inactive selectable placeholders for average and K-means from the current view.

- [ ] **Step 6: Wire `ThresholdControl`**

Pass `splitMergeThreshold`, `0`, `20`, and `setSplitMergeThreshold`. Ensure the copy uses bead-count semantics and includes the no-candidate fallback.

- [ ] **Step 7: Restyle the bead list as a compact data list**

Render `SplitBeadList` with `splitColorList` and the non-transparent cell count. Each row has four concrete visible fields: `.split-bead-code`, `.split-bead-swatch`, `.split-bead-hex`, and `.split-bead-count`. The summary header is separate. Do not fabricate percentages because the approved scope only requires true data already computed.

- [ ] **Step 8: Implement browse responsive styles**

Use `.split-browser-container` as the only main scroll container (`overflow-y: auto`); `.split-preview-page` remains `overflow: hidden`. Cap content at 720px. On phone, keep 16px horizontal padding and avoid horizontal truncation except for `.split-pattern-name`, which uses `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap`.

- [ ] **Step 9: Add disabled import styles**

Add `.split-action-btn:disabled { opacity: .42; box-shadow: none; cursor: not-allowed; }` and `.split-action-btn:not(:disabled):active` for press feedback. The Task 3 component tests verify disabled behavior, and the Task 7 tests verify the app binding, selector, and normal enabled state.

- [ ] **Step 10: Run all browse contracts to verify GREEN**

```bash
npx playwright test tests/e2e/h5.spec.ts --grep "uploads from the H5 home page|binds browse import availability|ellipsizes a long pattern name"
```

Expected: PASS.

- [ ] **Step 11: Commit the browse chunk when safe**

```bash
git diff -- apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
git add -p apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts
git commit -m "feat: redesign h5 split preview"
```

### Task 9: Run the responsive and regression verification matrix

**Files:**
- Modify if required: `apps/h5/src/H5App.tsx`
- Modify if required: `apps/h5/src/styles.css`
- Modify if required: `tests/e2e/h5.spec.ts`

- [ ] **Step 1: Run the core suite**

```bash
npm test -- --run packages/core/src/domain/grid.test.ts
```

Expected: all grid-domain tests pass.

- [ ] **Step 2: Run the targeted three-screen suite**

```bash
npx playwright test tests/e2e/h5.spec.ts --grep "reference-driven home hierarchy|uploads from the H5 home page|aligns the split grid|zooms the image outside|clicks outside|pans the image"
```

Expected: all selected tests pass.

- [ ] **Step 3: Run the full H5 E2E file**

```bash
npx playwright test tests/e2e/h5.spec.ts
```

Expected: all tests pass. If an existing unrelated failure remains, record its exact test name and evidence; do not hide it by weakening the assertion.

- [ ] **Step 4: Run the production build**

```bash
npm run build:h5
```

Expected: TypeScript and Vite build pass without errors.

- [ ] **Step 5: Check formatting and forbidden patterns**

```bash
git diff --check
rg -n "scrollIntoView|const styles\s*=" apps/h5/src/H5App.tsx apps/h5/src/styles.css
```

Expected: `git diff --check` exits 0; `rg` finds no newly introduced forbidden pattern.

- [ ] **Step 6: Add and run an executable visual-verification test**

Add `test('renders the redesigned creation flow cleanly at phone and desktop sizes', ...)` to `tests/e2e/h5.spec.ts`. The test must:

```ts
const artifactDir = path.resolve('test-results/h5-ui-review');
fs.mkdirSync(artifactDir, { recursive: true });
const consoleProblems: string[] = [];
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(`${message.type()}: ${message.text()}`);
});

for (const viewport of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }]) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-home.png`), fullPage: true });
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);
  await expect(page.getByRole('heading', { name: '分割设置' })).toBeVisible();
  await expect(page.locator('.split-preview-canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.split-preview-canvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context || canvas.width === 0 || canvas.height === 0) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    return pixels.some((channel, index) => index % 4 === 3 && channel > 0);
  });
  await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-split-quick.png`) });
  await page.getByRole('tab', { name: '对格子' }).click();
  await expect(page.getByRole('tab', { name: '对格子' })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-split-align.png`) });
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByRole('heading', { name: '浏览' })).toBeVisible();
  await expect(page.locator('.split-grid-preview')).toBeVisible();
  await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-browse-settings.png`), fullPage: true });
  await page.getByRole('tab', { name: /豆子清单/ }).click();
  await expect(page.getByRole('tab', { name: /豆子清单/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.split-bead-list-panel')).toBeVisible();
  await page.screenshot({ path: path.join(artifactDir, `${viewport.name}-browse-beads.png`), fullPage: true });
  await expectNoPageScrollbar(page);
}
expect(consoleProblems).toEqual([]);
```

Then test reduced motion separately:

```ts
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto('/');
const transitionSeconds = await page.locator('.home-upload-hero').evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration) || 0);
expect(transitionSeconds).toBeLessThanOrEqual(0.01);
```

Run:

```bash
npx playwright test tests/e2e/h5.spec.ts --grep "renders the redesigned creation flow cleanly"
```

Expected: PASS, no collected console warnings/errors, and ten PNG artifacts under `test-results/h5-ui-review/`. Mobile panel caps, double-scroll ownership, long filenames, bead ordering, touch targets, empty-list static markup, and disabled import markup are asserted by Tasks 2, 3, 5, and 7.

- [ ] **Step 7: Inspect and approve all ten visual artifacts**

Open every PNG in `test-results/h5-ui-review/` with the local image viewer. Record a pass/fail checklist for phone and desktop across home, split quick, split align, browse settings, and browse beads. Each image must satisfy all applicable criteria:

- no clipped text, overlapping controls, accidental black background, or browser-level scrollbar;
- content follows the approved deep-navy/blue/white visual hierarchy and remains centered within the 720px cap on desktop;
- split Canvas remains the dominant area, with the fixed controls attached to the viewport bottom and grid/image visually attached;
- browse metadata, preview, tabs, threshold panel, and bead rows have clear spacing and alignment;
- phone controls remain readable without shrinking interactive targets below 44px.

If any artifact fails, fix the owned JSX/CSS, rerun Step 6 to regenerate all screenshots, and inspect all ten again. Do not mark visual verification complete solely because screenshot files were created.

- [ ] **Step 8: Final commit when safe**

```bash
git status --short
git diff --check
git add -p apps/h5/src/H5App.tsx apps/h5/src/styles.css tests/e2e/h5.spec.ts packages/core/src/domain/grid.test.ts
git commit -m "feat: unify h5 creation flow ui"
```

Only commit remaining owned hunks. Preserve unrelated user changes and untracked reference images.
