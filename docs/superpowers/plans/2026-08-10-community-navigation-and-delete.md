# 社区导航与作品删除实施计划

> **For agentic workers:** REQUIRED: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`. Follow RED → GREEN → REFACTOR.

**Goal:** 固定社区单页导航的返回目标，并为现有作品硬删除补齐权限、关联清理和前端交互回归。

**Architecture:** 保留 `H5App` 中显式 ref 记录来源页面；将返回目标计算提取为纯函数以便测试。删除继续调用现有 `DELETE /api/projects/:id`，不引入软删除或第二套缓存。

**Tech Stack:** React 19、TypeScript、Vitest、Node.js ESM、SQL.js。

---

### Task 1：固定返回目标状态机

**Files:**

- Create: `apps/h5/src/community/communityNavigation.ts`
- Create: `apps/h5/src/community/communityNavigation.test.ts`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx`

- [ ] 定义最小纯函数和联合类型，表达详情来源、作者页来源和作者页返回前的详情；不要引入路由库或浏览器 history 猜测。
- [ ] 先写失败测试覆盖：发现 → 详情 → 发现；发现 → 作者 → 作者作品详情 → 作者 → 发现；详情 → 作者 → 原详情。
- [ ] 写失败测试确认“我的 → 我的作品 → 返回”目标为 `profile`，修复当前返回 `home` 的行为。
- [ ] `H5App` 继续使用 `patternDetailBackTargetRef`、`authorProfileBackTargetRef`、`authorProfileReturnPatternRef`，但所有目标选择调用已测试的纯函数。
- [ ] 运行：`npm test -- apps/h5/src/community/communityNavigation.test.ts apps/h5/src/patterns/H5PatternPages.test.ts apps/h5/src/pages/home/HomeProfileNavigation.test.tsx --run`。

### Task 2：建立可复用的第二用户测试夹具

**Files:**

- Create: `apps/api/src/testPhoneUser.mjs`
- Modify: `apps/api/src/phoneAuth.integration.test.mjs`
- Modify: `apps/api/src/community.test.mjs`

- [ ] 从现有手机号鉴权集成测试提取“签名 challenge/send/register 并返回 access token”的测试 helper；helper 只在测试代码使用。
- [ ] 社区权限测试以 `AUTH_SMS_PROVIDER=mock`、固定验证码和独立测试手机号创建第二用户，不伪造 production token，不新增测试后门路由。
- [ ] 测试夹具使用当前测试 Redis 配置；在 suite setup 检查依赖并给出明确失败信息，在 teardown 清理生成的用户会话和临时数据库。
- [ ] 保留现有管理员登录作为作品所有者，第二用户只用于跨用户权限断言。
- [ ] 运行：`npm test -- apps/api/src/phoneAuth.integration.test.mjs apps/api/src/community.test.mjs --run`。

### Task 3：补齐现有硬删除 API 契约

**Files:**

- Modify: `apps/api/src/community.test.mjs`
- Modify only if tests expose a defect: `apps/api/src/server.mjs`

- [ ] 先写失败测试：本人删除返回 200；第二用户删除返回 404；重复删除返回 404；匿名请求返回 401。
- [ ] 删除后断言作品不在 `/api/projects`、热门/最新社区列表和作者主页中。
- [ ] 在删除前制造点赞、通知、评论和活跃拼豆会话，删除后断言关联记录已清理且会话不再引用作品。
- [ ] 保留事务硬删除和“不存在/非本人统一 404”的信息隐藏策略；不增加 `deleted_at` 或 403 分支。
- [ ] 运行：`npm test -- apps/api/src/community.test.mjs --run`。

### Task 4：验证前端确认与局部状态更新

**Files:**

- Modify: `apps/h5/src/pages/beading/ProjectActionSheet.test.tsx`
- Create: `apps/h5/src/community/deleteProjectFlow.test.ts`
- Create if orchestration extraction is needed: `apps/h5/src/community/deleteProjectFlow.ts`
- Modify only if tests expose a defect: `apps/h5/src/H5App.tsx`

- [ ] 测试删除按钮阻止卡片编辑/开始动作冒泡。
- [ ] 测试确认弹窗快速重复点击只提交一次；失败时保留 action sheet 上下文并显示错误。
- [ ] 删除成功后只从 `recentProjects` 移除目标并关闭 action sheet；重新进入发现时沿用现有加载器刷新，不维护第二套社区缓存失效器。
- [ ] 运行：`npm test -- apps/h5/src/pages/beading/ProjectActionSheet.test.tsx apps/h5/src/community/deleteProjectFlow.test.ts --run`。
- [ ] 运行：`git diff --check`。

## 完成标准

- 所有返回路径由显式来源状态决定且有纯函数测试。
- 跨用户删除使用真实第二用户 token 验证。
- 删除保持事务硬删除，关联记录和前端状态均一致。
