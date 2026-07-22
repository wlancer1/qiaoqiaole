# H5 Eraser Icon and Canvas Pan Design

## Goal

Make the H5 canvas eraser immediately recognizable and make canvas movement predictable without conflicting with painting gestures.

## Scope

- Replace only the canvas toolbar's hand-drawn eraser SVG with the open-source Phosphor `EraserIcon`.
- Keep the existing toolbar order, sizing, selected state, tool state, and erasing behavior.
- Complete and verify the existing `pan` tool rather than adding a duplicate hand button or a second transform model.
- Keep all changes within `apps/h5`, its package dependency declaration, and focused H5 end-to-end coverage.
- Do not redesign other toolbar icons or alter canvas data, history, export, or reference-image behavior.

## Eraser Icon

Add `@phosphor-icons/react` as an H5 workspace dependency and import `EraserIcon` from its specific client-side module so the build does not eagerly process the library's full icon catalog.

Render the icon with the library's `duotone` weight. The partially filled eraser segment provides a visible material boundary at the toolbar's existing 25px icon size, while `currentColor` preserves the existing dark inactive state and white active state. The toolbar button retains the accessible name `橡皮工具`.

Phosphor Icons is MIT licensed and its React package supports tree-shaken, per-icon imports. No remote font, runtime CDN request, copied SVG, or custom eraser path is introduced.

## Canvas Movement

The existing hand button remains the single explicit movement tool. Its accessible name changes from `拖拽工具` to `手抓移动工具`.

- With the hand tool selected, one-pointer dragging pans the transformed canvas and never paints or erases cells.
- With brush or eraser selected, one-pointer dragging continues to edit cells and must not pan the canvas.
- Two-pointer gestures remain available for pan and pinch-zoom regardless of the selected tool, allowing mobile users to reposition the canvas without repeatedly changing tools.
- Desktop pointer feedback uses `grab` while the hand tool is ready and `grabbing` during an active pan.
- The default selected tool remains the brush. Selecting the hand tool is explicit and does not mutate canvas cells or history.

`react-zoom-pan-pinch` remains the only transform owner. The implementation may configure its existing panning and pinch options and add presentation state/classes, but must not maintain a parallel pan offset or duplicate pointer-delta transform path.

## Interaction Boundaries

- Brush and eraser pointer handlers act only for their matching tools.
- The hand tool delegates drag gestures to the transform wrapper.
- Toolbar presses, zoom controls, the settings modal, and the floating reference image do not initiate canvas panning.
- Changing tools during an idle state takes effect immediately. An in-progress gesture completes or cancels cleanly without applying a different tool midway.
- Existing zoom limits and reset behavior remain unchanged.

## Accessibility and Visual Feedback

- Keep the existing 48px hand-tool touch target and active blue button treatment.
- Expose `aria-pressed` on toolbar buttons so the selected tool is programmatically identifiable.
- Use cursor feedback only on pointer-capable devices; touch behavior does not depend on cursor styling.
- Respect the current `touch-action` containment so page chrome does not scroll during a canvas gesture.

## Verification

Extend focused Playwright coverage to verify:

- The eraser button renders the Phosphor icon and retains its accessible name.
- Selecting the hand button exposes its active/pressed state.
- A one-pointer drag with the hand tool changes the transform position and leaves all cell colors and transparency unchanged.
- The same drag path with the brush or eraser selected edits cells rather than moving the transform.
- A two-pointer gesture can transform the canvas while a drawing tool is selected, without editing cells.
- The hand tool exposes `grab`/`grabbing` feedback on desktop.

Run the focused H5 Playwright test, the H5 build, and the relevant existing test suite before completion.

## Files

- `apps/h5/package.json`: Phosphor React dependency.
- `apps/h5/src/H5App.tsx`: icon import/rendering, hand-tool naming, transform configuration, and selected-state semantics.
- `apps/h5/src/styles.css`: grab/grabbing cursor feedback if needed.
- `tests/e2e/h5.spec.ts`: icon, pan, gesture-conflict, and accessibility regressions.

