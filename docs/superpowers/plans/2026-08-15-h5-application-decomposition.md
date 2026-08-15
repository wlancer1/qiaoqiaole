# H5 Application Decomposition Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all application coordination out of `H5App.tsx` into routed pages, bounded feature modules, Redux/RTK Query state, and a persistent application overlay while preserving H5 behavior.

**Architecture:** Keep `AppBootstrap` as the provider/router entry point. Create a thin `H5AppShell` that renders routed content and persistent application-level overlays. Move behavior from the current coordinator into feature hooks in dependency order; retain high-frequency canvas and form state in their owning page and move shared server/command state to RTK Query or existing domain slices.

**Tech Stack:** React 19, React Router DOM, Redux Toolkit, RTK Query, Vitest, TypeScript, Vite.

---

## Mandatory task gate

Before every task commit, run its focused Vitest tests, `npm run build:h5`, and `git diff --check`. For every migrated or added Redux slice, thunk, or RTK Query endpoint, add behavior tests for reducer/selector or cache invalidation as applicable, plus successful, failed and cancelled/stale request paths. No task may remove the old owner until its replacement has been wired into the real application and its regression tests are green.

## File map

- `apps/h5/src/app/H5AppShell.tsx`: thin routed shell and durable overlay mount point.
- `apps/h5/src/app/overlays/*`: login/profile/save/share/folder/project-action/confirm overlay composition.
- `apps/h5/src/app/routes/*`: route registrations, route param parsing and protected-route behavior.
- `apps/h5/src/features/auth/*`: login UI state and authentication commands.
- `apps/h5/src/features/projects/*`: project list, folder, save/open and pagination coordination.
- `apps/h5/src/features/community/*`: community domain adapter around the existing hook and route pages.
- `apps/h5/src/features/warehouse/*`: warehouse load/detail/inventory commands.
- `apps/h5/src/features/beading/*`: session/open/resume coordination.
- `apps/h5/src/pages/editor/*`, `pages/split/*`: local controllers for canvas and split workflows.
- `apps/h5/src/H5App.tsx`: temporary compatibility export, then a thin alias to `H5AppShell`.

## Chunk 1: Application shell and durable overlays

### Task 1: Characterize the shell contract

**Files:** Create `apps/h5/src/app/H5AppShell.test.tsx`; modify `apps/h5/src/app/H5RoutedContent.test.tsx`, `apps/h5/src/app/AppBootstrap.tsx`, `apps/h5/src/main.tsx`, and `apps/h5/src/H5App.tsx`; create `apps/h5/src/app/H5AppShell.tsx`.

- [ ] Write an integration test mounting the real `main.tsx`/`AppBootstrap` path. Prove the shell renders the route outlet, its empty durable overlay slot survives real navigation, and route scope is exactly `location.key + pathname + search`.
- [ ] Run `npx vitest run --config vitest.config.ts apps/h5/src/app/H5AppShell.test.tsx` and confirm failure because the shell is absent.
- [ ] Implement the minimal shell as a compatibility wrapper around the existing `H5App` coordinator: `main.tsx` mounts `H5AppShell`, which renders the legacy coordinator as its temporary routed-content implementation plus an empty durable overlay slot. This preserves all existing props/state while later tasks replace one domain boundary at a time. Task 1 does not make an empty outlet the production application and does not yet move `ConfirmDialog`.
- [ ] Add route-scope regressions: navigation immediately clears the old status, and a request which captured the old scope cannot publish a status after navigation.
- [ ] Re-run shell, route and route-scope tests, then `npm run build:h5`.
- [ ] Commit only these files: `refactor(h5): introduce routed application shell`.

### Task 2: Move modal state behind an explicit overlay interface

**Files:** Create `apps/h5/src/app/overlays/AppOverlayContext.tsx`, `AppOverlayHost.tsx`, and `AppOverlayHost.test.tsx`; modify `H5AppShell.tsx`.

**Overlay ownership map:** `H5AppShell` is the only persistent mount point. `AppOverlayHost` owns the route-scoped global status (including independent clear), `ConfirmDialog`, login entry, profile editor, save/login-prompt, share dialog, create/move-folder sheets, project-action sheet and beading inventory sheet. Task 2 migrates the host/context and status/confirmation behavior; Task 3 supplies the auth dialog controller; Task 6 supplies project action controllers; Tasks 9–10 supply warehouse/beading command data. No page may render one of these cross-route overlays directly.

- [ ] Write failing tests for the ownership map: route-scoped global status renders in the shell, supports independent clear, clears on route navigation and rejects late old-scope updates; confirmation, login, profile, save/share, folder, project-action and inventory overlays all mount beneath the same persistent host. Cover open/cancel/confirm, Escape, backdrop click/touch non-propagation, scroll lock/restore, submit deduplication, and route changes without unmounting the host.
- [ ] Verify RED, then implement serializable request state and a local provider bridge. Keep functions, DOM nodes and focus refs local to the host, never Redux.
- [ ] Migrate status and `ConfirmDialog` first, retaining scope isolation, Escape, scroll lock and duplicate-submit behavior. Expose typed overlay slots for the remaining overlay families; their state and handlers migrate only in their owning feature task, without changing the host.
- [ ] Run focused tests and `npm run build:h5`; commit `refactor(h5): centralize app overlays`.

## Chunk 2: Complete authentication extraction

### Task 3: Define an authentication dialog controller

**Files:** Create `apps/h5/src/features/auth/useAuthDialog.ts` and `.test.tsx`, plus `apps/h5/src/features/auth/useProfileEditor.ts` and `.test.tsx`; modify `pages/home/HomeShellPage.tsx`, `app/overlays/AppOverlayHost.tsx`, `app/routes/*`, and every existing `requireLogin`/`openLogin` consumer discovered by `rg`.

- [ ] Inventory every `requireLogin`, `openLogin`, 401/session-expiry handler and protected route before moving code. Write failing hook/route tests for username login, phone login/register reset, SMS countdown cleanup, remembered-phone handling, stale-attempt suppression, protected-route redirect and login return target.
- [ ] Verify RED; implement by composing `authAttemptGuard`, `authLoginFlows`, `authSessionCoordinator` and remembered-phone helpers.
- [ ] Store return target as a validated Router pathname+search value. Wire `PhoneLoginModal` and every login trigger through the overlay host without changing copy or accessibility names.
- [ ] Move profile display-name/avatar editing into `useProfileEditor`; wire its payload and open/cancel/submit lifecycle through `AppOverlayHost`. Add open/cancel/confirm, file-validation, pending-submit and background non-propagation regressions.
- [ ] Run auth/route tests and build; commit `refactor(h5): move login dialog state to auth feature`.

### Task 4: Remove authentication orchestration from the app coordinator

**Files:** Modify `apps/h5/src/H5App.tsx`, `H5App.auth.test.ts`, and `H5App.loginGate.test.tsx`.

- [ ] Add a failing regression assertion that the entry no longer owns phone-login state or guards.
- [ ] Move remaining auth effects and handlers to the controller, keeping 401 handling centralized.
- [ ] Run focused tests/build and commit `refactor(h5): detach auth flow from app coordinator`.

## Chunk 3: Project feature ownership

### Task 5: Extract project list and folder commands

**Files:** Move or rename the existing `apps/h5/src/projects/useProjectDomain.ts` and its test into `features/projects/` (do not create a parallel hook); modify `H5App.tsx`, `store/projects/projectSlice.ts`, `projects/projectApi.ts`, `app/overlays/AppOverlayHost.tsx`, and route page consumers only as needed.

- [ ] Define and test the URL schema before implementation: `/projects?folder=<id|all>&page=<positive-int>`, with validation/defaulting and back/forward/refresh recovery. Write failing tests for initial load, pagination, stale response rejection, folder create/move/delete and route-based project open.
- [ ] Verify RED; implement a feature hook using existing project actions/thunks and owning only request sequencing plus page-local pending state.
- [ ] Move project effects/callbacks out of `H5App`, preserving folder history sentinel behavior. Ensure list endpoints return only summary fields and current-page data; editor/beading entry loads a project detail by route ID rather than relying on a list object.
- [ ] Wire create/move-folder payloads through `AppOverlayHost`; cover open/cancel/confirm, focus restoration, pending-submit and backdrop non-propagation for both folder sheets.
- [ ] Cover reducer/selector, success/failure/cancellation, tag invalidation if an RTK Query endpoint is added, and assertions that list payloads omit `canvasData`, `beadList`, source-image Base64 and other large fields.
- [ ] Run project/API tests/build; commit `refactor(h5): move project domain coordination`.

### Task 6: Extract project save/share/action overlays

**Files:** Create `apps/h5/src/features/projects/useProjectActions.ts` and `.test.tsx`; modify `AppOverlayHost.tsx` and `H5App.tsx`.

- [ ] Test save-login prompt, save deduplication, share pending/failure and action confirmation.
- [ ] Verify RED; implement minimally and move the overlays to the host.
- [ ] Run modal/project tests/build; commit `refactor(h5): centralize project actions`.

## Chunk 4: Community feature and route pages

### Task 7: Promote the existing community hook to a feature boundary

**Files:** Move `community/useCommunityDomain.ts` and its test to `features/community/`; modify consumers and `H5App.tsx`.

- [ ] Define and test the URL schema first: `/discover?sort=<hot|latest>&tags=<encoded-list>&page=<positive-int>` and validated page-local search semantics. Add failing tests for post/author route changes cancelling stale results, URL refresh, and back/forward restoration.
- [ ] Verify RED; expose a narrow feature API for discovery, detail, author, social and notifications.
- [ ] Make routed pages consume the feature API instead of callbacks threaded through `H5App`.
- [ ] For every migrated community endpoint or state action, cover list/detail cache invalidation or reducer/selector behavior plus success, failure and stale/cancelled paths. Extend API regression tests to enforce page-size bounds, current-page-only queries, absence of `canvasData`, `beadList`, source-image Base64 and detail-only fields, and formatters that do not read those omitted fields.
- [ ] Run community/route tests/build; commit `refactor(h5): move community domain to feature module`.

### Task 8: Remove community callbacks from the coordinator

**Files:** Modify `H5App.tsx`, `patterns/H5PatternPages.tsx`, and `app/H5RoutedContent.test.tsx`.

- [ ] Add a failing test proving direct community routes load from route IDs without parent-held active pattern state.
- [ ] Encode detail/author back-target in a validated `from` query parameter with a deterministic default for direct links; `location.state` may improve transitions but cannot be the only source.
- [ ] Delete parent callbacks only after green; run tests/build and commit `refactor(h5): route community pages independently`.

## Chunk 5: Warehouse and beading session ownership

### Task 9: Extract warehouse commands

**Files:** Create `features/warehouse/useWarehouseDomain.ts` and `.test.tsx`; modify warehouse pages, `H5App.tsx`, and route helpers.

- [ ] Define validated URL filters (`search`, `letter`, `unit`, page where applicable), then test list/inventory loads, route ID changes, stale response handling, refresh and error scope.
- [ ] Verify RED; implement with existing warehouse thunks/slice, then move callbacks into pages.
- [ ] For every migrated inventory mutation or endpoint, cover the slice reducer/selector or tag invalidation and successful, failed and stale/cancelled mutations.
- [ ] Run warehouse tests/build; commit `refactor(h5): move warehouse domain coordination`.

### Task 10: Extract beading session route coordinator

**Files:** Create `features/beading/useBeadingRouteSession.ts` and `.test.tsx`; modify `BeadingSessionPage.tsx`, `app/overlays/AppOverlayHost.tsx`, and `H5App.tsx`.

- [ ] Define the route contract first: `/projects/:projectId/beading` validates and decodes the ID, reloads the project detail and session after refresh, and maps missing/invalid/unauthorized resources to the existing route-scoped error/return behavior. Test direct entry, session start, resume, conflict recovery, inventory check and route exit.
- [ ] Verify RED; implement with existing client/action utilities; keep pointer and timer UI in the page.
- [ ] Wire inventory-check payloads and completion/cancel commands through `AppOverlayHost`; cover opening, cancelling, confirming, pending state and backdrop non-propagation.
- [ ] For every migrated session mutation or endpoint, cover the slice/selector or cache invalidation and successful, failed and conflict/cancelled paths.
- [ ] Run beading suite/build; commit `refactor(h5): move beading session coordination`.

## Chunk 6: Editor/split controllers and entry cleanup

### Task 11: Extract editor canvas controller

**Files:** Create `pages/editor/useCanvasEditor.ts` and `.test.tsx`; modify `CanvasPage.tsx` and `H5App.tsx`.

- [ ] Define the route contract first: `/projects/:projectId/edit` validates and decodes the ID, loads the project detail after refresh, and handles invalid/missing/unauthorized IDs without using a list object. Characterize undo/redo, drawing, resize, save and background-removal restore using failing tests.
- [ ] Verify RED; implement a page-local controller. Never place cells, history, refs or pointer state in Redux.
- [ ] Route editor loading by project ID, remove callback props, run editor tests/build, commit `refactor(h5): move canvas editor controller`.

### Task 12: Extract split workflow controller

**Files:** Create `pages/split/useSplitWorkflow.ts` and `.test.tsx`; modify `SplitPages.tsx` and `H5App.tsx`.

- [ ] Define validated transient-route behavior: `/split`, `/split/crop`, and `/split/preview` must redirect to `/split` with a clear scoped status if required in-memory image state is unavailable after direct open/refresh. Write failing tests for upload, background sensitivity, crop, grid alignment, preview cancellation and this direct-entry fallback.
- [ ] Verify RED; implement local workflow state with existing job refs; retain `ImageData` and files locally.
- [ ] Remove split event machinery from `H5App`, run split tests/build, commit `refactor(h5): move split workflow controller`.

### Task 13: Replace the legacy coordinator

**Files:** Modify `H5App.tsx`, `app/AppBootstrap.tsx`, `app/H5RoutedContent.tsx`, and `main.test.ts`.

- [ ] Add a failing test that the production entry renders `H5AppShell`, each legacy route renders from real router state, and no legacy screen-switching branches remain.
- [ ] Replace `H5App` with a thin compatibility export of `H5AppShell` (or remove after all imports migrate).
- [ ] Delete dead imports, setter adapters and duplicated effects.
- [ ] Run `npx vitest run --config vitest.config.ts apps/h5/src`, `npm run build:h5`, and `git diff --check`; commit `refactor(h5): complete application decomposition`.

## Final verification

- [ ] Inspect `git status --short`; confirm only planned files are present.
- [ ] Confirm modal tests cover open, cancel, confirm and backdrop non-propagation.
- [ ] Confirm route scope uses `location.key + pathname + search`, old statuses are cleared synchronously, and late requests cannot write a new-route status.
- [ ] Confirm refresh/deep links, browser navigation and validated URL state work for protected, project, community, warehouse, beading, editor and split pages.
- [ ] Verify the production server's unknown-H5-route fallback returns `index.html` rather than 404, using the project's deployment/server configuration or an HTTP integration test.
- [ ] Inspect project and community list responses: they fetch only the current page and omit `canvasData`, `beadList`, source-image Base64 and other detail-only fields.
