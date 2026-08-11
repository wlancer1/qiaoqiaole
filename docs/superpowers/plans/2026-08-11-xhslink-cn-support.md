# Xiaohongshu `xhslink.cn` Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept current Xiaohongshu `xhslink.cn` share links end to end without weakening redirect or Cookie security.

**Architecture:** Keep URL extraction and hostname validation in the existing H5/API helpers, but add only the confirmed `xhslink.cn` root domain. Extract the redirect loop into a focused API module with injectable `fetch`, so actual request sequencing, host validation, redirect limits, and Cookie propagation are covered without starting the full server.

**Tech Stack:** React, TypeScript, Node.js ESM, Fetch API, Vitest

---

## Chunk 1: Domain compatibility and secure redirects

### Task 0: Record the in-flight diagnostics baseline

**Files:**
- Inspect: `CHANGELOG.md`
- Inspect: `apps/api/src/server.mjs`
- Inspect: `apps/api/src/xiaohongshu.mjs`
- Inspect: `apps/api/src/xiaohongshu.test.mjs`

- [ ] **Step 1: Capture the existing uncommitted diagnostics diff before implementation**

Run:

```bash
git status --short
git diff -- CHANGELOG.md apps/api/src/server.mjs apps/api/src/xiaohongshu.mjs apps/api/src/xiaohongshu.test.mjs
```

Record that the baseline contains `summarizeXhsError`, `summarizeXhsUpstreamResponse`, `xhs-image`/`xhs-proxy` request loggers, `image_probe_success`/`image_probe_failed`, `download_upstream_response`, `proxy_upstream_response`, and download/proxy failure logs. Task 4 must verify all remain in the final diff.

### Task 1: Accept the new root domain in H5 and API validation

**Files:**
- Modify: `apps/h5/src/utils/h5AppUtils.test.ts`
- Modify: `apps/h5/src/utils/h5AppUtils.ts`
- Modify: `apps/h5/src/pages/home/HomeShellPage.tsx`
- Modify: `apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`
- Modify: `apps/api/src/xiaohongshu.test.mjs`
- Modify: `apps/api/src/xiaohongshu.mjs`

- [ ] **Step 1: Write failing H5 and API tests**

Add assertions using the supplied share text and exact hostname boundaries:

```ts
expect(extractUrlFromText('拼豆图纸 http://xhslink.cn/o/AYw80EYloim 把口令复制下来')).toBe(
  'http://xhslink.cn/o/AYw80EYloim',
);
expect(isSupportedXiaohongshuUrl('http://xhslink.cn/o/AYw80EYloim')).toBe(true);
expect(isSupportedXiaohongshuUrl('https://xhslink.cn/o/AYw80EYloim')).toBe(true);
expect(isSupportedXiaohongshuUrl('http://xhslink.cn:80/o/1')).toBe(true);
expect(isSupportedXiaohongshuUrl('https://xhslink.cn:443/o/1')).toBe(true);
expect(isSupportedXiaohongshuUrl('https://sub.xhslink.cn/o/1')).toBe(false);
expect(isSupportedXiaohongshuUrl('https://xhslink.cn.attacker.example/o/1')).toBe(false);
expect(isSupportedXiaohongshuUrl('https://xhslink.cn@attacker.example/o/1')).toBe(false);
expect(isSupportedXiaohongshuUrl('https://xhslink.cn:8443/o/1')).toBe(false);
expect(isSupportedXiaohongshuUrl('https://attacker.example/xhslink.cn/o/1')).toBe(false);
expect(isSupportedXiaohongshuUrl('https://attacker.example/?next=xhslink.cn')).toBe(false);
```

Add the same explicit boundary matrix to `xiaohongshu.test.mjs`. In `HomeShellPage.fixBug.test.tsx`, read `HomeShellPage.tsx` and assert that it contains `placeholder="粘贴小红书笔记链接或分享口令"` and no longer contains the old `.com`-enumerating placeholder.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest run apps/h5/src/utils/h5AppUtils.test.ts apps/api/src/xiaohongshu.test.mjs apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx --config vitest.config.ts
```

Expected: FAIL because `xhslink.cn` is rejected and the old placeholder enumerates `.com` domains.

- [ ] **Step 3: Implement the minimal validation and copy changes**

In both H5 and API URL validators, accept `hostname === 'xhslink.cn'` only when the URL uses the default HTTP/HTTPS port. Preserve existing `xiaohongshu.com` and `xhslink.com` behavior. Change the upload placeholder to:

```tsx
placeholder="粘贴小红书笔记链接或分享口令"
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

### Task 2: Prevent Cookie forwarding over HTTP

**Files:**
- Modify: `apps/api/src/xiaohongshu.test.mjs`
- Modify: `apps/api/src/xiaohongshu.mjs`

- [ ] **Step 1: Write the failing HTTP Cookie test**

Inside the existing environment save/restore block, configure `XHS_COOKIE` and assert:

```js
expect(mobileHeaders('http://www.xiaohongshu.com/explore/1')).not.toHaveProperty('cookie');
expect(mobileHeaders('https://www.xiaohongshu.com/explore/1')).toMatchObject({ cookie: 'web_session=abc' });
expect(mobileHeaders('http://xhslink.cn/o/1')).not.toHaveProperty('cookie');
expect(mobileHeaders('https://attacker.example/path')).not.toHaveProperty('cookie');
```

- [ ] **Step 2: Run the test and verify RED**

Run `npx vitest run apps/api/src/xiaohongshu.test.mjs --config vitest.config.ts`.

Expected: FAIL because HTTP `xiaohongshu.com` currently receives the Cookie.

- [ ] **Step 3: Require HTTPS in `shouldSendXhsCookie`**

Return true only when the parsed protocol is `https:` and the hostname passes `isXiaohongshuCookieHost`.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 3: Make redirect behavior independently testable

**Files:**
- Create: `apps/api/src/xhsRedirects.mjs`
- Create: `apps/api/src/xhsRedirects.test.mjs`
- Modify: `apps/api/src/xiaohongshu.mjs`
- Modify: `apps/api/src/xiaohongshu.test.mjs`
- Modify: `apps/api/src/server.mjs`

- [ ] **Step 1: Create an importable redirect-module skeleton**

Create `xhsRedirects.mjs` with the intended named exports, but have `fetchWithValidatedXhsRedirects` throw `new Error('not implemented')`. This establishes an importable seam without implementing behavior before its test.

- [ ] **Step 2: Write failing redirect behavior tests**

First assert that `mobileHeaders` includes `XHS_COOKIE` only for HTTPS `xiaohongshu.com`, never HTTP or short-link hosts. Then define redirect tests against this public API:

```js
await fetchWithValidatedXhsRedirects(startUrl, logger, {
  useCookie: true,
  includeCookieForFirstRequest: false,
  fetchImpl,
});
```

`xhsRedirects.mjs` imports `isSupportedXiaohongshuUrl`, `mobileHeaders`, and `redactUrl` from `xiaohongshu.mjs`. The logger test double is `{ info: vi.fn() }`. Save `process.env.XHS_COOKIE`, set it to `web_session=abc`, and restore or delete it in `finally`.

Use a deterministic `fetchImpl` to prove:

- `http://xhslink.cn/o/first` and a relative same-domain redirect carry no Cookie.
- the subsequent HTTPS `xiaohongshu.com` request carries the configured Cookie.
- a third-party `Location` returns a rejected response without fetching the third party.
- five redirects return status 508.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npx vitest run apps/api/src/xiaohongshu.test.mjs apps/api/src/xhsRedirects.test.mjs --config vitest.config.ts
```

Expected: FAIL with `not implemented`, proving the tests reached the new API and exercised missing redirect behavior.

- [ ] **Step 4: Implement the redirect module**

Export `isXhsLinkUrl`, `fetchWithValidatedXhsRedirects`, and `fetchXiaohongshuPage`. `isXhsLinkUrl` recognizes the existing `.com` short links plus only the exact `xhslink.cn` root. `fetchWithValidatedXhsRedirects` accepts `{ useCookie = false, includeCookieForFirstRequest = false, fetchImpl = fetch }`, performs at most five manual-redirect fetches, resolves relative `Location`, validates the resolved URL before the next fetch, logs `redirect_response`/`request_rejected`, and returns `{ ok: false, status: 400, url, headers: new Headers(), text: async () => '' }` for a third-party redirect or status 508 after the limit.

`fetchXiaohongshuPage` calls the exported loop with `includeCookieForFirstRequest: useCookie && !isXhsLinkUrl(noteUrl)`. In `server.mjs`, import `fetchXiaohongshuPage` from the new module and remove only the five now-duplicated local functions: `fetchXiaohongshuPage`, `fetchWithValidatedRedirects`, `isRedirectStatus`, `createRejectedUpstreamResponse`, and `isXhsLinkUrl`. Keep every request-scoped diagnostic call elsewhere unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run `npx vitest run apps/api/src/xiaohongshu.test.mjs apps/api/src/xhsRedirects.test.mjs --config vitest.config.ts`. Expected: PASS.

### Task 4: Document and verify the complete change

**Files:**
- Modify: `CHANGELOG.md`
- Test: all files above

- [ ] **Step 1: Update the changelog**

Extend the existing Xiaohongshu diagnostics entry to mention `xhslink.cn` compatibility and HTTPS-only Cookie forwarding.

Compare the final diff with the Task 0 baseline and verify it still contains `summarizeXhsError`, `summarizeXhsUpstreamResponse`, request-scoped `xhs-image`/`xhs-proxy` loggers, `image_probe_success`/`image_probe_failed`, `download_upstream_response`, `proxy_upstream_response`, and download/proxy failure logging.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test -- --run
npx tsc -p tsconfig.json --noEmit
npm run build:h5
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Review the final diff and commit**

Ensure the existing request-scoped diagnostics remain intact. Stage only the intended files, then inspect and validate the staged patch:

```bash
git add CHANGELOG.md apps/api/src/server.mjs apps/api/src/xiaohongshu.mjs apps/api/src/xiaohongshu.test.mjs apps/api/src/xhsRedirects.mjs apps/api/src/xhsRedirects.test.mjs apps/h5/src/utils/h5AppUtils.ts apps/h5/src/utils/h5AppUtils.test.ts apps/h5/src/pages/home/HomeShellPage.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx docs/superpowers/plans/2026-08-11-xhslink-cn-support.md
git diff --cached --name-status
git diff --cached --check
git commit -m "fix: support xhslink cn shares"
```
