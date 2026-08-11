# H5 本地去背景实施计划

> **For agentic workers:** REQUIRED: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`. Follow RED → GREEN → REFACTOR.

**Goal:** 在 H5 图片浏览页本地去除平坦背景并可恢复原图，确保预览、分割 cells、画布导入和保存 source 始终对应当前图像。

**Architecture:** 将 Web 已有四角取样算法提取到 `packages/core`，以 RGBA buffer 为纯函数输入。H5 同时保存不可变原始图像和当前图像；每次去背景或恢复都通过同一派生流水线重建 URL、crop、cells、统计及待保存 source。

**Tech Stack:** TypeScript、Browser Canvas API、Vitest、React 19。

---

## 状态契约

`UploadedSplitImage` 明确区分：

- `originalImageData`：首次解码后的不可变原图，用于恢复。
- `imageData`：当前处理结果，预览、分割和导入均以它为准。
- `originalUrl`：原图预览 URL；组件卸载或替换图片时释放。
- `url`：当前结果 URL；去背景/恢复时替换并释放旧 URL。
- `backgroundRemoved`：当前结果是否为去背景版本。

`H5App` 中保存作品使用的 `uploadedSourceImageDataUrl` 必须随 `imageData` 更新。若需要保存原始 data URL，则新增名称明确的 `originalUploadedSourceImageDataUrl`，不得继续让名为 source 的字段在预览已处理时仍指向原图。

### Task 1：提取并测试共享算法

**Files:**

- Modify: `packages/core/src/domain/grid.ts`
- Modify: `packages/core/src/domain/grid.test.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] 将 `apps/web/src/App.tsx` 中的四角取样去背景逻辑提取为 core 纯函数；输入 RGBA、宽、高、阈值，返回新的 RGBA，不原地修改调用方 buffer。
- [ ] 先写失败测试覆盖：纯色背景透明、前景保留、已有透明像素、四角颜色差异、1×1/极小图和无效尺寸。
- [ ] 固定阈值单位和颜色距离算法，Web 继续使用与当前视觉接近的默认值。
- [ ] Web 删除私有重复算法并调用 core，保证现有 Web 行为回归。
- [ ] 运行：`npm test -- packages/core/src/domain/grid.test.ts --run`。

### Task 2：建立原图/当前图派生流水线

**Files:**

- Modify: `apps/h5/src/shared/h5Types.ts`
- Modify: `apps/h5/src/H5App.tsx`
- Create: `apps/h5/src/pages/split/splitImageProcessing.ts`
- Create: `apps/h5/src/pages/split/splitImageProcessing.test.ts`

- [ ] 抽取 `deriveSplitImage(imageData, settings)`：一次生成当前 URL/data URL、crop、原始分割 cells、合并结果、裁剪边界和豆子统计。
- [ ] 先写测试证明同一输入派生出的预览、cells 和 source 属于同一图像版本。
- [ ] 初次上传同时设置 `originalImageData` 和当前 `imageData`；原始 buffer 深拷贝并冻结所有权，不被算法修改。
- [ ] 去背景以 `originalImageData` 为输入生成当前结果，避免重复点击对已处理结果累积侵蚀；恢复直接以原图重跑派生流水线。
- [ ] 更新 `uploadedSourceImageDataUrl` 为当前结果。保存作品时继续只读取这个当前 source；恢复后它必须恢复为原图内容。
- [ ] 用 job id/sequence ref 防止较早计算覆盖较新的恢复或新上传图片；替换 Blob URL 时释放旧 URL。
- [ ] 运行：`npm test -- apps/h5/src/pages/split/splitImageProcessing.test.ts --run`。

### Task 3：在浏览页接入去背景与恢复

**Files:**

- Modify: `apps/h5/src/pages/split/SplitPages.tsx`
- Modify: `apps/h5/src/pages/split/SplitPages.test.ts`
- Modify: `apps/h5/src/styles.css`

- [ ] 在浏览页设置区增加互斥的“去除背景”/“恢复原图”动作，并显示处理中状态。
- [ ] 处理期间禁用重复点击和导入；成功后再启用导入。
- [ ] 透明区域沿用或增加棋盘格预览，不改变主体缩放和裁剪操作。
- [ ] Canvas 不可用、处理异常或 job 过期时保持当前图像、cells 和 source 不变，并显示错误。
- [ ] 测试去背景后导入使用处理结果；恢复后导入与保存 source 都使用原图结果。
- [ ] 运行：`npm test -- packages/core/src/domain/grid.test.ts apps/h5/src/pages/split/splitImageProcessing.test.ts apps/h5/src/pages/split/SplitPages.test.ts --run`。
- [ ] 运行：`npm run build:web && npm run build:h5`。
- [ ] 运行：`git diff --check`。

## 完成标准

- Web 与 H5 使用同一去背景算法。
- 原图不可变、当前图可替换，异步旧任务不能回写。
- 预览、cells、画布导入和保存 source 在去背景及恢复后始终一致。
- 不新增后端图片下载、第三方去背景服务、密钥或 SSRF 风险。
