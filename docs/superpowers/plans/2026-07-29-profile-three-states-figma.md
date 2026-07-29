# Profile Three-State Figma Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add logged-out, logged-in empty, and logged-in populated Profile screens to the existing Figma `Screens` page without changing other screens.

**Architecture:** Treat `15:1102` as the immutable visual source for all three states. Clone it twice, organize the three sibling frames at fixed positions, then edit state-specific text and visibility inside each frame. Verify structure through Figwright reads and verify rendered output through three screenshots.

**Tech Stack:** Figma design file, Figwright MCP read/write tools

---

## File Structure

- Modify externally: Figma file “超级拼 · 移动端 H5 UI（高保真）”, `Screens` page, source frame `15:1102`.
- Reference: `docs/superpowers/specs/2026-07-29-profile-three-states-figma-design.md`.
- No application source files or tests are modified.

## Chunk 1: Build and verify the three Profile states

### Task 1: Preflight and organize the frames

- [ ] **Step 1: Confirm the connected file and source frame**

Run Figwright `ping`, `list_files`, `get_metadata`, and `get_node(15:1102)`.

Expected: file name is “超级拼 · 移动端 H5 UI（高保真）”, current page is `Screens`, and `15:1102` is a visible 414 × 876 Profile frame.

- [ ] **Step 2: Capture the populated baseline**

Run `get_screenshot` for `15:1102` as PNG at 1× and retain it as the rendered baseline for final comparison.

Expected: a non-empty 414 × 876 image showing the existing populated Profile screen.

- [ ] **Step 3: Clone the populated source twice**

Run `clone_node(15:1102)` twice and record the two returned frame IDs.

Expected: two new sibling frames, each with the full Profile subtree.

- [ ] **Step 4: Name and position the frames**

Use `rename_node` and `set_position`:

- First clone → `FINAL / 05A Profile / Logged Out`, `(2860, 1069)`.
- Second clone → `FINAL / 05B Profile / Empty`, `(3322, 1069)`.
- Source `15:1102` → `FINAL / 05C Profile / Populated`, `(3784, 1069)`.

Expected: exactly three Profile root frames, ordered left to right with 48 px gaps.

### Task 2: Build the logged-out state

- [ ] **Step 1: Resolve child IDs inside the logged-out clone**

Use `scan_text_nodes` and `search_nodes` scoped to the logged-out root. Resolve children by their existing text or layer names before editing; do not assume cloned node IDs.

- [ ] **Step 2: Replace account and gated copy**

Use `set_text` for these exact replacements:

- `拼` → `访`
- `拼豆玩家` → `欢迎来到超级拼`
- `ID 20260729` → `登录后管理你的拼豆世界`
- `12 个项目` → `—`
- `2 个仓库` → `—`
- `86 色在库` → `—`
- `豆子仓库` → `登录后查看豆子仓库`
- `管理 MARD 221 色库存` → `登录后同步库存与色号`
- `查看最近编辑与导出` → `登录后查看编辑与导出记录`

Rename changed layers with the `Logged Out /` prefix.

- [ ] **Step 3: Hide authenticated-only content**

Rename the verified badge ellipse, verification check text, four colored swatches, “+82”, progress track, progress fill, both warehouse totals, logout rectangle, and logout text with the `Logged Out /` prefix. Then use `set_visible(false)` on all of them.

Expected: no personal ID, inventory values, verification badge, or logout action remains visible.

- [ ] **Step 4: Create the Login / Register button**

Inside the logged-out frame, create a 104 × 44 rectangle at frame-local coordinates `(270, 151)` named `Logged Out / Login Button`; apply 12 px corners and the existing primary blue fill `#146CFF`. Create centered white semibold 14 px text `登录 / 注册` named `Logged Out / Login Label`.

Expected: the button sits inside the account card without overlapping the nickname, subtitle, or statistics.

### Task 3: Build the logged-in empty state

- [ ] **Step 1: Resolve child IDs inside the empty clone**

Use `scan_text_nodes` and `search_nodes` scoped to the empty root. Resolve by existing text or layer names before editing.

- [ ] **Step 2: Replace empty-state copy**

Use `set_text` for these exact replacements:

- `拼豆玩家` → `拼豆新手`
- `12 个项目` → `0 个项目`
- `2 个仓库` → `0 个仓库`
- `86 色在库` → `0 色在库`
- `豆子仓库` → `还没有豆子仓库`
- `管理 MARD 221 色库存` → `创建仓库，开始管理豆子库存`
- `查看最近编辑与导出` → `还没有编辑与导出记录`

Keep `ID 20260729` and the verified badge. Rename changed layers with the `Empty /` prefix.

- [ ] **Step 3: Hide populated inventory content**

Rename four colored swatches, “+82”, progress track, progress fill, and both warehouse totals with the `Empty /` prefix. Then use `set_visible(false)` on all of them.

Expected: the warehouse card contains no nonzero stock values or misleading progress.

- [ ] **Step 4: Create the Create Warehouse button**

Inside the empty frame, create a 104 × 44 rectangle at frame-local coordinates `(96, 370)` named `Empty / Create Warehouse Button`; apply 12 px corners, white fill, 1 px inside stroke `#146CFF`. Create centered blue semibold 14 px text `创建仓库` named `Empty / Create Warehouse Label`.

Expected: the CTA fits inside the warehouse card and has a 44 px touch height.

### Task 4: Rendered and structural verification

- [ ] **Step 1: Verify root structure and geometry**

Use `search_nodes(name: "Profile /")` and `get_nodes_info` or `get_node` on the three root IDs.

Expected: three 414 × 876 frames at x = 2860, 3322, 3784 and y = 1069, with the exact final names.

- [ ] **Step 2: Export all three screenshots**

Run `get_screenshot` for the three root IDs as PNG at 1×.

Expected: each image is 414 × 876, non-empty, uncropped, and shows “我的” active in the bottom tab.

- [ ] **Step 3: Inspect visual acceptance criteria**

Confirm no overlap, clipping, text overflow, hidden icon remnants, or unintended changes. Confirm logged-out contains no personal data or logout action; empty contains zero statistics and clear empty messaging; compare the populated screenshot against the retained preflight baseline and confirm identical rendered content after normalizing for frame position.

- [ ] **Step 4: Correct and re-export if needed**

Use targeted Figwright position, visibility, text, fill, stroke, or typography edits only on the affected state. Re-export all three screenshots after corrections.

- [ ] **Step 5: Record completion**

Report the three final frame IDs and names, the preserved source state, and screenshot verification results. No git commit is required for Figma mutations; commit this plan document only.
