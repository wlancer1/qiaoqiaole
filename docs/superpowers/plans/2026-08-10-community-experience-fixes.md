# 社区与创作体验修复总计划

> **For agentic workers:** 本文件是总计划索引，不应一次性作为单个实现任务执行。每次只选择一个子计划，并使用 `superpowers:executing-plans` 或 `superpowers:subagent-driven-development` 执行；完成该子计划的定向验证后，再进入下一个子计划。

**Goal:** 在现有 React H5、Node API 和 SQL.js 架构内，修复社区导航与删除、小红书文案解析、首页数据新鲜度、“保存并开始拼豆”、H5 本地去背景以及评论回复/删除体验。

**Architecture:** H5 页面继续由 `H5App.tsx` 的 `screen` / `activeTab` 状态驱动；API 继续使用 `apps/api/src/server.mjs` 的现有路由、鉴权和 SQL.js 迁移模式；共享图像算法放入 `packages/core`。不引入 Taro、Zustand、另一套路由、第二套社区列表或新的服务端图片下载能力。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Playwright、Node.js ESM、SQL.js、Browser Canvas API。

---

## 执行基线

本计划以当前工作区为准。工作区存在用户尚未提交的改动，其中包含作者主页、统一确认弹窗、登录拦截、社区卡片等本计划依赖的实现。

- 执行每个子计划前先运行 `git status --short`。
- 不得使用 `git reset --hard`、`git checkout --` 或覆盖无关改动。
- 每个子计划按 RED → GREEN → REFACTOR 执行，先确认测试因目标行为缺失而失败。
- 每个子计划独立验证、独立审查；未经用户要求不自动提交。

当前真实入口：

- H5 根状态和业务编排：`apps/h5/src/H5App.tsx`
- 首页 / 发现 / 我的：`apps/h5/src/pages/home/HomeShellPage.tsx`
- 作者主页 / 我的作品 / 作品详情：`apps/h5/src/patterns/H5PatternPages.tsx`
- 图片浏览、裁剪与分割：`apps/h5/src/pages/split/SplitPages.tsx`
- 画布保存弹窗：`apps/h5/src/pages/editor/CanvasPage.tsx`
- API、schema 与迁移：`apps/api/src/server.mjs`
- 小红书解析：`apps/api/src/xiaohongshu.mjs`
- 共享图像算法：`packages/core/src/domain/grid.ts`

已经存在、不得重复建设：

- 首页热门、发现热门、作品详情、作者主页、我的作品、关注列表。
- 社区帖子、评论、点赞、关注、分享和复制作品 API。
- 带所有权检查和关联清理的 `DELETE /api/projects/:id` 事务硬删除。
- 小红书提取 API、图片代理、前端上传弹窗。
- 保存作品、登录后继续保存、创建拼豆会话和进度保存。
- 发现 → 作者 → 详情所需的显式返回目标 ref。

## 已固定的产品与技术决策

以下决策用于消除实现阶段的歧义；如产品要改变，必须先改对应子计划再编码。

1. **首页刷新不是触摸下拉手势。** 本轮实现进入首页及文档从隐藏恢复可见时的数据刷新。下拉动画、阻尼和触摸手势不在范围内。
2. **首页刷新是非破坏性的。** 后台刷新失败保留当前列表和摘要，只展示可重试错误；旧请求不得覆盖新请求。
3. **作品继续硬删除。** 非本人作品和不存在作品均返回 404；不增加 `deleted_at`。
4. **顶级评论删除采用整组删除。** 删除顶级评论时事务删除它的一层回复并清理通知；不保留“已删除”占位。删除单条回复只影响该回复。
5. **评论分页按顶级讨论组计算。** `pageSize` 表示顶级评论数；选中的每组返回全部一级回复，组不会跨页。
6. **评论只支持一级回复。** 回复目标必须是同一作品的顶级评论，拒绝回复的回复。
7. **去背景后的资源就是当前资源。** 预览、cells、画布导入和作品保存中的 source 图片必须来自同一份当前处理结果；原图单独保留用于恢复。
8. **保存后的动作由提交参数表达。** 普通保存和“保存并开始拼豆”共用一个确认提交入口，不使用跨弹窗生命周期残留的 ref。

## 子计划索引

### A. 保存并开始拼豆（最高优先级）

[2026-08-10-save-and-start-beading.md](./2026-08-10-save-and-start-beading.md)

修复保存弹窗中的按钮只重复打开弹窗、未真正提交的问题，并覆盖匿名登录拦截与单次创建会话。

### B. 社区导航与作品删除

[2026-08-10-community-navigation-and-delete.md](./2026-08-10-community-navigation-and-delete.md)

固定单页应用返回目标，并补齐本人/他人删除、关联清理和前端单次确认回归。

### C. 小红书完整分享文案

[2026-08-10-xiaohongshu-share-text.md](./2026-08-10-xiaohongshu-share-text.md)

在现有提取接口上统一 URL 候选和尾随标点规则，不新增第二套 route/service。

### D. 首页数据刷新

[2026-08-10-home-data-refresh.md](./2026-08-10-home-data-refresh.md)

增加进入首页和恢复可见时的非破坏性刷新，并为四类请求分别增加竞态保护。

### E. H5 本地去背景

[2026-08-10-h5-local-background-removal.md](./2026-08-10-h5-local-background-removal.md)

复用 Web 四角取样算法，统一原图、当前预览、cells、导入与保存 source 的状态语义。

### F. 评论一级回复与删除

[2026-08-10-comment-replies-and-delete.md](./2026-08-10-comment-replies-and-delete.md)

固定 schema、嵌套响应、分页、计数、权限和跨用户测试夹具。

## 执行顺序与依赖

1. 先执行 A，解除当前保存主流程阻塞。
2. B 与 C 无共享 schema 依赖，可在 A 后独立执行。
3. D 依赖现有首页加载器，但不依赖 B/C。
4. E 涉及共享 core 算法与资源状态，应单独实施和验收。
5. F 涉及数据库迁移、API 契约和 UI 状态，最后单独实施。

不要把六个子计划合并为一次大提交。每个子计划完成后运行其定向测试、`git diff --check`，并审查是否触碰了其他子计划的文件；若共享文件（特别是 `H5App.tsx` 和 `server.mjs`）已有改动，基于当前内容做最小增量修改。

## 总体验收

所有子计划完成后再执行全量回归：

- [ ] `npm test -- --run`
- [ ] `npm run build:web && npm run build:h5`
- [ ] `npx playwright test tests/e2e/h5.spec.ts`
- [ ] `git diff --check`
- [ ] `git status --short`
- [ ] 记录并区分执行前已存在的失败和本轮新增失败，不把未运行或已知失败描述为通过。

最终应满足：

- 页面返回目标稳定，“我的作品”返回“我的”Tab。
- 作品删除保持事务硬删除，跨用户权限和关联清理有自动化测试。
- 小红书完整分享文案能提取清洗后的受支持 URL。
- 进入首页或页面恢复可见时获得最新数据，刷新失败不清空已显示内容。
- 匿名保存会显示登录框；“保存并开始拼豆”只保存一次、只创建一个会话。
- H5 可本地去背景和恢复原图，预览、导入及保存 source 一致。
- 评论支持一级回复与本人删除，分页不拆组，计数和权限一致。
