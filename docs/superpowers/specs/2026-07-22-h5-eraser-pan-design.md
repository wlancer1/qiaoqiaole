# H5 Eraser Icon and Canvas Pan Design

## Goal

Make the H5 canvas eraser immediately recognizable and make canvas movement predictable without conflicting with painting gestures.

## Scope

- Replace only the canvas toolbar's hand-drawn eraser SVG with the open-source Phosphor `EraserIcon`.
- Keep the existing toolbar order, sizing, selected state, tool state, and erasing behavior.
- Complete and verify the existing `pan` tool rather than adding a duplicate hand button or a second transform model.
- Keep all changes within `apps/h5`, its package dependency declaration, the root npm workspace lockfile, and focused H5 end-to-end coverage.
- Do not redesign other toolbar icons or alter canvas data, history, export, or reference-image behavior.

## Eraser Icon

Add `@phosphor-icons/react` as an H5 workspace dependency and import it with the supported client-side path `import { EraserIcon } from '@phosphor-icons/react/dist/csr/Eraser'` so the build does not eagerly process the library's full icon catalog.

Render the icon with the library's `duotone` weight. The partially filled eraser segment provides a visible material boundary at the toolbar's existing 25px icon size, while `currentColor` preserves the existing dark inactive state and white active state. Give the component a dedicated `phosphor-icon` class and `data-icon-source="phosphor"` marker. The dedicated class owns only display, 25px sizing, color inheritance, and flex behavior; it must not inherit the existing `.ui-icon` rules for `fill: none`, stroke width, line caps, or line joins because Phosphor's duotone artwork is fill-based. The toolbar button retains the accessible name `橡皮工具`.

Phosphor Icons is MIT licensed and its React package supports tree-shaken, per-icon imports. No remote font, runtime CDN request, copied SVG, or custom eraser path is introduced.

## Canvas Movement

The existing hand button remains the single explicit movement tool. Its accessible name changes from `拖拽工具` to `手抓移动工具`.

- With the hand tool selected, one-pointer dragging pans the transformed canvas and never paints or erases cells.
- With brush or eraser selected, one-pointer dragging continues to edit cells and must not pan the canvas.
- Two-pointer gestures remain available for pan and pinch-zoom regardless of the selected tool, allowing mobile users to reposition the canvas without repeatedly changing tools.
- Desktop pointer feedback uses `grab` while the hand tool is ready and `grabbing` during an active pan.
- The default selected tool remains the brush. Selecting the hand tool is explicit and does not mutate canvas cells or history.

`react-zoom-pan-pinch` remains the only transform owner. Configure its version-4.0.3 options as follows:

- Keep `panning.disabled` set to `false` for every tool so `pinch.allowPanning: true` can translate the canvas midpoint during a two-touch gesture.
- When the selected tool is not the hand, set `panning.excluded` to a stable canvas-artwork class applied to both grid and image drawing surfaces. This blocks the library's one-pointer pan start on drawing targets without excluding those targets from pinch.
- When the hand is selected, clear that panning exclusion so a one-pointer drag on the artwork pans.
- Keep `pinch.disabled: false`, `pinch.allowPanning: true`, and `pinch.excluded: []` for every tool.

Do not add separate `panX`/`panY` writes or another pointer-delta transform path for the canvas editor.

## Interaction Boundaries

- Brush and eraser pointer handlers act only for their matching tools.
- The hand tool delegates drag gestures to the transform wrapper.
- Toolbar presses, zoom controls, the settings modal, and the floating reference image do not initiate canvas panning.
- Changing tools during an idle state takes effect immediately. An in-progress gesture completes or cancels cleanly without applying a different tool midway.
- Existing zoom limits and reset behavior remain unchanged.

### Drawing-to-Pinch Arbitration

Drawing still applies a first-pointer change to the existing in-memory stroke draft for immediate feedback, but it does not commit history until pointer-up. Track the active canvas pointer IDs and whether the current contact sequence has become multi-touch.

1. The first pointer can begin a brush or eraser draft and capture that pointer as it does today.
2. If a second pointer goes down before the first finishes, immediately cancel the draft, restore both React state and `cellsRef` to the stroke's `baseCells`, release the captured drawing pointer when available, and do not append to history or clear the redo stack.
3. Mark the contact sequence as a transform gesture. No pointer in that sequence may start or resume drawing, even after one finger lifts.
4. Clear the transform-gesture marker only after every tracked pointer has ended or been cancelled. A fresh subsequent pointer-down may then draw normally.
5. The second touch is not prevented or captured by drawing code, allowing the transform wrapper's touch handlers to start pinch and midpoint translation.

This arbitration applies identically to the DOM grid and imported-image canvas paths. Cancelling restores the entire stroke draft, including any cells traversed before the second touch arrived.

## Accessibility and Visual Feedback

- Keep the existing 48px hand-tool touch target and active blue button treatment.
- Expose `aria-pressed` on toolbar buttons so the selected tool is programmatically identifiable.
- Use cursor feedback only inside `@media (any-pointer: fine)` so hybrid touch-and-mouse devices receive it without making touch behavior depend on cursor styling.
- Respect the current `touch-action` containment so page chrome does not scroll during a canvas gesture.

## Verification

Extend focused Playwright coverage to verify:

- The eraser button contains `[data-icon-source="phosphor"]`, renders at 25px, does not inherit `fill: none`, and retains its accessible name.
- Selecting the hand button exposes its active/pressed state.
- A one-pointer drag with the hand tool changes the transform position and leaves all cell colors and transparency unchanged; undo remains disabled if it was disabled before the drag.
- The same drag path with the brush or eraser selected edits cells rather than moving the transform.
- A two-pointer gesture can transform the canvas while a drawing tool is selected. Assert that a first-touch draft mutation is visibly rolled back when the second touch arrives, final cells equal their pre-gesture values, and undo/redo availability is unchanged.
- The hand tool exposes `grab`/`grabbing` feedback on desktop.

Run the focused H5 Playwright test, the H5 build, and the relevant existing test suite before completion.

## Files

- `apps/h5/package.json`: Phosphor React dependency.
- `package-lock.json`: npm workspace dependency lock entry.
- `apps/h5/src/H5App.tsx`: icon import/rendering, hand-tool naming, transform configuration, and selected-state semantics.
- `apps/h5/src/styles.css`: dedicated Phosphor icon sizing/color boundary and grab/grabbing cursor feedback.
- `tests/e2e/h5.spec.ts`: icon, pan, gesture-conflict, and accessibility regressions.
