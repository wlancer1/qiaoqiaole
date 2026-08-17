## [Unreleased]

### Added / Changed / Fixed

- Stabilized H5 mobile image loading and interaction: legacy project thumbnails use protected resource URLs, image failures retry with network/restore recovery and bounded loading timeouts, and My Works defers thumbnails after the first six to reduce mobile request contention. Added IME-safe controlled text inputs and route/overlay regressions for mobile forms.
- Affected modules: `apps/api/src/server.mjs`, `apps/h5/src/shared/ImageWithSkeleton.tsx`, H5 home/My Works/project route/input and overlay modules, and related tests.

- Decomposed the H5 application coordinator into application overlays and feature boundaries for auth, projects, community, warehouse, beading, editor, and split workflows; removed the obsolete `H5App.tsx` compatibility entry and made `app/H5Application.tsx` the sole H5 composition root.
- Added route-scoped async guards, deep-link loaders, modal/overlay regressions, and feature-level behavior coverage across the migrated workflows.
- Affected modules: `apps/h5/src/app`, `apps/h5/src/features`, H5 route/page tests, and related community API projection tests.

- Replaced the API's in-memory `sql.js` snapshot persistence with file-backed native SQLite through `better-sqlite3` in WAL mode, added native-store regression coverage, updated the API image base, and migrated the legacy project-image script to direct SQLite writes.
- Optimized community author profiles and comments to avoid loading heavy project fields, added bounded community/author pagination with load-more UI, and added 15-second Xiaohongshu upstream timeouts.
- Affected modules: `apps/api/src/sqliteStore.mjs`, `apps/api/src/server.mjs`, `apps/api/scripts/migrate-project-images.mjs`, `apps/api/Dockerfile`, H5 community/pattern pages, and related tests.

- Added H5 canvas/grid background-removal controls, transparent-cell sampling, quick-split bounds handling, Xiaohongshu multi-image selection, and related editor/home regressions.
- Affected modules: H5 canvas, editor, home, split, project-folder UI, `packages/core/src/domain/grid.ts`, and related tests/docs.

- Added a safe migration script for moving legacy Base64 project source and thumbnail images to Tencent COS, with dry-run mode, SQLite backup, bounded batches, and resumable success-only updates.
- Affected modules: `apps/api/scripts/migrate-project-images.mjs`, migration tests, and server migration documentation.
- Passed Tencent COS configuration from the host `.env` into the API container through Docker Compose so image migration and new uploads use the configured COS service.
- Affected files: `docker-compose.yml`.
- Fixed the canvas background-removal control to remain available for saved projects that have editable canvas data but no original source image.
- Affected modules: `apps/h5/src/H5App.tsx` and the canvas editor regression test.

- Fixed slow community post listing by returning lightweight list payloads, moving full image/canvas data to the detail endpoint, removing comment joins from list queries, adding community/tag indexes, and caching tag counts.
- Affected modules: `apps/api/src/server.mjs` and `apps/api/src/community.test.mjs`.

- Added shared H5 project-folder sheets for creating and moving folders, including stacked-modal isolation, focus restoration, browser-back handling, pending-state locks, keyboard/context/long-press folder actions, and the redesigned My Works folder header.
- Changed community discovery to expose only tags used by shared posts, refreshed profile received-like totals, aligned following/follower rows, and kept logged-out profile statistics hidden.
- Fixed H5 page status messages leaking across screen or tab changes by scoping the shared status setter to the current route context; documented the async stale-message rule in `AGENTS.md`.
- Added `xhslink.cn` Xiaohongshu share-link compatibility with `XHS_COOKIE` forwarding restricted to HTTPS `xiaohongshu.com`, while preserving request-scoped diagnostics for redirects, page parsing, CDN probes, image downloads, and preview proxy failures.
- Affected modules: H5 app/editor/home/beading/pattern pages and styles, project-folder flow/sheet/history modules, community/profile API handlers and tests, `AGENTS.md`, and modal design documentation.

- Fixed save-and-start beading submission, community navigation and project deletion permissions, Xiaohongshu URL extraction, non-destructive home refresh, H5 local background removal, and threaded comment replies/deletion.
- Added idempotent comment schema migration coverage, a real mock-phone second-user API fixture, shared background-removal derivation tests, and focused H5 save/navigation/home/split regressions.
- Affected modules: `apps/api/src/server.mjs`, `apps/api/src/community.test.mjs`, `apps/api/src/testPhoneUser.mjs`, `apps/h5/src/H5App.tsx`, H5 community/editor/home/split/pattern pages, `packages/core/src/domain/grid.ts`, and `apps/web/src/App.tsx`.

- Added sticky, zoom-aware canvas rulers and accurate cell labels for editor and beading views.
- Added public community author profiles, shared-work viewing without login, community card/avatar components, and follow navigation coverage.
- Added profile editing with username and avatar updates, and changed new project names to default to `未命名作品`.
- Replaced browser confirmation dialogs with a unified, design-scale confirmation dialog for destructive and reset actions.
- Removed non-essential success/status toasts while preserving validation and error feedback.
- Affected modules: `apps/h5/src/H5App.tsx`, H5 canvas/beading/community/profile pages and styles, `apps/h5/src/shared/ConfirmDialog.tsx`, and `apps/api/src/server.mjs`.

### Fixed

- Fixed H5 blank-canvas width and height fields so custom multi-digit sizes can be edited before validation, and aligned the new-canvas modal typography with the canvas settings modal.
- Affected modules: `apps/h5/src/pages/home/HomeShellPage.tsx`, `apps/h5/src/pages/editor/CanvasPage.tsx`, `apps/h5/src/H5App.tsx`, and H5 shared styles/utilities.

### Added

- Added real-data community/template flows with project saving, one-time share-to-community behavior, community comments, likes, and hot sorting by like count.
- Added a dedicated split crop step with single-canvas rendering, preset crop ratios, automatic content bounds, row/column labels, movable crop selection, and zoom behavior aligned with the split flow.

### Changed

- Reworked H5 split/crop/editor code into canvas, flow, page, pattern, shared, and utility modules for the expanded split-to-crop-to-preview workflow.

### Fixed

- Fixed crop output handoff, back navigation, grid preservation after alignment zoom, crop selection bounds, and crop canvas layout so the editor canvas fills its workspace.

### Added

- Added H5 split-preview bead color merging controls and bead list coverage backed by core `mergeSimilarCells` tests.
- Added H5 E2E coverage for compact split controls, single-slider quick split sizing, centered alignment sizing controls, and matching home/profile hero card heights.
- Added H5 canvas pan-first toolbar behavior, drag painting/erasing, reference image support, compact mobile rulers/cell labels, and plain color-code labels with black/white contrast.
- Added focused H5 E2E coverage for mobile canvas layout, drag editing, reference images, palette filtering, and color-code contrast.
- Added canvas-rendered split previews with touch-driven grid-density adjustment on the H5 split page.
- Added authenticated, on-demand Xiaohongshu image download flow so extraction returns note image links first and only downloads the selected image.
- Added fixed admin credential configuration for the API service and E2E environment.
- Added the H5 API service and SQLite-backed endpoints for authentication, warehouses, inventory, and Xiaohongshu note image extraction.
- Added Xiaohongshu extraction tests and H5 end-to-end coverage for single-image and multi-image import flows.
- Added H5 warehouse management UI and supporting API proxy/dev configuration.

### Changed

- Changed H5 canvas rendering to redraw visible cells in fixed viewport-sized layers, keeping 108×108 grids sharp through high-DPI zoom and avoiding a one-frame camera redraw lag.
- Changed H5 quick split sizing to a single slider, tightened split settings layout, removed bottom whitespace from the split controls, and aligned the home/profile hero card height system.
- Changed the H5 split page preview from DOM image/grid overlays to a high-DPI canvas preview with separate button zoom and pinch-to-adjust split count behavior.
- Changed login/register behavior to use configured admin login only, with registration disabled at the API.
- Reworked Xiaohongshu note image extraction to prefer note-scoped image data, avoid comment/static asset images, expose parser diagnostics, and return compressed WebP image URLs.
- Updated H5 image import so Xiaohongshu images load into the same split-preview workflow as local uploads.

### Fixed

- Made API admin credentials fail closed when required environment variables are missing.
- Migrated legacy warehouse ownership to the configured admin account on first admin login.
- Revoked legacy non-admin sessions and restricted authenticated API tokens to the configured admin user.
- Allowed H5 login to submit any non-empty configured admin password.
- Filtered Xiaohongshu extraction results with lightweight backend image reachability probes before returning selectable links.
