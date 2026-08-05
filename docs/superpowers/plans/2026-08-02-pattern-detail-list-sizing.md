# Pattern Detail List Sizing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pattern detail page use the same mobile sizing system as the discover list page.

**Architecture:** Keep the existing React structure and data. Replace detail-only small-canvas measurements with the list page's established spacing, typography, radius, and action-size tokens; retain the shared responsive content width and full-width fixed action bar.

**Tech Stack:** React, TypeScript, CSS, Vite, Playwright

---

## Chunk 1: Mobile sizing parity

### Task 1: Apply list-page sizing tokens to detail components

**Files:**
- Modify: `apps/h5/src/styles.css`

- [x] **Step 1:** Capture list and detail computed typography, spacing, and control heights at a 390×844 viewport.
- [x] **Step 2:** Replace detail typography and controls with list-equivalent mobile tokens.
- [x] **Step 3:** Keep detail content width and horizontal padding identical to `.pattern-list-content`.
- [x] **Step 4:** Verify headers, cards, comments, and actions remain aligned without horizontal overflow.

### Task 2: Verify the mobile page

**Files:**
- Verify: `apps/h5/src/H5App.tsx`
- Verify: `apps/h5/src/styles.css`

- [x] **Step 1:** Run `npm run build:h5` and expect exit code 0.
- [x] **Step 2:** Run `git diff --check` and expect no output.
- [x] **Step 3:** Render list and detail pages at 390×844 and compare content bounds and computed type/control sizes.
- [x] **Step 4:** Capture the final detail screenshot for visual inspection.
