# 小红书完整分享文案解析实施计划

> **For agentic workers:** REQUIRED: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`. Follow RED → GREEN → REFACTOR.

**Goal:** 让完整复制文案、纯链接和带中英文尾随标点的分享内容都能提取出合法 URL，同时保留现有域名安全校验和提取 API。

**Architecture:** H5 负责从输入中提取并清洗第一个 HTTP(S) 候选，API 端再次执行相同清洗作为信任边界；服务端继续以解析后的 hostname 白名单判断支持范围。

**Tech Stack:** TypeScript、Node.js ESM、Vitest、Playwright。

---

## 固定解析契约

- 输入可为整段文案或纯 URL。
- 只取第一个 `http://` 或 `https://` 候选。
- 从候选末尾反复剥离 ASCII 与中文句末/括号标点，包括 `. , ! ? ; : ) ] }` 和 `。 ， ！ ？ ； ： ） 】 》`。
- URL 内部的 percent encoding、query 和 fragment 保持不变。
- 没有候选返回空字符串，不把整段文案当 URL。
- 是否支持仍由服务端 URL parser + hostname 白名单决定。

### Task 1：用同一张样例表固定前后端规则

**Files:**

- Modify: `apps/h5/src/utils/h5AppUtils.test.ts`
- Modify: `apps/api/src/xiaohongshu.test.mjs`
- Modify: `apps/h5/src/utils/h5AppUtils.ts`
- Modify: `apps/api/src/xiaohongshu.mjs`

- [ ] 加入至少 3 条脱敏真实格式样例：完整文案 + 短链、纯链接、换行及中文右括号/句号结尾。
- [ ] 先确认当前正则会把尾随标点吞入 URL，测试以此原因失败。
- [ ] 在 H5 与 API 的现有 `extractUrlFromText` 中实现相同规则；不创建新的 service、route 或链接模型。
- [ ] 增加无链接、多个链接、非小红书域名、伪造子域名和合法 query/fragment 测试。
- [ ] 保留 `isSupportedXiaohongshuUrl` 的精确 hostname 白名单，不使用字符串 `includes`。
- [ ] 运行：`npm test -- apps/h5/src/utils/h5AppUtils.test.ts apps/api/src/xiaohongshu.test.mjs --run`。

### Task 2：细分前端错误而不改 API 范围

**Files:**

- Modify only where needed: `apps/h5/src/H5App.tsx`

- [ ] 输入没有 HTTP(S) 候选时提示“未识别到链接”。
- [ ] API 判定 hostname 不受支持时提示“不支持的链接域名”。
- [ ] 网络、页面提取或图片获取失败沿用“提取失败”类提示，不能伪装成格式问题。
- [ ] 未登录仍走现有登录拦截；保留 `/api/xiaohongshu/extract`、`/image`、`/proxy`。

### Task 3：验证完整文案进入现有提取链路

**Files:**

- Modify: `tests/e2e/h5.spec.ts`

- [ ] 在现有上传弹窗粘贴完整分享文案。
- [ ] 拦截请求并断言 `/api/xiaohongshu/extract` 收到的是清洗后的 URL，不含中文句号或右括号。
- [ ] 验证无链接和不支持域名显示不同提示，且不发起图片代理请求。
- [ ] 运行：`npx playwright test tests/e2e/h5.spec.ts --grep "Xiaohongshu|小红书"`。
- [ ] 运行：`git diff --check`。

## 完成标准

- 前后端对 URL 候选及尾随标点行为一致。
- 服务端安全校验未被前端预处理取代或放宽。
- 不产生重复的小红书接口或解析模块。
