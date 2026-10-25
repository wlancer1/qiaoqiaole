# 小程序

UI 以现有 H5 为参考，布局使用 750 设计宽度和 rpx。
H5 的流式根字号换算为约 57.0652 rpx/rem；Canvas 内部绘制和触摸位置仍使用实际 px/mm。
安全区只加在实际贴边的底部控件上。

## 验证

在仓库根目录执行：

- `npm run build:weapp --workspace @qiaoqiaole/mini`
- `npx vitest run --config apps/mini/vitest.config.ts`
- `npx tsc -p apps/mini/tsconfig.json --noEmit --skipLibCheck --noUnusedLocals false --noUnusedParameters false`

最后一条关闭未使用变量检查，是因为复用的 core 包当前存在未使用参数；不会关闭类型检查。
小程序使用 React 18，根目录 H5 使用 React 19，tsconfig 的 React 类型路径用于隔离两端类型。

在微信开发者工具中导入本目录，编译目录是 dist。真机需复查：
- 系统胶囊、安全区、原生返回与弹层关闭。
- Canvas 绘制、布料图片平铺、保存到相册的授权。
- 微信登录和生产请求域名。

## 本次 UI 对齐范围

首页、发现、作品、我的、拼豆/拼布编辑器布局；共用底栏、创作菜单和 Sheet；
发现搜索/分类/触底加载；拼布填布/填色、无填充、底布选择及撤销。
系统布料 PNG 来自 H5 相同的 SVG 图案，以支持小程序原生 Canvas。更新源图后运行 `node apps/mini/scripts/sync-fabric-presets.mjs`（需要本机 Chrome）。
本机项目仍使用现有本地存储；此次没有实现 H5 全部云端功能（例如云端作品同步、布料库存、社区详情和评论）。
