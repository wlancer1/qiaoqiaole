# 社区业务域拆分实施计划

> 本计划基于 `docs/superpowers/specs/2026-08-14-community-domain-split-design.md`，第一期只迁移 H5 社区业务，不修改 API、UI 和路由行为。

## 实施原则

- 直接在当前分支工作，不创建新分支或 worktree。
- 每个步骤保持 TypeScript 可编译；步骤失败时只回退当前能力。
- 先补充可观察行为测试，再迁移实现。
- 保留现有错误文案、请求序号、登录拦截和页面作用域提示。
- 使用 `apply_patch` 修改文件。

## 步骤 1：建立社区 Hook 的测试边界

文件：

- 新增 `apps/h5/src/community/useCommunityDomain.test.tsx`
- 参考 `apps/h5/src/community/communityData.test.ts`

任务：

1. 建立最小 Hook 测试工具，注入假的 `requestApi`、`setStatus`、`requireLogin`、`navigate` 和应用层状态回调。
2. 覆盖帖子列表首次请求、追加分页和排序结果。
3. 覆盖过期请求响应不覆盖新请求。
4. 覆盖未登录点赞、关注、评论只触发登录恢复回调。

验证：

```bash
npx vitest run --config vitest.config.ts apps/h5/src/community/useCommunityDomain.test.tsx
```

## 步骤 2：抽取社区状态和帖子列表

文件：

- 新增 `apps/h5/src/community/useCommunityDomain.ts`
- 修改 `apps/h5/src/H5App.tsx`

任务：

1. 将社区帖子、排序、搜索、标签、debounce、分页和加载状态迁入 Hook。
2. 将 `communityPosts`、`communityAvailableTags`、`communityHasMore` 及相关 refs 从 `H5App` 删除。
3. 将 `loadCommunityPosts`、`loadMoreCommunityPosts` 迁入 Hook。
4. 保留 `activeTab` 条件和当前发现页请求参数。
5. 让 `H5App` 使用 Hook 返回值渲染社区卡片和首页模板卡片。

验证：

```bash
npx vitest run --config vitest.config.ts apps/h5/src/community/useCommunityDomain.test.tsx apps/h5/src/community/communityData.test.ts
npm run build:h5
```

## 步骤 3：迁移作者主页和关注/粉丝列表

文件：

- 继续修改 `apps/h5/src/community/useCommunityDomain.ts`
- 修改 `apps/h5/src/H5App.tsx`
- 视需要补充 `apps/h5/src/community/useCommunityDomain.test.tsx`

任务：

1. 迁移作者资料、作者作品分页和作者主页错误状态。
2. 迁移关注用户、粉丝用户及各自加载状态和错误状态。
3. 保留作者主页请求序号，防止快速切换作者时旧响应覆盖新作者。
4. 保留 `openAuthorProfile` 对本人资料的特殊处理。
5. 保留返回目标 refs 在 `H5App` 中，由 Hook 只执行导航和应用回调。

验证：

```bash
npx vitest run --config vitest.config.ts apps/h5/src/community/useCommunityDomain.test.tsx apps/h5/src/patterns/H5FollowingPage.test.tsx
npm run build:h5
```

## 步骤 4：迁移评论、点赞和关注操作

文件：

- 修改 `apps/h5/src/community/useCommunityDomain.ts`
- 修改 `apps/h5/src/H5App.tsx`
- 更新社区 Hook 测试

任务：

1. 迁移评论加载、发表评论、回复和删除。
2. 使用现有 `insertCommentReply`、`removeCommentTree`，不改变树形数据处理。
3. 迁移点赞和关注/取消关注。
4. 通过 `setActivePattern` 同步详情卡片，通过列表 setter 同步列表卡片。
5. 通过 `loadFollowingCount` 或等价注入回调刷新个人关注统计。
6. 保留评论提交、回复和删除 pending 状态。

验证：

```bash
npx vitest run --config vitest.config.ts apps/h5/src/community/useCommunityDomain.test.tsx apps/h5/src/community/communityData.test.ts apps/h5/src/community/CommunityPatternCard.test.tsx
npm run build:h5
```

## 步骤 5：迁移通知和社区详情加载

文件：

- 修改 `apps/h5/src/community/useCommunityDomain.ts`
- 修改 `apps/h5/src/H5App.tsx`
- 更新社区 Hook 测试

任务：

1. 迁移通知列表、打开通知和标记已读。
2. 迁移社区详情路由对应的帖子加载 effect，保留取消标记。
3. 详情加载成功后通过 `setActivePattern` 写回应用当前作品。
4. 通知已读失败和详情加载失败继续使用应用层 `setStatus`。

验证：

```bash
npx vitest run --config vitest.config.ts apps/h5/src/community/useCommunityDomain.test.tsx apps/h5/src/app/H5RoutedContent.test.tsx apps/h5/src/app/h5Routes.test.ts
npm run build:h5
```

## 步骤 6：清理旧逻辑并完成集成回归

任务：

1. 删除 `H5App.tsx` 中已经迁移的社区 state、refs、effects 和函数。
2. 检查社区相关引用，确保没有重复实现或未使用 import。
3. 检查 `activePattern`、`setStatus`、`requireLogin` 和导航回调的依赖数组。
4. 确认页面离开后旧请求不会写入新页面。
5. 确认全局弹层仍位于应用级覆盖层，不被 Hook 改变挂载位置。

验证：

```bash
npx vitest run --config vitest.config.ts apps/h5/src
npm run build:h5
git diff --check
git status --short
```

## 步骤 7：交付检查

交付前确认：

- `H5App.tsx` 行数明显减少，社区业务集中在 `useCommunityDomain.ts`。
- 社区发现、搜索、标签、作者主页、关注、粉丝、详情、评论和通知行为未回归。
- 所有新增测试通过。
- H5 构建通过。
- 没有修改与本期无关的后端、数据库或页面样式。
- 在最终完成前再次查看 `git diff --check` 和工作区状态。
