# 巧巧乐 · 我的布料仓库与库存管理 UI 设计稿

> 设计阶段：静态交互视觉稿，非已上线功能。2026-10-19\
> 所有示意图片与库存数据均为设计素材。**点击原型按钮不会访问 API、上传图片或真实扣减库存**。\
> 产品/技术需求参见 [布料仓库、缺料预警与裁剪扣库 PRD / 技术设计 V2.0](../patchwork-fabric-inventory-prd-v2.md)。

## 1. 如何查看

- 双击 [fabric-inventory-ui.html](./fabric-inventory-ui.html) 用 Chrome 或 Safari 打开，横向展示 **8 张 390 × 844 px 手机稿**；可点跳转按钮浏览流程。
- 总览截图：[screenshots/00-all-screens-overview.png](./screenshots/00-all-screens-overview.png)。
- 布料花纹素材位于 [assets/](./assets/)：为专门制作的 SVG 设计素材，并非用户真实上传图片。
- 重新导出各屏截图（从项目根目录）：

  ```bash
  node docs/patchwork/ui/render-screenshots.cjs
  ```

  脚本使用现有 `@playwright/test` 和本机 Chrome；可通过 `CHROME_BIN` 指定 Chrome 路径。

## 2. 页面列表与对应需求

| 编号 | 页面 | PNG 设计稿 | PRD 对应章节 |
| --- | --- | --- | --- |
| UI-01 | 我的布料仓库（搜索、库存状态、入口） | [01-my-fabric-warehouse.png](./screenshots/01-my-fabric-warehouse.png) | 4.1、5.1 |
| UI-02 | 上传布料（照片裁剪、名称、分类、库存方式、尺寸） | [02-upload-fabric.png](./screenshots/02-upload-fabric.png) | 4.1、5.1、9 |
| UI-03 | 布料详情（面积、批次、入库、流水入口） | [03-fabric-stock-detail.png](./screenshots/03-fabric-stock-detail.png) | 5.1、8、9 |
| UI-04 | 编辑器统一布料选择器（仅已有，点击即填充） | [04-editor-fabric-picker.png](./screenshots/04-editor-fabric-picker.png) | 4.2、5.2 |
| UI-05 | Canvas 缺料标红（保留原纹理、文字与图标提示） | [05-canvas-missing-warning.png](./screenshots/05-canvas-missing-warning.png) | 4.3、5.3 |
| UI-06 | 项目用料清单（逐款面积、缺量、更换入口） | [06-project-fabric-requirements.png](./screenshots/06-project-fabric-requirements.png) | 4.3、5.4、6 |
| UI-07 | 已裁剪确认（预计面积、缝份、损耗、选批次、人工核对） | [07-confirm-cutting-stock.png](./screenshots/07-confirm-cutting-stock.png) | 4.5、5.5、6、7 |
| UI-08 | 扣减成功与库存流水（余额、记录、错误冲正） | [08-stock-deduction-record.png](./screenshots/08-stock-deduction-record.png) | 4.6、5.6、7 |

## 3. 主要用户路径

### 路径 A · 首次入库

**我的 → 我的布料 → + 上传 → 选图片 → 裁剪纹理 → 录入名称/尺寸/库存批次 → 保存**。

- 点击上传即打开系统图片选择器（开发态）；不应先弹无用的“上传方式选择”窗。
- 未测量布料允许「仅记录拥有」，库存面积为 `unknown`。
- 初次入库与后续调整都应进入服务端库；不能把样例花纹算作用户拥有。

### 路径 B · 设计选布

**拼布编辑器 → 选中布片 → 底部布料 → 个人仓库选择器 → 点击立即填充**。

- 统一组件 `FabricPicker`；底布、布片属性、底部快速填布复用。
- 普通列表只显示真正可选且拥有的布料；不显示无库存的花色，空仓库显示去上传。
- 页面 UI-04 以半透明画布 + 底部抽屉表达「选布」，避免打开独立页面中断创作。

### 路径 C · 缺料处理

**画布缺料提示 → 项目用料清单 → 缺料行 → 更换为我的布料**。

- 画布有红色虚线轮廓，材料仍以原纹理展示，避免破坏设计。
- 文字、图标、红色边框三重提示；不能只靠颜色。
- 缺料、库存不足、未分配、未知是不同状态；接口失败不得全部报“缺料”。
- 缺料行不放在普通可选仓库列表里，而是在项目需求清单里呈现。

### 路径 D · 裁剪扣库

**项目用料 → 估算 → 确认实际用量和批次 → 我已裁剪 → 服务端原子扣减 → 库存流水**。

- 图形面积、缝份、损耗是估算，仍需人工核对现实布料。
- UI-07 是高风险操作，固定底部显示确认文案；不能与普通「保存」共享动作。
- 真实实现要求库存并发保护、操作幂等键、版本锁与流水记录。
- UI-08 演示成功状态；网络超时先按 operationId 查询状态，不能直接重复扣。
- 错误扣减只能提交「冲正」，不能删除流水；现实已剪布不能直接当作整块布返还。

## 4. 视觉规范（对齐现有 H5）

| 视觉参数 | 方案 |
| --- | --- |
| 设计画布 | 390 × 844 px，移动端竖屏 |
| 品牌蓝 | `#208EDC`（与现有拼布编辑器一致） |
| 文字主色 | `#22384C` |
| 页面底色 | `#F5F8FB` / `#EDF3F7` |
| 白卡片 | `#FFFFFF`，细边框与轻阴影 |
| 缺料红 | `#DC4D56`，配软红背景 `#FFF0F0` |
| 已有绿 | `#27986F`，配软绿背景 `#EBF8F2` |
| 主按钮 | 蓝底白字，圆角约 13px，触控高度 ≥44px |
| 分组卡片 | 11–18px 圆角，避免过多嵌套阴影 |
| 底部抽屉 | 24px 顶角、顶部拖拽条、可滚动内容 |
| 信息密度 | 图片先行、金额/面积粗体突出，辅助说明 10–12px |
| 交互原则 | **选图直接选文件、选布直接填充、确认真实扣库存需明确授权** |

样式源文件为 [fabric-inventory-ui.css](./fabric-inventory-ui.css)，页面布局和跳转逻辑见 [fabric-inventory-ui.html](./fabric-inventory-ui.html)。

## 5. 从设计稿到开发任务

本设计稿是 UI 评审基线，**不代表八个页面已经接入前后端**。实现时请按依赖分四阶段：

1. **仓库数据**：沿用现有 `/api/fabrics`，扩展用户隔离、批次、库存单位和图片上传等；UI-01/02/03。
2. **编辑器联动**：项目材料增加仓库关联和视觉快照、统一 FabricPicker 数据源、缺料状态；UI-04/05/06。
3. **面积/扣库**：纯函数面积计算及缝份，服务端估算和库存事务；UI-07/08。
4. **验证上线**：旧项目迁移、缺料场景、并发、幂等、撤销误扣、移动端视觉回归。

对应目录建议：

- `apps/h5/src/patchwork/PatchworkPage.tsx` —— Canvas 与缺料入口
- `apps/h5/src/patchwork/FabricPicker.tsx` —— 统一选布入口
- `apps/h5/src/patchwork/model.ts` —— 材料仓库关联和快照
- `apps/h5/src/patchwork/export.ts` —— 现有裁片几何算法可复用
- `apps/api/src/server.mjs` —— 现有个人布料 API，后续需要重构出独立服务

## 6. 截图导出与校验

- 所有 8 张手机 PNG：780 × 1690 px（2 倍设备像素），含设备外框。
- 总览 PNG：自动按照网页多列布局长截图。
- 导出脚本验证每张画面都存在、SVG 图片可读取且浏览器无 JS 异常。
- 此目录不修改应用运行态数据，也不存储真实用户库存。
