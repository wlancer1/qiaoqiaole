# Canvas Color-Code Contrast Design

## Goal

Show cell color codes as plain text without any translucent or solid label background.

## Behavior

- Apply the same rule to editable grid canvases and imported image canvases.
- Render the color code in black on light-colored cells.
- Render the color code in white on black or otherwise dark-colored cells.
- Choose black or white from the cell color's luminance; do not add a badge, overlay, or pseudo-element behind the text.
- Keep the existing compact font size and zoom threshold for showing color codes.

## Implementation Scope

- Add a small contrast helper in `apps/h5/src/H5App.tsx` and use it for both color-code render paths.
- Remove the translucent backgrounds from `.h5-cell-code`, `.h5-image-cell-code`, and the imported-code pseudo-element in `apps/h5/src/styles.css`.
- Extend `tests/e2e/h5.spec.ts` to verify transparent code backgrounds plus black-on-light and white-on-dark text.

## Acceptance Criteria

- No cell color code has a visible background layer.
- A light cell displays a black code.
- A dark or black cell displays a white code.
- Both editable grids and imported image canvases follow the same rule.
