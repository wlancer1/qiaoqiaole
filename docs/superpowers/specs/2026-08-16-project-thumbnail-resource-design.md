# Historical Project Thumbnail Resource Design

## Problem

The home screen can display a legacy project's in-memory Base64 thumbnail. Opening
"全部" reloads the lightweight project-list endpoint. That endpoint deliberately
omits Base64 values, so legacy records whose thumbnail is only a data URL arrive
with an empty `thumbnailImage` and render as an empty placeholder in 我的作品.

## Decision

Keep project-list payloads summary-sized. For a legacy data-URL thumbnail, the
list endpoint will return a signed, project-specific thumbnail resource URL
instead of the Base64 value. A new GET endpoint validates the project owner and
the short-lived signature, decodes only the stored thumbnail, and returns image
bytes with the stored content type. It never returns source images and does not
put canvas data, bead lists, or Base64 image data into a list response.

COS-backed thumbnails continue through the existing `/api/project-assets` URL
flow. New and existing callers keep consuming `thumbnailImage` as a normal image
URL, so the H5 list and its `ImageWithSkeleton` component need no new loading
state or per-item detail request.

## Data Flow

1. `GET /api/projects` selects only summary fields, including `id` and the stored
   `thumbnail_image`.
2. A COS thumbnail is mapped to the existing stable asset redirect. A legacy data
   URL is mapped to `/api/project-thumbnails/:id?...` with a user-bound expiry and
   signature. An absent thumbnail remains empty.
3. The browser requests that URL from the `<img>` in 我的作品.
4. The thumbnail route validates the signed request (or the authenticated owner),
   selects only the target project's `thumbnail_image`, validates it as a bounded
   image data URL, and streams the decoded bytes. Invalid, expired, non-owned,
   missing, or non-thumbnail data receives the existing safe error semantics.

## Testing

Add an API regression test that creates a legacy Base64 thumbnail and confirms
the list response: contains a resource URL, excludes `sourceImage`, `canvasData`,
`beadList`, and `base64,`; and the resource URL returns the expected image bytes
for its owner. Preserve the existing test that details, rather than lists, return
heavy fields. Run the focused API test, H5 tests, H5 build, and `git diff --check`.
