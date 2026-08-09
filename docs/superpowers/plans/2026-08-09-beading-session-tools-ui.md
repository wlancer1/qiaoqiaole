# 拼豆会话工具与 UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 H5 拼豆会话的真实工具、高亮和可靠完成流程，并将移动端布局对齐参考截图。

**Architecture:** 页面 reducer 管理纯本地工具状态，服务端 `BeadingSession` 是完成状态唯一来源；颜色、色号、网格和高亮全部用四张 canvas 分层。草稿、指针、viewport/fit 和异步动作分别进入小型模块，避免继续膨胀页面组件。

**Tech Stack:** React 19、TypeScript、Vitest、Canvas 2D、react-zoom-pan-pinch、Lucide、Playwright、CSS。

**Spec:** `docs/superpowers/specs/2026-08-09-beading-session-tools-ui-design.md`

---

## Chunk 1: 功能状态、Canvas 与会话流程

### Task 1: 工具 reducer 与纯业务函数

**Files:**
- Create: `apps/h5/src/beading/beadingToolState.ts`
- Create: `apps/h5/src/beading/beadingToolState.test.ts`

最终公共契约：

```ts
export type InteractionMode = 'pan' | 'mark' | 'revise';
export type ActivePanel = null | 'search' | 'more';
export type SortMode = 'canvas' | 'remaining' | 'code';
export type BeadingToolState = {
  interactionMode: InteractionMode; activePanel: ActivePanel;
  highlightEnabled: boolean; locked: boolean; focusMode: boolean;
  codesVisible: boolean; gridVisible: boolean; sortMode: SortMode;
  markedCellIndexes: number[];
};
export type BeadingToolAction =
  | { type: 'toggle-mode'; mode: Exclude<InteractionMode, 'pan'> }
  | { type: 'set-panel'; panel: ActivePanel }
  | { type: 'toggle-highlight' | 'toggle-lock' | 'toggle-focus' | 'toggle-codes' | 'toggle-grid' }
  | { type: 'set-sort'; sortMode: SortMode }
  | { type: 'set-marks'; indexes: number[]; cellCount: number }
  | { type: 'reset' };
```

- [ ] **Step 1:** 写默认值、独立开关、互斥模式和 reset 的失败测试。
- [ ] **Step 2:** 运行 `npx vitest run apps/h5/src/beading/beadingToolState.test.ts`，预期因模块不存在而 FAIL。
- [ ] **Step 3:** 实现上述类型、`createBeadingToolState()` 和 `beadingToolReducer()`。
- [ ] **Step 4:** 运行同一命令，预期 reducer 测试 PASS。
- [ ] **Step 5:** 写 `cellIndexFromPoint(rect, clientX, clientY, rows, cols)` 的失败测试，覆盖缩放后 rect、越界、零尺寸。
- [ ] **Step 6:** 实现坐标映射，返回 `number | null`，公式使用 rect 实际尺寸。
- [ ] **Step 7:** 写 `toggleMarkedCell`、`reviseMarkedCell`、`remainingRequirement`、`sortBeadingRequirements` 的失败测试。
- [ ] **Step 8:** 实现纯函数；remaining 为完成色 0、未完成色 required，自然排序使用 `{numeric:true}`。
- [ ] **Step 9:** 运行同一测试命令，预期全部 PASS。
- [ ] **Step 10:** 仅提交这两个文件，commit `feat(h5): add beading tool state`。

### Task 2: 草稿 schema 与持久化 hook

**Files:**
- Modify: `apps/h5/src/beading/beadingSessionUtils.ts`
- Modify: `apps/h5/src/beading/beadingSessionUtils.test.ts`
- Create: `apps/h5/src/beading/useBeadingDraft.ts`
- Create: `apps/h5/src/beading/useBeadingDraft.test.tsx`

草稿类型扩展为所有新字段可选以读取旧 JSON；`normalizeBeadingDraft(raw, cellCount)` 返回完整 `BeadingToolState` 子集。hook 契约：

```ts
useBeadingDraft({ ownerId, sessionId, cellCount, state, dispatch, storage, onWarning }): {
  clearDraft(): void;
}
```

- [ ] **Step 1:** 写旧草稿迁移、索引去重/越界过滤和新字段 round-trip 失败测试。
- [ ] **Step 2:** 运行 `npx vitest run apps/h5/src/beading/beadingSessionUtils.test.ts`，预期新断言 FAIL。
- [ ] **Step 3:** 扩展 `BeadingDraft` 并实现 normalization，保持原键格式不变。
- [ ] **Step 4:** 重跑 utils 测试，预期 PASS。
- [ ] **Step 5:** 写 hook 失败测试：首次只读一次、owner 缺失不读写、150ms 防抖、rows/cols 改变过滤、quota/parse 错误调用 warning。
- [ ] **Step 6:** 运行 `npx vitest run apps/h5/src/beading/useBeadingDraft.test.tsx`，预期 FAIL。
- [ ] **Step 7:** 实现 hook；默认 storage 为 `window.localStorage`。state effect 只重置 150ms timer，不在 effect cleanup flush；独立 unmount effect 从 `latestStateRef` flush。`clearDraft` 先设 `suppressedRef=true`、取消 timer 再删除，后续卸载不得重建。
- [ ] **Step 8:** 写 clear 语义测试：普通卸载保留，显式 clear 删除，完成失败不由 hook 自动删除。
- [ ] **Step 9:** 运行两个草稿测试文件，预期 PASS。
- [ ] **Step 10:** 提交四个文件，commit `feat(h5): persist beading tool draft`。

### Task 3: 第四张 Canvas 覆盖层

**Files:**
- Create: `apps/h5/src/canvas/H5BeadingOverlay.ts`
- Modify: `apps/h5/src/canvas/H5CanvasRenderer.test.ts`
- Modify: `apps/h5/src/canvas/H5CanvasLayers.tsx`
- Modify: `apps/h5/src/canvas/H5CanvasLayers.test.ts`
- Modify: `apps/h5/src/canvas/H5CanvasRenderer.ts`

```ts
export type H5CanvasOverlay = {
  currentColorCode: string | null; highlightEnabled: boolean;
  markedCellIndexes: readonly number[]; completedColorCodes: readonly string[];
};
export type DrawViewportBeadingOverlayOptions = H5CanvasOverlay & {
  viewportWidth:number; viewportHeight:number; artboard:ViewportArtboard;
  rows:number; cols:number; renderScale:number; cells:readonly CanvasCell[];
  getCode(color:string):string;
};
```

- [ ] **Step 1:** 写 renderer RED 测试：暗层、当前色青边、完成弱勾、标记强勾、透明格跳过、高亮关闭后 clearRect 清旧像素。
- [ ] **Step 2:** 运行 `npx vitest run apps/h5/src/canvas/H5CanvasRenderer.test.ts`，预期导出缺失 FAIL。
- [ ] **Step 3:** 实现 `drawViewportBeadingOverlay`，只遍历 visible range。
- [ ] **Step 4:** 重跑 renderer 测试，预期 PASS。
- [ ] **Step 5:** 写 invalidation RED 测试：overlay/cells/dimensions/getCode/camera/viewport 使 overlay dirty；仅字体和 codesVisible 不使 overlay dirty；gridVisible 只影响 grid。
- [ ] **Step 6:** 为 `DrawViewportGridLayerOptions` 增加 `visible:boolean` 并写 RED 测试，关闭时必须先 clearRect 再 return，旧网格像素不可残留。
- [ ] **Step 7:** 更新 snapshot、dirty 类型和 `H5CanvasLayers` props，加入第四个 canvas/context，顺序 color/code/grid/overlay，并接入 grid visible。
- [ ] **Step 8:** 写 backing-area RED 测试，验证 `CANVAS_LAYER_COUNT=4` 后 4096/总面积约束、DPR resize 和每张 canvas configure 尺寸。
- [ ] **Step 9:** 更新层数常量并运行 `npx vitest run apps/h5/src/canvas/H5CanvasRenderer.test.ts apps/h5/src/canvas/H5CanvasLayers.test.ts`，预期 PASS。
- [ ] **Step 10:** 提交相关文件，commit `feat(h5): render beading canvas highlights`。

### Task 4: Pointer 手势与 Canvas viewport/fit

**Files:**
- Create: `apps/h5/src/pages/beading/useBeadingPointer.ts`
- Create: `apps/h5/src/pages/beading/useBeadingPointer.test.tsx`
- Create: `apps/h5/src/pages/beading/BeadingCanvasViewport.tsx`
- Create: `apps/h5/src/pages/beading/BeadingCanvasViewport.test.tsx`

pointer hook 用 ref 保存 `{activePointerIds:Set<number>,primaryPointerId,startX,startY,moved,hadMultiTouch}`；down 将 id 加入集合并 capture，第二指加入后永久设本轮 `hadMultiTouch`；move 只追踪 primary 且超过 4px 标记 moved；任意 up/cancel 先从集合删除，只有“primary 抬起、从未多指、未移动”才调用 `onCell(index)`；primary 先抬起或集合清空都彻底重置本轮，不能在双指结束后误标记。所有坐标以变换后的 artboard rect 映射。

viewport 以 18px/格生成 artboard 原始尺寸，`ResizeObserver` 读取 stage content box；fit 计算 `scale=min((w-32)/artboardWidth,(h-32)/artboardHeight)`，允许小作品放大，最终仅钳制到 TransformWrapper 的 `[0.25,8]`；位移为 `(w-artboardWidth*scale)/2` 与对应 y，调用 `setTransform(x,y,scale,180)`。resize、rows/cols 和 focusMode 改变时重新 fit；锁定传给 `TransformWrapper disabled`。

- [ ] **Step 1:** 写 pointer down/move/up/cancel、双指、锁定、越界和零尺寸 RED 测试。
- [ ] **Step 2:** 运行 pointer 测试，预期模块不存在 FAIL。
- [ ] **Step 3:** 实现 pointer hook并重跑，预期 PASS。
- [ ] **Step 4:** 写 viewport fit RED 测试，mock ResizeObserver 与 `setTransform`，验证上述 scale/位移公式、小画布放大、上下限及 focus resize 重算。
- [ ] **Step 5:** 运行 viewport 测试，预期模块不存在 FAIL。
- [ ] **Step 6:** 实现 viewport；暴露 `onFitReady(fit:()=>void)` 供“适应”按钮调用，Canvas 本身 pointer-events none、artboard 接手势。
- [ ] **Step 7:** 重跑两个测试文件，预期 PASS。
- [ ] **Step 8:** 提交四个文件，commit `feat(h5): add beading canvas interactions`。

### Task 5: 拆分并实现控制组件

**Files:**
- Modify/Test: `apps/h5/src/pages/beading/BeadingToolbar.tsx`, `apps/h5/src/pages/beading/BeadingToolbar.test.tsx`
- Create/Test: `apps/h5/src/pages/beading/BeadingToolRow.tsx`, `apps/h5/src/pages/beading/BeadingToolRow.test.tsx`
- Create/Test: `apps/h5/src/pages/beading/BeadingToolPanels.tsx`, `apps/h5/src/pages/beading/BeadingToolPanels.test.tsx`
- Modify/Test: `apps/h5/src/pages/beading/BeadingColorRail.tsx`, `apps/h5/src/pages/beading/BeadingColorRail.test.tsx`

props 分别只接展示值、pending/disabled 和事件回调；不在子组件复制 reducer/session 状态。`BeadingColorRail` 接收 `{requirements, completed, current, sortMode, resolveColor, resolveTextColor, pending, terminalPrepare, onSelect, onSort, onRevise, onComplete}`。

- [ ] **Step 1:** 写 toolbar RED 测试：库存、计时暂停、保存、设置、pending 与 44px 可访问 label。
- [ ] **Step 2:** 实现 toolbar，运行其测试预期 PASS。
- [ ] **Step 3:** 写六工具 RED 测试，区分开关/模式/面板选中和 fit 瞬时命令。
- [ ] **Step 4:** 实现 tool row，运行其测试预期 PASS。
- [ ] **Step 5:** 写 search/more RED 测试：大小写搜索、空态、选择关闭、Escape、toggle、clear、reset。
- [ ] **Step 6:** 实现 panels，运行其测试预期 PASS。
- [ ] **Step 7:** 写 rail RED 测试：MARD 背景、对比文字、完成角标、排序/修订、计数和 terminal “确认完成”。
- [ ] **Step 8:** 实现 rail，运行其测试预期 PASS。
- [ ] **Step 9:** 运行四个组件测试文件，预期 PASS。
- [ ] **Step 10:** 提交八个文件，commit `feat(h5): add beading session controls`。

### Task 6: 页面异步动作状态机

**Files:**
- Create: `apps/h5/src/pages/beading/useBeadingSessionActions.ts`
- Create: `apps/h5/src/pages/beading/useBeadingSessionActions.test.tsx`

```ts
type SessionMutation = (input: {completedColorCodes:string[];elapsedSeconds:number;version:number}) => Promise<BeadingSession>;
type Prepare = (input:{version:number}) => Promise<BeadingSession>;
type Complete = (input:{deduct:boolean}) => Promise<BeadingSession>;
type Resume = (input:{version:number}) => Promise<BeadingSession>;
type PendingAction = null|'save'|'inventory'|'patch'|'prepare'|'complete'|'resume';
type UseBeadingSessionActionsInput = {
  session:BeadingSession; elapsedSeconds:number; currentColor:string|null;
  onPatch:SessionMutation; onPrepareCompletion:Prepare; onComplete:Complete;
  onResume:Resume; onOpenInventory:()=>Promise<void>;
  onSessionConflict:(session:BeadingSession)=>void; onStatus:(message:string)=>void;
  onCurrentChange:(code:string|null)=>void; onPrepared:()=>void; onCompleted:()=>void;
};
type UseBeadingSessionActionsResult = {
  pendingAction:PendingAction; save():Promise<boolean>; completeCurrent():Promise<boolean>;
  retryPrepare():Promise<boolean>; openInventory():Promise<boolean>;
  resume():Promise<boolean>; complete(deduct:boolean):Promise<boolean>;
};
```

- [ ] **Step 1:** 写 RED 测试：当前色 PATCH 失败不推进、重复点击一次请求、PATCH 返回 version 传给 prepare。
- [ ] **Step 2:** 实现 save/completeCurrent/prepare 串行核心，运行测试预期 PASS。
- [ ] **Step 3:** 写 RED 测试：prepare 失败可单独重试、pending_completion 恢复、结构化错误 `body.session` 调用 `onSessionConflict`。
- [ ] **Step 4:** 实现 `isSessionConflictError(error)` 与 terminal retry，运行测试预期 PASS。
- [ ] **Step 5:** 写 RED 测试：保存失败不退出、inventory 防重复、resume 成功/失败、complete 扣/不扣两路、complete 失败不触发 clear。
- [ ] **Step 6:** 实现其余动作及每类 pending 的 finally 解锁，运行测试预期 PASS。
- [ ] **Step 7:** 提交两个文件，commit `feat(h5): serialize beading session actions`。

### Task 7: 集成 BeadingSessionPage

**Files:**
- Modify: `apps/h5/src/pages/beading/BeadingSessionPage.tsx`
- Modify: `apps/h5/src/pages/beading/BeadingSessionPage.test.tsx`

`BeadingSessionPageProps` 明确包含 Task 6 四类 Promise、`onOpenInventory():Promise<void>`、`onExit({mode})`、`onSessionConflict(session)`、`draftOwnerId?:string` 和 `onStatus(message)`；父级保证有 session 才渲染，回调不得返回 null。

- [ ] **Step 1:** 写页面 RED 测试：切色自动高亮、mark/revise、锁定、搜色、排序、more、fit、专注退出。
- [ ] **Step 2:** 接入 reducer、控制组件、viewport 和 canvas overlay，运行页面测试预期 PASS。
- [ ] **Step 3:** 写页面 RED 测试：草稿恢复、保存退出保留、放弃清理、complete 成功清理、失败保留。
- [ ] **Step 4:** 接入 draft hook 和退出流程，运行页面测试预期 PASS。
- [ ] **Step 5:** 写页面 RED 测试：暂停保存 elapsed、resume version、pending 按钮禁用、prepare 重试弹窗。
- [ ] **Step 6:** 接入 action hook 和计时回归，运行页面测试预期 PASS。
- [ ] **Step 7:** 提交两个文件，commit `feat(h5): integrate beading session workspace`。

### Task 8: H5App 最新 session/version 与库存入口

**Files:**
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/flow/H5FlowComponents.test.ts`

- [ ] **Step 1:** 写结构 RED 测试：显式 input version、Promise 返回 session、draftOwnerId、inventory callback、冲突 session 同步。
- [ ] **Step 2:** 运行 flow 测试，预期新断言 FAIL。
- [ ] **Step 3:** 扩展 H5App 内部 `requestApi` 的错误契约为 `Object.assign(new Error(message), {status, code, body})`，保留响应中的 `body.session`；补测试证明版本冲突信息不丢失。
- [ ] **Step 4:** 重构 patch/prepare/complete/resume：无 active session 时 reject `Error('拼豆会话已失效')`；成功先 set state 再 return；失败 setStatus 后 throw。
- [ ] **Step 5:** 实现 `openBeadingInventory():Promise<void>`，父级持有 sheet data；页面只持 pending。
- [ ] **Step 6:** 接入新 props，`draftOwnerId={loginName.trim() || undefined}`；冲突回调用 payload session 更新父状态。
- [ ] **Step 7:** 运行 `npx vitest run apps/h5/src/flow/H5FlowComponents.test.ts apps/h5/src/pages/beading/BeadingSessionPage.test.tsx`，预期 PASS。
- [ ] **Step 8:** 提交两个文件，commit `fix(h5): return latest beading sessions`。

## Chunk 2: 视觉、回归与推送

### Task 9: 独立页面样式与响应式视觉令牌

**Files:**
- Create: `apps/h5/src/pages/beading/beadingSession.css`
- Modify: `apps/h5/src/pages/beading/BeadingSessionPage.tsx`
- Modify: `apps/h5/src/styles.css`
- Modify: `apps/h5/src/pages/beading/BeadingSessionPage.test.tsx`

- [ ] **Step 1:** 写样式契约 RED 测试：分区 class、无 82px、四 canvas 绝对叠放/pointer-events none、44px 热区、字号和 reduced-motion。
- [ ] **Step 2:** 从 8850 行总样式删除旧 beading session 规则，在页面导入独立 CSS。
- [ ] **Step 3:** 实现顶部/进度/stage/工具/色轨布局和 safe-area；正文≥12px、主按钮 15–17px。
- [ ] **Step 4:** 实现固定令牌：蓝绿进度、`#18d8ff` 高亮、橙色双描边、120–180ms 动效及 reduced-motion=0。
- [ ] **Step 5:** 实现 320–430px media query 和 focus 隐藏规则，热区保持≥44px。
- [ ] **Step 6:** 运行 `npx vitest run apps/h5/src/pages/beading/BeadingSessionPage.test.tsx`，预期该测试文件 PASS。
- [ ] **Step 7:** 运行 `git add apps/h5/src/pages/beading/beadingSession.css apps/h5/src/pages/beading/BeadingSessionPage.tsx apps/h5/src/styles.css apps/h5/src/pages/beading/BeadingSessionPage.test.tsx && git commit -m "style(h5): align beading mobile workspace"`。

### Task 10: 固定 fixture 与 Playwright 截图验收

**Files:**
- Create: `apps/h5/src/pages/beading/BeadingSessionFixture.tsx`
- Modify: `apps/h5/src/H5App.tsx`
- Create: `tests/e2e/beading-session-visual.h5.spec.ts`
- Create: `tests/e2e/beading-session-visual.h5.spec.ts-snapshots/beading-390.png`
- Create: `tests/e2e/beading-session-visual.h5.spec.ts-snapshots/beading-430.png`

fixture 只在 `import.meta.env.DEV && location.search.includes('beading-fixture=1')` 渲染，使用 27×27 固定 cells、8 色 requirements、3 个已完成色和 no-op resolved Promise；生产 build 不暴露入口。参考图为 `/Users/yuhaowang/project/qiaoqiaole/6121786192676_.pic.jpg`。

- [ ] **Step 1:** 写 Playwright 测试访问 `/?beading-fixture=1`，循环设置 390×844 和 430×932，并用 boundingBox 数值断言：无水平滚动、每个按钮宽高≥44、顶部≤96、底部≤190、artboard/stage 宽度比≥0.78、stage 与上下控制区矩形不相交；再断言 overlay canvas 可见、focus 可进可退、当前色卡 computed border 为橙色。
- [ ] **Step 2:** 增加 fixture 组件和 DEV 路由；不手工启动服务，沿用 `playwright.config.ts` 已有 `h5-chromium` project 和 `npm run dev:h5 -- --port 5174` webServer。文件名以 `.h5.spec.ts` 结尾以匹配现有 testMatch。
- [ ] **Step 3:** 运行 `npx playwright test tests/e2e/beading-session-visual.h5.spec.ts --project=h5-chromium --update-snapshots`，预期量化布局断言先 PASS，再生成两个基线。
- [ ] **Step 4:** 人工对照参考图确认颜色、层级和间距方向；若量化断言或人工检查失败，只修改 Task 9 CSS/页面分区，然后重新执行 Step 3。
- [ ] **Step 5:** 运行 `npx playwright test tests/e2e/beading-session-visual.h5.spec.ts --project=h5-chromium`，预期两视口量化断言 PASS，截图像素差在 Playwright 默认阈值内。
- [ ] **Step 6:** 运行 `git add apps/h5/src/pages/beading/BeadingSessionFixture.tsx apps/h5/src/H5App.tsx tests/e2e/beading-session-visual.h5.spec.ts tests/e2e/beading-session-visual.h5.spec.ts-snapshots && git commit -m "test(h5): cover beading mobile visuals"`。

### Task 11: MARD/API 修复归档与全量验证

**Files:**
- Existing related changes: `apps/api/src/mard221.mjs`, `apps/api/src/beadingSessionUtils.mjs`, `apps/api/src/beadingSessionUtils.test.mjs`, `apps/api/src/beadingInventoryApi.test.mjs`, `apps/api/src/server.mjs`, `apps/h5/src/H5App.tsx`

- [ ] **Step 1:** 运行 `npx vitest run apps/api/src/beadingSessionUtils.test.mjs apps/api/src/beadingInventoryApi.test.mjs`，预期 MARD HEX/C17 与 inventory API 测试 PASS。
- [ ] **Step 2:** 审查上述既有 diff，只暂存与本问题相关的 MARD/API/H5App 修改。
- [ ] **Step 3:** 运行 `git add apps/api/src/mard221.mjs apps/api/src/beadingSessionUtils.mjs apps/api/src/beadingSessionUtils.test.mjs apps/api/src/beadingInventoryApi.test.mjs apps/api/src/server.mjs && git commit -m "fix: normalize MARD colors for beading sessions"`；H5App 已随 Task 8 提交，不重复暂存。
- [ ] **Step 4:** 运行 `npm test -- --run`，预期全套测试 PASS 且无 unhandled errors。
- [ ] **Step 5:** 运行 `npm run build`，预期 Web/H5 TypeScript 和 Vite build 均成功。
- [ ] **Step 6:** 运行 `git diff --check`，预期无输出。

### Task 12: 最终审查、复验和推送

**Files:**
- 只修改 codex-review 证明必须修复的相关文件；每个修复加入对应测试。

- [ ] **Step 1:** 使用 `codex-review` 审查当前分支和剩余工作区，预期无 P0/P1。
- [ ] **Step 2:** 若有 P0/P1，逐项写/更新失败测试并修复；若没有则跳过本步。
- [ ] **Step 3:** 将审查修复提交为 `fix: address beading session review findings`；没有修复则不创建空提交。
- [ ] **Step 4:** 重新运行 `npm test -- --run`，预期 PASS。
- [ ] **Step 5:** 重新运行 `npm run build`，预期 PASS。
- [ ] **Step 6:** 运行 `git status --short`，确认仅剩用户无关未跟踪文件：参考图、`fix_bug.md`、comment-default-avatar spec；相关源码不得未提交。
- [ ] **Step 7:** 运行 `git branch --show-current` 与 `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`，记录当前分支/upstream；upstream 缺失则停止并报告。
- [ ] **Step 8:** 运行 `git push`，预期远端接受当前分支。
