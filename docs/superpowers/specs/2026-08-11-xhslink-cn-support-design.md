# 小红书 `xhslink.cn` 短链兼容设计

## 目标

让 H5 接受小红书新分享口令中的 `http://xhslink.cn/o/...` 和 `https://xhslink.cn/o/...`，并让 API 将该域名按现有小红书短链流程安全解析。

## 范围

- 保留 `xiaohongshu.com` 与 `xhslink.com` 的现有支持。
- 仅新增已确认用于分享口令的根域名 `xhslink.cn`，不泛化到其任意子域名。
- 不放开其他 `.cn` 域名，不允许仅在路径或查询参数中包含受支持域名的第三方 URL。
- 不改变图片解析；输入提示改成不枚举域名的“小红书笔记链接或分享口令”。

## 数据流与安全边界

1. H5 从完整分享文案中提取第一个 HTTP(S) URL，并按精确主机边界接受根域名 `xhslink.cn`。
2. API 使用相同主机白名单再次校验，防止绕过客户端校验。
3. 服务端把 `xhslink.cn` 识别为短链；首次请求不携带 `XHS_COOKIE`。
4. 每次跳转仍必须落在小红书受支持主机白名单内，第三方跳转继续被拒绝。
5. HTTP 短链入口可以访问，但 `XHS_COOKIE` 只能发送给 HTTPS 的 `xiaohongshu.com` 主机；任何 HTTP 页面请求都不得携带 Cookie。
6. 跳转到 HTTPS `xiaohongshu.com` 后，沿用现有页面获取、日志和图片提取流程。

## 测试

- H5：用户给出的完整新分享口令能提取 `xhslink.cn` URL；HTTP/HTTPS 根域通过；子域、伪造后缀域名、用户信息伪装 URL 和非标准端口失败。
- API：对同一组 URL 执行一致的主机和端口边界断言。
- Cookie：`mobileHeaders` 证明 HTTP `xiaohongshu.com`、`xhslink.cn` 和第三方主机从不携带 Cookie，只有 HTTPS `xiaohongshu.com` 可按配置携带。
- 重定向：将现有重定向循环改为可注入 `fetch` 的独立可测单元，覆盖 `xhslink.cn` 首次请求与同域中间跳转无 Cookie、到 HTTPS `xiaohongshu.com` 后才携带 Cookie、相对 `Location`、第三方跳转不发起后续请求，以及超过五次跳转失败。
- 运行小红书聚焦测试、完整测试、TypeScript 检查、`npm run build:h5` 和 `git diff --check`。
