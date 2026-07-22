# Suppress Paint Status Popups

## Goal

Keep the H5 canvas unobstructed while the user paints or erases. Successful brush and eraser interactions, including single-cell taps and drag strokes, must not show the floating canvas status message.

## Scope

- Stop publishing canvas status messages for successful brush strokes.
- Stop publishing canvas status messages for successful eraser strokes.
- Do not show no-op messages when a brush targets a cell that already has the selected color or when an eraser targets an empty cell.
- Apply the behavior to both grid canvases and imported image canvases, and to both taps and pointer-drag strokes.
- Preserve cell mutations, undo/redo history, selected colors, and tool behavior.
- Preserve status messages for fill, eyedropper, uploads, imports, exports, authentication, validation, and errors.

## Design

Suppress feedback at the source instead of filtering rendered text. Brush and eraser handlers will complete their existing mutations and history commits without assigning a status message. The shared floating status renderer remains unchanged for operations that still need feedback.

This avoids coupling behavior to Chinese message prefixes and ensures future brush or eraser paths do not briefly publish an announcement before presentation code hides it.

## Testing

Extend the H5 Playwright canvas-editing coverage to assert that the floating `.canvas-status` element is absent after:

- a successful brush tap;
- a brush drag stroke;
- a successful eraser tap;
- an eraser drag stroke.

Retain or add an assertion proving a non-paint operation can still render its status message. Existing drawing, erasing, and undo assertions continue to protect canvas behavior.

## Non-goals

- Redesigning the status component.
- Removing the palette search dialog or canvas settings dialog.
- Changing fill or eyedropper feedback.
- Altering the current in-progress canvas and reference-image work.
