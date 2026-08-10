# Profile Edit Modal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an edit-profile modal that lets logged-in users change their display name and avatar from the profile page.

**Architecture:** Extend the existing authenticated profile API with a small profile update endpoint. The H5 app owns modal state and submits a validated display name plus a local image data URL; the updated profile is applied immediately to the profile card and persisted in local storage/session responses.

**Tech Stack:** React/TypeScript, existing H5 `requestApi`, Node HTTP API, SQLite users table, Vitest.

---

### Task 1: Add authenticated profile update API

**Files:**
- Modify: `apps/api/src/server.mjs`
- Test: `apps/api/src/profileApi.test.mjs`

- [ ] Add `PATCH /api/profile` using the existing authenticated user resolver.
- [ ] Validate a trimmed display name (1–32 characters) and optional avatar data URL (image MIME type, maximum 1MB).
- [ ] Persist `nickname` and `avatar_url`, then return the normalized profile.
- [ ] Add API coverage for successful update and invalid input.

### Task 2: Add edit-profile modal and profile state

**Files:**
- Modify: `apps/h5/src/H5App.tsx`
- Modify: `apps/h5/src/pages/home/HomeShellPage.tsx`
- Modify: `apps/h5/src/styles.css`
- Test: `apps/h5/src/pages/home/HomeShellPage.profile.test.tsx`

- [ ] Add modal/profile state, local image preview handling, save/cancel actions, and API submission.
- [ ] Replace the current unavailable “编辑资料” action with modal opening.
- [ ] Render the saved avatar when present and keep the existing fallback avatar otherwise.
- [ ] Update login/session restoration state with `avatarUrl` where available.
- [ ] Add modal rendering and interaction coverage.

### Task 3: Verify the feature

- [ ] Run focused H5 profile tests.
- [ ] Run the profile API test.
- [ ] Run `npm run build:h5` and `git diff --check`.
