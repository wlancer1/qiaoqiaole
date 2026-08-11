# My Works Folder Filter Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the “新建文件夹” action visible while any number of folder filters scroll independently.

**Architecture:** Convert the existing filter section into a non-scrolling two-column shell. Add a nested horizontal scroll rail for filter buttons and retain the create action as a fixed sibling, without changing callbacks or folder data.

**Tech Stack:** React, TypeScript, CSS, Vitest, React server rendering

---

## Chunk 1: Persistent folder creation action

### Task 1: Split the scroll rail from the create action

**Files:**
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx:115`
- Modify: `apps/h5/src/styles.css:9557`
- Test: `apps/h5/src/patterns/H5PatternPages.test.ts`

- [ ] **Step 1: Write the failing structure and layout tests**

Render `MyWorksPage` with several folders and assert that `.my-works-folder-scroll` contains all folder filters while `.my-works-create-folder` is its sibling. Add CSS assertions that the shell uses grid, the rail has `overflow-x: auto` and `min-width: 0`, and the create button does not shrink.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run apps/h5/src/patterns/H5PatternPages.test.ts`

Expected: FAIL because `.my-works-folder-scroll` does not exist and the outer filter currently owns horizontal overflow.

- [ ] **Step 3: Implement the minimal React structure**

Wrap “全部作品”, “未分类”, and mapped custom folders in:

```tsx
<div className="my-works-folder-scroll">
  {/* filter buttons and custom folder items */}
</div>
```

Keep `.my-works-create-folder` after that `div`, as a direct child of `.my-works-folder-filter`.

- [ ] **Step 4: Implement the layout CSS**

Use a two-column grid shell (`minmax(0, 1fr) auto`), move horizontal scrolling and scrollbar suppression to `.my-works-folder-scroll`, and set the create action to `flex: 0 0 auto`. Preserve current chips, colors, counts, and deletion styles. At narrow widths, hide a `.my-works-create-folder-label-long` fragment so the visible label becomes “新建”.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- --run apps/h5/src/patterns/H5PatternPages.test.ts`

Expected: PASS.

- [ ] **Step 6: Run related regression checks**

Run:

```bash
npm test -- --run apps/h5/src/patterns/H5PatternPages.test.ts apps/h5/src/patterns/H5FollowingPage.test.tsx
npx tsc -p tsconfig.json --noEmit
npm run build:h5
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit only the implementation files**

```bash
git add apps/h5/src/patterns/H5PatternPages.tsx apps/h5/src/patterns/H5PatternPages.test.ts apps/h5/src/styles.css docs/superpowers/plans/2026-08-11-my-works-folder-filter-layout.md
git commit -m "fix(h5): keep folder creation action visible"
```
