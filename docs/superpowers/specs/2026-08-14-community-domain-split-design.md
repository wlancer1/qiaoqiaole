# 社区业务域拆分设计

## 背景

`apps/h5/src/H5App.tsx` 当前约 3961 行，同时承载认证、作品、画布、社区、分图、仓库和拼豆会话等业务。社区相关状态和副作用已经形成相对完整的边界，但仍与页面路由、认证、全局提示和当前作品展示存在少量协作关系。

本期只拆分社区业务域，不调整视觉表现、路由结构、接口协议或分页策略。目标是让 `H5App` 负责应用级协调，让社区 Hook 负责社区数据与操作。

## 目标与非目标

### 目标

- 抽取社区帖子、作者主页、评论、关注、点赞、通知和相关分页状态。
- 保留当前请求序号、取消过期响应、错误提示和登录拦截行为。
- 保留 `PatternListCard` 映射和社区排序逻辑的现有结果。
- 让社区业务可以通过独立 Hook 进行单元测试。
- 让 `H5App.tsx` 只通过明确的输入和输出使用社区域。

### 非目标

- 不改变 API 路径、请求参数、响应类型或后端逻辑。
- 不改变社区页面的 UI、路由和返回路径。
- 不在本期拆分认证、作品保存、画布编辑、仓库或拼豆会话。
- 不引入全局状态库或新的组件库。
- 不把跨页面弹窗移动到社区 Hook；弹窗仍由应用级覆盖层协调。

## 现状边界

社区相关逻辑主要包括：

- 帖子列表：排序、搜索、标签、分页、加载更多、过期请求保护。
- 作者主页：作者资料、作者作品分页、加载状态和错误状态。
- 关注关系：关注列表、粉丝列表、关注/取消关注和个人统计刷新。
- 互动：点赞、发表评论、回复、删除评论。
- 通知：通知列表、打开通知、标记已读。
- 详情加载：根据社区详情路由加载单个帖子。

这些逻辑会与应用层保持以下协作：

- 读取 `authToken` 和 `authUserId`。
- 调用应用统一的 `requestApi`。
- 登录失效时调用应用层 `requireLogin`。
- 通过 `setStatus` 写入当前页面作用域内的提示。
- 导航到社区详情、作者主页或个人作品页。
- 点赞、评论、关注后同步更新当前激活的 `activePattern`。

## 方案选择

### 方案 A：显式依赖的业务 Hook（采用）

新增 `apps/h5/src/community/useCommunityDomain.ts`，通过参数注入请求、认证、导航和应用协作回调，返回社区状态与操作。

优点：

- 改动范围可控，适合从现有单体组件渐进迁移。
- 依赖明确，避免社区 Hook 隐式读取应用全局状态。
- 保留现有 API 和页面调用方式，容易逐段替换和回滚。
- 可以在不渲染完整 `H5App` 的情况下测试请求竞态和状态更新。

缺点：

- 第一阶段 Hook 参数会比较多。
- `activePattern` 等应用级状态仍需由 `H5App` 通过回调同步。

### 方案 B：社区 Context/Provider

使用 Provider 暴露社区状态和操作。

优点是组件调用更简洁；缺点是需要调整应用级挂载、上下文边界和渲染订阅，容易在本期引入不必要的重渲染及弹窗层级风险，因此暂不采用。

### 方案 C：按页面拆分多个社区容器

分别创建发现页、详情页、作者主页和关注页容器。

该方案最终结构可能更清晰，但会重复处理请求竞态、共享互动状态和路由返回目标。本期先抽取共享业务 Hook，后续再根据实际页面依赖决定是否继续拆容器。

## 目标模块结构

第一期采用小步迁移，不强行拆过多文件：

```text
apps/h5/src/community/
├── useCommunityDomain.ts       # 状态、副作用和社区操作
├── communityData.ts             # 已有类型、映射和树形评论工具
└── communityNavigation.ts       # 已有返回目标工具
```

如果迁移过程中发现请求响应类型明显增加，再补充 `communityApi.ts`；不为了形式拆文件。

## Hook 接口设计

Hook 的依赖采用对象参数，避免位置参数难以维护。概念接口如下，具体类型以现有 `requestApi` 和业务类型为准：

```ts
type CommunityDomainOptions = {
  authToken: string;
  authUserId: string;
  activeTab: string;
  screen: string;
  routePostId: string;
  routeAuthorId: string;
  requestApi: RequestApi;
  navigate: NavigateFunction;
  setStatus: (message: string) => void;
  requireLogin: (resume: (token: string) => void) => void;
  activePattern: PatternListCard | null;
  setActivePattern: Dispatch<SetStateAction<PatternListCard | null>>;
  setActiveTab: (tab: string) => void;
  openMyWorks: (from: string) => void;
};
```

返回值按业务能力分组：

```ts
{
  state: {
    communityPosts,
    communityCards,
    homeTemplateCards,
    communityComments,
    authorProfile,
    authorProfilePosts,
    followingUsers,
    followersUsers,
    notifications,
    loading,
    errors,
    filters,
  },
  actions: {
    loadCommunityPosts,
    loadMoreCommunityPosts,
    loadCommunityComments,
    loadAuthorProfile,
    loadMoreAuthorProfile,
    openAuthorProfile,
    openFollowUserProfile,
    likeCommunityPost,
    toggleCommunityFollow,
    addCommunityComment,
    deleteCommunityComment,
    openNotification,
    loadNotifications,
    loadFollowingUsers,
    loadFollowersUsers,
  },
}
```

实际实现中可以直接扁平返回以减少调用处改动，但内部仍按 `state/actions` 组织代码。

## 状态所有权

迁移到社区 Hook：

- `communityPosts`、`communityComments`、`notifications`。
- 作者主页及关注/粉丝列表状态。
- 社区 loading、分页、错误、搜索、排序和标签状态。
- 评论提交、回复和删除的 pending 状态。
- 社区请求序号和分页 ref。

暂时保留在 `H5App`：

- `activePattern`，因为它也被作品详情和其他页面使用。
- `authToken`、`authUserId` 和登录弹窗。
- 路由来源 ref（作者主页返回目标、详情返回目标）。
- 应用级 `status` 状态和 `requestApi` 实现。

## 迁移顺序

1. 先为社区 Hook 的纯数据映射、排序和评论树更新补充或完善单元测试。
2. 抽取社区状态声明和请求序号 ref，保持原函数签名及错误文案。
3. 迁移帖子列表、搜索/标签 debounce、加载更多。
4. 迁移作者主页、关注列表和粉丝列表。
5. 迁移评论、点赞、关注和通知操作。
6. 将 `H5App` 中社区调用点改为 Hook 返回值。
7. 删除已经迁移的重复状态、函数和 effect。
8. 运行社区相关 Vitest、完整 H5 Vitest 和 `npm run build:h5`。

每个阶段都保持应用可编译；如果发现跨域依赖不能安全移动，保留该段在 `H5App`，通过回调接入，不扩大本期范围。

## 行为保持规则

- 请求序号必须继续丢弃过期响应，避免切换作者、帖子或筛选条件后旧请求覆盖新数据。
- 页面离开后异步结果不能写入新的页面作用域；Hook 的 effect 必须使用取消标记或请求序号。
- 未登录的点赞、关注、评论操作仍交给 `requireLogin`，登录后继续原操作。
- `setStatus` 仍由应用层保证 `screen + activeTab` 作用域，社区 Hook 不自行维护全局提示。
- 弹窗打开、关闭和确认逻辑不迁移到社区 Hook。
- 社区卡片的数据结构和排序结果必须与当前实现一致。

## 测试设计

至少覆盖：

- 帖子首次加载和追加分页。
- 搜索、标签或排序变化时旧请求结果被丢弃。
- 作者主页切换时旧作者响应不覆盖当前作者。
- 评论加载、发表评论、回复和删除后的本地状态更新。
- 点赞和关注后的帖子、详情、作者主页状态同步。
- 未登录操作调用 `requireLogin` 且不发送请求。
- 通知打开及标记已读失败时的提示行为。
- 页面离开后异步结果不写入已失效页面。

## 风险与回滚

主要风险是社区操作同时更新 `activePattern` 和列表数据，迁移时可能造成某一处显示不同步。处理方式是保留 `setActivePattern` 作为显式应用层回调，并在迁移完成前逐项对照原函数。

如果单个能力迁移后测试或构建失败，优先回退该能力到 `H5App`，不回滚无关的已完成拆分。第一期不修改后端和数据库，因此回滚只涉及前端代码。
