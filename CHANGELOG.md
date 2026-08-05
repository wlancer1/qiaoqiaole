## [Unreleased]

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
