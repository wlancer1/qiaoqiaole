# 记住手机号和密码 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 H5 手机号登录弹窗中支持记住手机号和密码，并在下次打开时自动填充。

**Architecture:** 新增独立的 `rememberedPhoneLogin` 存储 helper，不扩展现有会话 token 记录。`H5App` 负责在登录弹窗打开时恢复凭据、在登录成功后保存或清除凭据；`PhoneLoginModal` 只负责展示复选框和传递状态。注册模式不展示、不写入密码。

**Tech Stack:** React 18、TypeScript、Vitest、现有 H5 CSS 与 `localStorage`。

---

## Chunk 1: 凭据存储边界

### Task 1: 添加失败测试，定义记忆登录记录 API

**Files:**
- Create: `apps/h5/src/store/auth/rememberedPhoneLogin.test.ts`
- Create: `apps/h5/src/store/auth/rememberedPhoneLogin.ts`

- [ ] **Step 1: 写合法记录读写、清除和容错测试**

覆盖 `readRememberedPhoneLogin`、`writeRememberedPhoneLogin`、`clearRememberedPhoneLogin`：合法记录可往返；缺字段、空手机号/密码、错误类型和损坏 JSON 被清除并返回 `null`；Storage 读写异常不抛错。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix apps/h5 run test -- src/store/auth/rememberedPhoneLogin.test.ts`

Expected: FAIL，因为 helper 尚未实现。

- [ ] **Step 3: 实现最小 helper**

使用独立 key `qiaoqiaole.remembered-phone-login`，只序列化 `phone`、`password` 和 `remember`；读取时严格校验字符串非空和 `remember === true`。Storage 异常只降级为无记忆凭据，不阻断登录。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix apps/h5 run test -- src/store/auth/rememberedPhoneLogin.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交凭据 helper**

```bash
git add apps/h5/src/store/auth/rememberedPhoneLogin.ts apps/h5/src/store/auth/rememberedPhoneLogin.test.ts
git commit -m "feat: add remembered phone login storage"
```

## Chunk 2: 登录弹窗交互与登录流程

### Task 2: 先补登录组件和源代码行为测试

**Files:**
- Modify: `apps/h5/src/pages/home/HomeShellPage.tsx`
- Modify: `apps/h5/src/H5App.tsx`
- Test: `apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`
- Test: `apps/h5/src/H5App.auth.test.ts`

- [ ] **Step 1: 写失败测试**

断言 `PhoneLoginModal` 在登录模式显示“记住手机号和密码”复选框、使用传入的 `rememberPassword` 值并调用 `setRememberPassword`；注册模式不显示该复选框。补充 H5App 行为测试，要求登录弹窗打开时恢复存储凭据，登录成功按勾选状态调用写入或清除 helper。

- [ ] **Step 2: 运行相关测试确认失败**

Run: `npm --prefix apps/h5 run test -- src/pages/home/HomeShellPage.fixBug.test.tsx src/H5App.auth.test.ts`

Expected: FAIL，因为组件和登录流程尚未接入记忆登录状态。

- [ ] **Step 3: 接入复选框和状态**

在 `H5App` 增加 `rememberPassword` 状态及一个只在登录弹窗打开、登录模式下执行的恢复逻辑；恢复时填充手机号和密码并设置复选框，未找到记录时保持空表单。把状态和 setter 传入 `PhoneLoginModal`，登录模式渲染 checkbox，注册模式隐藏。

- [ ] **Step 4: 接入成功保存和清除**

在 `submitPhoneAuth('login')` 成功后，根据 `rememberPassword` 写入或清除独立记录；注册成功不调用保存 helper。保留现有 token 写入、异步请求序号和提交中禁用逻辑。退出登录只清除会话，不清除已记住的凭据。

- [ ] **Step 5: 运行相关测试确认通过**

Run: `npm --prefix apps/h5 run test -- src/pages/home/HomeShellPage.fixBug.test.tsx src/H5App.auth.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交登录交互**

```bash
git add apps/h5/src/pages/home/HomeShellPage.tsx apps/h5/src/H5App.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx apps/h5/src/H5App.auth.test.ts
git commit -m "feat: remember phone login credentials"
```

## Chunk 3: 全量验证与交付

### Task 3: 检查样式、类型和 H5 构建

**Files:**
- Modify: `apps/h5/src/styles.css` only if the checkbox needs alignment with the existing phone login form.

- [ ] **Step 1: 运行 H5 测试**

Run: `npm --prefix apps/h5 run test`

Expected: all existing and new tests PASS。

- [ ] **Step 2: 运行 H5 构建**

Run: `npm run build:h5`

Expected: build succeeds without TypeScript or bundling errors。

- [ ] **Step 3: 检查差异和工作区**

Run: `git diff --check && git status --short`

Expected: no whitespace errors；仅包含本次功能的修改，保留既有未跟踪计划文件不动。

- [ ] **Step 4: 提交验证结果**

若验证期间只产生本次功能的必要样式或测试修正，提交：

```bash
git add apps/h5/src && git commit -m "test: verify remembered phone login"
```
