# H5 Lightweight Toast Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom application-level light status banner with a lightweight `react-hot-toast` notification host.

**Architecture:** Keep Redux `ui.status` and route-scope guards as the source of truth. `AppOverlayHost` observes the scoped status and presents it through a single application-level `Toaster`; closing or automatic dismissal clears the corresponding Redux status only when it is still current.

**Tech Stack:** React 19, Redux Toolkit, React Router, react-hot-toast, Vitest.

---

## Chunk 1: Toast host migration

### Task 1: Protect status-to-toast lifecycle

**Files:**
- Modify: `apps/h5/src/app/overlays/AppOverlayHost.test.tsx`
- Modify: `apps/h5/package.json`
- Modify: `package-lock.json`
- Modify: `apps/h5/src/app/overlays/AppOverlayHost.tsx`

- [ ] **Step 1: Write a failing host test**

Assert a route-scoped status opens one toast and that dismissing it dispatches the existing scoped clear action.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- apps/h5/src/app/overlays/AppOverlayHost.test.tsx`
Expected: FAIL because no third-party Toast host is mounted.

- [ ] **Step 3: Install and mount the minimal dependency**

Run: `npm install --workspace @qiaoqiaole/h5 react-hot-toast`

Render one `Toaster` in `AppOverlayHost`, use a stable toast id for the current scoped status, configure top-center placement and safe-area-aware offset, and clear Redux only from the matching toast dismissal callback.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- apps/h5/src/app/overlays/AppOverlayHost.test.tsx apps/h5/src/app/RouteScopeBridge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verify production output**

Run: `npm run build:h5 && git diff --check`
Expected: successful build and no whitespace errors.
