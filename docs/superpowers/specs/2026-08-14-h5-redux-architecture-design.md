# H5 Redux 状态架构设计

## 背景

`apps/h5/src/H5App.tsx` 当前约 4,000 行，同时负责路由、认证、社区、作品、仓库、分图、画布、拼豆、API 请求、异步竞态处理和应用级弹窗。页面组件虽然已经逐步拆出，但状态、业务操作和页面 Props 仍集中在 `H5App`，使它成为难以理解、测试和修改的应用级上帝组件。

本次重构采用 Redux Toolkit、React Redux 和 RTK Query，但不追求把所有 React 状态都放进 Redux。目标是为每种状态指定唯一且合适的归属，逐步把 `H5App` 收缩为应用壳。

## 目标

- 将 `H5App.tsx` 最终控制在约 100 行以内，只保留应用 Provider、路由边界和应用级覆盖层。
- 使用 Redux Toolkit 管理跨页面、可序列化、需要追踪的客户端业务状态。
- 使用 RTK Query 管理 API 数据、缓存、加载状态、请求去重和缓存失效。
- 使用 React Router 管理页面、资源 ID、Tab、排序和可分享的筛选参数。
- 保留组件本地状态和 Ref，用于表单草稿、DOM、Canvas、手势与高频临时交互。
- 按业务领域渐进迁移，每个阶段保持现有 URL、接口和页面行为不变。
- 将状态管理边界写入根目录 `AGENTS.md`，约束后续新增页面和业务。

## 非目标

- 不在一次提交中重写全部 H5 业务。
- 不引入 Zustand、MobX、Redux Saga 或第二套全局状态库。
- 不把 `ImageData`、DOM 节点、事件、函数、计时器和手势对象放入 Redux。
- 不为了使用 Redux 而迁移只属于单个组件的临时 UI 状态。
- 不改变现有 API 协议、数据库或后端业务语义。

## 总体架构

```text
React Router
  负责 URL、页面、资源 ID、Tab、排序和筛选
        │
        ▼
Route Container
  读取路由参数并组合业务与展示页面
        │
        ├── RTK Query
        │     服务器数据、缓存、请求状态、缓存失效
        │
        ├── Redux Slices
        │     认证、全局 UI、跨页面工作流、可序列化编辑状态
        │
        └── Local State / Reducer / Ref
              表单草稿、Canvas、ImageData、手势、高频临时状态
```

Redux Provider 和 BrowserRouter 只在 `main.tsx` 创建一次。重构完成后的入口关系为：

```tsx
// main.tsx
<Provider store={store}>
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <AppBootstrap><H5App /></AppBootstrap>
  </BrowserRouter>
</Provider>

// H5App.tsx
export default function H5App() {
  return <AppProviders>
    <Suspense fallback={<DelayedRouteLoadingFallback />}>
      <AppRoutes />
    </Suspense>
    <AppOverlays />
  </AppProviders>;
}
```

## 状态归属规则

| 状态类别 | 归属 | 示例 |
| --- | --- | --- |
| 页面与可分享导航状态 | React Router | `postId`、`projectId`、`warehouseId`、首页 Tab、社区排序、标签和搜索参数 |
| 服务器数据 | RTK Query | 帖子、评论、通知、作者资料、作品、文件夹、仓库、库存、拼豆会话 |
| 跨页面客户端状态 | Redux Slice | 登录会话、应用级弹窗、当前工作区 ID、分图步骤和可序列化参数 |
| 单组件临时状态 | `useState` / 局部 `useReducer` | 输入草稿、局部展开状态、尚未提交的弹窗内容 |
| 高频或不可序列化运行时状态 | `useRef` / Feature Context | DOM、Canvas、`ImageData`、`File`、Pointer、动画帧、拖拽和缩放实例 |
| 可由其他状态计算的数据 | Selector / `useMemo` | 总豆数、已用颜色、库存统计、筛选后的颜色列表 |

Redux State 和 Redux Action 必须保持可序列化。不得通过关闭 Redux Toolkit 的 `serializableCheck` 来掩盖设计问题；若第三方库 action 确有例外，应精确配置忽略路径并写明原因。

## Store 设计

初期 Store 只包含真正跨页面的客户端状态和一个 RTK Query API Slice：

```text
apps/h5/src/store/
├── store.ts
├── hooks.ts
├── rootReducer.ts
├── api/
│   ├── apiSlice.ts
│   ├── authEndpoints.ts
│   ├── communityEndpoints.ts
│   ├── projectEndpoints.ts
│   ├── warehouseEndpoints.ts
│   └── beadingEndpoints.ts
└── slices/
    ├── authSlice.ts
    ├── uiSlice.ts
    ├── projectWorkspaceSlice.ts
    ├── splitWorkflowSlice.ts
    └── beadingWorkflowSlice.ts
```

### Slice 职责

`authSlice`

- 当前用户标识和展示资料。
- Access Token 与认证恢复状态。
- 登录、退出和认证失效事件。
- 持久化适配器负责与现有本地存储格式兼容，Reducer 本身不直接访问 `localStorage`。

认证必须在第一阶段迁移，因为所有后续 RTK Query Endpoint 都依赖单一 Token 来源。认证状态使用明确状态机：

```ts
type AuthStatus = 'restoring' | 'authenticated' | 'anonymous';

type AuthState = {
  status: AuthStatus;
  token: string;
  user: AuthUser | null;
  restoreRequestId: string | null;
  sessionVersion: number;
};
```

现有持久化键保持 `qiaoqiaole.auth`，兼容结构为 `{ token: string; username?: string; userId?: string }`。Store 创建时只安全解析该记录：JSON 损坏、字段类型错误或 Token 为空时立即删除并初始化为 `anonymous`；存在 Token 时初始化为 `restoring`，在 `/api/me` 校验完成前，受保护 Query 使用 `skip`，页面显示认证恢复加载态，不先发送匿名请求。

恢复成功后，以 `/api/me` 返回用户为准，一次 action 原子写入认证状态，再更新兼容存储；恢复失败或 Token 过期时，先使旧 Token 对后续请求不可见，再清除用户缓存和本地记录，最终进入 `anonymous`。登录也只在服务端成功后通过一个 `sessionEstablished` action 原子更新；退出即使后端失败也必须完成本地退出。

`restoreSession.pending` 在请求发出前同步写入 `restoreRequestId`，并在 Thunk 参数/Meta 中捕获启动时的 `sessionVersion`；Thunk `condition` 只允许 `status === 'restoring' && restoreRequestId === null`。fulfilled/rejected 只有在 `action.meta.requestId === state.restoreRequestId` 且捕获的 sessionVersion 仍等于当前值时才能修改认证状态，否则只丢弃过期结果。有效 settled action 清空 restoreRequestId 并结束 restoring，从而阻止 StrictMode 第二次 Effect 发起有效请求。`sessionVersion` 在登录成功、恢复成功、退出和认证失效时递增，用于识别账号代次。

本阶段不增加多标签页实时同步；这是明确的非目标。不同标签页在下一次受保护请求返回 401 或刷新时各自收敛。若未来增加同步，只允许通过 `storage` 事件派发已有认证事件，不能直接修改 Store。

`uiSlice`

- 应用级状态提示。
- 统一确认框的可序列化描述和提交状态。
- 不随页面路由卸载的登录、分享等应用级覆盖层状态。
- 提示继续绑定当前路由作用域，旧异步结果不得写入新页面。

确认框不得把 `onConfirm` 函数存入 Redux。统一接口改为 Promise 形式：

```ts
const confirmed = await confirmDialog.open({
  title: '删除作品？',
  message: '删除后无法恢复。',
  confirmText: '删除作品',
  danger: true,
});
if (confirmed) await deleteProject(projectId);
```

`uiSlice` 只保存 `{ id, title, message, confirmText, cancelText, danger }`。`confirmDialog` 模块在 Redux 外用 `Map<id, resolve>` 保存 Promise Resolver；应用同一时刻只允许一个确认框，已有确认框时新的 `open` 立即解析为 `false`，不排队。确认、取消、遮罩和 Esc 使用同一个只执行一次的 settle 函数。Provider 卸载时必须先将所有未完成 Promise 结算为 `false`，再清空 Registry，不能留下永久 pending 的调用方。用户作出选择后 Overlay 立即关闭；后续异步业务由调用方执行，并使用页面或 mutation 的 pending 状态禁止重复提交。迁移期兼容适配器把旧 `onConfirm` 调用转换为 `open(...).then(...)`，旧回调不进入 action 或 state。

页面提示作用域由 Router Bridge 在每次 location 变化时生成 `scopeId = location.key + ':' + pathname + search`，并派发 `routeScopeChanged`。异步操作开始时捕获当前 `scopeId`，完成后派发 `statusRequested({ scopeId, message })`；Reducer 只接受与当前 scope 相同的消息。路由变化同时清理旧提示。全局认证失效等明确跨页面消息使用单独的 `globalStatusRequested`，不得滥用。

现有 `pendingAuthActionRef` 也不能迁入 Redux。新代码的认证门禁为 `authGate.require({ scopeId, returnTo? }): Promise<boolean>`：`uiSlice` 只保存可序列化的登录弹窗请求 ID 和可选 `returnTo` URL，Redux 外 Registry 保存 Resolver。同一登录弹窗打开期间的多个 require 共享该登录流程并分别登记 scope；登录成功时只有 scope 仍相同的请求才解析为 `true`，其余解析为 `false`。取消登录和 Provider 卸载把全部等待者解析为 `false`。单纯导航意图使用可序列化 `returnTo`，登录成功后由 Login Overlay 导航；点赞、保存等操作在 `await require` 返回 true 后发起普通 RTK Query Mutation，Token 仍只能由 Base Query 从当前 Store 读取。迁移期旧函数若仍要求 Token，兼容适配器可以在恢复回调的瞬间通过 Selector 读取当前 Token；该通道在阶段 1 完成时删除。

`projectWorkspaceSlice`

- 当前作品 ID、名称、行列、选择颜色、选择工具等可序列化工作区状态。
- 正式提交后的 Cells 和撤销/重做历史可以迁入，但高频绘制草稿保留在编辑器本地。
- 大数组迁移前必须基准测试 Redux DevTools、开发中间件和渲染性能。

`splitWorkflowSlice`

- 当前步骤、裁剪比例、网格参数、合并阈值、背景敏感度等可序列化流程状态。
- Reducer 采用事件命名，如 `imageSelected`、`cropConfirmed`、`previewCompleted`，而不是大量无语义的 `setXxx`。
- 原始 `ImageData` 和处理中间缓冲区留在 Split Feature 的运行时上下文。

`beadingWorkflowSlice`

- 当前会话 ID、当前颜色、工作阶段和需要跨页面保留的 UI 选择。
- 服务端会话本体和库存检测结果优先由 RTK Query 缓存管理。

## RTK Query 设计

应用只创建一个面向同一 `/api` Base URL 的 `apiSlice`，各业务模块使用 `injectEndpoints` 分文件注入 endpoint。

基础请求层需要兼容现有行为：

- 自动附加认证 Token。
- 统一解析 JSON 和业务错误。
- 401 时派发认证失效事件，但不得产生重复退出和重复提示。
- 支持请求取消信号。
- 保留现有接口返回类型，并在 endpoint 的 `transformResponse` 中完成必要归一化。

Base Query 从 `getState().auth` 读取唯一 Token，并在请求发出时捕获 `{ token, sessionVersion }`。Endpoint 通过 `extraOptions: { auth: 'required' | 'optional' | 'none' }` 声明认证策略：只有 `required` 请求的 401 才派发 `sessionInvalidated({ token, sessionVersion })`；公共 Endpoint 的匿名 401 作为普通请求错误处理。Listener 只有在 action 的 token 和 sessionVersion 都仍等于当前会话时才执行失效，同一代次的并发 401 只处理一次；账号 A 的迟到 401 对账号 B 没有副作用。有效失效的处理顺序为：标记 `anonymous` 并令 Token 立即不可读、取消/重置用户相关 API 缓存、清空用户 Slice、删除本地记录、发出一次全局提示。退出接口失败不回滚本地退出。所有认证异步结果遵守同一规则：启动时捕获 sessionVersion，settled 时代次不匹配则只丢弃结果。

因为公共帖子响应也可能包含当前用户的点赞和关注字段，账号建立、退出、401 失效以及从账号 A 切换到账号 B 时统一执行完整 `apiSlice.util.resetApiState()`，不尝试区分公共与私有缓存。重置期间展示对应页面骨架，避免上一账号数据短暂泄漏；公共数据随后按当前身份重新请求。认证恢复使用带 `condition` 的单一 `restoreSession` Thunk：只有状态为 `restoring` 且没有活动 restore request 时才能发起 `/me`，React StrictMode 重复 Effect 不会产生第二个有效恢复流程。

Base Query 统一返回可判别错误：

```ts
type ApiError = {
  kind: 'http' | 'business' | 'network' | 'parse' | 'aborted';
  status?: number;
  code?: string;
  message: string;
  data?: unknown;
  retryable: boolean;
};
```

非 2xx 是 `http`，合法响应中的业务失败是 `business`，Fetch 异常是 `network`，非预期响应体是 `parse`，主动取消是 `aborted`。只有 GET Query 的网络错误和 5xx 标记为可重试；第一轮迁移不配置自动重试，所有请求最多自动发送一次，`retryable` 只控制页面是否提供用户触发的重试按钮。Mutation、4xx、业务错误和解析错误由具体操作决定恢复方式。Route Container 使用共享 `toUserMessage(ApiError)`，不能各自猜测错误结构。

正式 Tag 类型和 ID 约定如下，不允许使用缩写或另一套同义名称：

| Tag Type | ID 示例 |
| --- | --- |
| `CommunityPost` | `postId`、`LIST:<filterSignature>` |
| `CommunityComment` | `POST:<postId>` |
| `CommunityProfile` | `authorId` |
| `CommunityRelation` | `FOLLOWING:<viewerId>`、`FOLLOWERS:<authorId>` |
| `Notification` | `LIST:<viewerId>` |
| `Project` | `projectId`、`LIST:<folderId|all>` |
| `ProjectFolder` | `LIST:<ownerId>` |
| `Warehouse` | `warehouseId`、`LIST:<ownerId>` |
| `Inventory` | `warehouseId` |
| `BeadingSession` | `sessionId`、`PROJECT:<projectId>` |

Mutation 成功后使用精确实体 ID 失效或手动更新缓存。例如关注作者后，同时更新作者资料、关注列表和当前可见帖子中的关注状态；不能依赖整页重新请求修复不一致。

社区列表要求 `@reduxjs/toolkit >= 2.6`，使用 `build.infiniteQuery<PageResponse, CommunityFilter, number>`。所有调用先经过唯一的 `normalizeCommunityFilter`：搜索词 trim，tags 去重后按字典序排序，pageSize 固定为 50，非法 sort 回退为 `hot`，保证语义相同的筛选生成同一缓存键。Page Param 是页码并从 1 开始。现有响应没有 `hasMore`，因此 `transformResponse` 根据 `posts.length === pageSize` 派生 `hasMore`；`getNextPageParam` 再根据派生值和响应 `page` 返回下一页或 `undefined`，不改变后端协议。筛选签名变化会自然切换到独立缓存条目，不使用动态数量的 Hook。Route Container 从 `data.pages` 扁平化并按帖子 ID 去重，使用 Hook 提供的 `fetchNextPage`、`isFetchingNextPage` 和 `hasNextPage`。旧筛选请求即使晚到也只更新自己的缓存键，不进入当前列表。为保持返回后的已加载位置，本阶段不设置 `maxPages`；路由卸载后缓存按 `keepUnusedDataFor: 120` 秒释放，这是对短时内存占用的明确取舍。

关键缓存责任如下：

| Mutation | 直接更新 | 失效 Tag |
| --- | --- | --- |
| 关注/取消关注 | 更新当前作者详情和可见帖子中的 `isFollowing` | `CommunityRelation:FOLLOWING:<viewerId>`、`CommunityRelation:FOLLOWERS:<authorId>`、`CommunityProfile:<authorId>` |
| 点赞帖子 | 更新帖子详情和当前已缓存列表实体 | `CommunityPost:<postId>` |
| 评论增删 | 更新对应评论列表 | `CommunityComment:POST:<postId>`、`CommunityPost:<postId>` |
| 保存/删除/分享/取消分享作品 | 更新或移除作品详情 | `Project:LIST:<folderId|all>`、`Project:<projectId>`、相关 `CommunityPost:<postId>`，并失效所有已订阅的 `CommunityPost:LIST:<filterSignature>` |
| 新建/删除/移动文件夹 | 更新文件夹和作品归属 | `ProjectFolder:LIST:<ownerId>`、相关 `Project:LIST:<folderId|all>` |
| 修改库存 | 更新目标仓库库存缓存 | `Inventory:<warehouseId>`、`Warehouse:<warehouseId>`、`Warehouse:LIST:<ownerId>` |
| 完成/放弃拼豆 | 更新会话详情 | `BeadingSession:<sessionId>`、`BeadingSession:PROJECT:<projectId>`、`Project:<projectId>`、需要时 `Inventory:<warehouseId>` |

列表 Tag 使用上表的参数化 ID，详情使用实体 ID。需要立即反馈的低风险操作可通过 `api.util.updateQueryData` 乐观更新并在失败时 undo；库存扣减、删除和完成拼豆默认等待服务端成功。

## 路由容器与展示组件

`main.tsx` 的 Provider 顺序固定为 `StrictMode > Redux Provider > BrowserRouter > AppBootstrap > H5App`。`AppBootstrap` 渲染 Router Bridge 和认证恢复逻辑；Store 和 Listener 不导入 `navigate`，从而避免 Router 与 Store 循环依赖。`AppProviders` 只组合确认框 Promise Registry、运行时图片缓存等非 Redux Provider，不能重复创建 Router 或 Store。

`AppRoutes` 只声明路由。每个 Feature Route Container 自己读取 `useParams` / `useSearchParams`、调用 RTK Query 和 Slice Selector，并处理加载、错误和导航。

```tsx
function WarehouseDetailRoute() {
  const { warehouseId = '' } = useParams();
  const query = useGetWarehouseQuery(warehouseId, { skip: !warehouseId });

  if (query.isLoading) {
    return <PageSkeleton kind="warehouse" label="正在加载仓库" />;
  }

  if (query.error) {
    return <PageLoadError message="仓库加载失败" onRetry={query.refetch} />;
  }

  return <WarehousePage warehouse={query.data} />;
}
```

展示组件不读取 API URL，不处理 Token，不负责全局导航状态。它可以使用 Redux Selector 读取与自身紧密相关的共享状态，避免 Route Container 再次形成超长 Props 链。

建议目录：

```text
apps/h5/src/
├── app/
│   ├── AppRoutes.tsx
│   ├── AppProviders.tsx
│   └── AppOverlays.tsx
├── store/
├── features/
│   ├── auth/
│   ├── community/
│   ├── projects/
│   ├── warehouse/
│   ├── split/
│   └── beading/
├── pages/
└── shared/
```

## 画布和分图性能边界

画布绘制采用“两阶段提交”：

```text
pointermove
  → 本地 Ref / Draft 实时绘制
  → pointerup
  → dispatch(commitStroke)
  → Redux 保存正式结果和撤销记录
```

不得为每次 Pointer Move 派发 Redux Action。迁移 Cells 前需要验证：

- 32×32 和 120×120 画布满足文末的确定性耗时与 Heap 基准。
- Selector 只订阅页面真正需要的数据，避免整个编辑器因单格变化全部重渲染。

分图流程只把参数和阶段放入 Redux。`ImageData`、裁剪中间缓冲、后台去背景任务和动画帧保留在 Feature Runtime Context，并用可序列化 Job ID 与 Redux 流程状态关联。

Split Runtime Context 维护 `Map<JobId, { abortController, imageData, objectUrls }>`。创建任务时先递增 Job ID 并写入 Redux 当前 Job；任务完成前比较当前 Job ID 和路由所属项目 ID，不匹配则丢弃结果。新任务、离开 Split 路由和 Provider 卸载时必须 abort 可取消工作、取消动画帧、删除 Registry 项并 `URL.revokeObjectURL`。页面刷新后 Redux 不恢复运行中任务，流程回到需要重新选择图片的安全状态。

持久化边界固定如下：认证兼容记录继续持久化；现有拼豆草稿继续由 `useBeadingDraft` 持久化，并以服务端会话版本为权威；`projectWorkspaceSlice`、`splitWorkflowSlice` 和 `beadingWorkflowSlice` 本身不做 Redux 持久化。已保存作品从服务端恢复，未保存编辑和分图刷新后丢失，除非未来另行设计草稿协议。

## 错误处理与异步竞态

- RTK Query 负责同一缓存键的请求生命周期和订阅缓存；组件卸载不被假定为立即取消所有请求。
- 页面离开后，旧请求不得更新新页面的应用级提示。
- Mutation 的错误由发起操作的 Feature 处理；只有跨页面事件才写入 `uiSlice`。
- 破坏性操作仍使用应用级 `ConfirmDialog`，提交期间锁定重复提交。
- 乐观更新必须提供回滚路径；涉及库存扣减、删除作品和完成拼豆等高风险操作默认等待服务端成功。
- 认证失效由单一 Listener Middleware 响应，清理用户相关 Slice 和 RTK Query 缓存。

普通 Query 即使页面离开也允许完成并进入对应缓存，但不能发送页面提示。搜索联想、图片导入、去背景、预览生成等结果只对当前 Route/Job 有意义的任务必须显式 abort 或通过 scope/job ID 丢弃。已经发送的保存、删除、库存和拼豆 Mutation 默认继续执行并更新实体缓存；其成功或失败提示必须携带发起时的 route scope，离开页面后不展示。用户主动取消操作只有在后端协议支持安全取消时才调用 abort。

## AGENTS.md 新增约定

在根目录 `AGENTS.md` 新增“状态管理”章节，内容应表达以下规则：

1. H5 全局状态统一使用 Redux Toolkit 和 React Redux，不得新增第二套全局状态库。
2. 服务器数据默认使用 RTK Query；同一 Base URL 使用单个 `apiSlice`，业务模块通过 `injectEndpoints` 拆分。
3. React Router 管页面、资源 ID、Tab、排序和可分享筛选参数，不在 Redux 中复制路由状态。
4. Redux 只保存跨页面、需要追踪且可序列化的客户端状态；组件临时 UI 状态保留本地。
5. DOM、Ref、函数、事件、`File`、`ImageData`、Pointer、计时器和动画帧不得存入 Redux。
6. 不得创建包含全部业务的巨型 `appSlice` 或巨型 Context；Slice 按数据和业务领域组织。
7. 可派生数据通过 Selector 计算，不重复存储；Selector 使用 `selectXxx` 命名。
8. Action 以业务事件命名，不以机械的 `setXxx` 为默认设计。
9. 高频 Canvas/手势状态本地处理，在稳定提交点同步 Redux，不为每次移动派发 Action。
10. 新增或迁移 Slice、Endpoint 必须补充 Reducer、Selector、缓存失效和错误路径测试。

## 迁移所有权矩阵

| 阶段 | 迁移数据 | 唯一写入源 | 兼容适配 | 删除条件 |
| --- | --- | --- | --- | --- |
| 1 | 认证、路由作用域 | `authSlice` / `uiSlice.currentScope` | 旧组件通过类型化 Selector/Action 读取和触发 | 登录、恢复、退出、401 测试通过后删除 H5App 认证 state/effect |
| 2 | 仓库列表和库存 | warehouse endpoints | Route Container 暂时把 Query 结果适配成现有 Page Props | 所有仓库页面不再调用旧 `loadWarehouses/loadInventory` 后删除旧 state/ref |
| 3a | 社区列表和筛选 | community list endpoints + URL | 现有卡片继续接收映射后的列表 | 发现页只读 RTK 缓存后删除旧列表 state/effect |
| 3b | 社区详情、作者、评论 | detail endpoints | 展示组件 Props 保持兼容 | 详情路由切换完成后删除对应请求函数和 requestSeqRef |
| 3c | 关注、点赞、通知 Mutation | RTK Query mutation/cache update | 无双写；单个操作整体切换 | 缓存一致性测试通过后删除旧 mutation 函数 |
| 4a | 作品和文件夹 | project endpoints | 现有弹窗读取 Query 数据 | 保存、移动、删除全链路切换后删除旧 state |
| 4b | 全局覆盖层和提示 | `uiSlice` + Promise Registry | `requestConfirm` 兼容适配器 | 全部调用点改 Promise 接口后删除回调式接口 |
| 5 | 分图流程参数 | `splitWorkflowSlice` | Runtime Context 持有图片对象 | Job 清理和步骤回归通过后删除 H5App split state |
| 6a | 编辑器工作流 | `projectWorkspaceSlice` / 本地 Draft | 编辑器整体在一次提交内切换写入源 | 性能测试通过后删除旧 editor state |
| 6b | 拼豆工作流 | `beadingWorkflowSlice` / RTK Query / 现有 Draft | 拼豆整体在一次提交内切换写入源 | 会话冲突和恢复测试通过后删除旧 beading state |

每个表格行必须在单独的可回滚提交中完成切换。兼容层只能读新源并转换为旧 Props，不能回写旧 state；发现双写时停止迁移并先消除其中一个写入路径。

## 渐进迁移顺序

### 阶段 1：基础设施、认证与约束

- 安装 `@reduxjs/toolkit` 和 `react-redux`。
- 创建 Store、类型化 Hooks、空的 API Slice 和 Provider。
- 迁移 `authSlice`、认证持久化适配器、Router Bridge 和 401 去重 Listener。
- 将状态管理规范写入 `AGENTS.md`。
- 不迁移其他业务，确保登录、恢复、退出和路由行为不变。

### 阶段 2：仓库试点

- 迁移仓库列表、详情、库存读取和修改。
- 新建仓库 Route Container。
- 验证 RTK Query 缓存、失效、错误重试和认证处理。
- 用这个相对独立的业务验证目录和测试模式。

### 阶段 3a：社区列表

- 迁移发现列表、分页和 URL 筛选。
- 验证逐页缓存、错误重试和筛选切换。

### 阶段 3b：社区详情

- 迁移帖子详情、评论和作者资料读取。
- 删除对应手写请求序号和 loading 状态。

### 阶段 3c：社区 Mutation 与通知

- 迁移点赞、关注、评论增删和通知。
- 验证乐观更新、回滚和跨缓存一致性。

### 阶段 4a：作品与文件夹

- 迁移作品、文件夹、分享和删除操作。
- 保持现有弹窗生命周期和操作语义。

### 阶段 4b：全局 UI

- 建立完整 `uiSlice`、Promise Confirm Registry 和应用级 Overlay。
- 保持现有弹窗生命周期、滚动锁定和路由提示作用域。

### 阶段 5：分图流程

- 将可序列化流程参数迁入 `splitWorkflowSlice`。
- 建立 Split Runtime Context 管理 `ImageData` 和手势对象。
- 使用 Reducer 事件明确步骤转换和过期任务丢弃。

### 阶段 6a：编辑器

- 迁移编辑器状态、正式提交和撤销历史。
- 先做性能基准，再决定 Cells 和历史的最终存储位置；若 Redux 版本未达到基准，Cells 和历史保留 Feature 局部 Reducer，Redux 只保存项目身份和工作流状态。
- 完成 Route Container 后删除 `H5App` 中对应状态和操作。

### 阶段 6b：拼豆

- 迁移拼豆会话读取、工作流状态和 Mutation。
- 保留现有本地 Draft 恢复协议，并以服务端会话版本为权威。
- 验证冲突、暂停、恢复、完成和放弃后删除 `H5App` 中对应状态。

### 阶段 7：收口

- 将路由移至 `AppRoutes`，覆盖层移至 `AppOverlays`。
- 删除不再使用的手写 API 生命周期和 Props 转发。
- 将 `H5App` 收缩为应用壳。

每个阶段独立提交、独立验证，不允许在尚未迁移所有消费者时同时保留两个可写数据源。过渡期间若必须双读，只能有一个明确的写入源，并在阶段结束时删除兼容路径。

## 测试策略

- Store：验证配置、中间件、类型化 Hook 和认证清理行为。
- 认证：覆盖损坏存储、StrictMode 重复挂载、并发 401 去重、退出失败、退出后立即登录另一账号，以及账号切换时旧缓存不可见。
- Slice：验证初始状态、业务事件、状态机转换和 Selector。
- RTK Query：验证请求参数、认证头、响应转换、Tag 失效、Infinite Query 翻页去重和错误映射。
- Route Container：验证加载、错误重试、空状态、成功展示和路由参数变化。
- 回归：每个阶段运行受影响 Vitest 测试和 `npm run build:h5`；提交前运行 `git diff --check`。
- 性能：编辑器迁移阶段增加大画布提交、撤销和连续绘制的基准或可重复性能检查。

编辑器基准在同一开发机、同一 Chromium 版本和生产构建下对迁移前后各运行 5 次，取中位数；场景为 32×32 和 120×120 画布各连续完成 100 笔、20 次撤销和 20 次重做。迁移后操作耗时不得比基线恶化超过 10%，单次正式提交和撤销的 p95 不超过 50ms。Heap 对比通过 Playwright Chromium CDP 在测量前后调用 `HeapProfiler.collectGarbage`，再读取同一指标；迁移后不得比基线增长超过 15%。任何一项不满足时，不把 Cells/历史迁入 Redux。

## 完成标准

- `H5App.tsx` 仅包含应用壳，不再直接拥有各业务域状态和 API 操作。
- 页面 URL 和导航状态没有 Redux 副本。
- API 服务器数据不再由页面手写 `useEffect` 和请求序号维护。
- Redux Store 中没有不可序列化值。
- 每个 Slice 和 Endpoint 都属于明确的 Feature，能够单独理解和测试。
- 仓库、社区、作品、分图、编辑器和拼豆现有功能及回归测试保持通过。
- 根目录 `AGENTS.md` 包含并执行上述状态管理约定。
