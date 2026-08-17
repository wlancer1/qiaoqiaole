/goal

在当前仓库中完整实现“社区真实数据、评论、点赞与作品分享”功能。

## 最终目标

将 H5 端发现页、首页热门图纸和作品详情页中的静态社区数据替换为真实 API 数据，并允许用户将已保存作品分享到社区。

以现有 `projects` 表作为社区作品的唯一数据源，不创建社区作品快照表。

未登录用户可以浏览社区列表、社区作品详情和评论；点赞、评论和分享必须登录。

持续工作，直到实现、测试和构建验证全部完成。不要只输出方案或伪代码，应直接检查仓库并修改实际代码。

## 开始前

1. 阅读项目根目录及相关目录中的 `AGENTS.md`、`README.md` 和现有开发说明。
2. 检查当前 Git 状态，不覆盖或撤销用户已有修改。
3. 定位并理解：

   * sql.js / SQLite 初始化和持久化逻辑
   * 数据库迁移方式
   * Bearer session 和可选登录解析方式
   * `projects`、`users` 表结构
   * 作品保存及删除流程
   * `requestApi`
   * 登录状态与登录引导
   * 首页热门图纸
   * 发现页
   * 社区或图纸详情页
   * 我的作品页面
   * 现有测试框架和 Playwright 配置
4. 先根据实际仓库结构制定实施计划，并使用 checklist 跟踪进度。
5. 发现需求与现有架构冲突时，优先采用最小改动、兼容现有实现的方案，并记录决策，不要重构无关模块。

## 数据库改动

在 `projects` 表增加：

```text
shared_to_community INTEGER NOT NULL DEFAULT 0
shared_at TEXT NULL
likes_count INTEGER NOT NULL DEFAULT 0
```

新增 `project_likes` 表：

```text
project_id
user_id
created_at
PRIMARY KEY (project_id, user_id)
```

新增 `project_comments` 表：

```text
id
project_id
user_id
content
created_at
```

要求：

* `project_likes` 关联 `projects` 和 `users`。
* `project_comments` 关联 `projects` 和 `users`。
* 项目删除时，其点赞和评论必须级联删除。
* 数据库初始化时启用 `PRAGMA foreign_keys = ON`。
* 迁移兼容已有 SQLite 文件，不得覆盖原数据库。
* 使用 `PRAGMA table_info(projects)` 判断新增字段是否存在。
* 使用 SQLite 支持的 `ALTER TABLE ... ADD COLUMN`。
* 创建社区热门、最新排序、评论查询所需索引。
* 保留一个根据 `project_likes` 重新校准 `likes_count` 的内部维护函数或脚本。

## sql.js 写入一致性

检查当前 sql.js 持久化实现。

点赞、评论、分享、保存和删除等数据库写操作必须复用现有统一写锁、写队列或等价串行机制。

如果现有实现没有安全的统一写入机制，在数据库封装层补充最小范围的串行写入能力，确保：

* 同一时间只执行一个写任务。
* 多条相关 SQL 使用事务。
* 事务成功后再持久化 SQLite 文件。
* 失败时回滚。
* 并发点赞和评论不会覆盖彼此的数据。
* 不建立第二套数据库封装。

## API

### 社区列表

实现：

```http
GET /api/community/posts?sort=hot|latest&page=1&pageSize=20
```

权限：

* 无需登录。
* Bearer session 可选。
* 有有效 session 时返回真实 `likedByCurrentUser`。
* 未登录时返回 `likedByCurrentUser: false`。

只返回：

```text
shared_to_community = 1
```

热门排序：

```text
likes_count DESC, shared_at DESC, project id DESC
```

最新排序：

```text
shared_at DESC, project id DESC
```

返回至少包括：

* projectId
* title
* imageUrl
* width
* height
* 作者 ID 和用户名
* likesCount
* commentsCount
* sharedAt
* likedByCurrentUser
* 分页信息

评论数必须来自数据库聚合，不得使用静态计数。

避免直接同时 JOIN 两张一对多表造成重复计数，优先使用子查询或独立聚合。

图片继续复用现有 COS / 本地资源解析逻辑。

### 社区作品详情

检查现有详情接口是否能安全返回已分享作品。

如果不能满足要求，实现：

```http
GET /api/community/posts/:projectId
```

权限：

* 无需登录。
* session 可选。

只允许读取已分享作品，并返回真实作品数据、作者、点赞数、评论数、分享时间和当前用户点赞状态。

### 评论列表

实现：

```http
GET /api/community/posts/:projectId/comments?page=1&pageSize=20
```

权限：

* 无需登录。

要求：

* 作品必须存在且已经分享。
* 返回评论作者用户名。
* 按 `created_at DESC, id DESC` 排序。
* 返回分页信息。

### 点赞

实现：

```http
POST /api/community/posts/:projectId/like
```

权限：

* 必须登录。

本次只实现点赞，不实现取消点赞。

要求：

* 未分享作品不能点赞。
* 同一用户不能重复点赞。
* 重复请求幂等成功。
* 首次成功插入 `project_likes` 后才递增 `projects.likes_count`。
* 插入点赞记录和递增计数必须处于同一事务。
* 重复点赞不得增加计数。
* 返回真实 `liked`、`likesCount` 和 `alreadyLiked` 状态。

不要只依赖前端防重，必须依靠数据库复合主键保证唯一性。

### 评论发布

实现：

```http
POST /api/community/posts/:projectId/comments
```

权限：

* 必须登录。

请求体：

```json
{
  "content": "评论内容"
}
```

要求：

* 作品必须已经分享。
* `content` 必须为字符串。
* 服务端执行 `trim()`。
* trim 后为空时拒绝。
* 最长 300 个 Unicode 字符，使用等价于 `[...content].length` 的方式计算。
* 评论以纯文本存储。
* 返回数据库真实写入的新评论及作者信息。

### 分享作品

实现：

```http
POST /api/projects/:projectId/share
```

权限：

* 必须登录。
* 只允许作品拥有者调用。

要求：

* 作品必须存在并已保存完成。
* 必须具有有效预览图、尺寸及社区展示所需数据。
* 首次分享写入：

  * `shared_to_community = 1`
  * `shared_at = 当前 ISO 8601 时间`
* 重复分享幂等成功。
* 重复分享不得更新 `shared_at`。
* 不创建社区稿件副本。
* 返回 `sharedToCommunity`、`sharedAt` 和 `alreadyShared`。

## 权限规则

匿名允许：

```text
GET /api/community/posts
GET /api/community/posts/:projectId
GET /api/community/posts/:projectId/comments
```

必须登录：

```text
POST /api/community/posts/:projectId/like
POST /api/community/posts/:projectId/comments
POST /api/projects/:projectId/share
```

不要在社区读取接口上使用强制登录中间件。复用或补充可选 session 解析。

## 错误格式

复用项目现有统一格式：

```json
{
  "error": "ERROR_CODE",
  "message": "用户可理解的错误信息"
}
```

正确区分：

* 400：参数错误、评论为空或过长
* 401：未登录或 session 无效
* 403：非作品拥有者
* 404：作品不存在
* 500：数据库或服务异常

重复点赞和重复分享属于成功，不返回冲突错误。

## 前端改动

删除以下位置的静态稿件、静态评论和静态计数：

* 发现页
* 首页热门图纸
* 社区或图纸详情页

### 发现页

* 请求真实社区 API。
* 支持热门和最新排序。
* 加载时显示现有风格的轻量 loading 或骨架。
* 无数据时显示真实空状态。
* 请求失败时显示错误和重试入口。
* 不生成假卡片。

### 首页热门图纸

* 复用社区热门列表 API。
* 按点赞数降序取前 3 条。
* 使用作品真实缩略图。
* 无数据时显示空状态。

### 详情页

* 从真实社区作品进入。
* 加载真实点赞状态和评论。
* 匿名用户可以查看详情和评论。
* 匿名用户点击点赞时引导登录。
* 匿名用户点击评论输入区域或提交按钮时引导登录。
* 登录后尽量返回当前详情上下文。

### 点赞交互

* 使用乐观更新。
* 请求期间防止重复点击。
* 成功后使用服务端返回的真实计数覆盖本地值。
* 失败后恢复原状态并显示错误。
* 点赞成功后显示已点赞，本次不提供取消点赞。

### 评论交互

* 登录用户可发表评论。
* 成功后将服务端返回的新评论插入列表顶部。
* 清空输入框并更新评论数。
* 失败后保留输入内容。
* 评论使用 React 文本插值渲染。
* 不使用 `dangerouslySetInnerHTML`。

### 保存弹窗

增加“分享到社区”开关：

* 新作品默认关闭。
* 先完成作品和画布快照保存。
* 保存成功且开关开启后，再调用分享接口。
* 保存失败时不得调用分享接口。
* 分享失败不回滚已保存作品。
* 分享失败时明确提示作品已保存，并可在“我的作品”中重试。
* 已分享作品显示“已分享到社区”，不得重复触发分享。

### 我的作品

根据现有 UI 以最小改动增加：

* 未分享：分享到社区
* 分享中：加载状态
* 已分享：已分享到社区
* 分享失败：重试分享

不得通过重复分享刷新 `shared_at`。

## 作品更新和删除规则

由于社区直接读取 `projects`：

* 已分享作品后续编辑会同步反映到社区。
* 原点赞和评论继续保留。
* 删除作品时，作品从社区消失。
* 相关点赞和评论必须删除。
* 不实现取消分享。

## 类型与代码质量

* 为社区列表、详情、评论、点赞和分享响应增加准确 TypeScript 类型。
* 尽量复用现有 `requestApi`、登录状态、图片解析、数据库和页面组件。
* 不复制相同的 API 请求逻辑。
* 不保留静态数据作为无数据兜底。
* 不使用 `any` 绕过关键类型。
* 不重构无关画布、图片上传或编辑器核心逻辑。
* 遵循仓库现有命名、目录、格式化和错误处理方式。

## 测试

根据仓库现有测试结构补充或调整测试。

### API 测试至少覆盖

* 匿名读取社区列表。
* 匿名读取评论。
* 未登录时 `likedByCurrentUser` 为 false。
* 登录时返回真实点赞状态。
* 未分享作品不出现在社区。
* 热门和最新排序。
* 稳定排序。
* 评论数真实聚合。
* 分享权限。
* 首次分享。
* 重复分享幂等且不更新 `shared_at`。
* 未分享作品不可点赞或评论。
* 首次点赞只增加一次。
* 重复点赞不增加数量。
* 点赞复合主键约束。
* 评论 trim、空内容和 300 字符限制。
* 删除项目后关联数据清除。

### 前端测试至少覆盖

* 社区数据映射。
* 首页热门图纸取前 3 条。
* 加载、空和错误状态。
* 已分享和未分享状态。
* 点赞乐观更新及失败回滚。
* 评论成功后立即加入列表。
* 匿名用户互动时触发登录引导。
* 分享失败后保留作品并提供重试。

### E2E

在现有环境允许时，实现或更新以下流程：

```text
登录
→ 创建或保存作品
→ 勾选分享到社区
→ 发现页出现作品
→ 打开详情
→ 点赞
→ 发表评论
→ 刷新
→ 点赞和评论仍然存在
```

并验证：

* 匿名可浏览。
* 重复分享不产生重复作品。
* 重复点赞不增加数量。
* 分享失败不影响作品保存。

## 验证要求

完成后运行仓库实际存在的相关命令，至少包括：

```bash
npm test
npm run build
```

如果仓库使用其他 package manager 或测试命令，根据实际项目调整。

必要时运行相关 Playwright 测试。

不要通过删除测试、跳过测试、放宽断言或隐藏 TypeScript 错误来获得通过。

## 完成条件

只有以下条件全部满足，目标才算完成：

* 静态社区稿件、评论和计数已从目标页面移除。
* 社区读取允许匿名访问。
* 点赞、评论和分享权限正确。
* 数据迁移兼容已有 SQLite 文件。
* sql.js 写入不会因并发持久化而相互覆盖。
* 分享和点赞具有幂等性。
* 点赞记录与计数保持事务一致。
* 发现页、首页和详情页使用真实数据。
* 保存及我的作品页面具备分享状态和失败重试。
* 相关测试已补充。
* 测试和生产构建通过。
* 最终检查 Git diff，确认没有无关大范围重构或用户修改被覆盖。

## 最终汇报

完成后提供：

1. 实际修改的文件列表。
2. 数据库迁移和持久化方案。
3. API 与前端实现摘要。
4. 测试及构建命令和结果。
5. 尚未解决的问题或环境限制。
6. 建议人工重点检查的交互。
