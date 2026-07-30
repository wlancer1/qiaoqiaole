# H5 Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the H5 interface adaptive across common mobile widths without anchoring the design system to a single device.

**Architecture:** Keep a stable, user-zoomable rem design-token scale for visual rhythm. Use flexible container widths, content-driven breakpoints, `clamp()` for controlled component sizing, and `dvh` plus safe-area insets for vertical layout. Canvas drawing pixels and one-pixel borders remain physical units.

**Tech Stack:** React, TypeScript, CSS custom properties, CSS Grid/Flexbox, Playwright, Vitest.

---

### Task 1: Define the cross-device H5 sizing contract

**Files:**
- Create: `docs/H5移动端响应式规范.md`
- Modify: `apps/h5/src/styles.css:19-45`
- Test: `tests/e2e/h5.spec.ts`

- [x] Add the responsive sizing contract and a CSS root-scale token.
- [x] Keep the root text size zoomable and use `clamp()` only for component sizing.
- [x] Verify 320px, 360px, 393px, 414px, and 430px viewports have no page-level overflow.

### Task 2: Convert fixed split-screen UI geometry to design tokens

**Files:**
- Modify: `apps/h5/src/styles.css:3655-4536`
- Test: `tests/e2e/h5.spec.ts`

- [x] Replace fixed UI dimensions with rem tokens derived from the H5 design scale.
- [x] Preserve one-pixel hairlines and canvas pixel drawing values.
- [x] Keep existing content-width branches as responsive safeguards while converting their internal geometry to rem.

### Task 3: Verify interactive constraints and document memory

**Files:**
- Modify: `docs/H5移动端响应式规范.md`
- Test: `apps/h5/src/H5FlowComponents.test.ts`, `tests/e2e/h5.spec.ts`

- [x] Confirm 44 CSS-pixel minimum touch targets through a rem lower bound and regression test.
- [x] Verify build, targeted unit tests, and mobile E2E paths.
- [x] Mark the plan complete after all checks pass.
