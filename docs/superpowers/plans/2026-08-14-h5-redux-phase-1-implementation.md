# H5 Redux Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce Redux Toolkit and RTK Query infrastructure, make Redux the single source of truth for H5 authentication and route-scoped status, replace callback-based post-login continuation, and document the state-management rules without migrating unrelated feature data.

**Architecture:** `main.tsx` owns one Redux Provider and one BrowserRouter. A small `AppBootstrap` synchronizes the current React Router location into `uiSlice` and starts one generation-safe session restore. `authSlice` owns serializable session state, a custom RTK Query base query owns future authenticated API access, and an external auth-gate registry bridges the existing login modal without storing callbacks in Redux. Existing community, project, warehouse, split, editor, and beading state remains in `H5App` until later phase-specific plans.

**Tech Stack:** React 19, TypeScript, React Router 7, Redux Toolkit 2.6+, React Redux 9, RTK Query, Vitest 3

**Constraints:** Work in the current branch and workspace because root `AGENTS.md` forbids creating branches or worktrees. Preserve the existing uncommitted routing/loading work. Stage and commit only the files listed by each task.

**Design reference:** `docs/superpowers/specs/2026-08-14-h5-redux-architecture-design.md`

---

## File Structure

### New files

- `apps/h5/src/store/store.ts` — configures the single H5 Redux store, API middleware, and auth listener middleware.
- `apps/h5/src/store/hooks.ts` — exports typed `useAppDispatch` and `useAppSelector` hooks.
- `apps/h5/src/store/api/apiError.ts` — defines and maps the shared discriminated `ApiError` type.
- `apps/h5/src/store/api/baseQuery.ts` — attaches the current auth token and generation-protects required-endpoint 401 handling.
- `apps/h5/src/store/api/apiSlice.ts` — defines the one `/api` RTK Query slice and formal tag types.
- `apps/h5/src/store/auth/authTypes.ts` — defines serializable auth state and normalized user types.
- `apps/h5/src/store/auth/authEvents.ts` — defines pure semantic auth actions shared without importing the reducer.
- `apps/h5/src/store/auth/authStorage.ts` — safely reads, writes, and clears the compatible `qiaoqiaole.auth` record.
- `apps/h5/src/store/auth/authSlice.ts` — owns the auth state machine, session generation, profile updates, and selectors.
- `apps/h5/src/store/auth/authThunks.ts` — restores `/api/me` once and performs best-effort server logout.
- `apps/h5/src/store/auth/authListener.ts` — persists valid sessions, clears auth-dependent caches, and deduplicates generation-scoped invalidation.
- `apps/h5/src/store/ui/uiSlice.ts` — owns current route scope, route-scoped status, and serializable login-request metadata.
- `apps/h5/src/store/ui/useScopedStatus.ts` — captures the current route scope for stale-safe status dispatch.
- `apps/h5/src/store/ui/useStatusAutoDismiss.ts` — dismisses only the status instance and route scope captured when its timer starts.
- `apps/h5/src/store/ui/authGate.ts` — keeps post-login Promise resolvers outside Redux and exposes a boolean auth gate.
- `apps/h5/src/store/ui/AuthGateContext.tsx` — provides one gate instance to H5 components without importing the singleton Store.
- `apps/h5/src/features/auth/authSessionCoordinator.ts` — normalizes both login forms and coordinates successful sessions with the external auth gate.
- `apps/h5/src/features/auth/authAttemptGuard.ts` — gives username and phone login requests one shared, cancelable attempt generation outside Redux.
- `apps/h5/src/features/auth/authLoginFlows.ts` — owns the executable username and phone success paths used by H5App and behavior tests.
- `apps/h5/src/features/auth/sessionBoundOperations.ts` — commits profile and still-local feature results only while their captured session identity remains current.
- `apps/h5/src/features/auth/authRouteGuard.ts` — resolves protected-route access only after restore reaches a terminal auth state.
- `apps/h5/src/H5App.protectedRoutes.test.tsx` — verifies restore behavior for every protected deep-link family.
- `apps/h5/src/H5App.loginGate.test.tsx` — verifies all H5 login entry points use the single Redux-backed auth gate.
- `apps/h5/src/app/RouteScopeBridge.tsx` — dispatches the current `location.key + pathname + search` scope.
- `apps/h5/src/app/AppBootstrap.tsx` — mounts the route bridge, triggers auth restore, and settles auth-gate requests.

### Modified files

- `apps/h5/package.json` and `package-lock.json` — add Redux Toolkit and React Redux.
- `apps/h5/src/main.tsx` — mount the single Redux Provider and `AppBootstrap` in the approved order.
- `apps/h5/src/H5App.tsx` — replace local auth/status sources with selectors/actions while leaving feature data local.
- `apps/h5/src/H5App.auth.test.ts` — replace obsolete source assertions with Redux integration contracts.
- `apps/h5/src/pages/home/HomeShellPage.tsx` and its tests — rename login modal Props to Redux-derived read/open/close contracts.
- `AGENTS.md` — add state-management rules and update the status-scope rule from `screen + activeTab` to Router scope.

---

## Chunk 1: Redux Core and Authentication State Machine

### Task 0: Commit the already verified routing/loading baseline

**Files:**
- Existing: `apps/h5/src/H5App.auth.test.ts`
- Existing: `apps/h5/src/H5App.tsx`
- Existing: `apps/h5/src/app/h5Routes.test.ts`
- Existing: `apps/h5/src/app/h5Routes.ts`
- Existing: `apps/h5/src/styles.css`
- Existing: `apps/h5/src/loading/`
- Existing: `docs/superpowers/plans/2026-08-14-h5-layered-loading-implementation.md`

- [ ] **Step 1: Verify the baseline still contains only the prior router/loading work**

Run:

```bash
git status --short
git diff -- apps/h5/src/H5App.auth.test.ts apps/h5/src/H5App.tsx apps/h5/src/app/h5Routes.test.ts apps/h5/src/app/h5Routes.ts apps/h5/src/styles.css apps/h5/src/loading docs/superpowers/plans/2026-08-14-h5-layered-loading-implementation.md
```

Expected: the diff contains the already completed React Router conversion and A+B loading states described in the prior handoff, with no Redux code.

- [ ] **Step 2: Re-run the prior verification before committing**

```bash
npx vitest run apps/h5/src
npm run build:h5
git diff --check
```

Expected: all H5 tests and build PASS, with no whitespace errors.

- [ ] **Step 3: Commit only that baseline**

```bash
git add apps/h5/src/H5App.auth.test.ts apps/h5/src/H5App.tsx apps/h5/src/app/h5Routes.test.ts apps/h5/src/app/h5Routes.ts apps/h5/src/styles.css apps/h5/src/loading docs/superpowers/plans/2026-08-14-h5-layered-loading-implementation.md
git diff --cached --check
git diff --cached --name-only
git diff --cached -- apps/h5/src/H5App.auth.test.ts apps/h5/src/H5App.tsx apps/h5/src/app/h5Routes.test.ts apps/h5/src/app/h5Routes.ts apps/h5/src/styles.css apps/h5/src/loading docs/superpowers/plans/2026-08-14-h5-layered-loading-implementation.md
git commit -m "feat(h5): complete routed loading experience"
```

Expected: cached names are exactly the listed baseline paths, and the complete cached patch—including previously untracked files—contains only the verified routing and A+B loading work. The Redux phase-1 plan/spec and unrelated files are not staged.

### Task 1: Install Redux Toolkit and React Redux

**Files:**
- Modify: `apps/h5/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Record the dependency baseline**

Run:

```bash
npm ls --workspace @qiaoqiaole/h5 @reduxjs/toolkit react-redux
```

Expected: the command reports that Redux Toolkit and React Redux are not installed for the H5 workspace.

- [ ] **Step 2: Install the official packages**

Run:

```bash
npm install --workspace @qiaoqiaole/h5 @reduxjs/toolkit@^2.6.0 react-redux@^9.2.0
```

Expected: `apps/h5/package.json` contains both packages and `package-lock.json` is updated without changing unrelated workspace dependencies.

- [ ] **Step 3: Verify the resolved versions**

Run:

```bash
npm ls --workspace @qiaoqiaole/h5 @reduxjs/toolkit react-redux
```

Expected: one resolved Redux Toolkit version at or above 2.6 and one React Redux 9.x version.

- [ ] **Step 4: Commit the dependency change**

```bash
git add apps/h5/package.json package-lock.json
git commit -m "build(h5): add Redux Toolkit state dependencies"
```

### Task 2: Implement auth contracts, storage, and pure reducer events

**Files:**
- Create: `apps/h5/src/store/auth/authTypes.ts`
- Create: `apps/h5/src/store/auth/authEvents.ts`
- Create: `apps/h5/src/store/auth/authStorage.ts`
- Create: `apps/h5/src/store/auth/authStorage.test.ts`
- Create: `apps/h5/src/store/auth/authSlice.ts`
- Create: `apps/h5/src/store/auth/authSlice.test.ts`

- [ ] **Step 1: Write failing storage tests**

Test a small in-memory `Storage` double. Required assertions:

- `readStoredAuth` accepts `{ token, username, userId }` from `qiaoqiaole.auth`.
- Missing/blank token returns `null` and removes the record.
- Invalid JSON removes the record without throwing.
- Non-string `token`, or non-string `username`/`userId` when those optional fields are present, removes the record and returns `null`.
- `writeStoredAuth` writes only the compatible serializable fields.
- `clearStoredAuth` is idempotent.

- [ ] **Step 2: Write failing state-factory and reducer tests**

Use the intended public actions/selectors. Cover:

```ts
sessionEstablished({ token, user })
sessionInvalidated({ token, sessionVersion })
profileUpdated({ token, sessionVersion, changes: { displayName, avatarUrl } })
profileStatsUpdated({ token, sessionVersion, changes: { likesCount, followingCount, followersCount } })
sessionCleared()
```

Assert that:

- `createAuthInitialState(storedRecord)` is `restoring` when the supplied record contains a token, otherwise `anonymous`;
- `sessionVersion` increments on successful restore/login, invalidation, and logout;
- invalidation with an old token or generation is ignored;
- `restoreIdentityHint` may be non-null only while status is `restoring`; every `sessionEstablished`, `sessionInvalidated`, and `sessionCleared` path clears it;
- profile actions never change the session generation and are ignored unless their captured token and `sessionVersion` still match the active session;
- selectors return token, user ID, display name, avatar, stats, and `isAuthenticated`;
- no state contains a function, Set, DOM object, or `ImageData`.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```bash
npx vitest run apps/h5/src/store/auth/authStorage.test.ts apps/h5/src/store/auth/authSlice.test.ts
```

Expected: FAIL because auth files do not exist.

- [ ] **Step 4: Implement auth types, pure events, and storage adapter**

Define a normalized user containing:

```ts
export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  legacyDraftOwnerId: string;
  likesCount: number;
  followingCount: number;
  followersCount: number;
};
```

The storage module is the only auth module allowed to access `localStorage`. Accept `Storage | undefined` as a parameter so tests and SSR-safe initialization do not read `window` at module evaluation. `authEvents.ts` uses `createAction` for `sessionEstablished`, `sessionInvalidated`, `sessionCleared`, profile events, and contains no reducer import.

- [ ] **Step 5: Implement the reducer and selectors**

Use:

```ts
export type AuthState = {
  status: 'restoring' | 'authenticated' | 'anonymous';
  token: string;
  user: AuthUser | null;
  restoreIdentityHint: { username?: string; userId?: string } | null;
  restoreRequestId: string | null;
  sessionVersion: number;
};
```

`createAuthInitialState(storedRecord)` is the only initial-state factory. The later Store factory calls `readStoredAuth(storage)` once and passes the record as preloaded auth state; `authSlice` never reads storage. `sessionInvalidated` must compare both payload fields to current state before clearing. Export narrowly named selectors rather than exposing arbitrary state shape to components.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run apps/h5/src/store/auth/authStorage.test.ts apps/h5/src/store/auth/authSlice.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the auth state model**

```bash
git add apps/h5/src/store/auth/authTypes.ts apps/h5/src/store/auth/authEvents.ts apps/h5/src/store/auth/authStorage.ts apps/h5/src/store/auth/authStorage.test.ts apps/h5/src/store/auth/authSlice.ts apps/h5/src/store/auth/authSlice.test.ts
git commit -m "feat(h5): add Redux auth state machine"
```

### Task 3: Define the shared API error and authenticated base query

**Files:**
- Create: `apps/h5/src/store/api/apiError.ts`
- Create: `apps/h5/src/store/api/apiError.test.ts`
- Create: `apps/h5/src/store/api/baseQuery.ts`
- Create: `apps/h5/src/store/api/baseQuery.test.ts`
- Create: `apps/h5/src/store/api/apiSlice.ts`

- [ ] **Step 1: Write failing `ApiError` mapping tests**

Cover HTTP 500 query retryability, HTTP 400, network errors, parsing errors, aborts, and a valid HTTP 200 body shaped as `{ success: false, code, message }` mapping to `kind: 'business'`. Call `toApiError(raw, operation)` with both `query` and `mutation`; a network/500 Query is retryable, while the same Mutation error is not.

- [ ] **Step 2: Run the error tests and verify RED**

Run `npx vitest run apps/h5/src/store/api/apiError.test.ts`.

Expected: FAIL because `apiError.ts` does not exist.

- [ ] **Step 3: Implement the exact `ApiError` discriminator**

```ts
export type ApiError = {
  kind: 'http' | 'business' | 'network' | 'parse' | 'aborted';
  status?: number;
  code?: string;
  message: string;
  data?: unknown;
  retryable: boolean;
};
```

Export `toApiError(raw, operation)` and `toUserMessage(error)`. Detect business failure only from an explicit supported envelope (`success === false` or `ok === false`), not merely from a `message` field.

- [ ] **Step 4: Write failing base-query tests**

With a minimal Store using the real `authReducer`, assert required and optional endpoints attach a Token when present; none never attaches one; optional without Token stays anonymous; only required 401 dispatches captured `{ token, sessionVersion }`; an in-flight identity change does not alter that payload; 2xx business failure maps to `ApiError`; Query versus Mutation retryability uses `api.type`; and there is one fetch attempt.

- [ ] **Step 5: Run the base-query test and verify RED**

Run `npx vitest run apps/h5/src/store/api/baseQuery.test.ts`.

Expected: FAIL because Base Query/API Slice are missing.

- [ ] **Step 6: Implement Base Query and the one API Slice**

Define `AuthExtraOptions = { auth: 'required' | 'optional' | 'none' }`. Read `{ token, sessionVersion }` once before fetch, map transport and explicit 2xx business failures, dispatch the pure `sessionInvalidated` event only for required 401, and do not configure retry middleware. Configure the formal tag types and `keepUnusedDataFor: 120` from the spec.

- [ ] **Step 7: Run focused tests and commit**

```bash
npx vitest run apps/h5/src/store/api
git add apps/h5/src/store/api
git commit -m "feat(h5): add RTK Query API foundation"
```

Expected: all API tests PASS before commit.

### Task 4: Configure the production Store factory for lifecycle tests

**Files:**
- Create: `apps/h5/src/store/store.ts`
- Create: `apps/h5/src/store/store.test.ts`

- [ ] **Step 1: Write a failing Store initialization test**

Call `createH5Store({ storage })` with valid, missing, and corrupt auth storage. Assert the factory reads storage once, injects the matching auth initial state including a one-time `restoreIdentityHint`, installs API middleware, and keeps serializable checks enabled. Tests stub `globalThis.fetch` with Vitest per test and restore it afterward; the H5 Store does not support a mutable/global fetch override. For Chunk 1 the state keys are exactly `api` and `auth`; Chunk 2 will add `ui` before application mount.

- [ ] **Step 2: Run the test and verify RED**

Run `npx vitest run apps/h5/src/store/store.test.ts`.

Expected: FAIL because Store factory is missing.

- [ ] **Step 3: Implement injectable Store dependencies**

The factory accepts browser Storage by default and allows tests to inject `Storage`. It calls `readStoredAuth(storage)` and `createAuthInitialState(record)` once, configures real `authReducer` and `apiSlice.reducer`, and installs API middleware. Base Query and auth Thunks use browser `globalThis.fetch`; tests use scoped `vi.stubGlobal`/`vi.unstubAllGlobals`, never a module-level mutable fetch. Do not export the browser singleton until Chunk 2 adds `uiReducer` and listener middleware.

- [ ] **Step 4: Run the Store/API/auth tests and commit**

```bash
npx vitest run apps/h5/src/store/store.test.ts apps/h5/src/store/api apps/h5/src/store/auth
git add apps/h5/src/store/store.ts apps/h5/src/store/store.test.ts
git commit -m "feat(h5): add injectable Redux store factory"
```

Expected: PASS.

### Task 5: Add restore/logout thunks and auth lifecycle listener

**Files:**
- Create: `apps/h5/src/store/auth/authThunks.ts`
- Create: `apps/h5/src/store/auth/authThunks.test.ts`
- Create: `apps/h5/src/store/auth/authListener.ts`
- Create: `apps/h5/src/store/auth/authListener.test.ts`
- Modify: `apps/h5/src/store/auth/authSlice.ts`
- Modify: `apps/h5/src/store/store.ts`

- [ ] **Step 1: Write failing restore tests against `createH5Store`**

Test with a real configured reducer and mocked fetch:

- no stored token means no `/api/me` request;
- valid restore normalizes `/api/me` user and profile counts;
- malformed `/api/me` response becomes anonymous and clears storage;
- dispatch uses explicit `{ sessionVersion }` args while Token and one-time identity hints come from the already initialized auth state; a second dispatch while `restoreRequestId` is active is rejected by `condition`;
- a restore response whose request ID or captured session generation is stale cannot overwrite a newer login;
- StrictMode-equivalent double dispatch produces one effective `/api/me` call.

- [ ] **Step 2: Write failing listener/logout tests against the same Store factory**

Assert:

- `sessionEstablished` writes the compatible storage record and resets the whole API cache before the new identity fetches data;
- valid `sessionInvalidated` clears storage, user state, and API cache once;
- two required 401 actions from the same generation produce one global invalidation effect;
- an old account's late 401 does not clear a newer account;
- after a newer login, stale restore fulfilled/rejected actions cannot write/remove the new storage record or reset the new account API cache;
- logout clears the local session before awaiting `/api/v1/auth/logout`, so a newer login cannot be cleared by a late logout completion;
- listener validates a 401 against `listenerApi.getOriginalState()` because the reducer has already advanced generation by effect time.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npx vitest run apps/h5/src/store/auth/authThunks.test.ts apps/h5/src/store/auth/authListener.test.ts
```

Expected: FAIL because thunks/listener are missing.

- [ ] **Step 4: Implement `restoreSession`**

Use `createAsyncThunk<RestorePayload, { sessionVersion: number }>` so `meta.arg.sessionVersion` exists on pending, fulfilled, and every rejected action. Its `condition` requires restoring status, no request ID, matching generation, and a non-empty state Token. The payload creator captures Token and `restoreIdentityHint` from state once; no module rereads storage. Add extraReducers to `authSlice.ts` with these atomic transitions:

- accepted pending stores `meta.requestId`;
- accepted fulfilled requires matching request ID and generation, sets `authenticated`, writes normalized user, clears request ID/hint, and increments generation;
- accepted rejected requires matching request ID and generation, sets `anonymous`, clears Token/User/request ID/hint, and increments generation;
- stale settled actions change nothing.

All ordinary events leaving restoring also clear the hint. `authThunks.ts` imports only auth types/events, while `authSlice.ts` may import the thunk, preserving one-way dependency.

Normalize the existing `/api/me` response with `resolveRestoredDisplayName`; do not trigger project, community, notification, or warehouse loading from the thunk.

- [ ] **Step 5: Implement best-effort logout**

The logout thunk captures the current generation for diagnostics, immediately dispatches `sessionCleared`, then sends `/api/v1/auth/logout` best-effort. Its eventual resolution dispatches no session-clearing action, so a newly established account is safe. It must not retain Token in Redux after the first synchronous dispatch.

- [ ] **Step 6: Implement listener middleware**

Export `createAuthListenerMiddleware({ storage })` so every Store/test receives an isolated processed-generation marker. It owns storage writes/removal and dispatches `apiSlice.util.resetApiState()` for every identity establishment/change/clear. For restore settled actions, compare both `meta.requestId` and `meta.arg.sessionVersion` to `listenerApi.getOriginalState().auth`; only an action the reducer was eligible to accept may produce side effects. On valid fulfilled, write the normalized compatible record and reset API cache after the reducer establishes the user. On valid rejected, the reducer first makes Token unreadable; the listener then resets API cache and removes storage. Stale fulfilled/rejected actions do nothing to Store-adjacent state, storage, or API cache. For `sessionInvalidated`, compare payload with original auth state for the same reason. Deduplicate within that listener instance, not by checking already-mutated current auth state.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run apps/h5/src/store/auth
```

Expected: all auth tests PASS.

- [ ] **Step 8: Commit async auth lifecycle**

```bash
git add apps/h5/src/store/auth/authThunks.ts apps/h5/src/store/auth/authThunks.test.ts apps/h5/src/store/auth/authListener.ts apps/h5/src/store/auth/authListener.test.ts apps/h5/src/store/auth/authSlice.ts apps/h5/src/store/store.ts
git commit -m "feat(h5): add generation-safe auth lifecycle"
```

---

## Chunk 2: Store, Router Scope, and Serializable Login Gate

### Task 6: Add the serializable phase-1 UI reducer

**Files:**
- Create: `apps/h5/src/store/ui/uiSlice.ts`
- Create: `apps/h5/src/store/ui/uiSlice.test.ts`

- [ ] **Step 1: Write failing reducer tests**

Required cases: route change clears an old status; current-scope status is accepted; old-scope status/clear actions are ignored; global status is the only bypass; first valid login `returnTo` wins; matching-ID `loginRequestReconciled` updates the surviving scope/`returnTo`; stale-ID reconciliation is ignored; login completion/cancel clears only the matching request ID; and every state/action remains serializable.

- [ ] **Step 2: Run the reducer test and verify RED**

Run `npx vitest run apps/h5/src/store/ui/uiSlice.test.ts`.

Expected: FAIL because `uiSlice.ts` does not exist.

- [ ] **Step 3: Implement the minimal UI state**

```ts
type UiState = {
  currentRouteScope: string;
  status: { scopeId: string; message: string } | null;
  loginRequest: { id: string; scopeId: string; returnTo?: string } | null;
};
```

Do not add confirm callbacks or unrelated modal state.

- [ ] **Step 4: Run and commit**

```bash
npx vitest run apps/h5/src/store/ui/uiSlice.test.ts
git add apps/h5/src/store/ui/uiSlice.ts apps/h5/src/store/ui/uiSlice.test.ts
git commit -m "feat(h5): add serializable UI state"
```

Expected: PASS.

### Task 7: Complete the Store and add route-scoped status adapters

**Files:**
- Modify: `apps/h5/src/store/store.ts`
- Modify: `apps/h5/src/store/store.test.ts`
- Create: `apps/h5/src/store/hooks.ts`
- Create: `apps/h5/src/store/ui/useScopedStatus.ts`
- Create: `apps/h5/src/store/ui/useScopedStatus.test.tsx`
- Create: `apps/h5/src/app/RouteScopeBridge.tsx`
- Create: `apps/h5/src/app/RouteScopeBridge.test.tsx`

- [ ] **Step 1: Extend the failing Store test**

Require final phase-1 keys `['api', 'auth', 'ui']`, the auth listener and API middleware exactly once, browser singleton export, and serializable/immutable checks enabled.

- [ ] **Step 2: Write failing bridge/hook tests**

Render with a MemoryRouter and Redux Provider. Navigate from `/discover` to `/profile`; assert the scope includes location key, pathname, and search, and old status disappears. Capture `setStatus` before navigation, call it after navigation, and assert it cannot write into the new route.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npx vitest run apps/h5/src/store/ui/uiSlice.test.ts apps/h5/src/store/ui/useScopedStatus.test.tsx apps/h5/src/app/RouteScopeBridge.test.tsx
npx vitest run apps/h5/src/store/store.test.ts
```

Expected: FAIL because the Store lacks UI and the hook/bridge are missing.

- [ ] **Step 4: Complete Store and typed hooks**

Add `uiReducer`, export the browser singleton, RootState/AppDispatch, and React Redux `.withTypes` hooks. The injectable factory remains the single implementation used by tests and browser Store.

- [ ] **Step 5: Implement `useScopedStatus`**

The returned callback closes over the scope read during that render:

```ts
const scopeId = useAppSelector(selectCurrentRouteScope);
return useCallback((message: string) => {
  dispatch(statusRequested({ scopeId, message }));
}, [dispatch, scopeId]);
```

This captured scope is required; reading the latest scope at completion would reintroduce stale messages.

- [ ] **Step 6: Implement `RouteScopeBridge`**

Use `useLocation`, construct `${location.key}:${location.pathname}${location.search}`, and dispatch on every location change. Render `null`.

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
npx vitest run apps/h5/src/store/store.test.ts apps/h5/src/store/ui apps/h5/src/app/RouteScopeBridge.test.tsx
```

Expected: PASS.

```bash
git add apps/h5/src/store/store.ts apps/h5/src/store/store.test.ts apps/h5/src/store/hooks.ts apps/h5/src/store/ui/useScopedStatus.ts apps/h5/src/store/ui/useScopedStatus.test.tsx apps/h5/src/app/RouteScopeBridge.tsx apps/h5/src/app/RouteScopeBridge.test.tsx
git commit -m "feat(h5): scope Redux status to router location"
```

### Task 8: Replace callback-based login continuation with an external Promise registry

**Files:**
- Create: `apps/h5/src/store/ui/authGate.ts`
- Create: `apps/h5/src/store/ui/authGate.test.ts`
- Create: `apps/h5/src/store/ui/AuthGateContext.tsx`
- Create: `apps/h5/src/app/AppBootstrap.tsx`
- Create: `apps/h5/src/app/AppBootstrap.test.tsx`
- Modify: `apps/h5/src/app/RouteScopeBridge.tsx`
- Modify: `apps/h5/src/app/RouteScopeBridge.test.tsx`

- [ ] **Step 1: Write failing auth-gate tests**

Test the public contract:

```ts
const result = authGate.require({ scopeId: 'route-a', returnTo: '/warehouses' });
```

Assert:

- an already authenticated Store resolves `true` immediately without opening login;
- multiple unauthenticated calls share one visible login request but retain separate scopes and insertion order;
- successful login resolves only requests whose scope is still current;
- cancel and Provider disposal resolve every waiter to `false`;
- final Provider disposal also matching-ID cancels `ui.loginRequest`, while StrictMode cleanup/setup replay cancels neither waiter nor request;
- no Redux action/state contains a resolver or callback;
- when concurrent valid requests contain different `returnTo` values, the first non-empty `returnTo` wins and later navigation intents do not overwrite it;
- `completeLogin(oldRequestId)` and `cancelLogin(oldRequestId)` cannot settle a newer request;
- releasing an old Bootstrap owner cannot dispose waiters while a current owner remains attached.
- `routeChanged(nextScope)` immediately resolves waiters from other scopes as `false` while preserving waiters from the new scope;
- after route invalidation, no surviving waiter dispatches matching-ID login cancel, while surviving waiters reconcile `ui.loginRequest` to the first remaining scope and first non-empty remaining `returnTo`;
- after `routeChanged` has installed a new current scope, a late `require` carrying an old scope resolves `false` immediately without creating a waiter or opening login.

- [ ] **Step 2: Write failing bootstrap tests**

Render `AppBootstrap` under StrictMode, Provider, and MemoryRouter. Assert:

- it renders children and `RouteScopeBridge`;
- each effect setup reads `store.getState().auth.sessionVersion` and dispatches `restoreSession({ sessionVersion })`; two StrictMode setups produce one effective restore request because the second fails the thunk condition;
- unmount settles auth-gate waiters as false;
- after the zero-owner disposal microtask, unmount also clears the matching `ui.loginRequest`;
- StrictMode's setup/cleanup/setup cycle preserves waiters owned by the remounted Bootstrap;
- it does not create a second Router or Redux Provider.

- [ ] **Step 3: Run tests and verify RED**

Run:

```bash
npx vitest run apps/h5/src/store/ui/authGate.test.ts apps/h5/src/app/AppBootstrap.test.tsx apps/h5/src/app/RouteScopeBridge.test.tsx
```

Expected: FAIL because the registry/bootstrap files do not exist.

- [ ] **Step 4: Implement `authGate`**

Implement only the factory design:

```ts
const gate = createAuthGate({ getState: store.getState, dispatch: store.dispatch });
```

Each gate owns its private insertion-ordered resolver Map; no module-scope resolver singleton is allowed. Every waiter records `{ loginRequestId, scopeId, returnTo }`. At the start of `require`, compare the supplied scope with `getState().ui.currentRouteScope`; a stale scope resolves `false` without registering or dispatching. `completeLogin(requestId)` and `cancelLogin(requestId)` are no-ops unless the ID equals the active Redux request. `attach()` returns a unique owner ID. `release(ownerId)` removes only that owner and schedules disposal in a microtask; a StrictMode re-attach before that microtask cancels disposal. Only zero owners at microtask time settle all waiters false and dispatch matching-ID login cancel for the disposed active request. Resolve with booleans only.

`routeChanged(nextScope)` removes and resolves all nonmatching waiters. If the active request has no waiter left, dispatch matching-ID login cancel. Otherwise dispatch matching-ID `loginRequestReconciled` with the first surviving waiter's scope and the first non-empty `returnTo` among surviving waiters. This ensures an invalidated route cannot leave its modal metadata or navigation intent behind.

`AuthGateContext.tsx` provides this instance and exports `useAuthGate`; H5App/features never import the singleton Redux Store.

- [ ] **Step 5: Implement `AppBootstrap`**

It renders:

```tsx
<>
  <RouteScopeBridge />
  {children}
</>
```

Create one gate per mounted `AppBootstrap` with `useMemo` from the React Redux `useStore()` instance, provide it through `AuthGateContext`, and call `attach/release` in an effect. In a separate effect setup, read the current generation from `store.getState()` and dispatch `restoreSession({ sessionVersion })`. Do not abort restore during cleanup; request/generation guards reject stale results.

Update `RouteScopeBridge` to call `gate.routeChanged(scopeId)` after dispatching `routeScopeChanged`; this provides immediate route-invalidation settlement rather than waiting until login completes. Extend its integration test to prove the Redux scope changes first, then gate reconciliation removes old waiters and old `returnTo` metadata.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
npx vitest run apps/h5/src/store/ui apps/h5/src/app/AppBootstrap.test.tsx apps/h5/src/app/RouteScopeBridge.test.tsx
```

Expected: PASS.

```bash
git add apps/h5/src/store/ui/authGate.ts apps/h5/src/store/ui/authGate.test.ts apps/h5/src/store/ui/AuthGateContext.tsx apps/h5/src/app/AppBootstrap.tsx apps/h5/src/app/AppBootstrap.test.tsx apps/h5/src/app/RouteScopeBridge.tsx apps/h5/src/app/RouteScopeBridge.test.tsx
git commit -m "feat(h5): add serializable login gate"
```

### Task 9: Write Redux rules into `AGENTS.md`

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add a `状态管理` section after route rules**

Add the ten approved rules from the design spec, including:

- Redux Toolkit/React Redux are the only H5 global-state solution.
- Server data defaults to one RTK Query `apiSlice` with injected endpoints.
- Router owns page/resource/filter state.
- Redux values/actions must be serializable.
- DOM, Ref, functions, events, `File`, `ImageData`, Pointer, timers, and animation frames are forbidden in Redux.
- No giant `appSlice` or giant global Context.
- Derived data belongs in `selectXxx` selectors.
- Actions describe domain events rather than defaulting to mechanical `setXxx` names.
- Canvas pointer movement stays local and commits only at stable boundaries.
- Every Slice/Endpoint migration needs reducer, selector, invalidation, and error-path tests.

- [ ] **Step 2: Update the existing status rule**

Replace the obsolete requirement that status is bound to `screen + activeTab`. State that application status is bound to the Router scope `${location.key}:${pathname}${search}`, route changes clear it, and late async callbacks must dispatch with their captured scope.

- [ ] **Step 3: Verify documentation consistency**

Run:

```bash
rg -n "状态管理|Redux Toolkit|RTK Query|ImageData|location.key|screen \+ activeTab" AGENTS.md
git diff --check -- AGENTS.md
```

Expected: all new concepts are present, and the obsolete `screen + activeTab` requirement is absent.

- [ ] **Step 4: Commit the project rules**

```bash
git add AGENTS.md
git commit -m "docs: define H5 Redux state rules"
```

---

## Chunk 3: Application Integration and Verification

### Task 10: Mount the single Store and bootstrap boundary

**Files:**
- Modify: `apps/h5/src/main.tsx`
- Create: `apps/h5/src/main.test.ts`

- [ ] **Step 1: Write a failing entry contract test**

Read `main.tsx` as source and assert exactly one each of:

```text
<Provider store={store}>
<BrowserRouter basename={import.meta.env.BASE_URL}>
<AppBootstrap>
```

Assert their order is Provider, BrowserRouter, AppBootstrap, content. Assert `H5App` does not create a Provider or Router.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run apps/h5/src/main.test.ts
```

Expected: FAIL because `main.tsx` does not mount Redux.

- [ ] **Step 3: Modify `main.tsx`**

Wrap the normal H5 app in the approved order. Keep the development beading fixture working; it still receives the Redux Provider and BrowserRouter, but it does not need to mount `AppBootstrap` unless it renders `H5App`.

- [ ] **Step 4: Run the entry test and build**

Run:

```bash
npx vitest run apps/h5/src/main.test.ts apps/h5/src/app
npm run build:h5
```

Expected: tests PASS and TypeScript/Vite build succeeds.

- [ ] **Step 5: Commit the entry integration**

```bash
git add apps/h5/src/main.tsx apps/h5/src/main.test.ts
git commit -m "feat(h5): mount Redux application bootstrap"
```

### Task 11: Migrate route-scoped status as one buildable vertical change

**Files:**
- Create: `apps/h5/src/store/ui/useStatusAutoDismiss.ts`
- Create: `apps/h5/src/store/ui/useStatusAutoDismiss.test.tsx`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/H5App.auth.test.ts`

- [ ] **Step 1: Write failing behavioral timer tests**

Under Provider and MemoryRouter, show a non-sticky status, advance 2.8 seconds, and assert matching-scope dismissal. Then show status on route A, navigate to route B before the timer fires, show a new status, advance the old timer, and assert route B status remains. Assert messages beginning with `正在` are not auto-dismissed.

- [ ] **Step 2: Add failing source contracts**

Require `useScopedStatus()` and `useStatusAutoDismiss()`. Forbid local `setStatusState`, `statusScopeRef`, and the old `${screen}:${activeTab}` scope. Keep unrelated auth, routing, modal, and loading assertions unchanged.

- [ ] **Step 3: Run tests and verify RED**

```bash
npx vitest run apps/h5/src/store/ui/useStatusAutoDismiss.test.tsx apps/h5/src/H5App.auth.test.ts
```

Expected: FAIL on the missing hook and old H5App state.

- [ ] **Step 4: Implement the hook and switch H5App status**

Read status and current scope with selectors, obtain `setStatus` from `useScopedStatus`, and call the new auto-dismiss hook. The timer dispatches `statusCleared({ scopeId })` with its captured scope. Remove only local status state/effects; leave authentication state untouched so this commit builds independently.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run apps/h5/src/store/ui apps/h5/src/H5App.auth.test.ts
npm run build:h5
git add apps/h5/src/store/ui/useStatusAutoDismiss.ts apps/h5/src/store/ui/useStatusAutoDismiss.test.tsx apps/h5/src/H5App.tsx apps/h5/src/H5App.auth.test.ts
git diff --cached --check
git commit -m "refactor(h5): scope application status with Redux"
```

Expected: tests/build PASS. Task 0's baseline means whole-file staging no longer mixes prior work.

### Task 12: Cut over the complete authentication vertical path atomically

**Files:**
- Create: `apps/h5/src/features/auth/authAttemptGuard.ts`
- Create: `apps/h5/src/features/auth/authAttemptGuard.test.ts`
- Create: `apps/h5/src/features/auth/authSessionCoordinator.ts`
- Create: `apps/h5/src/features/auth/authSessionCoordinator.test.ts`
- Create: `apps/h5/src/features/auth/authLoginFlows.ts`
- Create: `apps/h5/src/features/auth/authLoginFlows.test.ts`
- Create: `apps/h5/src/features/auth/sessionBoundOperations.ts`
- Create: `apps/h5/src/features/auth/sessionBoundOperations.test.ts`
- Create: `apps/h5/src/features/auth/authRouteGuard.ts`
- Create: `apps/h5/src/features/auth/authRouteGuard.test.ts`
- Create: `apps/h5/src/H5App.protectedRoutes.test.tsx`
- Create: `apps/h5/src/H5App.loginGate.test.tsx`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/H5App.auth.test.ts`
- Modify: `apps/h5/src/pages/home/HomeShellPage.tsx`
- Modify: `apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`
- Modify: `apps/h5/src/pages/home/HomeProfileNavigation.test.tsx`

- [ ] **Step 1: Write failing login-attempt and session-coordinator tests**

Give `authAttemptGuard` `begin()`, `cancel()`, and `isCurrent(attemptId)`. Starting a second attempt invalidates the first, and canceling invalidates the current attempt. Use a real test Store and gate factory for the coordinator. Cover both current response shapes:

1. username/password `{ token, user: { id, username, nickname, avatarUrl } }`;
2. phone `{ accessToken, user: { id, nickname, avatarUrl } }`.

Assert each current attempt becomes one normalized `sessionEstablished` event, preserves `legacyDraftOwnerId`, and calls `completeLogin(capturedRequestId)` exactly once. Before establishing a session, the coordinator must require both the captured login attempt to remain current and the Store's token/session version to equal the values captured when the attempt began. A stale gate request ID may establish a still-current successful session but must not settle a newer gate request; a stale login attempt may do neither. No Token is returned through the gate.

Cover these races explicitly:

- closing/canceling login before its response arrives;
- logging out before its response arrives;
- account B succeeding before account A's older response arrives;
- changing login method and starting a newer attempt.
- while account B is still submitting, account A's older request fails or enters `finally`; account A may not overwrite B's error, clear B's form, or end B's pending indicator.

- [ ] **Step 2: Write executable tests for both login flows**

Put the username and phone submission/success orchestration in `authLoginFlows.ts`, with request/CAPTCHA dependencies injected for tests and the existing validation behavior preserved. Execute both flows and assert each dispatches exactly one valid session, calls `completeLogin` once with the request ID captured at submission start, passes the response Token and newly established session identity explicitly to the still-local feature refresh adapter, and never resolves a gate with a Token. Every asynchronous side effect—success, error text, form cleanup, and pending-state completion—must first prove its attempt is still current. Assert an invalidated attempt cannot dispatch, refresh, settle its gate, write an error, clear current input, or end a newer attempt's pending state.

In `sessionBoundOperations.test.ts`, start a still-local feature refresh and a profile/stat operation under account A, then log out or establish account B before each Promise resolves or rejects. Assert account A's success cannot commit local arrays or dispatch a profile/stat action, and its rejection cannot clear data, run a failure fallback, or publish an error/status. Also assert same-session success and error handlers each run once. The helper owns both success and error commits and checks `{ token, sessionVersion }` after settlement on both paths, not only before the request starts.

- [ ] **Step 3: Write failing protected-route guard and integration tests**

Implement the intended pure outcomes:

```ts
expect(resolveProtectedAuth('restoring')).toBe('wait');
expect(resolveProtectedAuth('authenticated')).toBe('allow');
expect(resolveProtectedAuth('anonymous')).toBe('login');
```

This guard is used before project/warehouse deep-link effects so Redux restoration never produces an anonymous flash.

Under MemoryRouter, Provider, and AppBootstrap, render every protected deep-link family currently handled by H5App: project edit, project beading, and warehouse detail. For each route assert:

- `restoring` sends no anonymous resource request and opens no login request;
- successful restore starts the resource request exactly once;
- failed restore creates exactly one login request;
- navigating away before restore completion never loads the old route's resource.

- [ ] **Step 4: Add failing H5App cutover and login-gate assertions**

Require auth selectors, `useStore`, `useAuthGate`, semantic auth events/thunks, both exported login flows, and session-bound operations. Forbid every local auth source/setter, `pendingAuthActionRef`, `AUTH_STORAGE_KEY`, and all direct `localStorage.getItem/setItem/removeItem` calls in H5App. Specifically forbid `useState(...showLoginModal...)` and direct `setShowLoginModal(...)`, while requiring Redux-derived `isLoginModalOpen`, `openLogin`, and `closeLogin` contracts. Require each protected effect to call `resolveProtectedAuth(authStatus)`.

In `H5App.loginGate.test.tsx`, exercise the home/profile entry, a detail-page protected action, and a protected deep link. Assert they all open the same Redux `loginRequest`, repeated calls while it is active do not create a second request, and closing dispatches `cancelLogin` with the captured active request ID.

- [ ] **Step 5: Run tests and verify RED**

```bash
npx vitest run apps/h5/src/features/auth apps/h5/src/H5App.auth.test.ts apps/h5/src/H5App.protectedRoutes.test.tsx apps/h5/src/H5App.loginGate.test.tsx
```

Expected: FAIL until the complete read/write cutover is implemented.

- [ ] **Step 6: Implement auth aliases and restoring behavior**

Read `authStatus`, Token, user, user ID, display name, avatar, legacy draft owner, and profile counts from selectors. Rename the local credential field to `loginUsernameInput`; it remains a form draft, not auth state. Derive login modal visibility and active request ID from `uiSlice`. Use `resolveProtectedAuth` before protected deep-link loading: `wait` keeps the existing page skeleton, `login` opens the gate, and `allow` loads with the Redux Token.

Remove the local restore Effect and every H5App auth storage access. Legacy `requestApi` uses the selector Token or explicit override only.

- [ ] **Step 7: Migrate both login submissions through the tested flows**

At submission start capture `const loginRequestId = activeLoginRequest?.id ?? null`, the current `{ token, sessionVersion }`, and a new attempt ID from the shared guard. Both username and phone submission paths call their tested `authLoginFlows` function. Closing the modal, switching login methods, and logout cancel the current attempt; starting either flow supersedes the previous attempt. Continue passing the response Token explicitly to still-local project/community/warehouse refresh functions during this phase.

- [ ] **Step 8: Migrate profile statistics and login-modal control**

Profile save, `/me` count loads, self follow-count changes, and post-login project/community/notification/warehouse refreshes run through `sessionBoundOperations`, capturing `{ token, sessionVersion }` before starting and checking it again before any success or error commit. Stale rejections cannot publish status, clear data, or apply fallback values. Their semantic profile actions also carry that identity, so the reducer is a second guard. Other authors' follower counts remain feature-local. Opening login calls `authGate.require({ scopeId, returnTo? })`; closing cancels the login attempt and uses `cancelLogin(activeRequestId)`. Rename `HomeShellPage` Props and call sites from writable `showLoginModal`/`setShowLoginModal` to `isLoginModalOpen`, `openLogin`, and `closeLogin`; update both existing home tests. Do not store callbacks in Redux.

- [ ] **Step 9: Migrate callback compatibility and logout**

Obtain the current Redux Store through React Redux `useStore`, never by importing the singleton. The temporary callback adapter waits for `authGate.require`, then reads the current Token from that Store and invokes the old callback only if still authenticated. Logout first invalidates the active login attempt, captures and cancels the active gate request ID, dispatches `logoutSession()` (which clears locally before network completion), then clears only the still-local feature arrays. It uses no auth setters.

- [ ] **Step 10: Run focused behavioral tests and build**

```bash
npx vitest run apps/h5/src/features/auth apps/h5/src/store/auth apps/h5/src/store/ui apps/h5/src/app apps/h5/src/H5App.auth.test.ts apps/h5/src/H5App.protectedRoutes.test.tsx apps/h5/src/H5App.loginGate.test.tsx apps/h5/src/pages/home
npm run build:h5
```

Expected: all tests/build PASS; username and phone flows share the tested orchestration, stale attempts cannot create sessions, stale gate IDs cannot settle new gates, profile results are generation-safe, every protected restore waits, and logout failure cannot clear a newer session.

- [ ] **Step 11: Audit and commit the atomic cutover**

```bash
rg -n "setAuthToken|setAuthUserId|setIsLoggedIn|setProfileAvatarUrl|setFollowingCount|setFollowersCount|pendingAuthActionRef|AUTH_STORAGE_KEY|localStorage\.(getItem|setItem|removeItem)|setShowLoginModal\(" apps/h5/src/H5App.tsx
git add apps/h5/src/features/auth apps/h5/src/H5App.tsx apps/h5/src/H5App.auth.test.ts apps/h5/src/H5App.protectedRoutes.test.tsx apps/h5/src/H5App.loginGate.test.tsx apps/h5/src/pages/home/HomeShellPage.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx apps/h5/src/pages/home/HomeProfileNavigation.test.tsx
git diff --cached --check
git diff --cached --name-only
git commit -m "refactor(h5): move authentication into Redux"
```

Expected: `rg` returns no matches; cached names are only the listed auth/H5App paths.

### Task 13: Full regression, state audit, and phase-1 handoff

**Files:**
- Modify only if verification finds a phase-1 defect in files already listed above.

- [ ] **Step 1: Audit forbidden Redux values and duplicate auth sources**

Run:

```bash
rg -n "ImageData|HTMLElement|PointerEvent|MouseEvent|TouchEvent|File|Map<|Set<|=>" apps/h5/src/store
rg -n "setAuthToken|setAuthUserId|setIsLoggedIn|setShowLoginModal\(|AUTH_STORAGE_KEY|pendingAuthActionRef" apps/h5/src/H5App.tsx
rg -n "qiaoqiaole\.auth" apps/h5/src --glob '!store/auth/authStorage.ts' --glob '!store/auth/authStorage.test.ts'
```

Expected: matches in Redux are type guards/tests or external registries only; H5App has no old auth source; the auth storage key appears only in its adapter and adapter tests.

- [ ] **Step 2: Run all H5 tests**

Run:

```bash
npx vitest run apps/h5/src
```

Expected: all H5 tests PASS. Existing `react-test-renderer` deprecation warnings are acceptable; new unhandled Redux or React warnings are not.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build:h5
```

Expected: TypeScript and Vite build PASS. Record the main bundle and new Redux chunk sizes in the handoff.

- [ ] **Step 4: Run repository hygiene checks**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Task 0 already committed the pre-existing loading/router baseline, so all remaining changes are phase-1 files.

- [ ] **Step 5: Manually smoke the critical authentication routes**

Run `npm run dev:h5`, then verify in the browser:

1. Anonymous `/discover` loads public content.
2. A protected action opens one login modal.
3. Successful login resumes the action once.
4. Refresh with valid storage restores without an anonymous flash.
5. Invalid storage enters anonymous mode without repeated `/api/me` calls.
6. `/profile`, `/warehouses`, and `/projects` still navigate through React Router.
7. Logout clears user data even if the logout request is blocked in DevTools.
8. Navigating before an old request finishes does not show its status on the new route.

Expected: all eight checks pass.

- [ ] **Step 6: Commit verification-only fixes if present**

If no fixes were necessary, do not create an empty commit. If verification changed phase-1 code, first inspect tracked and untracked changes together:

```bash
git status --short
git diff
```

Stage only the exact files or hunks changed by the verification fix (use `git add -p <path>` when a file contains mixed work), then inspect the complete staged patch:

```bash
git diff --cached --check
git diff --cached --name-only
git diff --cached
git commit -m "fix(h5): complete Redux phase 1 regression"
```

Do not recursively stage `apps/h5/src/store`, `apps/h5/src/app`, or another directory in this final step. If `git status --short` includes an unexpected path, or a staged file contains a non-phase-1 hunk, stop and inspect it instead of committing.

---

## Phase-1 Exit Criteria

- Redux Provider and BrowserRouter each exist exactly once in `main.tsx`.
- `H5App` has no local source of truth for Token, authenticated user, profile counters, or global status.
- `qiaoqiaole.auth` is accessed only through `authStorage.ts`.
- Restore and 401 results are guarded by request identity and session generation.
- Old-account responses cannot clear or overwrite a newer account.
- RTK Query base infrastructure exists but unrelated feature data has not been prematurely migrated.
- Login continuation stores no callback in Redux and always settles on success, cancel, route invalidation, or disposal.
- Route changes clear status and late callbacks cannot write into the next route.
- `AGENTS.md` contains the approved Redux/RTK Query boundaries.
- All H5 tests, production build, and `git diff --check` pass.
