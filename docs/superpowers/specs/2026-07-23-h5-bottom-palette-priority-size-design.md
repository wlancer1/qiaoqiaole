# H5 Bottom Palette Priority and Compact Size

## Goal

Make the H5 canvas bottom palette surface colors already used in the current drawing first, while reducing each bottom color card to a compact but touch-safe 44 × 44px size.

## Ordering

- The bottom strip continues to contain all canonical `MARD_221_COLORS`; it is not reduced to used colors only.
- Reuse the palette-search ordering rules and implementation:
  - non-transparent canvas colors are counted by normalized hex value;
  - used colors appear before unused colors;
  - used colors sort by descending cell count;
  - equal counts use canonical palette order;
  - unused colors retain canonical palette order;
  - noncanonical cell colors add no card.
- Painting, erasing, filling, undoing, redoing, importing, resizing, or creating a canvas updates the ordering from the current `cells` state.
- The selected color receives no extra ordering priority. Until it is used in the drawing, it remains in the unused canonical partition.

This specification intentionally supersedes the earlier palette-modal specification's non-goal that canonical order would remain unchanged outside the modal. The new scope explicitly extends the same used-color priority to the bottom strip; the canonical palette data itself remains unchanged.

## Shared Data Flow

Compute one unfiltered `prioritizedPaletteColors` list from `MARD_221_COLORS` and `cells`. Render the bottom strip from that list.

Extract or reuse a pure query-only filter that accepts an already ordered palette list and a query. The existing usage-order helper may compose that query-only filter for backward compatibility, but the H5 component follows this data flow:

- `prioritizedPaletteColors` scans current cells once and contains the full ordered palette.
- `filteredPaletteColors` applies only the code/hex query filter to `prioritizedPaletteColors`; it never scans cells.
- When the query is empty, the query-only filter returns the prioritized list in the same order.

This guarantees one canvas scan per cell-state change, whether the modal is open or closed, and guarantees the bottom strip and unfiltered modal have identical ordering.

## Sizing and Layout

- Set `.palette-code` to a fixed `flex-basis`, `min-width`, and height of 44px at all H5 viewport sizes.
- Preserve the 6px mobile gap and horizontal scrolling with hidden scrollbars and touch momentum.
- Set the filter button to 44 × 44px so it remains a touch-safe target and aligns with the cards.
- Reduce `.palette-code-label` from 13px to 12px while retaining its weight and contrast.
- Reduce the active indicator to 12px wide and 3px high, positioned 4px from the bottom.
- Remove mobile overrides that calculate exactly six cards per row or change card height to 48/46px; fixed 44px cards may reveal a partial next card to communicate horizontal scrollability.
- Do not change the bottom bar's safe-area padding, grid structure, background, or filter icon.

## Interaction

Selecting any bottom card preserves existing behavior: select its color and code and switch to the brush. The same `.palette-strip` element remains mounted, so ordinary selection does not intentionally reset scrolling.

“Retain horizontal scrolling” means retain the ability to scroll the complete list with touch or horizontal wheel/trackpad input. Dynamic reordering does not promise that the same cards remain visible or that a semantic anchor is restored; the browser may retain the numeric `scrollLeft` while cards move around it. Selection state follows the color code rather than a fixed list index.

## Testing

Extend H5 Playwright coverage with an independent bottom-palette test that:

- paints A7 three times and M15 once, then verifies the first bottom cards are A7 followed by M15;
- verifies a known unused color remains present;
- verifies every sampled card is 44 × 44px, the filter button is 44 × 44px, the label is 12px, and the active indicator is 12 × 3px;
- verifies the strip remains horizontally scrollable and a horizontal wheel/trackpad gesture changes `scrollLeft`;
- makes the document horizontally scrollable during the scroll-boundary check and verifies horizontal wheel input over the strip does not move the document;
- opens the search modal and verifies its unfiltered first cards match the bottom strip;
- searches for a color and verifies query filtering and selection still work.
- undoes the one-cell M15 paint and verifies the bottom order changes from `A7, M15` to `A7, A1`, proving current cells—not stale initial counts—drive the list.

Run the 44px geometry assertions at representative viewport widths of 600px, 390px, and 350px, covering the base rules, the `max-width: 480px` block, and the `max-width: 360px` block. Each width must assert card and filter-button dimensions; the 390px case also asserts label and active-indicator dimensions.

Retain the pure helper unit suite, H5 build, palette-specific E2E tests, and complete H5 regression suite as verification gates.

## Non-goals

- Adding an “used colors only” mode, headings, separators, duplicated cards, counts, or badges.
- Changing the canonical palette itself.
- Changing search-modal card size or grid layout.
- Changing bottom bar height beyond what follows naturally from 44px controls.
- Fixing unrelated canvas-tool default-state work in the current dirty worktree.

## Dirty Worktree Boundary

Before implementation, capture the complete baseline diff for `H5App.tsx`, `styles.css`, and `h5.spec.ts`. Limit feature edits to:

- the prioritized/filtered palette memos and bottom-strip data source in `H5App.tsx`;
- the base, `max-width: 480px`, and `max-width: 360px` palette sizing declarations in `styles.css`;
- focused helper and bottom-palette tests.

Compare the final mixed-file diff against that baseline, identify the new hunks explicitly, and leave all mixed implementation files unstaged and uncommitted.
