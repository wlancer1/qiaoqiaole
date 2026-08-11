# My Works Folder Header Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the My Works folder area as a title row plus a dedicated folder-chip rail, following the approved reference.

**Architecture:** `MyWorksPage` owns the folder-chip context-menu state and continues calling the existing folder callbacks. The JSX separates header, scroll rail, and contextual delete menu; CSS provides the two-row visual hierarchy and leaves the project grid/empty state unchanged.

**Tech Stack:** React, TypeScript, CSS, Vitest

---

## Chunk 1: Folder heading, chips, and contextual deletion

### Task 1: Render and style the revised folder area

**Files:**
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx:60-130`
- Modify: `apps/h5/src/styles.css:9555-9575`
- Test: `apps/h5/src/patterns/H5PatternPages.test.ts:64-115`

- [ ] **Step 1: Write failing tests**

Render `MyWorksPage` with custom folders. Assert a `.my-works-folder-header` with title, total count, and create button appears before `.my-works-folder-scroll`; assert custom folder chips have no `删除文件夹` button; assert context-menu trigger props and the header/chip CSS contracts.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run apps/h5/src/patterns/H5PatternPages.test.ts`

Expected: FAIL because the current filter is a single grid shell and renders persistent delete buttons.

- [ ] **Step 3: Implement the minimal component structure**

Add a header row with “文件夹”, a total-count badge, and the existing create callback. Keep all filter chips in the scroll rail. Replace each persistent delete button with `onContextMenu` and a touch long-press handler that selects the folder; render one small menu with a destructive “删除文件夹” action that calls `onDeleteFolder`.

- [ ] **Step 4: Implement reference-aligned CSS**

Replace the grid-shell styling with a stacked section: header row plus horizontally scrolling chip rail. Use a light outline create button, white unselected chips, pale-blue active chip, and separate count badges. Add compact menu styles and a small-screen rule that preserves the header button.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- --run apps/h5/src/patterns/H5PatternPages.test.ts`

Expected: PASS.

- [ ] **Step 6: Run regression checks**

Run `npm test -- --run apps/h5/src/patterns/H5PatternPages.test.ts apps/h5/src/patterns/H5FollowingPage.test.tsx`, `npx tsc -p tsconfig.json --noEmit`, `npm run build:h5`, and `git diff --check`.

Expected: all commands exit 0.

- [ ] **Step 7: Commit only this feature's files**

Stage `apps/h5/src/patterns/H5PatternPages.tsx`, `apps/h5/src/patterns/H5PatternPages.test.ts`, `apps/h5/src/styles.css`, and this plan, then commit with `feat(h5): redesign my works folder header`.
