# 最近项目复用作品操作底部弹窗设计

## 背景

首页“最近项目”当前点击卡片后会直接进入画布；“我的作品”点击作品则会打开 `ProjectActionSheet`，由底部弹窗提供开始拼豆、编辑、分享和删除操作。两处入口行为不一致，用户容易误以为点击最近项目会直接编辑。

## 目标

让首页“最近项目”和“我的作品”使用同一套作品操作底部弹窗、同一套操作顺序、同一套按钮样式和 icon。点击最近项目卡片时不再直接打开画布。

## 非目标

- 不新增另一套弹窗组件。
- 不改变开始拼豆、编辑、分享、删除的业务逻辑。
- 不修改最近项目数据结构、接口或图片比例处理。
- 不调整其他首页卡片（热门模板、上传入口）的点击行为。

## 交互设计

### 最近项目

1. 用户点击首页“最近项目”卡片。
2. 设置当前作品为 `projectActionTarget`，打开 `ProjectActionSheet`。
3. 点击遮罩或关闭按钮时，只关闭弹窗。
4. 点击“编辑作品”时关闭弹窗并进入现有画布编辑流程。
5. 点击“开始拼豆”时复用现有库存检测和拼豆会话流程。
6. 点击“分享作品”时复用现有分享流程。
7. 点击“删除作品”时复用现有删除确认、请求和状态反馈。

### 我的作品

保持现有行为不变，但与最近项目共用同一个操作面板渲染和事件处理逻辑，避免两个入口后续出现差异。

## 视觉规范

操作面板继续使用项目已有的 `beading-sheet` 底部弹窗外壳，包括圆角、拖拽指示条、关闭按钮、阴影和安全区间距。

按钮直接复用现有底部弹窗按钮规范：

- 开始拼豆：`beading-primary-btn`，蓝色实心主按钮。
- 编辑作品、分享作品：`beading-secondary-btn`，浅灰底、描边、灰蓝色文字。
- 删除作品：`beading-secondary-btn is-danger`，保留次按钮外观，仅使用危险色文字。

每个操作按钮左侧使用项目现有 `lucide-react` 线性 icon，保持与其他页面相同的描边、尺寸和颜色：

- 开始拼豆：`PlayCircle`
- 编辑作品：`Pencil`
- 分享作品：`Share2`
- 删除作品：`Trash2`

不使用 emoji、字符占位图标、自绘 SVG 或新增图标库。

## 实现边界

### HomeShellPage

- 首页最近项目继续通过 `onOpenRecentProject(project)` 通知父级；父级实现必须改为 `setProjectActionTarget(project)`，不能调用 `openSavedProject(project)`。
- `HomeShellPage` 接收 `actionSheet?: ReactNode`，并在首页主内容根部渲染该节点，使它与页面内容处于同一个 React 渲染树。
- 不在首页组件内部复制删除、分享或拼豆业务逻辑。

### H5App

- 保持唯一的 `projectActionTarget` 状态。
- 在 `projectActionTarget` 非空时生成唯一的 `projectActionSheet: ReactNode`，同时传给 `HomeShellPage.actionSheet` 和 `MyWorksPage.actionSheet`；不在两个分支分别复制 JSX。
- 该节点的 props 使用现有 `ProjectActionSheet` 接口：`project: RecentProject`、`hasSession: boolean`、`onClose`、`onStart`、`onEdit`、`onShare`、`onDelete`。
- 四个回调由 H5App 统一提供；回调闭包捕获当前渲染中的非空 target，不能通过异步读取可能已变化的全局 target。
- `onStart` 复用 `startBeadingProject(target)`；`onEdit` 先清理 target 再调用 `openSavedProject(target)`；`onShare` 复用 `shareSavedProject(target)`，按现有流程关闭面板；`onDelete` 复用现有确认、请求、列表更新和状态提示。
- 删除或关闭时清理 `projectActionTarget`，避免旧作品弹窗残留。

### ProjectActionSheet

- 保留现有组件职责和 props。
- 四个按钮明确使用 `beading-primary-btn`、`beading-secondary-btn` 和 `is-danger`；处理现有 `.project-action-list button` 的 CSS 优先级，确保通用底部弹窗样式实际生效。
- 直接从 `lucide-react` 导入并渲染 `PlayCircle`、`Pencil`、`Share2`、`Trash2`，使用项目现有 `.ui-icon` 或同等尺寸/描边规则。
- 不修改按钮文案和业务回调语义。

## 错误处理与边界

- 未登录用户不应通过首页最近项目入口绕过登录校验；现有保存、分享、开始拼豆登录门禁继续生效。
- 点击关闭或遮罩时立即清理 target；登录取消只关闭登录流程，不进入画布。
- 开始拼豆、编辑和分享沿用现有流程的面板清理时机；失败时显示现有状态提示，不静默吞错。
- 删除确认取消时保留面板；删除成功后清理 target 并从最近项目/我的作品列表移除；删除失败时保留面板并显示错误提示。
- 作品 401/404 或状态失效时沿用现有接口错误提示，并清理已失效的操作面板 target。
- `projectActionTarget` 为空时不渲染弹窗。

## 验证标准

- 首页最近项目卡片点击后不直接进入画布，而是打开 `ProjectActionSheet`。
- 首页和我的作品弹窗的按钮文案、顺序、icon、颜色、间距一致。
- 编辑、开始拼豆、分享、删除四个动作在两个入口都调用同一份面板节点和同一组业务回调。
- 点击遮罩或关闭按钮只关闭弹窗。
- 空 `projectActionTarget` 不渲染面板；删除失败不丢失面板上下文。
- 组件测试验证最近项目点击回调不直接调用编辑器、操作按钮包含统一 icon 和底部弹窗 class。
- 现有 H5 类型检查、相关组件测试和全量测试通过。
- H5 生产构建通过。
