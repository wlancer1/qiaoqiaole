# 拼豆会话工具与 UI 对齐设计

## 目标

以参考截图为交互与视觉方向，先补齐拼豆会话页工具能力，再统一顶部状态、画布工作区、工具栏和色号轨道。完成后，用户能够从色号选择开始，明确看到当前色高亮，在画布上标记实际摆放进度、锁定或适应视图、调整色号顺序，并可靠地完成当前色及整件作品。

## 范围

本次实现：

- 搜色、标记、高亮、锁定、更多、适应六个工具。
- 色号选择、排序、修订、完成当前色和专注模式。
- 当前色高亮遮罩、已完成色与单格标记反馈。
- 顶部库存入口和设置入口复用现有能力；设置入口与“更多”打开同一工具设置面板。
- 工具设置按会话持久化到本机；已完成色与耗时继续同步服务端。
- 顶部、画布区和底部双层控制区按参考图重构。

本次不新增服务端业务字段，不跨设备同步单格标记，不让单格标记参与库存扣减，也不改造社区、仓库等其他页面。

## 现状与根因

当前 `BeadingSessionPage` 只维护当前色、计时和完成弹窗状态。六个工具除“高亮”具有静态选中样式外没有行为；`H5CanvasLayers` 没有接收当前色或覆盖层信息，因此点击色号不会改变画布显示。

当前画布宽度通过 `Math.min(82, ...)px` 计算，实际几乎固定为 82px，与截图中的大画布差距明显。工具栏和色号轨道也缺少真实色彩、完成数量和独立操作区。

## 状态模型

页面使用一个 reducer 管理工具状态，避免“当前工具”同时承担开关、模式、面板和命令四种不同语义：

```ts
type InteractionMode = 'pan' | 'mark' | 'revise'
type ActivePanel = null | 'search' | 'more'
type SortMode = 'canvas' | 'remaining' | 'code'

interface BeadingToolState {
  interactionMode: InteractionMode
  activePanel: ActivePanel
  highlightEnabled: boolean
  locked: boolean
  focusMode: boolean
  codesVisible: boolean
  gridVisible: boolean
  sortMode: SortMode
  markedCellIndexes: number[]
}
```

- 高亮和锁定是互不影响的独立开关。
- 标记和修订是互斥的画布交互模式；再次点击当前模式返回平移模式。
- 搜色和更多是临时底部面板；选择、点关闭、点遮罩或按 Escape 后关闭。
- 适应是一次性命令，不保存为选中工具。
- 服务端 `session.completedColorCodes` 是颜色完成状态的唯一事实来源，页面不维护第二份本地完成集合。

## 工具交互

### 搜色

- 在当前作品实际使用的色号中按色号子串搜索，输入和比较统一转大写。
- 每项展示色号、MARD 实际颜色、总需求数和剩余数；无结果显示空状态。
- 已完成色仍可选择查看，但不会因此恢复为未完成。
- 选择后更新当前色、自动开启高亮并关闭面板。

### 标记与修订

- 单格索引固定为 `row * cols + col`，只保存索引，不复制或修改原始 cell。
- 标记模式只响应非透明且颜色等于当前色的格子；点击未标记格加入 `markedCellIndexes`，点击已标记格取消。
- 修订模式只响应当前色中已经标记的格子，用于快速撤销误标；未标记格不产生变化。
- 透明格、其他色格和越界坐标全部忽略。
- 单格标记只表示本机摆放辅助进度，不改变色号需求数、剩余数、完成色、服务端 requirements 或最终库存扣减。
- 已完成颜色的所有格子显示弱勾选；本机手动标记显示更醒目的勾选。

### 高亮、锁定、更多和适应

- 高亮开启时，当前色保持正常亮度并显示青色描边，非当前色覆盖深色半透明遮罩；关闭后恢复原图。
- 锁定开启时禁用拖拽、缩放和所有格子写操作，但色号切换、高亮和面板仍可使用。
- 更多面板包含“显示色号”“显示网格”“清除单格标记”“恢复工具默认值”。清除非空标记前二次确认；恢复默认值不改变服务端完成色和耗时。
- 工具默认值固定为：平移模式、无活动面板、高亮开启、未锁定、非专注、显示色号、显示网格、作品顺序、无单格标记。确认恢复默认值后 reducer 一次性恢复这些字段并关闭面板。
- 适应根据工作区可用宽高和画布原始宽高计算 `min(availableWidth / artboardWidth, availableHeight / artboardHeight)`，再通过变换控制器居中；横竖屏切换、进入/退出专注模式后重新计算。它不是简单回到缩放比例 1。

### 专注、库存和设置

- 专注模式隐藏顶部次要控件和底部控制区，扩大画布；工作区保留固定的“退出专注”按钮，避免进入后无法返回。
- 顶部库存按钮调用 `onOpenInventory(): Promise<void>` 打开由 `H5App` 持有的现有库存检查面板，不实现新的库存逻辑。页面在请求期间禁用该按钮以防重复，失败后解除 pending，并在已有状态区显示错误；面板数据、仓库切换和关闭状态仍由 `H5App` 管理。
- 顶部设置按钮与底部“更多”使用同一个设置面板和同一份状态。

## 色号轨道与完成流程

- 色号卡使用 MARD 颜色值作为背景，显示色号、所需数量和完成标记；深色背景自动使用浅色文字。
- 点击卡片切换当前色并即时更新高亮。
- 排序按钮在“作品顺序”“剩余数量”“色号顺序”之间循环；作品顺序取该色第一次出现在 cells 中的位置，剩余数量降序，色号顺序使用自然排序。
- 单格标记不参与剩余数计算：未完成色剩余数等于 `required`，已完成色剩余数为 0。搜索结果和“剩余数量”排序统一使用这个公式。
- 完成按钮通常显示 `完成 已完成数/总色数`；点击时只提交当前色，并在成功后跳转下一未完成色。
- 所有色号已完成但 session 尚未进入 `pending_completion` 时，按钮改为可点击的“确认完成”，只重试 prepare，不重复 PATCH 色号；这也是最后一个色 PATCH 成功、prepare 失败后的恢复入口。
- 页面与父组件使用以下异步契约：

```ts
onPatch(input: {
  completedColorCodes: string[]
  elapsedSeconds: number
  version: number
}): Promise<BeadingSession>
onPrepareCompletion(input: { version: number }): Promise<BeadingSession>
onComplete(input: { deduct: boolean }): Promise<BeadingSession>
onExit(input: { mode: 'saved' | 'abandon' }): void
onOpenInventory(): Promise<void>
```

父组件在收到响应后先同步保存最新 session，再 resolve 并返回同一个 session；页面后续请求直接使用 Promise 返回值中的 version 和完成集合，不依赖尚未重渲染的 props。
- 颜色完成严格执行：防重复点击 → 等待 PATCH 成功并取得最新 session → 若全部完成则用该 version 等待 prepare 成功 → 展示最终确认弹窗。任一步失败都解除 pending、保留当前选择并显示错误，不提前弹出成功态。
- 请求 pending 时禁用保存和完成按钮；其他只读工具仍可使用。若接口返回版本冲突且附带最新 session，先用最新 session 替换页面数据并提示用户重试。

## 本地持久化

沿用现有会话草稿存储机制，但服务端状态始终优先。本地只新增保存：

- `markedCellIndexes: number[]`
- `highlightEnabled: boolean`
- `locked: boolean`
- `codesVisible: boolean`
- `gridVisible: boolean`
- `sortMode: SortMode`

草稿继续使用现有键 `qiaoqiaole.beading-draft:${ownerId}:${sessionId}`，不创建第二套键。`H5App` 将登录成功后持久保存的标准化用户名作为 `draftOwnerId?: string` 传给页面；页面直接使用 `window.localStorage`，测试通过注入 storage helper 覆盖。缺少稳定 owner 时完全跳过读写，不使用共享默认值。

旧草稿在同一个键读取：缺失的新字段使用默认值，旧 `completedColorCodes` 和 `elapsedSeconds` 不覆盖服务端 session；下一次状态写入时原位改写为新结构，因此不存在新旧键优先级，也无需删除另一个键。

页面首次装载时读取一次草稿，对单格索引去重并过滤到 `[0, rows * cols)`；状态变化后 150ms 防抖写入，存储解析或配额错误只显示非阻塞提示。普通保存退出保留草稿；放弃由页面在调用 `onExit({ mode: 'abandon' })` 前清除；最终完成则在 `onComplete` 成功后清除，失败时保留。

## 画布渲染与命中测试

`H5CanvasLayers` 继续使用纯 canvas 分层，并增加独立 overlay canvas，不使用 DOM 格子覆盖。组件接收：

```ts
interface H5CanvasOverlay {
  currentColorCode: string | null
  highlightEnabled: boolean
  markedCellIndexes: readonly number[]
  completedColorCodes: readonly string[]
}

interface H5CanvasLayersProps {
  overlay?: H5CanvasOverlay
  gridVisible?: boolean
  codesVisible?: boolean
}
```

绘制顺序为颜色 canvas、色号 canvas、网格 canvas、覆盖 canvas。覆盖层负责非当前色暗层、当前色边框、已完成弱勾选和手动标记强勾选；透明格不绘制覆盖。overlay canvas 的失效依赖包括 overlay 自身、cells、rows、cols、`getCode`、画布几何和变换；`gridVisible` 和 `codesVisible` 分别进入对应层的 invalidation snapshot。状态变化时只重绘受影响的 canvas，同一帧内的多次更新继续合并为一次 `requestAnimationFrame`。

所有 canvas 设置 `pointer-events: none`，不直接处理业务状态；命中事件统一落在 artboard：通过 `getBoundingClientRect()` 将坐标映射为 `floor((clientX - left) / width * cols)` 与对应行。指针移动超过 4px 视作拖拽，不触发格子点击；锁定时变换组件 `disabled`，标记和修订处理器也直接返回。标记模式下单指轻点写标记，双指仍可缩放；平移模式维持现有拖拽与缩放。

## 页面结构与视觉系统

### 顶部

- 白色工具栏：返回、库存入口、计时胶囊、保存按钮、设置按钮；下方为蓝绿渐变进度条和百分比。
- 保留移动端安全区，交互热区至少 44px。

### 画布工作区

- 浅蓝灰背景占据顶部与底部控制区之间空间，画布以每格 16–20px 的基础尺寸保持清晰度，再由适应命令缩放到可用区域，不再固定为 82px。
- 尺子与画布边界对齐；右上提供专注/退出专注按钮。

### 底部控制区

- 第一层为六个等宽工具，使用现有图标系统和文字；开关、模式和面板分别呈现准确的选中状态，适应按钮只提供按压反馈。
- 第二层为色号横向轨道、排序、修订和蓝色完成按钮。
- 色号卡最小 64×68px，当前卡使用双层橙色描边，已完成卡显示蓝色勾选。

### 视觉令牌

- 主品牌蓝沿用 `#146cff` / `#1268d7`，进度使用蓝到绿色渐变。
- 高亮使用 `#18d8ff`，工具选中使用 `#f0a517`。
- 工作区 `#f2f5fd`，面板白色，正文 `#1e3048`，次级文字 `#63738a`。
- 继续使用项目字体栈；正文不小于 12px，主要按钮 15–17px，并与其他弹窗字号令牌一致。
- 动效限制在 120–180ms，遵守 `prefers-reduced-motion`。

固定以 390×844 和 430×932 两个移动视口做截图回归；小于 360px 时工具文字可缩至 11px，但热区不得缩小。

## 错误与边界处理

- 当前色为空时禁用标记、修订和完成并提示“请选择色号”。
- 当前色已完成时完成按钮禁用，不重复提交。
- 搜索无结果、本地草稿损坏和存储不可用都有明确但非阻塞反馈。
- 服务端同步失败时不伪造完成结果；计时继续，本地工具状态不丢失。
- rows/cols 或 cells 变化时过滤失效标记并重新适应画布。

## 测试策略

- reducer/纯函数：高亮分类、标记与修订、坐标映射、排序、草稿迁移、当前色推进。
- 画布层：纯 canvas overlay 与显示开关 invalidation；分层顺序、暗层、描边和勾选绘制。
- 页面交互：搜色选择、高亮开关、锁定阻止写入、标记/修订互斥、适应命令、专注退出、设置面板。
- 异步流程：PATCH 失败不推进、重复点击只发一次、全部颜色完成时 PATCH 先于 prepare、版本冲突刷新。
- 回归：完整 Vitest、TypeScript、Web/H5 构建，并在 390×844 与 430×932 视口验证截图。

## 验收标准

- 选择任一色号后，画布立即突出该色，其他颜色明显压暗；关闭高亮则完整恢复。
- 六个工具、排序、修订、专注、库存与设置入口都有可观察行为，不再是静态按钮。
- 标记和修订不修改作品 cells、需求量或库存，本机会话刷新后可恢复。
- 完成色号、进度百分比和底部完成计数始终来自同一个服务端 session。
- 画布在 320–430px 宽手机上充分使用工作区，不再出现 82px 小画布；锁定、拖拽、缩放和适应行为可预测。
- 页面层级、间距、控件形态和颜色轨道与参考截图方向一致，并复用现有品牌色、字体与弹窗令牌。
