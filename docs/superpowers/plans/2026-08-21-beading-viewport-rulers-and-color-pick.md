# 拼豆画布自适应标尺与点按取色实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 H5 开始拼豆页中，使溢出画布的贴边标尺随实际缩放提高刻度密度而不重叠，并支持平移模式轻点格子取色并高亮同色区域。

**Architecture:** 将自适应刻度间隔保持为 `H5CanvasPreview` 中可单测的纯函数，并让视口几何按真实 `DOMRect` 单元中心及行/列独立的尺寸产生可见标签。将平移模式的静止轻点作为 `useBeadingPointer` 的显式可选回调；页面仅对非透明格复用已有 `selectColor`，以保留工具状态和颜色栏的一致性。

**Tech Stack:** React、TypeScript、react-zoom-pan-pinch、Vitest、react-test-renderer。

---

## Chunk 1: 自适应贴边标尺

### Task 1: 以实际格子尺寸计算可读刻度

**Files:**
- Modify: `apps/h5/src/canvas/H5CanvasPreview.tsx:32-142`
- Test: `apps/h5/src/canvas/H5CanvasPreview.test.ts`

- [ ] **Step 1: 写出失败测试，描述放大后逐格、有限空间时按整数间隔以及行列独立间隔。**

```ts
expect(viewportRulerTickStep(22)).toBe(1);
expect(viewportRulerTickStep(11)).toBe(2);
expect(viewportRulerTickStep(3)).toBe(5);

expect(getViewportRulerGeometry(stage, artboard, 20, 20, 2)).toMatchObject({
  columns: expect.arrayContaining([{ tick: 1, offset: 11 }]),
  rows: expect.arrayContaining([{ tick: 1, offset: 6 }]),
});
```

- [ ] **Step 2: 运行该测试并确认因导出/逻辑缺失而失败。**

Run: `npm exec vitest run -- apps/h5/src/canvas/H5CanvasPreview.test.ts`

Expected: FAIL，提示 `viewportRulerTickStep` 不存在或贴边标尺仍使用固定 5 格间隔。

- [ ] **Step 3: 实现最小的自适应刻度与可见标签计算。**

```ts
const MAX_RULER_TICK_STEP = 5;
const MIN_VIEWPORT_RULER_LABEL_GAP = 20;

export function viewportRulerTickStep(cellSize: number): number {
  if (!Number.isFinite(cellSize) || cellSize <= 0) return MAX_RULER_TICK_STEP;
  return Math.min(MAX_RULER_TICK_STEP, Math.max(1, Math.ceil(MIN_VIEWPORT_RULER_LABEL_GAP / cellSize)));
}

function visibleRulerTicks(size: number, cellSize: number, artboardOffset: number, viewportSize: number) {
  const step = viewportRulerTickStep(cellSize);
  return Array.from({ length: Math.ceil(size / step) }, (_, index) => 1 + index * step)
    .filter((tick) => tick <= size)
    .map((tick) => ({ tick, offset: artboardOffset + (tick - 0.5) * cellSize }))
    .filter(({ offset }) => offset >= 0 && offset <= viewportSize);
}
```

Pass the measured `cellWidth` and `cellHeight` independently to the column and row calls. Do not change the sticky condition or replace the real-center offset expression.

- [ ] **Step 4: 运行标尺测试并确认通过。**

Run: `npm exec vitest run -- apps/h5/src/canvas/H5CanvasPreview.test.ts apps/h5/src/pages/beading/BeadingCanvasViewport.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交本任务。**

```bash
git add apps/h5/src/canvas/H5CanvasPreview.tsx apps/h5/src/canvas/H5CanvasPreview.test.ts
git commit -m "feat(h5): adapt viewport ruler density"
```

## Chunk 2: 平移模式点按取色

### Task 2: 在指针处理器中暴露平移轻点回调

**Files:**
- Modify: `apps/h5/src/pages/beading/useBeadingPointer.ts:1-150`
- Test: `apps/h5/src/pages/beading/useBeadingPointer.test.tsx`

- [ ] **Step 1: 写失败测试，描述 pan 模式有效单指轻点派发格索引，以及其余模式和手势不派发。**

```ts
const onPickCell = vi.fn();
const handlers = renderPointerHandlers({ interactionMode: 'pan', locked: false, onPickCell });
tap(handlers, { clientX: 19, clientY: 19 });
expect(onPickCell).toHaveBeenCalledWith(0);

expect(renderPointerHandlers({ interactionMode: 'mark', onPickCell }).onPointerUp).not.toCallPick();
expect(renderPointerHandlers({ interactionMode: 'pan', locked: true, onPickCell }).onPointerUp).not.toCallPick();
```

- [ ] **Step 2: 运行该测试并确认因缺少 `onPickCell` 行为而失败。**

Run: `npm exec vitest run -- apps/h5/src/pages/beading/useBeadingPointer.test.tsx`

Expected: FAIL，pan 模式轻点没有触发取色回调。

- [ ] **Step 3: 实现最小指针分支。**

在 `UseBeadingPointerOptions` 中增加可选 `onPickCell?: (index: number) => void`。让 `onPointerDown` 在 `pan`、`mark` 和 `revise` 三种模式下都记录主指针起点、移动阈值及多指状态；pan 模式不调用 `setPointerCapture`，以保留 `react-zoom-pan-pinch` 原有的画布拖拽/缩放行为，mark/revise 保持既有捕获策略。松手时保持既有 mark/revise 分支不变；若模式为 `pan`、未锁定且手势为单指静止轻点，使用现有 `cellIndexFromPoint` 计算并调用 `onPickCell`。测试还必须覆盖 pan 拖动、多指、取消与锁定均不调用取色。

- [ ] **Step 4: 运行指针测试并确认通过。**

Run: `npm exec vitest run -- apps/h5/src/pages/beading/useBeadingPointer.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交本任务。**

```bash
git add apps/h5/src/pages/beading/useBeadingPointer.ts apps/h5/src/pages/beading/useBeadingPointer.test.tsx
git commit -m "feat(h5): pick beading color from canvas"
```

### Task 3: 页面将取色接到已有高亮状态

**Files:**
- Modify: `apps/h5/src/pages/beading/BeadingSessionPage.tsx:195-245`
- Test: `apps/h5/src/pages/beading/BeadingSessionPage.test.tsx`

- [ ] **Step 1: 写失败页面测试。**

使用现有页面渲染夹具模拟 `onPickCell`，断言非透明格的色号被传给 `selectColor` 的可观察结果：颜色栏当前项改变，且覆盖层得到 `highlightEnabled: true`；透明格不改变当前项。

- [ ] **Step 2: 运行测试并确认失败。**

Run: `npm exec vitest run -- apps/h5/src/pages/beading/BeadingSessionPage.test.tsx`

Expected: FAIL，页面没有将 `onPickCell` 传入指针处理器。

- [ ] **Step 3: 实现最小页面接线。**

```ts
const pickColorAtCell = useCallback((index: number) => {
  const cell = cells[index];
  if (!cell || cell.transparent) return;
  selectColor(getCode(cell.color));
}, [cells, getCode, selectColor]);

const pointerHandlers = useBeadingPointer({ /* existing options */, onPickCell: pickColorAtCell });
```

保持 `onCell` 的 mark/revise 逻辑不变。

- [ ] **Step 4: 运行页面与相关组件回归测试。**

Run: `npm exec vitest run -- apps/h5/src/pages/beading/BeadingSessionPage.test.tsx apps/h5/src/pages/beading/BeadingColorRail.test.tsx apps/h5/src/pages/beading/BeadingCanvasViewport.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交本任务。**

```bash
git add apps/h5/src/pages/beading/BeadingSessionPage.tsx apps/h5/src/pages/beading/BeadingSessionPage.test.tsx
git commit -m "feat(h5): highlight picked beading color"
```

## Chunk 3: 完整验证

### Task 4: 执行目标测试、构建与差异检查

**Files:**
- Verify only: `apps/h5/src/canvas/H5CanvasPreview.test.ts`
- Verify only: `apps/h5/src/pages/beading/useBeadingPointer.test.tsx`
- Verify only: `apps/h5/src/pages/beading/BeadingSessionPage.test.tsx`

- [ ] **Step 1: 运行完整目标测试。**

Run: `npm exec vitest run -- apps/h5/src/canvas/H5CanvasPreview.test.ts apps/h5/src/pages/beading/BeadingCanvasViewport.test.tsx apps/h5/src/pages/beading/useBeadingPointer.test.tsx apps/h5/src/pages/beading/BeadingSessionPage.test.tsx apps/h5/src/pages/beading/BeadingColorRail.test.tsx`

Expected: PASS。

- [ ] **Step 2: 运行 H5 构建。**

Run: `npm run build:h5`

Expected: exit code 0。

- [ ] **Step 3: 检查空白与工作区。**

Run: `git diff --check && git status --short`

Expected: 无空白错误；工作区干净。
