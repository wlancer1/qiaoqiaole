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

## Shared Data Flow

Compute one unfiltered `prioritizedPaletteColors` list from `MARD_221_COLORS` and `cells`. Render the bottom strip from that list.

The search modal must preserve its current query behavior without rescanning the canvas on every paint update:

- When the query is empty, reuse `prioritizedPaletteColors` directly.
- When the query is non-empty, use the existing `filterPaletteByUsage` query behavior and the current cells. Cell changes do not normally occur while the modal is open; the modal still remains correct if they do.

This keeps one canvas scan during normal painting and guarantees the bottom strip and unfiltered modal have identical ordering.

## Sizing and Layout

- Set `.palette-code` to a fixed `flex-basis`, `min-width`, and height of 44px at all H5 viewport sizes.
- Preserve the 6px mobile gap and horizontal scrolling with hidden scrollbars and touch momentum.
- Set the filter button to 44 × 44px so it remains a touch-safe target and aligns with the cards.
- Reduce `.palette-code-label` from 13px to 12px while retaining its weight and contrast.
- Reduce the active indicator to 12px wide and 3px high, positioned 4px from the bottom.
- Remove mobile overrides that calculate exactly six cards per row or change card height to 48/46px; fixed 44px cards may reveal a partial next card to communicate horizontal scrollability.
- Do not change the bottom bar's safe-area padding, grid structure, background, or filter icon.

## Interaction

Selecting any bottom card preserves existing behavior: select its color and code, switch to the brush, and retain horizontal scrolling. Reordering after a subsequent canvas mutation is expected; selection state follows the color code rather than a fixed list index.

## Testing

Extend H5 Playwright coverage with an independent bottom-palette test that:

- paints A7 three times and M15 once, then verifies the first bottom cards are A7 followed by M15;
- verifies a known unused color remains present;
- verifies every sampled card is 44 × 44px, the filter button is 44 × 44px, the label is 12px, and the active indicator is 12 × 3px;
- verifies the strip remains horizontally scrollable and a horizontal wheel/trackpad gesture changes `scrollLeft`;
- opens the search modal and verifies its unfiltered first cards match the bottom strip;
- searches for a color and verifies query filtering and selection still work.

Retain the pure helper unit suite, H5 build, palette-specific E2E tests, and complete H5 regression suite as verification gates.

## Non-goals

- Adding an “used colors only” mode, headings, separators, duplicated cards, counts, or badges.
- Changing the canonical palette itself.
- Changing search-modal card size or grid layout.
- Changing bottom bar height beyond what follows naturally from 44px controls.
- Fixing unrelated canvas-tool default-state work in the current dirty worktree.
