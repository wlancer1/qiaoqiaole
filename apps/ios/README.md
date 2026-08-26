# 敲敲乐 iOS

这是以 [`apps/h5`](../h5) 为功能、交互和视觉参考实现的 SwiftUI 原生 iOS App。它不使用 WebView、Capacitor 或 React Native 容器。

## 当前覆盖范围

- 四 Tab 首页、发现、消息和个人中心；深链接、登录门禁、应用级登录/确认/保存覆盖层。
- 从图片导入到裁剪、网格分图、MARD 221 色映射、颜色合并，再导入原生编辑器。
- 作品列表、文件夹、保存、重新打开、原生画布编辑（画笔、手抓、吸管、填充、撤销/重做、缩放标尺、参考图、颜色统计）以及 PNG/STL 导出。
- 拼豆会话、进度、计时、库存检查/扣减、仓库、库存流水和草稿恢复。
- 社区发现/详情、评论、关注与粉丝、通知、个人资料编辑、用户协议和隐私政策。

实现和验证的事实记录见 [PROGRESS.md](PROGRESS.md)；尚未完成的真机、TestFlight、生产域名和审核物料不会在本文件中伪称已完成。

## 在 Xcode 中运行

1. 打开 `QiaoQiaoLe.xcodeproj`。
2. 选择 Simulator，或选择已配置 Apple Development 签名的真机。
3. 运行 `QiaoQiaoLe` scheme。

命令行 Simulator 构建：

```sh
xcodebuild -project QiaoQiaoLe.xcodeproj \
  -scheme QiaoQiaoLe \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  build CODE_SIGNING_ALLOWED=NO
```

完整 XCTest（将设备名替换为本机可用设备）：

```sh
xcodebuild -project QiaoQiaoLe.xcodeproj \
  -scheme QiaoQiaoLe \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  test CODE_SIGNING_ALLOWED=NO
```

## API 配置与发布边界

`APIClient` 优先读取 app bundle 的 `APIBaseURL`。Debug 配置显式使用开发用的 `http://127.0.0.1:3000/api`；Release 配置在未注入有效 HTTP(S) 地址时会明确报“未配置生产 API 地址”，不会静默回退到本机。因此默认开发地址不能用于真机或 TestFlight。

准备发布前必须在 Release 配置中注入实际的 HTTPS `APIBaseURL`，并完成 Apple Developer Team、签名、App Store Connect/TestFlight、审核演示账号（或审核模式）及真机端到端回归。当前工程已有相册用途说明、隐私清单和 AppIcon，但这些外部发布条件需要相应权限和资料后才能完成。

## H5 对照

| H5 能力 | 原生实现 |
| --- | --- |
| `src/app/h5Routes.ts` 路由 | `AppFoundation.swift` 的 `AppRoute` 和深链接 |
| 分图与共享网格算法 | `SplitWorkflow.swift`、`SplitFlowView.swift`、`packages/core/src` fixture |
| 编辑器与画布交互 | `PatternEditorView.swift`、`PatternDocument.swift` |
| 项目、仓库、社区 API | `ProjectAPI.swift`、各 SwiftUI feature view |
| 图纸/STL 导出 | `STLExporter.swift` 与 `PatternFileExporter` |
