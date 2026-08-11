# 评论一级回复与删除实施计划

> **For agentic workers:** REQUIRED: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`. Follow RED → GREEN → REFACTOR.

**Goal:** 在现有评论功能上增加一级回复和本人删除，固定迁移、嵌套返回、分页、计数及跨用户权限契约。

**Architecture:** 在现有 `project_comments` 表增加父评论和回复目标字段；API 以顶级讨论组分页并返回嵌套结构。H5 直接消费服务端线程结构，不在客户端重新猜测分组或跨页拼接。

**Tech Stack:** Node.js ESM、SQL.js、React 19、TypeScript、Vitest、Playwright。

---

## API 与数据契约

迁移字段：

```text
project_comments.parent_id TEXT NULL
project_comments.reply_to_user_id TEXT NULL
```

响应结构：

```ts
type CommunityCommentThread = CommunityComment & {
  replies: CommunityComment[];
};

type CommunityCommentsResponse = {
  comments: CommunityCommentThread[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalTopLevel: number;
  totalComments: number;
};
```

固定语义：

- `GET /api/community/posts/:projectId/comments?page=1&pageSize=20` 中 `pageSize` 按顶级评论组计数。
- 顶级评论按创建时间倒序；组内回复按创建时间正序；返回所选组的全部一级回复。
- `POST` body 为 `{ content, parentId? }`。服务端从父评论计算 `replyToUserId`，不接受客户端用户 ID。
- parent 必须属于同一作品且自身没有 parent；否则返回 400/404，不允许二级回复。
- `commentsCount` 和 `totalComments` 均统计顶级评论与回复总数。
- 删除回复减 1；删除顶级评论事务删除整组，减去 `1 + replies.length`。
- 非作者删除和不存在评论统一返回 404；匿名写入/删除返回 401。

### Task 1：建立跨用户评论测试夹具和 schema 迁移

**Files:**

- Reuse/Create from navigation plan: `apps/api/src/testPhoneUser.mjs`
- Modify: `apps/api/src/server.mjs`
- Modify: `apps/api/src/community.test.mjs`

- [ ] 复用手机号 mock 注册 helper 创建第二用户；若导航删除计划尚未执行，先按其 Task 2 创建该 helper，不复制一份夹具。
- [ ] 先写迁移测试：旧数据库只有顶级评论时启动成功，新增列为空，原评论仍可读取。
- [ ] 使用现有幂等迁移模式增加两列和必要索引；重复启动不得报错或丢数据。
- [ ] 为同一作品创建所有者评论和第二用户评论，后续权限测试不得只依赖单一管理员 token。
- [ ] 运行：`npm test -- apps/api/src/community.test.mjs --run`。

### Task 2：实现写入、嵌套读取和精确分页

**Files:**

- Modify: `apps/api/src/server.mjs`
- Modify: `apps/api/src/community.test.mjs`

- [ ] 先写失败测试：创建顶级评论、回复顶级评论、拒绝跨作品 parent、拒绝回复的回复、匿名返回 401。
- [ ] 写分页测试：至少 3 个顶级组且每组有不同回复数，`pageSize=2` 时第一页返回两个完整组，第二页返回剩余完整组，无回复重复或遗漏。
- [ ] 断言顶级倒序、回复正序，以及 `page/pageSize/hasMore/totalTopLevel/totalComments`。
- [ ] POST 成功返回完整 `CommunityComment`，包含 `parentId`、`replyToUserId`、`replyToUserName`；值由服务端 join/查询生成。
- [ ] 通知接收者来自父评论作者；回复自己的评论不产生自通知。
- [ ] 运行：`npm test -- apps/api/src/community.test.mjs --run`。

### Task 3：实现本人删除和计数事务

**Files:**

- Modify: `apps/api/src/server.mjs`
- Modify: `apps/api/src/community.test.mjs`

- [ ] 新增 `DELETE /api/community/posts/:projectId/comments/:commentId`。
- [ ] 先写失败测试：本人删回复、本人删顶级整组、第二用户删除返回 404、重复删除返回 404、匿名返回 401。
- [ ] 删除顶级评论时在同一事务中删除回复及这些评论产生的通知，并按实际删除条数更新作品评论计数。
- [ ] 删除回复只清理该回复及对应通知，顶级评论保留。
- [ ] 事务失败必须回滚评论、通知和计数，不产生部分删除。
- [ ] 运行：`npm test -- apps/api/src/community.test.mjs --run`。

### Task 4：H5 消费线程结构并提供回复/删除交互

**Files:**

- Modify: `apps/h5/src/community/communityData.ts`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.test.ts`

- [ ] 增加 `CommunityCommentThread` 和分页响应类型；H5 不再把扁平数组自行分组。
- [ ] 详情页展示一级嵌套。点击回复显示 `回复 @用户名`，取消后恢复普通输入。
- [ ] 未登录点击回复或发送复用现有登录框；登录成功后恢复输入/回复目标，不自动发送。
- [ ] 回复、删除和发送分别维护 pending id/state，阻止重复提交但不锁死整个评论区。
- [ ] 发送成功用服务端返回记录更新对应线程；删除成功按服务端实际删除数更新详情及列表卡片计数，失败不做假删除。
- [ ] 删除顶级组后移除整组；删除回复只移除该回复。若当前页因此为空且 `page > 1`，加载上一页而不是展示错误空态。
- [ ] 运行：`npm test -- apps/h5/src/patterns/H5PatternPages.test.ts --run`。

### Task 5：端到端回归

**Files:**

- Modify: `tests/e2e/h5.spec.ts`

- [ ] 覆盖：用户 A 评论 → 用户 B 回复 → 用户 B 删除回复 → 用户 A 删除顶级评论。
- [ ] 验证未登录点击回复显示登录框。
- [ ] 验证第二用户看不到删除他人评论的成功结果；即使直接请求也返回 404。
- [ ] 运行：`npm test -- apps/api/src/community.test.mjs apps/h5/src/patterns/H5PatternPages.test.ts --run`。
- [ ] 运行：`npx playwright test tests/e2e/h5.spec.ts --grep "评论|回复"`。
- [ ] 运行：`git diff --check`。

## 完成标准

- 旧数据库可幂等迁移，旧顶级评论不丢失。
- API 返回稳定的嵌套线程与分页元数据，讨论组永不跨页。
- 只有评论作者可删除；顶级整组删除、通知清理和计数在同一事务中完成。
- H5 回复目标、pending 状态、列表与计数始终与服务端结果一致。
