# Project Folder Sheets Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace folder creation and project movement controls with design-system-compliant H5 bottom sheets while preserving save, My Works, and move workflow state.

**Architecture:** Add focused `CreateProjectFolderSheet` and `MoveProjectFolderSheet` components sharing one sheet shell and modal behavior. Keep API requests and cross-flow state in `H5App`; simplify `ProjectActionSheet` to emit an open-move event. Render folder overlays at the stable H5App overlay layer.

**Tech Stack:** React 19, TypeScript, CSS design tokens, Vitest, react-test-renderer.

---

## Chunk 1: Sheet components and action entry

### Task 1: Shared folder sheets

**Files:**
- Create: `apps/h5/src/projects/ProjectFolderSheets.tsx`
- Create: `apps/h5/src/projects/ProjectFolderSheets.test.tsx`
- Modify: `apps/h5/src/styles.css`

- [ ] Write failing tests for bottom-sheet semantics, create form validation/loading, overlay/content click isolation, move radio selection, same-folder disabled state, uncategorized, new-folder callback, and explicit confirmation. For both submit paths verify double-click submits once; pending disables cancel, backdrop, Escape and return handling; content clicks do not close; failure unlocks retry without duplicating the active request.
- [ ] Run `npm test -- --run apps/h5/src/projects/ProjectFolderSheets.test.tsx` and confirm failure because the components do not exist.
- [ ] Implement a shared sheet shell plus `CreateProjectFolderSheet` and `MoveProjectFolderSheet`, including Escape handling, request locking and focus restoration. A covered lower dialog must be inert, unfocusable, unclickable, hidden from the accessibility tree and no longer modal.
- [ ] Add styles using existing sheet tokens, a viewport-constrained maximum height, fixed header/footer outside the sole vertically scrollable options area, safe-area footer padding, no horizontal overflow for narrow screens/long names, and focus, selected and error states.
- [ ] Add structure/style assertions proving maximum height, options-only vertical scrolling, fixed action area with `env(safe-area-inset-bottom)`, and uncategorized/create rows when there are no user folders.
- [ ] Run the focused test and confirm it passes.

### Task 2: Replace the native move selector

**Files:**
- Modify: `apps/h5/src/pages/beading/ProjectActionSheet.tsx`
- Modify: `apps/h5/src/pages/beading/ProjectActionSheet.test.tsx`

- [ ] Change the existing test to require a button callback and reject native `select` markup; run it and confirm failure.
- [ ] Replace the label/select with a normal “移动到文件夹” button using the existing icon and `onMove` callback without a folder argument.
- [ ] Run `npm test -- --run apps/h5/src/pages/beading/ProjectActionSheet.test.tsx` and confirm it passes.

## Chunk 2: Application state and flow integration

### Task 3: Connect create and move workflows

**Files:**
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/H5App.auth.test.ts`
- Modify: `apps/h5/src/pages/editor/CanvasPage.tsx`
- Modify: `apps/h5/src/pages/editor/SaveProjectDialog.tsx`
- Modify: `apps/h5/src/pages/editor/SaveProjectDialog.test.tsx`
- Create: `apps/h5/src/projects/projectFolderFlow.ts`
- Create: `apps/h5/src/projects/projectFolderFlow.test.ts`
- Test: `apps/h5/src/projects/ProjectFolderSheets.test.tsx`

- [ ] Add failing reducer/state-flow tests for My Works create success, save create success/cancel/failure, move open/confirm/success/failure, nested move→create success/cancel, and request deduplication. Keep these transitions in `projectFolderFlow.ts` so asynchronous H5App orchestration is tested through real state rather than source strings.
- [ ] Add failing `SaveProjectDialog` tests for a `covered` prop: covered dialogs use `inert`, `aria-hidden="true"`, non-modal semantics and reject backdrop, close, submit, input and folder-selection interactions; uncovering preserves form values and restores interaction/focus.
- [ ] Add failing app rendering assertions for a stable sibling overlay layer, modal scroll-lock coverage, save-modal preservation, and removal of every legacy centered/local create-dialog injection.
- [ ] Add explicit create origin (`my-works`, `save`, `move`), move target/selection, create/move error and pending state.
- [ ] Route My Works and save-dialog creation through the shared create Sheet; preserve existing selection on cancel/failure and update the correct selection on success.
- [ ] Route ProjectActionSheet movement into `MoveProjectFolderSheet`; confirm via the existing PATCH endpoint only after explicit confirmation.
- [ ] Keep the move Sheet open on errors, return to it after nested folder creation, and update local project data on success.
- [ ] Establish one stable H5App page container plus sibling application overlay layer used across early `screen` branches. Remove both sheets from `MyWorksPage.actionSheet` and Canvas-local content, delete every `projectFolderCreateDialog` injection, and keep `ProjectActionSheet` in the same overlay layer.
- [ ] When “移动到文件夹” is selected, record the originating project-card trigger as the final focus target, close `ProjectActionSheet`, then open move Sheet. When nested create opens, separately retain the move Sheet create trigger; cancel/success restores the correct layer, and final close restores the project card.
- [ ] Add top-layer return handling: browser/app return closes only create then move, never underlying pages; pending requests consume return without closing. Include both sheets in blocking-modal scroll lock and keep the lock until the final layer closes.
- [ ] Add rendering/interaction tests proving: My Works opens create and success selects the new empty folder; save create success selects it, cancel preserves the old ID, and failure retains input/error over an inert mounted save dialog; ProjectActionSheet closes before move opens; PATCH is absent before confirmation and called once on confirmation; failure preserves move selection/error; success updates `folderId`/`updatedAt`; nested create returns with the new target selected; backdrop never activates underlying UI; stacked close does not release scrolling early.
- [ ] Run `npm test -- --run apps/h5/src/projects/ProjectFolderSheets.test.tsx apps/h5/src/projects/projectFolderFlow.test.ts apps/h5/src/pages/beading/ProjectActionSheet.test.tsx apps/h5/src/pages/editor/SaveProjectDialog.test.tsx apps/h5/src/H5App.auth.test.ts` and confirm all pass.

## Chunk 3: Verification

### Task 4: Full validation

**Files:**
- Modify only files required by failures caused by this feature.

- [ ] Run `npm test -- --run` and require zero failures.
- [ ] Run `npm run build:h5` and require a successful TypeScript/Vite build.
- [ ] Run `git diff --check` and require no whitespace errors.
- [ ] Inspect the final diff to ensure existing unrelated dirty-worktree changes are preserved.
