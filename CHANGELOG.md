## [Unreleased]

### Added

- Added the H5 API service and SQLite-backed endpoints for authentication, warehouses, inventory, and Xiaohongshu note image extraction.
- Added Xiaohongshu extraction tests and H5 end-to-end coverage for single-image and multi-image import flows.
- Added H5 warehouse management UI and supporting API proxy/dev configuration.

### Changed

- Reworked Xiaohongshu note image extraction to prefer note-scoped image data, avoid comment/static asset images, expose parser diagnostics, and return compressed WebP image URLs.
- Updated H5 image import so Xiaohongshu images load into the same split-preview workflow as local uploads.
