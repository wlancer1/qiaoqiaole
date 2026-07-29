# Upload Import Sheet Figma Design

## Objective

Design an editable mobile bottom sheet in the existing Figma `Screens` page for the upload flow opened from the home upload hero and center navigation action. The design must represent behavior already implemented in `apps/h5/src/H5App.tsx`; it must not introduce unsupported camera, drag-and-drop, cloud drive, or batch local upload actions.

## Supported Sources

1. **Local image**
   - Opens the existing file input.
   - Accepts PNG, JPG/JPEG, and WebP.
   - Maximum file size is 20 MB.
   - A successful selection closes the sheet and enters split settings.
   - Invalid format, oversize, and read failures remain app status messages.
2. **Xiaohongshu extraction**
   - Requires login before showing the extraction form.
   - Accepts `xiaohongshu.com` and `xhslink.com` links.
   - A single extracted image imports immediately.
   - Multiple extracted images open an in-sheet image picker.
   - Loading and extraction failure states must be represented.

## Presentation

Use a mobile bottom sheet over a dimmed, lightly blurred copy of the final home screen. The sheet spans the screen width with 20 px top corner radii and safe-area bottom padding. It uses the existing white, blue, pale-blue, gray, and dark-text visual language from the four final screens.

The header contains a centered drag handle, the title `导入图片`, supporting copy `选择图片来源，开始制作拼豆图纸`, and a circular close icon. A compact format row communicates `PNG / JPG / WebP` and `最大 20MB` without duplicating this information inside every control.

## Default State

The default sheet contains two vertically stacked source cards:

- `从相册或文件选择` is the primary card. It uses a blue-tinted icon surface, a picture/upload icon, and a trailing arrow. Its supporting text states that it opens the device album or file picker.
- `小红书提取` is a secondary card. It uses a spark/link icon, a `需登录` badge, and supporting text explaining that a note link can be used to extract an image.

Cards use 14 px radii, 1 px borders, at least 72 px height, and a 44 px icon target. No standalone confirm button appears in the default state because choosing the local source immediately opens the file picker.

## Xiaohongshu Expanded State

Selecting Xiaohongshu keeps the source card highlighted and expands an embedded form below it:

- Label `小红书链接`.
- Single URL field with the placeholder from the implementation.
- Full-width blue `提取图片` button.

The expanded sheet may grow vertically but must retain the header and close action. It must not become a separate full-screen route.

When the user is logged out, selecting Xiaohongshu opens the project's existing login modal first. That login modal is an external dependency and is not redesigned or duplicated in this upload-sheet section. After successful login, the callback opens this expanded state.

## Additional States

- **Extracting:** disable the primary action, show a progress spinner, and use `提取中...`.
- **Multiple images:** keep the URL field and extraction button, then append a two-column thumbnail grid headed `选择笔记图片`. Show four representative thumbnails in a 2 x 2 grid; additional results continue vertically in the implemented sheet. Each image has a visible index and a clear tap target. There is no persistent selected state; tapping a thumbnail immediately imports that image, matching the implementation.
- **Error:** keep the expanded form unchanged and show the existing compact app-status message above the bottom navigation area for invalid links or extraction failures. Do not introduce a new inline validation system in this Figma task.

## Figma Structure

Create a new section next to the final screens named `Upload Sheet / States`. Include five 414 x 940 px editable frames:

1. `Upload Sheet / Default`
2. `Upload Sheet / Xiaohongshu`
3. `Upload Sheet / Extracting`
4. `Upload Sheet / Image Picker`
5. `Upload Sheet / Error`

Use deterministic sheet heights measured from the bottom edge of each frame: 468 px for Default, 638 px for Xiaohongshu, 638 px for Extracting, 760 px for Image Picker, and 638 px for Error. The Error frame also includes the external app-status message above the navigation area.

Each frame reuses a dimmed home-screen background only as context. The sheet, text, source cards, icons, input, button, badges, error/loading indicators, and thumbnails remain separate editable layers. Repeated source cards, buttons, and image-picker cells should share naming and geometry so they can be converted to components later.

## Verification

- Compare all five states at 1x and 2x export.
- Confirm no text or control overlaps at 414 px width.
- Confirm the default state exposes exactly the two sources implemented in code.
- Confirm format and size limits match `handleUpload`.
- Confirm Xiaohongshu states match login, extracting, single-image, multiple-image, and failure behavior in `H5App.tsx`.
- Confirm each primary touch target is at least 44 px.
