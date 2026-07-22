# H5 Palette Modal Scroll and Used-Color Priority

## Goal

Make the H5 canvas palette-search modal usable on small screens and surface colors already present in the current drawing before unused colors.

## Current Behavior and Root Cause

The modal renders all 221 palette colors in `.palette-search-results`. Although that element declares `overflow: auto`, its grid parent has only a `max-height`; the results row retains its intrinsic minimum height and expands the panel instead of shrinking into a scrollable region.

The canvas already derives `usedColors` from non-transparent cells and counts occurrences by cell color. The palette-search list currently ignores those counts and always follows `MARD_221_COLORS` order.

## Interaction Design

- Keep the existing single color-card grid, title, close action, and search field.
- Keep the title and search field fixed within the bottom-sheet panel.
- Make only the results grid vertically scrollable within the panel's existing viewport cap.
- Support touch momentum scrolling and prevent scroll chaining from making the canvas/page move when the results reach an edge.
- Do not add sections, tabs, toggles, duplicated cards, or visible usage counts.

## Ordering Rules

Build the displayed list from `MARD_221_COLORS` using these rules:

1. Apply the current case-insensitive code/hex search filter.
2. Partition matching colors into used and unused colors by comparing normalized, case-insensitive hex values with the current non-transparent canvas cells.
3. Sort used colors by descending cell count.
4. Break equal-count ties by their original `MARD_221_COLORS` index.
5. Append unused colors in their original `MARD_221_COLORS` order.

The same ordering applies with or without a search query. A blank canvas has no used-color partition and therefore preserves the current palette order exactly. Transparent cells never contribute to usage counts.

If a cell color is not represented in `MARD_221_COLORS`, it contributes no card because the modal continues to display only the canonical 221-color palette.

## Layout

- Define the panel rows as `auto auto minmax(0, 1fr)` so the header and search input retain their natural sizes and the results row may shrink.
- Give the panel a bounded height derived from the existing viewport cap while respecting short mobile screens and safe-area spacing.
- Set the results grid to `min-height: 0`, `overflow-y: auto`, touch momentum scrolling, and contained overscroll.
- Preserve the current four-column card layout and hidden scrollbar styling.

## Selection and State

Selecting a color retains current behavior: update the selected color/code, switch to the brush, close the modal, and clear the search query. Reopening the modal recomputes ordering from the latest canvas cells, so newly painted or erased colors are reflected without separate state.

## Testing

Extend the H5 Playwright canvas test to verify:

- On a 390 x 844 viewport, the results grid has `scrollHeight > clientHeight` and changing `scrollTop` succeeds while the panel header and search remain visible.
- Used colors appear before unused colors.
- Multiple used colors are ordered by descending cell count.
- Equal usage counts retain canonical palette order.
- A search query filters the list while retaining used-color priority among matching results.
- Selecting a result still closes the modal and applies the chosen color.

The production build and complete H5 Playwright suite remain the regression gates.

## Non-goals

- Redesigning the bottom palette strip.
- Adding usage badges or quantities to cards.
- Adding used/all filters or separate sections.
- Changing the canonical palette order outside the search modal.
- Changing color quantization or nearest-color matching.
