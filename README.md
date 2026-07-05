# 敲敲乐（Peg Board）3D 打印生成工具

这是一个基于 `need.md` 开发的浏览器端 MVP 工具。用户可以上传参考图片，把图案转换成规则网格，手动编辑颜色，实时查看 3D 结构，并导出 STL 文件用于 3D 打印。

## 已完成功能

- 图片上传
  - 支持 `jpg`、`jpeg`、`png`、`webp`
  - 限制最大文件 20MB
  - 限制最大图片尺寸 4096 x 4096
- 自动去背景（MVP 版）
  - 使用浏览器 Canvas 读取图片
  - 根据四角背景色进行近似透明化
  - 自动裁切非透明图案区域
- 网格生成
  - 可调整行数和列数
  - 自动从裁切后的图案区域采样生成颜色矩阵
  - 内置示例网格，未上传图片时也可直接试用
- 颜色识别
  - 每个格子提取主色
  - 对颜色做基础量化，减少相近色噪声
- 像素编辑器
  - 默认点击网格取色
  - 画笔修改单个格子颜色
  - 油漆桶填充连续区域
  - 吸管读取格子颜色
  - 支持撤销和重做
  - 支持 `Ctrl/Command + Z` 撤销
  - 支持 `Ctrl/Command + Shift + Z` 重做
- 颜色工具
  - 当前颜色可手动选择
  - 点击网格即可拾取颜色
- 打印参数
  - 格子尺寸 `cellSize`
  - 网格高度 `wallHeight`
  - 网格厚度 `wallThickness`
  - 底板厚度 `baseThickness`
  - 外框厚度 `frameThickness`
  - 豆豆直径 `pegDiameter`
  - 豆豆高度 `pegHeight`
- Three.js 实时 3D 预览
  - 黑色底板
  - 外框
  - 网格墙
  - 彩色圆柱豆豆
  - 自动旋转，支持拖拽旋转
  - 显示模型尺寸和预计实体体积
- STL 导出
  - 前端生成 ASCII STL
  - 导出文件名为 `qiaoqiaole-all.stl`
  - STL 中包含底板、外框、网格墙和豆豆几何体
- 2D 图纸导出
  - 前端生成 SVG
  - 导出文件名为 `qiaoqiaole-2d-drawing.svg`
  - 用于排版和人工校对
- 自动化测试
  - 覆盖透明区域裁切
  - 覆盖网格采样
  - 覆盖主色识别
  - 覆盖油漆桶填充
  - 覆盖颜色替换
  - 覆盖 STL 零件生成和序列化

## 待开发功能

- 高精度背景去除
  - 接入 `rembg`
  - 或使用 Python/OpenCV 分割图案
- 后端图像处理 API
  - `POST /api/upload`
  - `POST /api/remove-background`
  - `POST /api/generate-grid`
  - `POST /api/update-cell`
  - `POST /api/generate-model`
- CadQuery 模型生成
  - 使用后端生成更适合打印的 STL
  - 优化墙体布尔结构
  - 支持更大网格的稳定导出
- 颜色拆分导出
  - 按颜色导出 `red.stl`、`green.stl` 等独立文件
- 3MF 导出
  - 保留颜色信息
  - 支持多色打印工作流
- AI 自动优化颜色
  - 自动减少颜色数量
  - 自动匹配常见豆豆品牌色卡
- 历史项目保存
  - 本地保存
  - 云端保存
- MakerWorld 集成
  - 导出项目包
  - 上传分享
- 更完整的编辑能力
  - 框选区域
  - 移动/复制选区
  - 缩放与平移编辑画布
  - 更细粒度的背景阈值调节

## 技术栈

- Vite
- React
- TypeScript
- Three.js
- Vitest
- Browser Canvas API

当前版本是纯前端实现，不依赖后端服务。

## 项目结构

当前仓库已经拆成网页端、H5 端和共享核心包：

```text
apps/web        # 网页端，大屏工作台
apps/h5         # H5 端，手机操作版
packages/core   # 共享网格、221 色卡、STL、采样等业务逻辑
tests/e2e       # web 和 H5 的端到端测试
```

## 本地运行

安装依赖：

```bash
npm install
```

启动网页端：

```bash
npm run dev:web
```

启动 H5 端：

```bash
npm run dev:h5
```

同时构建网页端和 H5 端：

```bash
npm run build
```

单独构建：

```bash
npm run build:web
npm run build:h5
```

运行测试：

```bash
npm test
npm run test:e2e
```

## 使用流程

1. 打开工具页面。
2. 点击“选择参考图片”上传图片。
3. 工具会自动去除近似背景、裁切图案区域并生成网格。
4. 调整行数、列数，让像素效果符合预期。
5. 默认点击网格取色，必要时切换到画笔、填充或吸管编辑颜色。
6. 调整打印参数。
7. 在 3D 预览区域检查底板、网格墙和豆豆效果。
8. 点击“导出 2D 图纸”或“导出 STL”下载对应文件。

## MVP 限制说明

- 当前背景去除是浏览器端近似算法，适合纯色或接近纯色背景；复杂照片背景需要后端 `rembg` 或 OpenCV。
- 当前 STL 是整体导出，不包含 3MF 颜色元数据。
- 当前 2D 图纸导出为 SVG，不是 CAD 级工程图。
- 当前 3D 预览用于快速检查结构，最终打印前建议使用切片软件复核尺寸、朝向和支撑。
- 100 x 100 大网格会生成大量几何体，浏览器性能取决于设备配置。
