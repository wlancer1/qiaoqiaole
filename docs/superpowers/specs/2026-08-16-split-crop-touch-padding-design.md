# 分图裁剪触控留白设计

## 目标

分图裁剪页在图片按工作区适配显示时，四周保留可触控留白，避免完整裁剪区域的边角缩放手柄贴住设备边缘而难以命中。

## 设计

- 修改 `SplitCropEditorCanvas` 的图片适配矩形计算，不通过 CSS 改变 canvas 尺寸。
- 默认安全留白为 24 CSS px。
- 实际留白取 `min(24px, 工作区短边 × 8%)`，避免在极窄或极矮工作区中占用过多空间。
- 工作区尺寸来自 canvas 的 `getBoundingClientRect()`，统一使用 CSS px。适配公式为：

  ```text
  padding = min(24, min(viewport.width, viewport.height) × 0.08)
  availableWidth = max(1, viewport.width − 2 × padding)
  availableHeight = max(1, viewport.height − 2 × padding)
  fit = min(
    availableWidth / max(1, crop.width),
    availableHeight / max(1, crop.height)
  )
  ```

- 图片继续在工作区内水平和垂直居中，横图、竖图均按扣除两侧留白后的可用区域等比适配。
- 裁剪框、网格、遮罩、标签和手柄仍全部基于同一个 `imageRect` 计算，保证显示位置、命中检测和裁剪坐标一致。
- 留白只影响适配基准。用户主动放大后允许图片和裁剪框扩展到留白区域之外，不额外限制缩放或拖拽。
- 重置缩放回到 100% 时恢复带安全留白的适配状态。

## 不包含

- 不修改裁剪数据结构、裁剪格数或最终导出区域。
- 不修改现有 16px 手柄视觉尺寸和 24px 命中半径。
- 不给 canvas 元素增加 CSS padding，避免 DOM 尺寸与绘制/指针坐标不一致。

## 验证

- 单元测试覆盖普通手机工作区，断言四周使用 24px 留白。
- 单元测试覆盖极窄工作区，断言留白按短边 8% 收缩。
- 覆盖横图和竖图的等比适配及居中结果。
- 覆盖完整选中全部格子的裁剪框，断言四角手柄中心位于安全留白边界内，并验证边缘侧触点可被现有 `hitCropHandle(..., 24)` 命中。
- 覆盖 `zoom = 1` 使用带留白的适配基准；`zoom > 1` 只围绕同一中心放大并允许越过安全留白，不把 padding 误作持续边界约束。
- 运行裁剪相关 Vitest、`npm run build:h5` 和 `git diff --check`。
