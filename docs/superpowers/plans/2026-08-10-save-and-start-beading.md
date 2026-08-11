# “保存并开始拼豆”修复实施计划

> **For agentic workers:** REQUIRED: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan. Follow RED → GREEN → REFACTOR and complete one task at a time.

**Goal:** 修复保存弹窗内“保存并开始拼豆”点击无响应，并保证匿名登录拦截、保存及会话创建均只执行一次。

**Architecture:** `H5App` 继续拥有保存、鉴权和导航编排；从 `CanvasPage` 抽出可独立测试的保存弹窗。弹窗通过显式 `startBeading` 参数提交意图，不用 ref 暂存下一步动作。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library。

---

## 根因与行为契约

当前 `CanvasPage` 的“保存并开始拼豆”调用 `saveAndStartProject`；后者先设置 `saveAndStartRef.current = true`，再调用只负责打开保存弹窗的 `saveCurrentProject()`。弹窗已经打开时没有发生提交，因此用户看到“没反应”。

固定行为：

- 打开保存入口时若未登录，立即显示登录框。
- 登录成功后恢复保存弹窗，不自动提交作品或创建会话。
- 普通保存提交 `{ startBeading: false }`。
- “保存并开始拼豆”提交 `{ startBeading: true }`。
- 请求进行中两个提交按钮都禁用；一次点击最多创建一个作品更新和一个拼豆会话。
- 保存成功但后续创建会话失败时保留已保存作品，显示可重试错误，不重复创建作品。

### Task 1：让保存弹窗可以独立验证提交意图

**Files:**

- Create: `apps/h5/src/pages/editor/SaveProjectDialog.tsx`
- Create: `apps/h5/src/pages/editor/SaveProjectDialog.test.tsx`
- Modify: `apps/h5/src/pages/editor/CanvasPage.tsx`

- [ ] 从 `CanvasPage` 抽出当前保存弹窗的展示和表单控件，不改变文案、样式类名或字段校验。
- [ ] 先写失败测试：表单提交调用 `onConfirm({ startBeading: false })`；次要按钮调用 `onConfirm({ startBeading: true })`。
- [ ] 测试空名称和 `isSaving` 时不可提交；快速双击不产生第二次回调。
- [ ] `CanvasPage` 只传递展示状态、字段值、setter、取消回调和统一 `onConfirm`，不再接收 `saveAndStartProject`。
- [ ] 运行：`npm test -- apps/h5/src/pages/editor/SaveProjectDialog.test.tsx --run`。

### Task 2：合并 H5App 保存提交入口

**Files:**

- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/H5App.auth.test.ts`
- Modify: `apps/h5/src/pages/editor/CanvasPage.tsx`

- [ ] 先写失败测试或最小编排测试，证明匿名点击保存会打开登录框，且登录成功只恢复保存弹窗。
- [ ] 将 `confirmSaveProject` 支为接收 `{ startBeading: boolean }`，在函数局部读取该值决定保存成功后是否创建会话。
- [ ] 删除 `saveAndStartRef`、`saveAndStartProject` 以及取消/失败路径中对该 ref 的重置。
- [ ] 保存入口继续使用零参数包装 `() => saveCurrentProject()`，避免 React click event 被当作 token。
- [ ] 统一提交函数以 `isSavingProject` 防重入；`finally` 恢复 loading，失败时保留弹窗和名称。
- [ ] 只有 `startBeading === true` 且作品保存成功时才执行：创建会话 → 库存检查 → 进入拼豆页。
- [ ] 运行：`npm test -- apps/h5/src/pages/editor/SaveProjectDialog.test.tsx apps/h5/src/H5App.auth.test.ts --run`。

### Task 3：回归真实保存链路

**Files:**

- Modify: `tests/e2e/h5.spec.ts`

- [ ] 增加匿名用例：上传图片进入稿件保存，点击保存后登录框可见，不得静默无响应。
- [ ] 增加登录用例：“保存并开始拼豆”发起一次作品保存、一次会话创建并进入拼豆页。
- [ ] 增加失败用例：会话创建失败时作品仍已保存，页面显示错误且不发生重复导航。
- [ ] 运行：`npx playwright test tests/e2e/h5.spec.ts --grep "保存|拼豆"`。
- [ ] 运行：`git diff --check`。

## 完成标准

- 匿名保存入口始终出现登录框。
- 保存弹窗的两个提交动作由显式参数区分。
- 不存在跨弹窗生命周期残留的“稍后开始拼豆”ref。
- 一次点击不会重复保存、创建会话或导航。
