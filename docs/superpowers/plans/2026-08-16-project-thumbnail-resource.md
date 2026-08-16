# Historical Project Thumbnail Resource Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure legacy Base64 thumbnails remain visible in 我的作品 without returning Base64 or source images in project-list responses.

**Architecture:** Add a signed thumbnail-only resource endpoint in the API. The project summary formatter maps legacy data-URL thumbnails to that endpoint while preserving the current COS asset URL flow. H5 continues to render `thumbnailImage` as a URL and does not fetch per-project details.

**Tech Stack:** Node.js HTTP server, SQLite, Vitest, React/TypeScript.

---

## Chunk 1: API thumbnail resource

### Task 1: Demonstrate the legacy-list failure

**Files:**
- Modify: `apps/api/src/community.test.mjs`
- Modify: `apps/api/src/server.mjs`

- [ ] **Step 1: Write the failing API regression test**

Extend the existing "keeps canvas data out of the project list" test to expect a
non-data `thumbnailImage` URL for a legacy data URL, fetch it with the test
owner's authorization, and assert `200`, `image/png`, and the decoded bytes.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- apps/api/src/community.test.mjs`

Expected: the assertion fails because the current list maps the legacy thumbnail
to an empty string.

- [ ] **Step 3: Implement the minimum API resource flow**

Add helpers beside `resolveProjectImage` to create and verify a signed
thumbnail-resource URL. Add an early GET route for the resource endpoint. It must
select only `id`, `user_id`, and `thumbnail_image`, authorize the owner via its
signature or bearer token, parse the thumbnail data URL with the existing bounded
parser, and return decoded bytes using its data-URL MIME type. Update
`listProjects` to map a Base64 thumbnail through this helper rather than returning
an empty string. Leave COS mapping unchanged.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- apps/api/src/community.test.mjs`

Expected: PASS; list JSON contains neither Base64 nor detail fields, and its
thumbnail resource can be loaded.

### Task 2: Verify consumers and delivery checks

**Files:**
- Test: `apps/api/src/community.test.mjs`
- Verify: `apps/h5/src/patterns/H5PatternPages.tsx`

- [ ] **Step 1: Confirm H5 consumes only the summary URL**

Keep `MyWorksPage` on `project.thumbnailImage || project.sourceImage`; the new
summary has a stable `thumbnailImage`, so no H5 detail query or list Base64 data
is introduced.

- [ ] **Step 2: Run regression and delivery checks**

Run: `npm test -- apps/api/src/community.test.mjs`

Run: `npm test -- apps/h5/src/shared/ImageWithSkeleton.test.tsx apps/h5/src/patterns/H5PatternPages.test.ts`

Run: `npm run build:h5`

Run: `git diff --check`

Expected: all commands exit 0.
