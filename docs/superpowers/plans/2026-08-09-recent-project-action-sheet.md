# 最近项目操作面板复用 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make homepage recent-project cards open the same bottom action sheet as My Works, with the existing bottom-sheet button styles and project-standard Lucide icons.

**Architecture:** Keep `projectActionTarget` and all action callbacks in `H5App`. Build one `ProjectActionSheet` node for the current target and pass that node to both `MyWorksPage` and `HomeShellPage`; `HomeShellPage` only renders the supplied node and never owns project business logic. Update `ProjectActionSheet` to use the existing `beading-primary-btn`/`beading-secondary-btn` styles and Lucide icons, with a scoped CSS override so the old list rule cannot win.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, `lucide-react`, existing H5 CSS tokens/classes.

---

## Chunk 1: Shared recent-project action sheet

### Task 1: Add failing component regression tests

**Files:**
- Create: `apps/h5/src/pages/beading/ProjectActionSheet.test.tsx`
- Modify: `apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx`
- Inspect/extend: the existing H5App test file that covers screen routing and saved-project actions (locate with `rg` before editing)

- [ ] **Step 1: Write the failing action-sheet test**

Render `ProjectActionSheet` with a representative `RecentProject` and four spy callbacks. Assert the output contains `开始拼豆`, `编辑作品`, `分享作品`, and `删除作品`, each button has the expected action class (`beading-primary-btn`, `beading-secondary-btn`, `is-danger`), and the markup contains the Lucide SVGs with `aria-hidden="true"`. Trigger each button and assert only its corresponding callback runs.

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- --run apps/h5/src/pages/beading/ProjectActionSheet.test.tsx
```

Expected: FAIL because the current component has no Lucide icons and uses the old list-button classes.

- [ ] **Step 3: Add the homepage interaction regression test**

Extend `HomeShellPage.fixBug.test.tsx` with a minimal `HomeShellPage` render containing one logged-in recent project and an `actionSheet` sentinel node. Assert the recent card calls `onOpenRecentProject` with the project and that the supplied `actionSheet` is rendered. This locks the parent/child contract without duplicating H5App internals.

- [ ] **Step 4: Run the focused homepage test to verify the new contract fails**

Run:

```bash
npm test -- --run apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx
```

Expected: FAIL because `HomeShellPage` currently does not accept or render `actionSheet` in its root content.

- [ ] **Step 5: Commit the failing tests**

```bash
git diff -- apps/h5/src/pages/beading/ProjectActionSheet.test.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx
git diff --cached -- apps/h5/src/pages/beading/ProjectActionSheet.test.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx
git add apps/h5/src/pages/beading/ProjectActionSheet.test.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx
git commit -m "test: define shared recent project action sheet behavior"
```

Before committing, verify `git diff --cached` contains only the new/updated test hunks. Do not use a whole-file add for any file that already contains unrelated user edits; if a test file is already dirty, stage only the task hunks with `git add -p` or leave the test commit for the final focused commit.

### Task 2: Implement the shared sheet and homepage rendering contract

**Files:**
- Modify: `apps/h5/src/pages/beading/ProjectActionSheet.tsx:1-20`
- Modify: `apps/h5/src/pages/home/HomeShellPage.tsx:7-105,140-170`
- Modify: `apps/h5/src/H5App.tsx:245-250,2690-2745`
- Modify: `apps/h5/src/styles.css:8845-8849`

- [ ] **Step 1: Update `ProjectActionSheet` icons and button classes**

Import `PlayCircle`, `Pencil`, `Share2`, and `Trash2` from `lucide-react`. Render each icon inside its action button with `className="ui-icon"` and `aria-hidden="true"`. Keep the existing text and callback props, assign `beading-primary-btn` to start, `beading-secondary-btn` to edit/share, and both `beading-secondary-btn` and `is-danger` to delete.

- [ ] **Step 2: Update the scoped action-list CSS**

Keep `.project-action-list` as a vertical layout, but replace the old border-only presentation with a scoped rule for `.project-action-list button.beading-primary-btn` and `.project-action-list button.beading-secondary-btn`: `display:flex`, `align-items:center`, `gap`, `min-height:46px`, `border-radius:14px`, and the existing bottom-sheet colors. Override the old `.project-action-list button` border/background/text rules at equal or higher specificity. Add icon sizing and preserve the red text for `.is-danger`.

- [ ] **Step 3: Add `actionSheet?: ReactNode` to `HomeShellPage`**

Import `ReactNode` as a type if needed, destructure `actionSheet`, and render it once inside the `h5-home-shell` root after the page content. Do not add project action callbacks or deletion logic to `HomeShellPage`.

- [ ] **Step 4: Build one target-bound sheet node in `H5App`**

Create a single `projectActionSheet` value when `projectActionTarget` is non-null. Capture the non-null target in that render so `onStart`, `onEdit`, `onShare`, and `onDelete` all operate on the same project. Reuse the existing My Works callbacks and cleanup behavior. Pass this same node to `MyWorksPage.actionSheet` and `HomeShellPage.actionSheet`.

- [ ] **Step 5: Change recent-project opening behavior**

Change the `HomeShellPage` prop from `onOpenRecentProject={openSavedProject}` to `onOpenRecentProject={(project) => setProjectActionTarget(project)}`. Recent cards must open the sheet, while the sheet’s edit action remains the only path into `openSavedProject`.

- [ ] **Step 6: Add H5App integration regression coverage**

Using the existing H5App test harness (or add the smallest compatible harness if none exists), cover the state boundary rather than implementation details: clicking a homepage recent-project card sets the action-sheet target and does not call `openSavedProject`; the rendered `ProjectActionSheet` receives that project; and the My Works and HomeShell page paths are passed the same target-bound action-sheet node. Cover the existing action cleanup contract as well: close and edit clear the target; share clears it after invoking the existing share action; delete confirmation cancel and delete request failure leave the sheet open; successful delete clears the target and removes the project. Mock the API/confirm/share dependencies using the conventions already present in the repository.

- [ ] **Step 7: Run focused tests and build**

Run:

```bash
npm test -- --run apps/h5/src/pages/beading/ProjectActionSheet.test.tsx apps/h5/src/pages/home/HomeShellPage.fixBug.test.tsx
npm run build:h5
```

Expected: both focused test files pass and the H5 TypeScript/Vite build exits successfully.

- [ ] **Step 8: Commit the implementation**

```bash
git diff -- apps/h5/src/pages/beading/ProjectActionSheet.tsx apps/h5/src/pages/home/HomeShellPage.tsx apps/h5/src/H5App.tsx apps/h5/src/styles.css
git add -p apps/h5/src/pages/beading/ProjectActionSheet.tsx apps/h5/src/pages/home/HomeShellPage.tsx apps/h5/src/H5App.tsx apps/h5/src/styles.css
git diff --cached --stat
git diff --cached
git commit -m "fix: reuse project action sheet for recent projects"
```

If any implementation file already contains unrelated user edits, use `git add -p` to stage only the action-sheet hunks. Never stage the entire file merely because the task touched it.

### Task 3: Complete verification without disturbing existing work

**Files:**
- Test only: existing H5 and repository test suites.

- [ ] **Step 1: Run the full test suite**

Run:

```bash
npm test -- --run
```

Expected: all test files pass with zero failures.

- [ ] **Step 2: Run both production builds**

Run:

```bash
npm run build
```

Expected: Web and H5 TypeScript checks and Vite builds complete successfully.

- [ ] **Step 3: Review the final diff and worktree**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors; only the intended implementation changes are present. Existing user modifications and untracked files must remain untouched and must not be staged accidentally.

- [ ] **Step 4: Commit any test-only adjustments**

If verification requires test adjustments, stage only the relevant test files and use a focused commit; do not reset or overwrite unrelated user changes.
