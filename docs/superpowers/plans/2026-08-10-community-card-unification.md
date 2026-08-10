# Community Card Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the home hot-template preview and discover list reuse one community pattern card implementation.

**Architecture:** Extract the duplicated card markup into `CommunityPatternCard`. Keep page-specific list layout, sizing, and navigation callbacks in `HomeShellPage` and `PatternDiscoverPage`.

**Tech Stack:** React 19, TypeScript, lucide-react, Vitest, server-side static markup tests.

---

### Task 1: Add the shared card contract test

**Files:**
- Create: `apps/h5/src/community/CommunityPatternCard.test.tsx`
- Reference: `apps/h5/src/shared/h5Types.ts`

- [ ] **Step 1: Write the failing test**

  Render a representative `PatternListCard` and assert the shared card contains its title, author, image, likes, and comments, plus the author callback affordance.

- [ ] **Step 2: Run the focused test and verify it fails**

  Run `npm test -- apps/h5/src/community/CommunityPatternCard.test.tsx --run`.
  Expected: fail because `CommunityPatternCard` does not exist yet.

### Task 2: Extract and adopt the shared card

**Files:**
- Create: `apps/h5/src/community/CommunityPatternCard.tsx`
- Modify: `apps/h5/src/pages/home/HomeShellPage.tsx`
- Modify: `apps/h5/src/patterns/H5PatternPages.tsx`

- [ ] **Step 1: Implement the minimal shared component**

  Move the common card body to `CommunityPatternCard`, using existing `UserAvatar`, `Heart`, `MessageCircle`, `formatPatternCount`, image fallback, and `PatternListCard` fields. Accept `className`, `onOpen`, and optional `onOpenAuthor` props.

- [ ] **Step 2: Replace homepage card JSX**

  Map `homeTemplateCards` through `CommunityPatternCard`, preserving `home-template-card`, detail navigation, and the existing home row layout.

- [ ] **Step 3: Replace discover card JSX**

  Map discover cards through `CommunityPatternCard`, preserving `pattern-card`, `data-card-index`, detail navigation, and author navigation.

- [ ] **Step 4: Run focused tests**

  Run the new card test and existing `H5PatternPages.test.ts` plus home tests.

### Task 3: Verify the refactor

**Files:**
- No additional files.

- [ ] **Step 1: Run the H5 test suite**

  Run `npm test -- apps/h5/src --run` and confirm no regressions.

- [ ] **Step 2: Run the H5 build**

  Run `npm run build:h5` and confirm TypeScript and Vite compilation pass.
