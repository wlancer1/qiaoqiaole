# H5 分层加载状态设计

## 目标

为 H5 首次进入、React Router 页面切换和页面核心数据加载提供统一、可识别且不过度打扰的加载反馈。加载体验采用“拼豆像素过渡 + 页面骨架屏”的分层组合，同时保留按钮提交、评论加载和列表加载更多等现有局部反馈。

## 设计原则

* 页面在 300ms 内完成时不显示加载动画，避免短暂闪烁。
* 路由代码、登录恢复或深链接初始化尚未完成时显示品牌化的拼豆像素动画。
* 页面结构已经确定、核心数据仍在请求时显示与真实布局接近的骨架屏。
* 数据完成后只做 120–180ms 的透明度淡入，不缩放页面，不制造布局跳动。
* 加载超过 8 秒时显示明确说明和重试入口，不能无限展示无解释的循环动画。
* 所有加载状态提供可访问语义，并遵守 `prefers-reduced-motion`。

## 加载状态分层

### 第一层：路由准备状态

适用场景：

* H5 首次启动并恢复登录状态。
* 路由页面采用懒加载，页面代码块尚未下载完成。
* 直接访问带资源 ID 的深链接，路由参数和页面初始化尚未完成。

视觉表现：

* 使用 3×3 拼豆像素图标，固定为 48×48px 视觉区域。
* 加载容器使用 flex 双轴居中；图标、标题和说明共用同一条垂直中心轴。
* 标题使用“正在准备页面”，说明使用“拼出精彩，只差一点点”。
* 背景使用当前页面所属 Token；默认主页流程使用 `--flow-bg`，编辑器流程使用编辑器现有背景。
* 动画只改变像素透明度和轻微缩放，不移动整个图标。

显示规则：

* 延迟 300ms 后才显示。
* 页面准备完成后立即进入骨架屏或真实内容。
* 不与骨架屏同时显示。

### 第二层：页面核心数据状态

适用场景：

* 社区列表、作者主页、关注和粉丝列表首次加载。
* 社区作品详情、仓库详情和已保存作品编辑数据加载。
* 页面外壳已渲染，但决定主要内容的数据尚未返回。

视觉表现：

* 保留页面真实的顶部栏、返回按钮和主要布局高度。
* 骨架块使用中性浅灰和低对比度流光，不使用蓝色大面积闪烁。
* 骨架尺寸必须接近真实内容，减少数据返回后的布局位移。
* 每类页面只维护一种骨架，不按具体资源定制。

骨架类型：

* `HomePageSkeleton`：首页头部、快捷入口和双列卡片。
* `PatternListSkeleton`：发现页、作者作品列表和我的作品卡片网格。
* `PatternDetailSkeleton`：作品主图、作者摘要、操作区和评论标题。
* `ProfileListSkeleton`：关注和粉丝头像列表。
* `WarehouseSkeleton`：仓库摘要、筛选栏和色号网格。
* `EditorLoadingSkeleton`：编辑器顶部栏和画布区域；不伪造可交互工具。

### 第三层：局部异步状态

以下状态不触发整页加载动画：

* 列表“加载更多”。
* 评论加载和回复提交。
* 点赞、关注、保存、分享和删除等按钮操作。
* 去背景、生成画布和图片分析。
* 库存检测和拼豆进度保存。

这些场景继续使用按钮禁用、局部文案、进度条或现有 `SplitCanvasLoading`，避免整页遮罩打断用户上下文。

## 组件边界

建议新增以下独立单元：

### `RouteLoadingFallback`

只负责第一层品牌动画，不读取业务数据。作为 React `Suspense` 的 fallback，也可用于应用初始化状态。

接口：

```ts
type RouteLoadingFallbackProps = {
  label?: string;
  description?: string;
  delayed?: boolean;
};
```

### `PageSkeleton`

按页面种类选择骨架结构，不负责请求和错误处理。

接口：

```ts
type PageSkeletonKind =
  | 'home'
  | 'pattern-list'
  | 'pattern-detail'
  | 'profile-list'
  | 'warehouse'
  | 'editor';

type PageSkeletonProps = {
  kind: PageSkeletonKind;
  label: string;
};
```

### `PageLoadBoundary`

统一处理核心数据的 loading、error 和 ready 三种状态。它不发起请求，只接收页面已有状态和重试回调。

接口：

```ts
type PageLoadBoundaryProps = {
  loading: boolean;
  error?: string;
  skeleton: PageSkeletonKind;
  loadingLabel: string;
  onRetry?: () => void;
  children: React.ReactNode;
};
```

### `useDelayedLoading`

封装 300ms 延迟显示和最短展示时间，避免动画一闪而过。

建议规则：

* `showDelayMs = 300`
* `minimumVisibleMs = 250`
* 请求结束时清理定时器，组件卸载后不得更新状态。

## React Router 接入

* 可独立拆包的现有页面通过 `React.lazy` 注册到路由配置。
* `Suspense fallback` 使用 `RouteLoadingFallback`。
* 页面组件读取路由参数后启动数据请求，并将其 loading/error 状态交给 `PageLoadBoundary`。
* 同一路由内筛选、排序和加载更多不触发路由 fallback。
* 浏览器前进或后退优先保留已有页面数据；缓存命中时不重复显示整页动画。
* 路由切换期间不得保留上一页面的成功或错误提示。

## 动画与样式

* 主动画色使用 `--flow-brand: #146cff`；编辑器内可使用现有 `--blue`，同一组件不混用两套 Token。
* 像素块圆角约 4px，间距约 4–5px，图标整体固定宽高并居中。
* 像素动画周期建议为 1000–1100ms，错峰延迟不超过 400ms。
* 骨架流光周期建议为 1200–1400ms。
* 内容淡入建议为 150ms，缓动使用 `ease-out`。
* 禁止使用大幅弹跳、旋转 Logo、全屏缩放和持续装饰动画。

减少动态效果时：

```css
@media (prefers-reduced-motion: reduce) {
  .route-loading-pixel,
  .page-skeleton-shimmer,
  .page-content-enter {
    animation: none;
    transition: none;
  }
}
```

## 可访问性

* 路由加载容器使用 `role="status"`、`aria-live="polite"` 和 `aria-busy="true"`。
* 骨架元素本身使用 `aria-hidden="true"`，页面另提供可读的加载标签。
* 加载完成时不能主动抢夺焦点。
* 错误状态必须包含可读错误信息；存在安全重试路径时提供“重新加载”按钮。
* 加载期间不可操作的旧页面内容不能继续接收点击或键盘事件。

## 错误和超时

* 0–300ms：保持当前背景，不显示反馈。
* 300ms–8s：显示对应加载状态。
* 超过 8s：显示“加载时间较长，请检查网络”以及重试按钮。
* 请求失败：保留页面外壳，骨架替换为错误状态，不直接跳回上一页。
* 资源不存在或无权限：使用页面级错误状态，并提供返回入口。

## 测试要求

### 单元测试

* 延迟不足 300ms 时不显示加载动画。
* 超过 300ms 后显示，结束后至少保持规定的最短时间。
* 组件卸载时清理定时器。
* `prefers-reduced-motion` 下不依赖动画完成事件。

### 组件测试

* 每种骨架包含正确的 `role`、`aria-busy` 和加载文案。
* 加载状态不渲染可操作的真实页面控件。
* 错误状态能够重试且禁止重复触发。
* 数据完成后显示真实内容并移除骨架。

### 路由回归测试

* 首次进入懒加载路由显示品牌 fallback。
* 社区详情、作者主页、仓库详情和作品编辑深链接能从加载状态进入真实页面。
* 浏览器前进、后退不会出现上一页面残留提示。
* 路由加载期间弹窗和背景点击不会穿透。

## 不在本次范围

* 不重做分图流程已有的像素生成进度动画。
* 不给所有按钮统一增加旋转图标。
* 不引入新的动画库。
* 不调整页面数据缓存策略；只消费页面已有 loading/error 状态。
* 不改变 API 请求协议和响应结构。
