# 社区标签与作品文件夹视觉对齐 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the project-folder, community-publishing, tag-filter, and tag-display UI use the existing H5 editor's compact control scale and visual hierarchy.

**Architecture:** Keep all existing requests and state unchanged. Restrict work to the feature-scoped CSS at the end of `styles.css`, and use existing semantic component class names. The save dialog is the sizing source of truth: 0.44rem field labels, 0.48rem control text, 1.59–1.65rem control heights, 0.44rem field corner radius, and 0.95rem modal corners.

**Tech Stack:** React, TypeScript, CSS, Vitest.

---

## Chunk 1: Compact form and publish-dialog controls

### Task 1: Lock the editor-scale dimensions in a visual contract test

**Files:**
- Modify: `apps/h5/src/patterns/H5PatternPages.test.ts`
- Modify: `apps/h5/src/styles.css`

- [ ] **Step 1: Write the failing CSS contract test** for folder picker and publish dialog values.
- [ ] **Step 2: Run** `npx vitest run apps/h5/src/patterns/H5PatternPages.test.ts` and verify it fails because the current controls are oversized.
- [ ] **Step 3: Implement minimal CSS overrides** using the save dialog's control height, typography, radius, and shadow hierarchy.
- [ ] **Step 4: Re-run the focused test** and verify it passes.

## Chunk 2: Folder rail, move selector, and discovery filters

### Task 2: Align information density with existing list filters

**Files:**
- Modify: `apps/h5/src/patterns/H5PatternPages.test.ts`
- Modify: `apps/h5/src/styles.css`

- [ ] **Step 1: Write failing CSS contract tests** for compact 32px-class filter chips, 44px touch-safe tap areas, and card-local move control spacing.
- [ ] **Step 2: Run the focused test** and verify expected failure.
- [ ] **Step 3: Implement only feature-scoped CSS**; do not alter existing my-work card/grid layout.
- [ ] **Step 4: Re-run the focused test** and verify it passes.

## Chunk 3: Regression verification and delivery

### Task 3: Verify no flow behavior changed

**Files:**
- Test: `apps/h5/src/patterns/H5PatternPages.test.ts`
- Test: `apps/h5/src/pages/editor/SaveProjectDialog.test.tsx`
- Test: `apps/h5/src/community/ShareCommunityDialog.test.tsx`

- [ ] **Step 1: Run focused UI tests and TypeScript check.**
- [ ] **Step 2: Run all H5 tests.**
- [ ] **Step 3: Run `git diff --check`.**
- [ ] **Step 4: Commit only the visual-alignment implementation and plan on `main`.**
