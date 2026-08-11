# 首页数据非破坏性刷新实施计划

> **For agentic workers:** REQUIRED: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`. Follow RED → GREEN → REFACTOR.

**Goal:** 在重新进入首页或文档恢复可见时刷新首页数据，同时避免匿名私有请求、旧请求覆盖新请求以及失败后清空已有内容。

**Architecture:** 将“何时刷新”和“四类数据如何刷新”抽成可测试编排；继续复用现有加载器。热门、最近作品、通知、仓库分别拥有 request sequence ref。后台刷新使用 preserve-on-error 模式。

**Tech Stack:** React 19、TypeScript、Vitest、Testing Library、Playwright。

---

## 固定刷新契约

- 本轮不实现触摸下拉手势、阻尼或刷新动画。
- 进入 `screen === 'home'` 且 `activeTab === 'home'` 时刷新一次。
- `document.visibilityState` 从 hidden 恢复为 visible 时，只有当前仍在首页才刷新。
- 匿名：只刷新社区热门。
- 登录：并行刷新社区热门、最近作品、通知和仓库摘要。
- 后台刷新失败保留各自当前数据，显示非阻塞、可重试错误。
- 每类资源只接受自身最新 request sequence 的结果和 loading/error 收尾。

### Task 1：抽取首页刷新编排并先测试调用矩阵

**Files:**

- Create: `apps/h5/src/pages/home/homeRefresh.ts`
- Create: `apps/h5/src/pages/home/homeRefresh.test.ts`
- Modify: `apps/h5/src/H5App.tsx`

- [ ] 定义依赖注入式 `refreshHomeData`，参数包含可选 token 和四个 loader，返回 `Promise.allSettled` 结果，避免一个失败阻止其余刷新。
- [ ] 先写失败测试：匿名只调用热门；登录调用全部四项；每项恰好一次；一个 loader reject 不取消其他 loader。
- [ ] `H5App` 使用该编排函数，不在 `HomeShellPage` 复制请求逻辑。
- [ ] 运行：`npm test -- apps/h5/src/pages/home/homeRefresh.test.ts --run`。

### Task 2：让四个加载器支持竞态保护和保留数据

**Files:**

- Modify: `apps/h5/src/H5App.tsx`
- Create: `apps/h5/src/pages/home/homeLoaders.test.ts`

- [ ] 为热门和最近作品核对现有 sequence ref；为当前缺失保护的通知、仓库分别增加 `notificationsRequestSeqRef`、`warehousesRequestSeqRef`。
- [ ] 加载器接收显式选项 `{ preserveOnError?: boolean }`，默认值保持原有首次加载语义；首页后台刷新统一传 `true`。
- [ ] 先写测试：第二个请求先返回时，第一个旧响应不得覆盖；旧请求的 `finally` 不得关闭新请求 loading。
- [ ] 测试 `preserveOnError: true` 时保留已有数据；首次加载仍可使用当前空态。
- [ ] 错误状态按资源记录或汇总为首页可重试提示，不使用清空列表表示错误。
- [ ] 运行：`npm test -- apps/h5/src/pages/home/homeLoaders.test.ts --run`。

### Task 3：接入进入首页和 visibilitychange 生命周期

**Files:**

- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`
- Modify: `tests/e2e/h5.spec.ts`

- [ ] 写失败测试：从发现/我的切回首页触发一轮刷新，其他 tab 切换不重复触发首页刷新。
- [ ] 注册 `visibilitychange` listener；handler 读取最新 screen、activeTab 和 token，cleanup 使用同一函数引用移除监听。
- [ ] 测试 hidden 不刷新、visible + 当前首页刷新、visible + 当前非首页不刷新。
- [ ] E2E 验证离开/返回首页后热门和最近作品更新；模拟一个后台请求失败并确认旧内容仍可见。
- [ ] 运行：`npm test -- apps/h5/src/pages/home/homeRefresh.test.ts apps/h5/src/pages/home/homeLoaders.test.ts apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx --run`。
- [ ] 运行：`npx playwright test tests/e2e/h5.spec.ts --grep "首页刷新"`。
- [ ] 运行：`git diff --check`。

## 完成标准

- 首页重入和恢复可见均刷新，监听无泄漏。
- 匿名绝不请求私有首页资源。
- 四类请求均不会被旧响应覆盖，失败不清空已展示内容。
