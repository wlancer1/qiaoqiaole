# Upload Import Sheet Figma Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five high-fidelity, editable upload bottom-sheet states to the existing Figma `Screens` page, matching the approved upload-flow specification and current H5 behavior.

**Architecture:** Create one canvas section containing five 414 x 940 state frames. Each state clones the approved final home frame for visual context, adds a shared dim overlay and editable bottom-sheet primitives, then applies only the state-specific form, loading, picker, or status layers. Verify the finished nodes through Figwright metadata and 1x/2x raster exports.

**Tech Stack:** Figma Design, Figwright MCP, existing `Screens` page and `FINAL / 01 Home` frame, project behavior in `apps/h5/src/H5App.tsx`.

---

## Chunk 1: Build And Verify The Figma States

### Task 1: Confirm Target And Create State Containers

**Files:**
- Reference: `docs/superpowers/specs/2026-07-29-upload-import-sheet-figma-design.md`
- Reference: `apps/h5/src/H5App.tsx:1028`
- Reference: `apps/h5/src/H5App.tsx:2368`
- Create in Figma: `Screens / Upload Sheet / States`

- [ ] **Step 1: Inspect the active Figma page and source frame**

Run Figwright `get_pages`, `get_node`, and `get_screenshot` for page `3:3` and frame `14:527`.

Expected: page name is `Screens`; source frame is `FINAL / 01 Home`, measures 414 x 940, and renders without missing layers.

- [ ] **Step 2: Create the canvas section**

Run Figwright `create_section` with name `Upload Sheet / States`, sized for a three-by-two arrangement with at least 48 px gaps, positioned to the right of the existing high-fidelity section.

Expected: one new editable section on `Screens`, with no overlap with section `14:2`.

- [ ] **Step 3: Clone and place five home-context frames**

Clone `14:527` five times, reparent the clones into the new section, rename them exactly as specified, and position them in a three-by-two grid:

```text
Upload Sheet / Default
Upload Sheet / Xiaohongshu
Upload Sheet / Extracting
Upload Sheet / Image Picker
Upload Sheet / Error
```

Expected: all five frames remain 414 x 940, retain the approved home background, and are independently editable.

### Task 2: Build The Shared Default Bottom Sheet

**Files:**
- Reference: `docs/superpowers/specs/2026-07-29-upload-import-sheet-figma-design.md`
- Modify in Figma: `Upload Sheet / Default`

- [ ] **Step 1: Add the named modal context roots**

Add a full-frame rectangle named `Modal / Overlay` above the home content with a dark fill at approximately 38% opacity and a 6 px `BACKGROUND_BLUR` effect. Add one frame named `Modal / Sheet` above the overlay, sized 414 x 468 and aligned to the frame bottom with a white fill, 20 px top corner radii, clipping enabled, and safe-area spacing. Every header, card, metadata, form, loading, and picker layer created later must be a descendant of `Modal / Sheet`; the Error frame's external app-status layer is the only exception.

Expected: layer order is home content, `Modal / Overlay`, then `Modal / Sheet`; home remains recognizable but dimmed and lightly blurred; the sheet top begins at y=472 and does not clip at the bottom.

- [ ] **Step 2: Build the sheet header**

Inside `Modal / Sheet`, create separate editable layers for the drag handle, title `导入图片`, supporting copy `选择图片来源，开始制作拼豆图纸`, and circular close icon. Use the established blue, pale-blue, gray, dark-text, and white palette from the final screens.

Expected: title and supporting copy are optically centered, the close target is at least 44 x 44, and no text overlaps.

- [ ] **Step 3: Build the two source cards**

Inside `Modal / Sheet`, create the primary `从相册或文件选择` card and secondary `小红书提取` card as separate editable frames. Include 44 x 44 icon surfaces, descriptions, trailing affordances, and the `需登录` badge on the Xiaohongshu card.

Expected: cards are at least 72 px high, use 14 px radii and 1 px borders, and expose exactly the two sources implemented in `H5App.tsx`.

- [ ] **Step 4: Add the compact file-limit row**

Add `PNG / JPG / WebP` and `最大 20MB` as one quiet metadata row below the source cards.

Expected: the row is readable at 1x without competing with the two actions.

### Task 3: Derive The Four Functional States

**Files:**
- Reference: `apps/h5/src/H5App.tsx:1085`
- Reference: `apps/h5/src/H5App.tsx:2397`
- Modify in Figma: `Upload Sheet / Xiaohongshu`
- Modify in Figma: `Upload Sheet / Extracting`
- Modify in Figma: `Upload Sheet / Image Picker`
- Modify in Figma: `Upload Sheet / Error`

- [ ] **Step 1: Clone the two shared modal roots into the remaining frames**

For each remaining state, clone the exact `Modal / Overlay` and `Modal / Sheet` roots from Default, reparent both clones into the target frame, and set their coordinates explicitly. Reorder each target so the cloned overlay is immediately above the retained home subtree and the cloned sheet is immediately above the overlay. Keep all shared sheet descendants inside the cloned `Modal / Sheet` root.

Expected: all five frames have the same complete modal context and stacking order; shared header, source-card, and metadata descendants align pixel-for-pixel.

- [ ] **Step 2: Build the Xiaohongshu expanded form**

Resize the sheet to 638 px high, highlight the Xiaohongshu source card, and add label `小红书链接`, the implemented URL placeholder, a 48 px URL input, and a full-width blue `提取图片` button. Do not add paste, camera, batch upload, or inline-validation actions.

Expected: sheet begins at y=302; the form remains inside the sheet and every action target is at least 44 px.

- [ ] **Step 3: Build the extracting state**

Keep the 638 px geometry, disable the primary action visually, add a spinner, and change the label to `提取中...`.

Expected: loading state is distinct without shifting surrounding geometry.

- [ ] **Step 4: Build the image-picker state**

Resize the sheet to 760 px high, retain the URL field and extraction button, then append `选择笔记图片` and four representative thumbnails in a two-column grid. Build the thumbnails by cloning the existing image-fill frames `15:1066`, `15:1068`, `15:1070`, and `14:1063`, reparenting them into `Modal / Sheet`, resizing them to equal grid cells, and preserving their bitmap fills as editable Figma layers. Add a separate visible index layer to each thumbnail and no persistent selected state.

Expected: sheet begins at y=180; all four thumbnails fit without clipping and clearly behave as immediate import targets.

- [ ] **Step 5: Build the error state**

Keep the 638 px expanded form unchanged and add the existing app-status treatment with `请输入有效的小红书链接。` as a sibling frame named `Modal / Status`. Position it 82 px from the frame bottom and reorder it above `Modal / Sheet`, matching the app's fixed status layer and higher z-index.

Expected: `Modal / Status` is visually separate from the sheet form, is included in the Error frame geometry audit, and matches the current external status-message behavior.

### Task 4: Audit And Export

**Files:**
- Create locally: `.figwright-assets/upload-sheet-1x/*.png`
- Create locally: `.figwright-assets/upload-sheet-2x/*.png`

- [ ] **Step 1: Audit frame and layer geometry**

Run Figwright `get_nodes_info` or `get_design_context` for all five frame IDs.

Expected: every frame is 414 x 940; sheet heights are 468, 638, 638, 760, and 638 px; all required text and state layers are visible.

- [ ] **Step 2: Export all states at 1x**

Run Figwright `save_screenshots` for all five frame IDs with scale 1.

Expected: five non-empty 414 x 940 PNG files.

- [ ] **Step 3: Export all states at 2x and inspect them**

Run Figwright `get_screenshot` and `save_screenshots` for all five frame IDs with scale 2, then visually inspect the renders.

Expected: five non-empty 828 x 1880 PNG files with no overlap, clipping, unintended transparency, or off-center text.

- [ ] **Step 4: Correct any visual deviations and re-export**

Use Figwright geometry, typography, fill, stroke, and effect setters for targeted corrections; repeat 2x export until all verification criteria pass.

Expected: final renders match the approved specification and maintain the visual language of the four existing final screens.

- [ ] **Step 5: Commit the implementation plan only**

```bash
git add docs/superpowers/plans/2026-07-29-upload-import-sheet-figma.md
git commit -m "docs: plan upload import sheet figma states"
```

Expected: the commit contains only this plan file; Figma edits remain in the linked Figma document.
