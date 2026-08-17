# 用户协议与隐私政策页面 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 H5 增加可分享的用户协议和隐私政策页面，并让手机号登录弹窗中的同意文案提供两个独立链接。

**Architecture:** 使用现有 React Router 注册 `/user-agreement` 和 `/privacy-policy`，由一个可复用的协议页面组件根据协议类型渲染标题和章节。登录弹窗保留现有勾选状态与提交逻辑，只把同意文案拆成两个路由链接，链接点击不改变勾选状态；协议正文先采用通用产品初稿，后续可替换文案。

**Tech Stack:** React 18、React Router、TypeScript、Vitest、现有 H5 CSS token。

---

## Chunk 1: 路由与协议页面

### Task 1: 写协议路由和页面的失败测试

**Files:**
- Create: `apps/h5/src/pages/legal/LegalPages.test.tsx`
- Modify: `apps/h5/src/app/H5RoutedContent.test.tsx`

- [ ] **Step 1: 写测试**：断言两个路由路径、页面标题、关键章节和返回按钮存在，并断言路由切换能渲染相应页面。
- [ ] **Step 2: 运行测试确认失败**：运行 `npx vitest run apps/h5/src/pages/legal/LegalPages.test.tsx apps/h5/src/app/H5RoutedContent.test.tsx`，预期因页面和路由尚不存在失败。

### Task 2: 实现协议页面和路由

**Files:**
- Create: `apps/h5/src/pages/legal/LegalPages.tsx`
- Modify: `apps/h5/src/app/h5Routes.ts`
- Modify: `apps/h5/src/app/H5RoutedContent.tsx`
- Modify: `apps/h5/src/app/H5Application.tsx`

- [ ] **Step 1: 增加路径常量和路由映射**：注册用户协议和隐私政策的明确路径，不增加 screen/activeTab 页面分支。
- [ ] **Step 2: 新增可复用协议页**：通过协议类型渲染标题、更新时间和章节，使用 `useNavigate` 返回上一页；页面具备标题语义、滚动区域和响应式结构。
- [ ] **Step 3: 在应用页面映射中提供协议页**：沿用现有 `H5RoutePages` 组合方式，不在页面组件内部新建 Router。
- [ ] **Step 4: 运行测试确认通过**：重新运行 Task 1 测试。

## Chunk 2: 登录入口与样式

### Task 3: 写登录协议链接的失败测试

**Files:**
- Modify: `apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`

- [ ] **Step 1: 增加行为测试**：断言登录文案包含两个链接并分别指向协议路径；点击链接时不触发复选框的 `onChange`。
- [ ] **Step 2: 运行测试确认失败**：运行 `npx vitest run apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`，预期因当前文案没有链接而失败。

### Task 4: 实现登录链接和协议页样式

**Files:**
- Modify: `apps/h5/src/pages/home/HomeShellPage.tsx`
- Modify: `apps/h5/src/styles.css`

- [ ] **Step 1: 拆分同意文案**：使用 `Link` 生成两个中文可访问链接，阻止链接点击冒泡，保持勾选逻辑不变。
- [ ] **Step 2: 增加协议页样式**：复用现有 `--flow-*` token、流式 rem、`min-height: 100svh`，保证窄屏不横向溢出，保留 `:focus-visible` 焦点轮廓。
- [ ] **Step 3: 运行登录测试确认通过**：重新运行 `npx vitest run apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`。

## Chunk 3: 全量验证

### Task 5: 验证并检查改动

**Files:**
- Verify: all modified H5 files

- [ ] **Step 1: 运行相关 Vitest**：`npx vitest run apps/h5/src/pages/legal/LegalPages.test.tsx apps/h5/src/app/H5RoutedContent.test.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`
- [ ] **Step 2: 构建 H5**：`npm run build:h5`
- [ ] **Step 3: 检查 diff**：`git diff --check`，并确认不覆盖现有用户修改。
