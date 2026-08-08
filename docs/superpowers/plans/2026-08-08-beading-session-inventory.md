# 拼豆库存检测与会话 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-08-08-beading-session-inventory-design.md` 实现库存检测、按色号拼豆会话、保存入口、我的作品操作和原子库存扣减。

**Architecture:** 在现有 sql.js 单文件 API 中增加需求快照、拼豆会话、幂等记录和库存流水审计字段；服务端负责版本校验、状态转换、库存检测与事务一致性。H5 在现有 `H5App` 状态和 `CanvasPage`/`BeadListDrawer` 基础上抽出会话纯逻辑与页面组件，所有进入方式复用同一会话 API。

**Workspace safety:** 所有实现、测试和提交只在 `/Users/yuhaowang/.config/superpowers/worktrees/qiaoqiaole/beading-session` 中进行。开始时和每个 chunk 完成时记录 `git status --short`, `git branch --show-current`, `git worktree list`，并确认 baseline 中已有文件；提交前执行 `git diff --cached --name-only` 与 `git diff --check`，只暂存本任务文件，不覆盖主工作区或用户未纳入任务的文件。

**Tech Stack:** Node.js HTTP API, sql.js/SQLite, React + TypeScript, Vitest, existing H5 canvas and modal CSS.

---

## Chunk 1: 需求统计与服务端基础模型

### Task 1: Add pure bead requirement and session transition utilities

**Files:**
- Create: `apps/api/src/beadingSessionUtils.mjs`
- Test: `apps/api/src/beadingSessionUtils.test.mjs`

- [ ] Write failing tests for MARD code validation, duplicate color aggregation, zero/invalid color rejection, inventory diff, completion progress, and allowed state transitions.
- [ ] Run `npm test -- --run apps/api/src/beadingSessionUtils.test.mjs` and verify the expected failures.
- [ ] Implement pure utilities with no database dependency.
- [ ] Run the focused test and verify it passes.
- [ ] Commit `test/api: define beading session rules`.

### Task 2: Extend sql.js schema and migration helpers

**Files:**
- Modify: `apps/api/src/server.mjs` in `initSchema()` and schema migration section.
- Test: `apps/api/src/beadingSessionSchema.integration.test.mjs`

- [ ] Write a failing `apps/api/src/beadingSessionSchema.integration.test.mjs` that boots an empty temporary database and an old database, runs migration twice, and verifies the complete schema/data dictionary: `beading_sessions.project_id` nullable after project deletion; immutable `project_snapshot_json`, `project_name_snapshot`, and `requirements_json` for completed/abandoned audit; `inventory_deducted`, `inventory_deduction_idempotency_key`, `completed_at`, `timer_started_at`, and `version`; `inventory_transactions.beading_session_id`, `project_id`, `source`, project-name snapshot, `color_code`, and `quantity`; and idempotency request fingerprint/first response summary.
- [ ] Run the focused test and verify failure before implementation.
- [ ] Add `beading_sessions`, `beading_idempotency_keys`, session audit fields, project revision support, and inventory transaction audit columns.
- [ ] Add the active-session uniqueness constraint or equivalent transaction-safe guard supported by sql.js: generate `active_key` as `user_id:project_id`, populate it on create/restart only for active statuses, clear it on active → abandoned/completed and project-deleted → abandoned/null-project, and set it to `NULL` for terminal statuses so SQLite permits multiple terminal rows.
- [ ] Keep existing databases migratable with `ALTER TABLE` guards, including existing inventory rows, empty databases, repeated migration, old databases with no new columns, and legacy duplicate active sessions. Test deterministic conflict handling: retain the newest active row by `updated_at DESC, id DESC`, abandon older duplicates, clear their keys, and create a unique key for the retained row.
- [ ] Add one transaction helper that uses `BEGIN IMMEDIATE`, rolls back on every failure, and calls `persist()` only after commit. Require it for create/restart, progress PATCH, pause/resume, prepare-completion, final completion, project deletion, all session CAS/revision checks, all inventory reads/writes/audits, and delete/complete race handling; no result-affecting query may occur outside the transaction. Test persist failure and both commit/rollback behavior in the schema/API fixture.
- [ ] Verify snapshot immutability at application level: changing project name/canvas/bead list after session creation never changes `project_snapshot_json`, `project_name_snapshot`, or `requirements_json`, and final completion always reads those session snapshots rather than the current project.
- [ ] Run schema tests and the full existing API test subset.
- [ ] Commit `feat(api): add beading session schema`.

## Chunk 2: Inventory and session API

### Task 3: Add inventory-check endpoints

**Files:**
- Modify: `apps/api/src/server.mjs` route table and compatibility glue only.
- Create: `apps/api/src/beadingSessionService.mjs` for snapshot/session lifecycle logic.
- Create: `apps/api/src/beadingInventoryService.mjs` for requirement diff and warehouse reads.
- Create: `apps/api/src/beadingInventoryApi.test.mjs`.

- [ ] Add failing integration tests for project-level inventory detection, session-snapshot detection, ownership, missing warehouse, insufficient quantities, and project revision mismatch at session creation.
- [ ] Run the focused tests and verify the failures are caused by missing routes/behavior.
- [ ] Implement server-derived project requirement snapshots and response shape `{ projectRevision, warehouseId, items, summary }`.
- [ ] Use the project’s canonical `/api/v1` API prefix for all new routes: `POST /api/v1/projects/:projectId/inventory-check` and `POST /api/v1/beading-sessions/:sessionId/inventory-check`; preserve an `/api` compatibility alias only if the existing project route contract requires it, and test both route resolution and response parity. If no warehouse exists, allow a session to start without `warehouseId` and return an explicit no-warehouse result.
- [ ] Add and test authenticated `POST /api/v1/projects/:projectId/copy`: unauthenticated returns `AUTH_REQUIRED`; inaccessible/non-shared source returns the existing project permission error; successful copy belongs to the current user, receives a new `projectId` and revision, and is the only project ID passed to session lookup. Verify source/copy sessions, deletion, and inventory audit records cannot be mixed.
- [ ] Run focused tests and verify green.
- [ ] Commit `feat(api): add beading inventory checks`.

### Task 4: Add session lifecycle endpoints

**Files:**
- Modify: `apps/api/src/server.mjs` route table and compatibility glue only.
- Modify: `apps/api/src/beadingSessionService.mjs`.
- Create: `apps/api/src/beadingSessionLifecycleApi.test.mjs`.

- [ ] Write failing tests for create/reuse/restart, snapshot persistence, versioned progress updates, pause/resume, prepare-completion, abandon, revision mismatch read-only behavior, and active-session concurrency. Include a state matrix covering illegal terminal writes, revision-mismatch rejection for pause/resume/prepare/complete, `pending_completion` allowing only return-to-progress or one terminal completion, and restart abandoning the old session while creating the new one in one transaction.
- [ ] Run tests and verify expected failures.
- [ ] Implement session creation from server-owned project snapshot with `expectedProjectRevision`; persist a complete immutable requirement snapshot and the selected warehouse identity used by the session.
- [ ] Implement `GET/POST /api/v1/projects/:projectId/beading-session`, `PATCH /api/v1/beading-sessions/:sessionId`, pause/resume, prepare-completion, return-to-progress, and abandon routes (with compatibility aliases only when required by existing route contracts).
- [ ] Enforce this independent state matrix in tests: `in_progress` allows PATCH/pause/prepare/abandon; `paused` allows PATCH/resume/prepare/abandon; `pending_completion` allows return/complete/abandon and rejects PATCH/pause/resume/prepare; `completed_deducted` and `completed_without_deduction` reject all writes including补扣; `abandoned` allows idempotent repeated abandon only; revision mismatch allows query, abandon, and restart only. Cover optimistic `version` and project revision checks.
- [ ] Implement identity-scoped local-sync-compatible response fields including `revisionMatched` and `readOnlyReason`.
- [ ] Run focused tests and the existing API tests.
- [ ] Commit `feat(api): add beading session lifecycle`.

### Task 5: Add atomic completion and idempotency

**Files:**
- Modify: `apps/api/src/server.mjs` route table and compatibility glue only.
- Create/Modify: `apps/api/src/beadingInventoryService.mjs` for completion transactions.
- Create: `apps/api/src/beadingCompletionApi.test.mjs`.

- [ ] Write failing tests for completion without deduction, atomic per-color deduction, insufficient-stock full rollback, alternate warehouse selection, same-key replay, same-key fingerprint conflict, different-key concurrent completion, project deletion/complete race behavior, and warehouse deletion/revocation or incompatible color-system failure. Also test: no-deduct followed by deduct is rejected; the same session with a different idempotency key is rejected; same-key fingerprint mismatch is rejected; concurrent first completion has one CAS winner; rollback leaves every stock/audit/session field unchanged; and delete/complete cannot leave an abandoned session with committed inventory. For warehouse deletion, assert the error code, unchanged stock, no transaction rows, and session still `pending_completion`.
- [ ] Run tests and verify expected failures.
- [ ] Implement `POST /api/v1/beading-sessions/:sessionId/complete` with transaction-scoped project/session revision checks, session CAS, inventory validation, per-color updates, audit rows, and response replay. Store and return the actual warehouse used in the session, audit rows, and completion response.
- [ ] Persist request fingerprint and first response summary; reject terminal-session rewrites and different completion decisions.
- [ ] Extend project deletion behavior to serialize with completion, abandon active sessions, preserve completed/audit records and immutable snapshots, and reject completion after deletion. Test both commit orders independently: delete-first makes completion fail with no deduction; complete-first preserves completion and audit rows while deletion only nulls `project_id`.
- [ ] Run focused tests and all API tests.
- [ ] Commit `feat(api): add atomic beading completion`.

## Chunk 3: H5 entry points and beading interface

### Task 6: Add client pure session helpers and API client

**Files:**
- Create: `apps/h5/src/beading/beadingSessionUtils.ts`
- Create: `apps/h5/src/beading/beadingSessionClient.ts`
- Test: `apps/h5/src/beading/beadingSessionUtils.test.ts`

- [ ] Write failing tests for client progress, next-color selection, snapshot mismatch handling, local cache key identity, and completion branches.
- [ ] Run focused tests and verify failures.
- [ ] Implement typed session models, API request helpers, deterministic progress calculations, and user/session-scoped local draft helpers.
- [ ] Run focused tests and verify green.
- [ ] Commit `feat(h5): add beading session client helpers`.

### Task 7: Extend bean list with inventory check and start action

**Files:**
- Create: `apps/h5/src/pages/beading/InventoryCheckSheet.tsx`
- Create: `apps/h5/src/pages/beading/InventoryCheckSheet.test.tsx`
- Modify: `apps/h5/src/flow/H5FlowComponents.tsx` and `apps/h5/src/pages/split/SplitPages.tsx` if needed.
- Modify: `apps/h5/src/H5App.tsx` only for inventory action callback wiring; session orchestration is reserved for Task 9.
- Modify: `apps/h5/src/styles.css` only in the inventory/bead-list bottom-sheet section.
- Test: `apps/h5/src/flow/H5FlowComponents.test.ts` and relevant page tests.

- [ ] Add failing render/interaction tests for inventory and start buttons, insufficient-stock summary, no-warehouse behavior, and login-required behavior.
- [ ] Run focused tests and verify failure.
- [ ] Add optional action callbacks to the existing `BeadListDrawer`; it only displays rows and emits actions, keeping color rows and MARD 221 codes unchanged.
- [ ] Implement `InventoryCheckSheet` with warehouse selection, per-color required/available/missing state, and “仍然开始拼豆”; add a focused component test.
- [ ] Route the bead-list inventory/start actions through `InventoryCheckSheet`; keep project-action and community-copy wiring out of this task. Unsaved sources and community sources are connected in Task 8 through the authenticated copy endpoint; do not introduce a temporary unauthenticated endpoint.
- [ ] Run focused H5 tests.
- [ ] Commit `feat(h5): add inventory check entry points`.

### Task 8: Add save-and-start and project action sheet

**Files:**
- Modify: `apps/h5/src/pages/editor/CanvasPage.tsx` and `apps/h5/src/H5App.tsx`.
- Create: `apps/h5/src/pages/beading/ProjectActionSheet.tsx`
- Create: `apps/h5/src/pages/beading/ProjectActionSheet.test.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx`/my works component, including the single action-sheet integration area.
- Modify: `apps/h5/src/styles.css` only in the project-action/save-sheet section.
- Test: relevant H5 page/component tests.

- [ ] Write failing tests for save modal button labels, save-before-navigation ordering, project image action sheet actions, dynamic start/continue label, and delete confirmation.
- [ ] Run focused tests and verify failures.
- [ ] Add `保存并开始拼豆` to the save dialog and only navigate after save succeeds. Test the exact sequence save success → session lookup/version → session inventory check → navigate; on save failure assert no session call and no navigation.
- [ ] Add project action sheet for start/continue, edit, share, and delete; preserve existing share behavior and warn about session deletion.
- [ ] Connect existing project open behavior to session lookup and inventory check; community sources must call authenticated `POST /api/v1/projects/:projectId/copy` first, then use the returned owned project. Test unauthenticated/forbidden/copy ownership behavior at the API layer and the client sequence here.
- [ ] Run focused tests and full H5 component tests.
- [ ] Commit `feat(h5): add project beading entry actions`.

### Task 9: Build reference-aligned beading session page

**Files:**
- Create: `apps/h5/src/pages/beading/BeadingSessionPage.tsx`
- Create: `apps/h5/src/pages/beading/BeadingSessionPage.test.tsx`
- Create: `apps/h5/src/pages/beading/BeadingToolbar.tsx`
- Create: `apps/h5/src/pages/beading/BeadingColorRail.tsx`
- Create: `apps/h5/src/pages/beading/BeadingExitDialog.tsx`
- Create: `apps/h5/src/pages/beading/BeadingCompletionDialog.tsx`
- Create: `apps/h5/src/pages/beading/BeadingToolbar.test.tsx`
- Create: `apps/h5/src/pages/beading/BeadingColorRail.test.tsx`
- Create: `apps/h5/src/pages/beading/BeadingExitDialog.test.tsx`
- Create: `apps/h5/src/pages/beading/BeadingCompletionDialog.test.tsx`
- Create: `apps/h5/src/beading/beadingSessionDrafts.test.ts`
- Modify: `apps/h5/src/H5App.tsx` screen routing and session orchestration.
- Modify: `apps/h5/src/styles.css`.
- Test: `apps/h5/src/pages/beading/BeadingSessionPage.test.tsx` and utility tests.

- [ ] Write failing tests for top status controls, progress `completed/total`, current color highlighting, completed check states, complete-color action, next-color selection, exit/save behavior, and final completion branches.
- [ ] Run focused tests and verify failures.
- [ ] Implement `BeadingSessionPage` orchestration and `BeadingToolbar`: reference-aligned top bar, progress line, pause/save/settings controls, and exit behavior. `BeadingSessionPage` directly composes existing `H5CanvasLayers`, `CanvasRulers`, and `react-transform-wrapper` rather than creating a second renderer; add a 104x104 render/zoom test plus manual viewport check.
- [ ] Implement `BeadingColorRail`: horizontally scrolling color rail, current-color highlighting, completed checks, and “完成当前色” with separate PATCH-progress and `prepare-completion` calls.
- [ ] Implement `BeadingExitDialog` and `BeadingCompletionDialog`: autosave on color completion, color switch, pause, exit, visibility change, and timer fallback; pending completion pauses the timer, return stays paused until explicit resume, and final choices are no-deduct / deduct / return.
- [ ] Implement server-authoritative conflict UI and client draft behavior: drafts keyed by user ID + session ID; logout, abandonment, deletion, and terminal sync clear drafts; offline mode permits marks/progress/timer but never final completion or inventory deduction; server state wins on restore, while overwrite requires an explicit server-version confirmation.
- [ ] Add `apps/h5/src/beading/beadingSessionDrafts.test.ts` with automatic coverage for offline final/deduction rejection, server-priority restore, explicit `overwriteExpectedServerVersion`, terminal overwrite rejection, logout cleanup, account-switch isolation, and cleanup after delete/abandon/terminal sync. Page tests cover the user-visible offline/conflict dialogs.
- [ ] Run focused tests and manual responsive checks at 320/375/390/414px.
- [ ] Commit `feat(h5): add reference-aligned beading session page`.

## Chunk 4: Verification and handoff

### Requirements traceability

| Spec section | Implementation | Required evidence |
|---|---|---|
| 1 背景 | All tasks | final requirement audit |
| 2 已确认的产品决策 | Tasks 3–9 | API/H5 tests for no blocking shortage, no-deduct choice, resume and entry routes |
| 3 目标与非目标 | Task 10 | scope audit and no unrelated feature changes |
| 4 统一用户流程 | Tasks 7–9 | drawer/save/action-sheet/session navigation interaction tests |
| 5 库存检测设计 | Task 3 | warehouse/no-warehouse/missing/ownership/revision tests |
| 6 “开始拼豆”页面 | Task 9 | toolbar/rail/canvas/page tests and 104×104 render/zoom check |
| 7 会话状态与保存 | Task 4, 8–9 | state matrix, version/revision/CAS, save-before-navigation and resume tests |
| 8 整件完成与库存扣减 | Task 5, 9 | no-deduct, atomic deduction, rollback, actual warehouse and final-choice tests |
| 9 建议数据模型 | Task 2 | schema fixture: every required column, nullability, snapshots, migration/repeat/conflict handling |
| 10 建议接口边界 | Tasks 3–5 | split inventory/lifecycle/completion API tests, route/response/permission evidence |
| 11 前端模块边界 | Tasks 6–9 | focused utility/sheet/toolbar/rail/dialog/page/drafts tests |
| 12 异常与边界状态 | Tasks 3–6, 9 | warehouse deletion, offline, conflicts, idempotency, concurrency and cleanup tests |
| 13 可用性与视觉要求 | Tasks 9–10 | manual 320/375/390/414px, 44px targets, safe-area, reduced-motion, text feedback and color-independent state checks |
| 14 测试要求 | All tasks | focused tests per task plus API/H5/root full suites and build |
| 15 验收标准 | Task 10 | complete manual scenario checklist and requirement audit |
| 16 建议实施顺序 | Plan execution | chunk status, per-task commits, baseline/after-worktree checks |
| 17 Codex Goal 建议目标文本 | Goal handoff | final summary links to spec/plan and exact verification results |

### Task 10: Full regression and requirement audit

**Files:**
- Modify only if verification exposes defects.

- [ ] Update and verify the requirements traceability table above against the final implementation and test results; do not create a second table.
- [ ] Run `npm test -- --run` and confirm all API/H5 tests pass.
- [ ] Run `npm run build:h5` and confirm TypeScript/Vite production build passes.
- [ ] Run `git diff --check` and inspect `git diff --cached --name-only` before every task commit.
- [ ] Review each section of `docs/superpowers/specs/2026-08-08-beading-session-inventory-design.md` against current code and tests.
- [ ] Manually verify save-and-start, project action sheet, inventory shortage continuation, no-warehouse start, resume, final no-deduct, final atomic deduction, idempotent replay/conflict, concurrent completion, delete/complete race, warehouse deletion, community copy, login restore, version conflict, responsive 320/375/390/414px layouts, 44px hit targets, iOS safe-area/browser bottom bar, `prefers-reduced-motion`, current-color state not conveyed by color alone, “缺 N 颗” text, pause/save/sync-failure text feedback, unified bottom-sheet style, and logout/local-cache isolation.
- [ ] Verify commands separately: `npm test -- --run apps/api/src`, `npm test -- --run apps/h5/src`, root `npm test -- --run`, `npm run build:h5`; `package.json` currently defines no separate lint/typecheck script beyond the H5 build, so record those checks as not applicable unless the file changes.
- [ ] Commit any final test fixes separately.
- [ ] Report exact verification counts and remaining unrelated worktree files.
