# Community Real Data Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static H5 community/template content with persisted shared projects, real likes and comments, and an idempotent share action from the save flow.

**Architecture:** Keep `projects` as the single source of truth and add community visibility metadata to it. Store likes and comments in separate SQLite tables with server-side ownership and uniqueness checks. The H5 app loads community posts through the existing authenticated API helper, uses the same post data for Discover and Home hot templates, and updates detail interactions from API responses.

**Tech Stack:** Node HTTP API, sql.js/SQLite, React + TypeScript, Vitest, Playwright.

---

## Chunk 1: API schema and community endpoints

### Task 1: Add failing API tests for schema, sharing, likes, comments, and sorting

**Files:**
- Create: `apps/api/src/community.test.mjs`
- Modify: `apps/api/src/server.mjs` only after the tests fail

- [ ] Add an isolated API test harness that starts the server with a temporary SQLite path and configured credentials.
- [ ] Test that a saved project can be shared only by its owner, and repeating the share request returns the same shared state without duplicate data.
- [ ] Test that an unshared project cannot be liked or commented on.
- [ ] Test that the same user liking twice leaves `likesCount` at one.
- [ ] Test that a valid comment is returned with author data and empty/overlong content is rejected.
- [ ] Test that community list `sort=hot` orders by likes descending and latest share time as the tie-breaker.
- [ ] Run `npm test -- apps/api/src/community.test.mjs` and confirm it fails because the endpoints/schema do not exist.

### Task 2: Implement community schema migration and server handlers

**Files:**
- Modify: `apps/api/src/server.mjs` schema initialization, route table, and project/community helpers

- [ ] Add `shared_to_community`, `shared_at`, and `likes_count` to `projects` with backward-compatible `ALTER TABLE` attempts.
- [ ] Add `project_likes` with `(project_id, user_id)` primary key and `project_comments` with project/user foreign keys.
- [ ] Add authenticated routes for community list, comments, like, and project share.
- [ ] Implement project ownership validation and shared-only visibility checks.
- [ ] Make share and like operations idempotent and keep the likes counter consistent with inserted like rows.
- [ ] Return resolved project image URLs, author username, comment count, like count, and `likedByMe`.
- [ ] Run the focused API tests and make them pass.

### Task 3: Refactor API test setup and add regression coverage

**Files:**
- Modify: `apps/api/src/community.test.mjs`
- Modify: `apps/api/package.json` only if test setup needs a script adjustment

- [ ] Cover API error messages and unauthorized access.
- [ ] Cover comment list ordering and shared project filtering.
- [ ] Run the focused API test file plus existing API tests; keep unrelated user changes intact.

## Chunk 2: H5 data model and loading

### Task 4: Add failing frontend tests for community mapping and sorting

**Files:**
- Create: `apps/h5/src/community/communityData.test.ts`
- Create: `apps/h5/src/community/communityData.ts`

- [ ] Define a real community post type including project identity, author, images, counts, share time, and current-user like state.
- [ ] Add tests for converting API payloads to UI cards and sorting hot posts by likes with share-time tie-breaker.
- [ ] Run the focused Vitest test and confirm it fails before the helper exists.

### Task 5: Implement community data helpers and app loading state

**Files:**
- Modify: `apps/h5/src/shared/h5Types.ts`
- Create: `apps/h5/src/community/communityData.ts`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/pages/home/HomeShellPage.tsx`

- [ ] Replace static `patternListCards` and `homeTemplates` inputs with API-backed community post state.
- [ ] Load posts after authenticated session initialization and whenever the Discover tab is opened.
- [ ] Derive Home hot templates from shared posts sorted by likes and show a real empty state when none exist.
- [ ] Preserve the existing login redirect behavior for unauthenticated API actions.
- [ ] Run focused frontend tests and TypeScript build checks.

## Chunk 3: Sharing from save flow

### Task 6: Add failing UI tests for share selection and duplicate state

**Files:**
- Modify: existing H5 component test location discovered during implementation, or create `apps/h5/src/pages/editor/saveProjectCommunity.test.tsx`
- Modify: `apps/h5/src/pages/editor/CanvasPage.tsx` only after tests fail

- [ ] Test that the save dialog exposes a share-to-community option.
- [ ] Test that a checked option is propagated to the save confirmation callback.
- [ ] Test that an already shared project displays disabled shared status and cannot trigger a duplicate share.

### Task 7: Implement save-and-share flow

**Files:**
- Modify: `apps/h5/src/pages/editor/CanvasPage.tsx`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/shared/h5Types.ts`
- Modify: `apps/h5/src/styles.css`

- [ ] Add share state to the save modal, defaulting to off for new projects.
- [ ] Save the project first, then call the idempotent project share endpoint when selected.
- [ ] Display a successful shared state and a retryable error if sharing fails after the project is saved.
- [ ] Load and retain `sharedToCommunity` for saved projects so duplicate sharing is disabled.
- [ ] Run focused UI tests and the H5 build.

## Chunk 4: Discover detail, likes, and comments

### Task 8: Add failing tests for comments and likes UI state

**Files:**
- Modify or create: `apps/h5/src/patterns/H5PatternPages.test.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx` only after tests fail

- [ ] Test that detail renders API-provided project metadata and counts.
- [ ] Test that a successful comment submission appends the returned comment.
- [ ] Test that unauthenticated comment/like actions invoke the login callback.
- [ ] Test that a failed like request rolls back optimistic UI state.

### Task 9: Implement real Discover and detail interactions

**Files:**
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx`
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/styles.css`

- [ ] Render community post cards from real images and metadata, removing static authors, comments, and artwork.
- [ ] Load comments for the active project detail and render the real list or empty state.
- [ ] Add login-aware like and comment submission callbacks wired to the API.
- [ ] Keep Discover tabs and the Home hot-template list ordered by real server counts.
- [ ] Run focused frontend tests and H5 build.

## Chunk 5: End-to-end verification and documentation

### Task 10: Add and run the user-flow regression test

**Files:**
- Modify: `tests/e2e/h5.spec.ts`

- [ ] Add a flow covering login, save, share, discover visibility, duplicate share protection, like, comment, and reload persistence.
- [ ] Run the relevant Playwright test with API and H5 dev servers configured.

### Task 11: Run full verification and update docs

**Files:**
- Modify: `docs/数据库选型与迁移约定.md` if the new tables need to be listed
- Modify: `docs/H5浏览界面功能说明.md` if the user-facing H5 flow needs updating

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run the relevant E2E suite.
- [ ] Run `git diff --check` and inspect the final diff for only scoped changes.
- [ ] Commit the implementation in focused commits.
