# 社区发布标签、搜索筛选与作品文件夹 Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:subagent-driven-development` (if subagents available) or `superpowers:executing-plans` to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户可将个人作品归档至文件夹，并在确认分享时为社区作品选择必填标签；发现页可按关键词、标签和排序稳定检索作品。

**Architecture:** 在 SQLite 的 `projects` 上增加可空 `folder_id`，并以 `project_folders` 管理用户私有文件夹；社区标签使用 `project_tags` 关联表。服务端将标签和文件夹归属作为项目读取模型的一部分返回，并在数据库层处理权限、校验和删除文件夹后的归档。H5 复用现有保存弹窗、我的作品页与发现页，通过小型受控组件承接选择器与确认操作，避免再扩大 `H5App.tsx` 的业务分支。

**Tech Stack:** Node.js ESM、SQLite（`sql.js`）、React、TypeScript、Vitest、React Test Renderer。

---

## 当前代码定位

| 责任 | 当前文件 | 现状 |
| --- | --- | --- |
| 数据库初始化、路由与项目/社区接口 | `apps/api/src/server.mjs` | `projects` 已有社区发布状态；`/api/projects` 和 `/api/community/posts` 是唯一入口。 |
| API 集成测试 | `apps/api/src/community.test.mjs` | 每个测试启动独立 SQLite 服务，适合验证权限、迁移、发布及检索结果。 |
| H5 根状态和请求编排 | `apps/h5/src/H5App.tsx` | 保存、分享、加载近期作品和社区列表均在这里。 |
| 保存弹窗 | `apps/h5/src/pages/editor/SaveProjectDialog.tsx` | 已提供名称、分享开关与保存意图。 |
| 作品页与发现页 | `apps/h5/src/patterns/H5PatternPages.tsx` | 我的作品仅列表展示；发现页只有排序，搜索框没有状态。 |
| 前端数据类型/映射 | `apps/h5/src/shared/h5Types.ts`、`apps/h5/src/community/communityData.ts` | `RecentProject` 和 `CommunityPost` 尚无 folder/tags。 |

## Chunk 1: 服务端文件夹归档

### Task 1: 覆盖文件夹迁移、CRUD 与归档规则

**Files:**
- Modify: `apps/api/src/community.test.mjs`
- Modify: `apps/api/src/server.mjs`

- [ ] **Step 1: 写出文件夹 API 的失败测试**

在 `community.test.mjs` 增加一个独立用例，使用两个登录用户验证：创建返回 `folder`；名称清理后不可重复；第二个用户不能重命名、删除或作为移动目标使用；删除文件夹后该文件夹内的作品仍存在且 `folderId === null`。

```js
const created = await request('/api/project-folders', {
  method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ name: '动物作品' }),
});
expect(created.status).toBe(201);
expect(created.body.folder.name).toBe('动物作品');

const moved = await request(`/api/projects/${projectId}/folder`, {
  method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ folderId: created.body.folder.id }),
});
expect(moved.body.project.folderId).toBe(created.body.folder.id);
```

- [ ] **Step 2: 单独运行并确认红灯**

Run: `npx vitest run apps/api/src/community.test.mjs`

Expected: FAIL，原因是 `404` 或响应没有 `folder`，不得因为测试环境配置错误而失败。

- [ ] **Step 3: 增加 schema 与幂等迁移**

在 `initializeDatabase()` 的建表 SQL 中增加：

```sql
CREATE TABLE IF NOT EXISTS project_folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, name),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

同时增加 `projects.folder_id` 的 `ALTER TABLE` 兼容迁移，以及：

```sql
CREATE INDEX IF NOT EXISTS idx_projects_user_folder_updated
  ON projects(user_id, folder_id, updated_at DESC);
```

- [ ] **Step 4: 实现受限文件夹 helper 和路由**

在 `server.mjs` 中添加小而独立的 helper：

```js
function normalizeFolderName(value) { /* trim 后校验 1–30 个字符 */ }
function getOwnedFolder(userId, folderId) { /* folderId 为 null 时直接返回 null */ }
```

增加并要求登录的接口：

```text
GET    /api/project-folders
POST   /api/project-folders
PATCH  /api/project-folders/:folderId
DELETE /api/project-folders/:folderId
PATCH  /api/projects/:projectId/folder
```

删除文件夹时在同一次 SQLite transaction 内将所属项目 `folder_id` 置空后再删除文件夹。移动前同时验证项目和目标文件夹均归当前用户。

- [ ] **Step 5: 将 folderId 回写到项目读取/写入模型**

更新 `listProjects`、`createProject`、`updateProject`、`copyCommunityProject` 的字段选择和 JSON 返回；`POST/PUT /api/projects` 接收可选 `folderId` 并调用 `getOwnedFolder` 校验。复制社区稿件默认归入未分类（`folderId: null`）。

- [ ] **Step 6: 运行 API 测试确认绿灯**

Run: `npx vitest run apps/api/src/community.test.mjs`

Expected: PASS；新增用例证明归档、权限和删除归档均正确，已有社区用例不得退化。

## Chunk 2: 服务端发布标签与社区检索

### Task 2: 覆盖标签校验、编辑与检索语义

**Files:**
- Modify: `apps/api/src/community.test.mjs`
- Modify: `apps/api/src/server.mjs`

- [ ] **Step 1: 写出标签发布的失败测试**

新增用例覆盖：无标签分享为 `400`；非法标签、空数组、超过三项和重复标签为 `400`；合法 `['动物', '动漫']` 可以分享；作者可以替换标签；非作者编辑返回 `404`；社区列表与详情返回 `tags`。

```js
const invalid = await request(`/api/projects/${projectId}/share`, {
  method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ tags: [] }),
});
expect(invalid.status).toBe(400);

const shared = await request(`/api/projects/${projectId}/share`, {
  method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({ tags: ['动物', '动漫'] }),
});
expect(shared.body.tags).toEqual(['动物', '动漫']);
```

再新建不同标题、作者和标签的共享作品，验证 `q` 可命中作品名、作者名和标签名；`tags=动物,动漫` 按 OR 规则返回；`sort=latest|hot` 仍在过滤结果内排序。

- [ ] **Step 2: 运行并确认红灯**

Run: `npx vitest run apps/api/src/community.test.mjs`

Expected: FAIL，因为当前分享接口不读取 body 且社区返回没有 `tags`。

- [ ] **Step 3: 增加标签关联表和唯一受控标签常量**

在初始化 schema 增加：

```sql
CREATE TABLE IF NOT EXISTS project_tags (
  project_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, tag),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_project_tags_tag_project
  ON project_tags(tag, project_id);
```

在模块顶层定义唯一来源：

```js
const COMMUNITY_TAGS = ['动物', '人物', '植物', '食物', '风景', '动漫', '游戏', '节日', '文字', '新手', '其他'];
```

添加 `normalizeCommunityTags(value)`：只接受数组、清理空白、去重、限制 1–3 个，且所有值必须在该常量中；失败抛出业务可读错误。

- [ ] **Step 4: 实现发布和编辑标签的原子写入**

将 `shareProject` 修改为读取 JSON body 并在 transaction 内：校验标签、标记首次分享、替换 `project_tags`。已分享时 `/share` 应视为“编辑标签”而非重复发布，且不能刷新 `shared_at`。添加显式接口：

```text
PATCH /api/projects/:projectId/community-tags
body: { tags: string[] }
```

该接口只允许作者，返回最新 tags。

- [ ] **Step 5: 让社区读取模型携带 tags 并支持筛选**

为 `getCommunityPost`、`listCommunityPosts`、作者资料的作品查询抽取 `getProjectTags(projectIds)` 或以聚合子查询一次性读取标签，避免卡片 N+1 查询。更新 `formatCommunityPost`，使每个 post 有稳定的 `tags: string[]`。

`listCommunityPosts(response, userId, sort, pagination, filters)` 读取：

```js
const q = String(searchParams.get('q') || '').trim().slice(0, 60);
const tags = normalizeRequestedTagFilters(searchParams.get('tags'));
```

关键词使用参数化 `LIKE` 匹配 `p.name`、作者展示名和标签；多标签以 `EXISTS (...) tag IN (...)` 实现 OR。`sort` 只允许 `hot` 和 `latest`，保留当前同分次序。

- [ ] **Step 6: 提供可缓存的标签目录接口**

添加公共 `GET /api/community/tags`，返回 `{ tags: COMMUNITY_TAGS }`；这让前端不用复制服务端校验值，并且日后可平滑替换为后台配置。

- [ ] **Step 7: 运行 API 测试确认绿灯**

Run: `npx vitest run apps/api/src/community.test.mjs`

Expected: PASS；所有标签约束、旧的 likes/comments/匿名读取和资产访问用例保持通过。

## Chunk 3: H5 数据类型、保存归档与我的作品页

### Task 3: 先定义前端数据契约和纯组件行为

**Files:**
- Modify: `apps/h5/src/shared/h5Types.ts`
- Modify: `apps/h5/src/community/communityData.ts`
- Create: `apps/h5/src/projects/projectFolders.ts`
- Create: `apps/h5/src/projects/ProjectFolderPicker.tsx`
- Create: `apps/h5/src/projects/ProjectFolderPicker.test.tsx`
- Modify: `apps/h5/src/pages/editor/SaveProjectDialog.tsx`
- Modify: `apps/h5/src/pages/editor/SaveProjectDialog.test.tsx`

- [ ] **Step 1: 为受控文件夹选择器写失败测试**

测试 `ProjectFolderPicker` 必须：显示“未分类”和已有文件夹；选择时调用 `onChange(folderId|null)`；快捷新建调用 `onCreateFolder`；删除后传入的不存在 id 会回退为 `null`。

- [ ] **Step 2: 运行并确认红灯**

Run: `npx vitest run apps/h5/src/projects/ProjectFolderPicker.test.tsx`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 添加共享类型和纯数据 helper**

扩展 `RecentProject`：

```ts
folderId?: string | null;
tags?: CommunityTag[];
```

在 `projectFolders.ts` 维护：

```ts
export type ProjectFolder = { id: string; name: string; createdAt: string; updatedAt: string };
export const UNCATEGORIZED_FOLDER_ID = null;
export function resolveFolderId(folderId: string | null | undefined, folders: ProjectFolder[]): string | null;
```

`CommunityPost` 与 `toPatternListCard` 同步暴露 `tags`；前端标签类型不要从 JSX 字符串推断。

- [ ] **Step 4: 实现并验证 FolderPicker**

实现为受控下拉/操作入口，不在组件内发请求；父级提供 `folders`、`value`、`onChange` 和 `onCreateFolder`。在 `SaveProjectDialog` 增加 `folders`、`folderId` 和 `onFolderChange` props，在名称字段下渲染“保存位置”。

- [ ] **Step 5: 运行组件测试确认绿灯**

Run: `npx vitest run apps/h5/src/projects/ProjectFolderPicker.test.tsx apps/h5/src/pages/editor/SaveProjectDialog.test.tsx`

Expected: PASS；原有保存和“保存并开始拼豆”意图保持不变。

### Task 4: 编排保存文件夹状态和我的作品文件夹交互

**Files:**
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.test.ts`
- Modify: `apps/h5/src/styles.css`

- [ ] **Step 1: 为我的作品页写失败测试**

扩展 `MyWorksPage` 测试，传入三个文件夹和不同 `folderId` 的项目，验证：全部、未分类和某文件夹计数正确；切换文件夹只渲染所属项目；每张作品有“移动到文件夹”入口；不重新出现已移除的“收藏/喜欢”标签。

- [ ] **Step 2: 运行并确认红灯**

Run: `npx vitest run apps/h5/src/patterns/H5PatternPages.test.ts`

Expected: FAIL，因为当前页面只有一个静态“作品”标签。

- [ ] **Step 3: 在 H5App 添加文件夹请求和状态**

仅在已登录时读取 `GET /project-folders`；增加 `folders`、`activeFolderId`、`saveFolderId` 状态。实现以下函数并复用 `requestApi`/`requireLogin`：

```ts
loadProjectFolders(token?: string): Promise<void>
createProjectFolder(name: string): Promise<ProjectFolder>
renameProjectFolder(folderId: string, name: string): Promise<void>
deleteProjectFolder(folderId: string): Promise<void>
moveProjectToFolder(projectId: string, folderId: string | null): Promise<void>
```

保存时把 `folderId: resolveFolderId(saveFolderId, folders)` 传给 `saveRecentProject`；服务端保存成功后采用返回项目更新本地状态。读取项目后将失效文件夹引用显示为未分类。

- [ ] **Step 4: 实现我的作品文件夹 UI**

在 `MyWorksPage` 的统计与网格之间增加横向可滚动文件夹条：`全部作品`、`未分类`、自定义文件夹、`+ 新建文件夹`。作品卡片操作通过现有 action sheet 弹出“移动到文件夹”，并提供重命名/删除文件夹管理模式。删除确认必须使用根组件现有 `requestConfirm`，确认后才请求服务端。

- [ ] **Step 5: 加入最小样式并做视觉回归检查**

新增局部 class（例如 `my-work-folder-rail`、`my-work-folder-chip`），沿用现有页面的间距、圆角、按钮高度和颜色 token；禁止重写 `author-work-card`、`author-profile-stats` 等共享选择器。

- [ ] **Step 6: 运行 H5 回归测试**

Run: `npx vitest run apps/h5/src/patterns/H5PatternPages.test.ts apps/h5/src/pages/editor/SaveProjectDialog.test.tsx apps/h5/src/H5App.auth.test.ts`

Expected: PASS；未登录仍只弹登录窗，保存与既有我的作品导航不受影响。

## Chunk 4: H5 发布确认、标签和发现页搜索筛选

### Task 5: 对标签选择器和发布确认先写组件测试

**Files:**
- Create: `apps/h5/src/community/communityTags.ts`
- Create: `apps/h5/src/community/CommunityTagSelector.tsx`
- Create: `apps/h5/src/community/ShareCommunityDialog.tsx`
- Create: `apps/h5/src/community/ShareCommunityDialog.test.tsx`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/styles.css`

- [ ] **Step 1: 写发布确认的失败测试**

验证：弹窗显示作品名称、尺寸和公开提示；初始没有标签时“确认发布”禁用；选择 1–3 个预设标签后可提交；选满三项后其余项不可选；取消只调用关闭；已分享的标题改为“编辑社区标签”。

```tsx
expect(renderer.root.findByProps({ 'aria-label': '确认发布' }).props.disabled).toBe(true);
act(() => renderer.root.findByProps({ 'aria-label': '选择标签 动物' }).props.onClick());
expect(renderer.root.findByProps({ 'aria-label': '确认发布' }).props.disabled).toBe(false);
```

- [ ] **Step 2: 运行并确认红灯**

Run: `npx vitest run apps/h5/src/community/ShareCommunityDialog.test.tsx`

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现受控标签常量及选择器**

`communityTags.ts` 导出只读的预设值、`CommunityTag` 类型和 `normalizeSelectedTags`；它与 API 的列表一致，但 API 仍为最终校验者。`CommunityTagSelector` 仅管理展示与 `onChange`，不发请求。

- [ ] **Step 4: 实现发布确认弹窗并接入 H5App**

在 `H5App.tsx` 增加 `shareDialogProject` 和 `shareDialogTags` 状态。点击未分享的“分享到社区”只打开 `ShareCommunityDialog`；确认才调用：

```ts
requestApi(`/projects/${project.id}/share`, {
  method: 'POST', body: JSON.stringify({ tags }),
});
```

若已分享，入口改为打开同一弹窗并调用 `PATCH /projects/:id/community-tags`。保存弹窗中的“分享到社区”改为：先保存，随后打开同一确认弹窗，绝不在保存函数中直接调用 `/share`。完成后更新 `recentProjects`、关闭弹窗并刷新当前发现页查询。

- [ ] **Step 5: 运行组件与相关回归测试**

Run: `npx vitest run apps/h5/src/community/ShareCommunityDialog.test.tsx apps/h5/src/pages/editor/SaveProjectDialog.test.tsx apps/h5/src/patterns/H5PatternPages.test.ts`

Expected: PASS；发布前不会产生社区请求，编辑标签也不会创建第二条社区作品。

### Task 6: 对发现页搜索、标签筛选与查询状态写测试

**Files:**
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.test.ts`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/community/communityData.ts`
- Modify: `apps/h5/src/styles.css`

- [ ] **Step 1: 为受控发现页写失败测试**

将 `PatternDiscoverPage` 变成受控视图，新增 `query`、`selectedTags`、`availableTags`、`onQueryChange`、`onTagsChange`。测试搜索框 value 与回调；“全部”清空标签；多选标签保持选中；卡片有最多两个标签及 `+N`；当前排序 state 继续使用。

- [ ] **Step 2: 运行并确认红灯**

Run: `npx vitest run apps/h5/src/patterns/H5PatternPages.test.ts`

Expected: FAIL，当前 input 没有 value/onChange 且没有标签筛选条。

- [ ] **Step 3: 实现发现页受控筛选 UI**

在搜索框下增加横向标签条，以 `全部` 清空状态。`CommunityPatternCard` 展示最多 2 个 `#标签`，超过时显示 `+N`；详情页展示完整标签并允许点击标签触发 `onFilterTag(tag)` 回到发现页。

- [ ] **Step 4: 在 H5App 接入防抖查询并避免竞态**

新增 `communityQuery`、`communitySelectedTags` 状态，令 `loadCommunityPosts(sort, filters)` 构造：

```ts
const params = new URLSearchParams({ sort });
if (query.trim()) params.set('q', query.trim());
if (tags.length) params.set('tags', tags.join(','));
```

关键词变动使用 250–300ms `useEffect` 防抖；排序/标签变动立即加载。使用递增 request sequence 或 `AbortController`，忽略较慢的旧响应，避免输入时列表回滚。退出登录后清理当前用户的 liked/following 状态，但保留公共搜索结果。

- [ ] **Step 5: 运行 H5 相关测试**

Run: `npx vitest run apps/h5/src/patterns/H5PatternPages.test.ts apps/h5/src/community/communityData.test.ts apps/h5/src/H5App.auth.test.ts`

Expected: PASS；排序、未登录浏览与卡片头像/点赞样式用例不退化。

## Chunk 5: 全量验证与人工验收

### Task 7: 按真实流程验证跨层行为

**Files:**
- Modify only if verification exposes a defect: the responsible file above

- [ ] **Step 1: 运行 API 全量测试**

Run: `npx vitest run apps/api/src/*.test.mjs`

Expected: PASS，无 SQLite migration 或并发测试回归。

- [ ] **Step 2: 运行 H5 全量测试和类型检查**

Run: `npx vitest run apps/h5/src && npx tsc --noEmit -p apps/h5/tsconfig.json`

Expected: PASS，且 TypeScript 不报错。

- [ ] **Step 3: 执行格式/差异安全检查**

Run: `git diff --check`

Expected: 无输出、退出码 0。

- [ ] **Step 4: 手工验收清单**

1. 新建“动物作品”文件夹，保存新图纸时选择它，作品进入该文件夹。
2. 从“全部作品”将一件作品移至“未分类”，返回文件夹后数量同步变化。
3. 删除“动物作品”并确认，其中作品存在于“未分类”。
4. 从未分享作品点击“分享到社区”，取消后发现页没有该作品。
5. 再次打开，未选标签无法发布；选择“动物、动漫”后发布，卡片/详情均显示标签。
6. 编辑已分享作品标签，确认分享时间和作品 id 不变。
7. 在发现页分别按标题、作者和标签搜索；选择多个标签时看到命中任意标签的结果；切换热门/最新结果保持筛选条件。
8. 未登录时尝试创建文件夹、移动、保存、分享、编辑标签，均进入统一登录弹窗而不是发起匿名写请求。

## 提交建议

若工作区可安全提交，按以下逻辑拆分，且每个提交先完成对应测试：

1. `feat(api): add project folder organization`
2. `feat(api): add community tags and filtering`
3. `feat(h5): organize saved projects with folders`
4. `feat(h5): confirm sharing and filter community posts`

当前工作树含有其他未提交改动；执行时必须只暂存本计划对应的文件，不得用 `git reset`、`git checkout` 或整树格式化来清理工作区。
