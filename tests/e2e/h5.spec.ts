import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.use({ baseURL: 'http://127.0.0.1:5174' });

const uploadFixture = path.resolve('image.png');
const testUsername = 'admin';
const testPassword = 'qiaoqiaole123';

async function loginFromDialog(dialog: ReturnType<import('@playwright/test').Page['getByRole']>) {
  await dialog.getByRole('textbox', { name: '用户名' }).fill(testUsername);
  await dialog.getByLabel('密码').fill(testPassword);
  await dialog.getByRole('button', { name: '登录并继续' }).click();
}

async function expectNoPageScrollbar(page: import('@playwright/test').Page) {
  const metrics = await page.locator('body').evaluate(() => ({
    widthOverflow: document.documentElement.scrollWidth > window.innerWidth,
    heightOverflow: document.documentElement.scrollHeight > window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(metrics, JSON.stringify(metrics)).toMatchObject({
    widthOverflow: false,
    heightOverflow: false,
  });
}

async function createBlankCanvasFromHome(page: import('@playwright/test').Page, cols = 32, rows = 32) {
  await page.getByRole('button', { name: '新建空白画布' }).click();
  const dialog = page.getByRole('dialog', { name: '新建画布设置' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('spinbutton', { name: '宽度列数' }).fill(String(cols));
  await dialog.getByRole('spinbutton', { name: '高度行数' }).fill(String(rows));
  await dialog.getByRole('button', { name: '创建画布' }).click();
  await expect(page.getByLabel('H5 画布编辑器')).toBeVisible();
}

async function pinchOpenSplitPreview(page: import('@playwright/test').Page) {
  const target = page.locator('.split-image-container');
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: centerX - 28, y: centerY, id: 1 },
      { x: centerX + 28, y: centerY, id: 2 },
    ],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: centerX - 92, y: centerY, id: 1 },
      { x: centerX + 92, y: centerY, id: 2 },
    ],
  });
  await page.waitForTimeout(100);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function twoFingerPinchOnGridCell(page: import('@playwright/test').Page, cellName: string) {
  const box = await page.getByRole('button', { name: cellName, exact: true }).boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: centerX, y: centerY, id: 1 }],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: centerX, y: centerY, id: 1 },
      { x: centerX + 28, y: centerY, id: 2 },
    ],
  });
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: centerX - 18, y: centerY, id: 1 },
      { x: centerX + 46, y: centerY, id: 2 },
    ],
  });
  await page.waitForTimeout(100);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
}

function longSideFromSplitInfo(text: string) {
  const numbers = text.match(/\d+/g)?.map(Number) ?? [];
  return Math.max(...numbers);
}

function gridSizeFromText(text: string) {
  const [cols = 0, rows = 0] = text.match(/\d+/g)?.map(Number) ?? [];
  return { cols, rows };
}

async function countGridPixelsInCanvasBand(
  page: import('@playwright/test').Page,
  band: 'left' | 'right',
) {
  return page.locator('.split-preview-canvas').evaluate((node, bandName) => {
    const canvas = node as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const bandWidth = Math.max(8, Math.floor(canvas.width * 0.12));
    const startX = bandName === 'left' ? 0 : canvas.width - bandWidth;
    const imageData = context.getImageData(startX, 0, bandWidth, canvas.height).data;
    let count = 0;
    for (let index = 0; index < imageData.length; index += 4) {
      const red = imageData[index] ?? 0;
      const green = imageData[index + 1] ?? 0;
      const blue = imageData[index + 2] ?? 0;
      if (blue > red + 24 && blue > green + 8) count += 1;
    }
    return count;
  }, band);
}

async function readCssScale(page: import('@playwright/test').Page, selector: string) {
  return page.locator(selector).evaluate((node) => {
    const transform = getComputedStyle(node).transform;
    if (!transform || transform === 'none') return 1;
    const matrix = new DOMMatrixReadOnly(transform);
    return matrix.a;
  });
}

test('uploads from the H5 home page, configures split count, previews, then imports into canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expectNoPageScrollbar(page);

  await expect(page.getByRole('heading', { name: '超级拼' })).toBeVisible();
  await expect(page.getByRole('button', { name: '首页' })).toBeVisible();
  await expect(page.getByRole('button', { name: '上传', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '我的' })).toBeVisible();
  await expect(page.getByText('上传图片生成图纸')).toHaveCount(0);

  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  await expect(page.getByRole('heading', { name: '分割' })).toBeVisible();
  await expectNoPageScrollbar(page);
  await expect(page.locator('.split-info-value')).toContainText('18');
  await expect(page.getByLabel('分割预览图')).toBeVisible();
  await expect(page.locator('.split-preview-canvas')).toBeVisible();
  await expect(page.locator('.split-image-zoom-wrapper')).toHaveCSS('touch-action', 'none');
  await expect(page.locator('.split-image-zoom-content')).toHaveCSS('touch-action', 'none');
  await expect(page.locator('.split-preview-canvas')).toHaveCSS('touch-action', 'none');
  await expect(page.locator('.split-zoom-controls')).toHaveCount(0);
  const splitTouchTargets = await page.locator('.split-topbar button, .split-mode-switch button, .split-step-btn, .split-range').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        label: node.getAttribute('aria-label') ?? node.textContent?.trim() ?? node.className,
        width: rect.width,
        height: rect.height,
      };
    }),
  );
  for (const target of splitTouchTargets) {
    expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: '对格子' }).click();
  const alignmentHandles = await page.locator('.split-grid-handle').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        className: node.className,
        width: rect.width,
        height: rect.height,
        borderColor: style.borderColor,
      };
    }),
  );
  expect(alignmentHandles).toHaveLength(2);
  for (const handle of alignmentHandles) {
    expect(handle.width, `${handle.className} width`).toBeGreaterThanOrEqual(42);
    expect(handle.width, `${handle.className} width`).toBeLessThanOrEqual(56);
    expect(handle.height, `${handle.className} height`).toBeGreaterThanOrEqual(42);
    expect(handle.height, `${handle.className} height`).toBeLessThanOrEqual(56);
  }
  expect(alignmentHandles.find((handle) => handle.className.includes('move'))?.borderColor).toBe('rgb(32, 142, 220)');
  expect(alignmentHandles.find((handle) => handle.className.includes('scale'))?.borderColor).toBe('rgb(247, 125, 36)');
  const alignTouchTargets = await page.locator('.split-align-controls button').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        label: node.getAttribute('aria-label') ?? node.textContent?.trim() ?? node.className,
        width: rect.width,
        height: rect.height,
      };
    }),
  );
  for (const target of alignTouchTargets) {
    expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: '快速分割' }).click();
  await expect.poll(async () => {
    return page.locator('.split-preview-canvas').evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      if (canvas.width === 0 || canvas.height === 0) return false;
      const context = canvas.getContext('2d');
      if (!context) return false;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let nonWhitePixels = 0;
      for (let index = 0; index < data.length; index += 4 * 32) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        if (alpha > 0 && (red < 245 || green < 245 || blue < 245)) nonWhitePixels += 1;
        if (nonWhitePixels > 8) return true;
      }
      return false;
    });
  }).toBe(true);
  await expect(page.locator('.split-red-line')).toHaveCount(0);

  const touchScaleBefore = await readCssScale(page, '.split-image-zoom-content');
  const splitInfoBeforePinch = await page.locator('.split-info-value').innerText();
  const longSideBeforePinch = longSideFromSplitInfo(splitInfoBeforePinch);
  await pinchOpenSplitPreview(page);
  await expect.poll(async () => longSideFromSplitInfo(await page.locator('.split-info-value').innerText())).toBeGreaterThan(longSideBeforePinch);
  await expect.poll(async () => readCssScale(page, '.split-image-zoom-content')).toBeCloseTo(touchScaleBefore, 1);

  await page.getByRole('slider', { name: '长边格数' }).fill('24');
  await expect(page.locator('.split-info-value')).toContainText('24');
  await page.getByRole('button', { name: '下一步' }).click();

  await expect(page.getByRole('heading', { name: '浏览' })).toBeVisible();
  await expectNoPageScrollbar(page);
  await expect(page.getByLabel('分割浏览预览')).toBeVisible();
  expect(await page.locator('.split-preview-cell').count()).toBeGreaterThan(20);
  await page.getByRole('button', { name: '导入画布' }).click();

  await expect(page.getByLabel('H5 画布编辑器')).toBeVisible();
  await expectNoPageScrollbar(page);
  await expect(page.getByRole('button', { name: '关闭画布' })).toBeVisible();
  await expect(page.getByRole('button', { name: '手抓移动工具' })).toHaveClass(/active/);
  await expect(page.locator('.h5-image-canvas')).toBeVisible();
  await expect(page.locator('.h5-image-grid-overlay')).toBeVisible();
  expect(await page.locator('.h5-image-grid-overlay .split-grid-line').count()).toBeGreaterThan(10);
  await expect(page.getByRole('button', { name: '导出 STL' })).toHaveCount(0);
  await expect(page.locator('.canvas-status')).toContainText('已导入画布');

  const importedCanvas = await page.locator('.h5-image-canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing canvas context');
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let paintedPixels = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] > 0) paintedPixels += 1;
    }
    return {
      totalPixels: canvas.width * canvas.height,
      paintedPixels,
    };
  });
  expect(importedCanvas.paintedPixels).toBe(importedCanvas.totalPixels);

  const imageCanvas = page.locator('.h5-image-canvas');
  const pixelAt = (x: number, y: number) => imageCanvas.evaluate((node, point) => {
    const canvas = node as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing canvas context');
    return Array.from(context.getImageData(point.x, point.y, 1, 1).data);
  }, { x, y });
  const originPixel = await pixelAt(0, 0);
  const a7Rgba = [254, 139, 76, 255];
  const c8Rgba = [15, 84, 192, 255];
  const paintCode = originPixel.every((channel, index) => channel === a7Rgba[index]) ? 'C8' : 'A7';
  const paintRgba = paintCode === 'A7' ? a7Rgba : c8Rgba;
  const dragCells = await imageCanvas.evaluate((node, selectedRgba) => {
    const canvas = node as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing canvas context');
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const differsFromPaint = (x: number, y: number) => {
      const index = (y * canvas.width + x) * 4;
      return selectedRgba.some((channel, offset) => data[index + offset] !== channel);
    };
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width - 1; x += 1) {
        if (y === 0 && x === 0) continue;
        if (differsFromPaint(x, y) && differsFromPaint(x + 1, y)) {
          return {
            start: { x, y },
            end: { x: x + 1, y },
          };
        }
      }
    }
    throw new Error('Imported canvas has no adjacent pixel pair different from the selected paint color');
  }, paintRgba);
  const imageCanvasBox = await imageCanvas.boundingBox();
  expect(imageCanvasBox).not.toBeNull();
  const imageCanvasSize = await imageCanvas.evaluate((node) => ({
    width: (node as HTMLCanvasElement).width,
    height: (node as HTMLCanvasElement).height,
  }));
  const cellCenter = (x: number, y: number) => ({
    x: imageCanvasBox!.x + ((x + 0.5) * imageCanvasBox!.width) / imageCanvasSize.width,
    y: imageCanvasBox!.y + ((y + 0.5) * imageCanvasBox!.height) / imageCanvasSize.height,
  });
  const dragAcrossImageCells = async (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const startCenter = cellCenter(start.x, start.y);
    const endCenter = cellCenter(end.x, end.y);
    await page.mouse.move(startCenter.x, startCenter.y);
    await page.mouse.down();
    await page.mouse.move(endCenter.x, endCenter.y, { steps: 4 });
    await page.mouse.up();
  };

  await page.getByRole('button', { name: `选择色号 ${paintCode}`, exact: true }).click();
  await expect(page.locator('.canvas-status')).toContainText(`已选择色号 ${paintCode}`);

  const edgeExitStart = cellCenter(Math.min(2, imageCanvasSize.width - 1), 0);
  await page.mouse.move(edgeExitStart.x, edgeExitStart.y);
  await page.mouse.down();
  await page.mouse.move(imageCanvasBox!.x - 30, edgeExitStart.y, { steps: 1 });
  await page.mouse.up();
  await expect.poll(() => pixelAt(0, 0)).toEqual(originPixel);

  const originCenter = cellCenter(0, 0);
  await page.mouse.click(originCenter.x, originCenter.y);
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect.poll(() => pixelAt(0, 0)).toEqual(paintRgba);

  await dragAcrossImageCells(dragCells.start, dragCells.end);
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect.poll(() => pixelAt(dragCells.start.x, dragCells.start.y)).toEqual(paintRgba);
  await expect.poll(() => pixelAt(dragCells.end.x, dragCells.end.y)).toEqual(paintRgba);

  await page.getByRole('button', { name: '橡皮工具' }).click();
  await page.mouse.click(originCenter.x, originCenter.y);
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect.poll(() => pixelAt(0, 0)).toEqual([0, 0, 0, 0]);

  await dragAcrossImageCells(dragCells.start, dragCells.end);
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect.poll(() => pixelAt(dragCells.start.x, dragCells.start.y)).toEqual([0, 0, 0, 0]);
  await expect.poll(() => pixelAt(dragCells.end.x, dragCells.end.y)).toEqual([0, 0, 0, 0]);

  const transformBefore = await page.locator('.react-transform-component').evaluate((node) => getComputedStyle(node).transform);
  await page.getByRole('button', { name: '放大画布' }).click();
  await page.waitForTimeout(250);
  const transformAfter = await page.locator('.react-transform-component').evaluate((node) => getComputedStyle(node).transform);
  expect(transformAfter).not.toBe(transformBefore);

  for (const code of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']) {
    await expect(page.getByRole('button', { name: `选择色号 ${code}`, exact: true })).toBeVisible();
  }

  const hasPageOverflow = await page.locator('body').evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasPageOverflow).toBe(false);
});

test('opens a reference image only after uploading one from the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);

  await expect(page.locator('.canvas-reference-window')).toHaveCount(0);
  await page.getByRole('button', { name: '上传参考图' }).click();
  await page.locator('input[aria-label="参考图文件"]').setInputFiles(uploadFixture);

  await expect(page.locator('.canvas-reference-window')).toBeVisible();
  await expect(page.locator('.canvas-reference-window img')).toHaveAttribute('src', /^blob:/);
  await page.getByRole('button', { name: '关闭参考图' }).click();
  await expect(page.locator('.canvas-reference-window')).toHaveCount(0);

  await page.getByRole('button', { name: '上传参考图' }).click();
  await page.locator('input[aria-label="参考图文件"]').setInputFiles(uploadFixture);
  await expect(page.locator('.canvas-reference-window')).toBeVisible();
  await page.getByRole('button', { name: '关闭画布' }).click();
  await createBlankCanvasFromHome(page, 18, 18);
  await expect(page.locator('.canvas-reference-window')).toHaveCount(0);

  await page.getByRole('button', { name: '上传参考图' }).click();
  const referenceInput = page.locator('input[aria-label="参考图文件"]');
  await referenceInput.setInputFiles(path.resolve('package.json'));
  await expect(page.locator('.canvas-status')).toContainText('请上传 PNG、JPG 或 WebP 参考图');
  await expect(referenceInput).toHaveJSProperty('value', '');
});

test('keeps imported canvas cell size stable when moving from phone to iPad viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '导入画布' }).click();
  await expect(page.getByLabel('H5 画布编辑器')).toBeVisible();

  const phoneCellSize = await page.locator('.h5-image-artboard').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const canvas = node.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('Missing imported image canvas');
    return rect.width / canvas.width;
  });

  await page.setViewportSize({ width: 820, height: 1180 });

  const ipadCellSize = await page.locator('.h5-image-artboard').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const canvas = node.querySelector('canvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('Missing imported image canvas');
    return rect.width / canvas.width;
  });

  expect(ipadCellSize).toBeCloseTo(phoneCellSize, 1);
});

test('shows bead color codes only after zooming into grid cells', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page, 32, 32);
  await page.getByRole('button', { name: '画笔工具' }).click();

  await page.getByRole('button', { name: '选择色号 H2', exact: true }).click();
  await page.getByRole('button', { name: '格子 1,1', exact: true }).click();
  await page.getByRole('button', { name: '选择色号 H7', exact: true }).click();
  await page.getByRole('button', { name: '格子 2,1', exact: true }).click();

  await expect(page.locator('.h5-cell-code').first()).toBeHidden();
  await page.getByRole('button', { name: '放大画布' }).click();
  await page.getByRole('button', { name: '放大画布' }).click();
  await page.getByRole('button', { name: '放大画布' }).click();

  const lightCode = page.getByRole('button', { name: '格子 1,1', exact: true }).locator('.h5-cell-code');
  const darkCode = page.getByRole('button', { name: '格子 2,1', exact: true }).locator('.h5-cell-code');
  await expect(lightCode).toBeVisible();
  await expect(lightCode).toContainText('H2');
  await expect(lightCode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(lightCode).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(lightCode).toHaveCSS('text-shadow', 'none');
  await expect(darkCode).toContainText('H7');
  await expect(darkCode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(darkCode).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(darkCode).toHaveCSS('text-shadow', 'none');
});

test('shows imported canvas color codes only after zooming in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '导入画布' }).click();
  await expect(page.locator('.h5-image-canvas')).toBeVisible();

  await expect(page.locator('.h5-image-cell-code').first()).toBeHidden();
  await page.getByRole('button', { name: '放大画布' }).click();
  await page.getByRole('button', { name: '放大画布' }).click();
  await page.getByRole('button', { name: '放大画布' }).click();

  await expect(page.locator('.h5-image-cell-code').first()).toBeVisible();
  await expect(page.locator('.h5-image-cell-code').first()).toContainText(/^[A-Z]\d+/);
  const contrastCells = await page.locator('.h5-image-canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Missing imported image canvas context');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let lightIndex = -1;
    let darkIndex = -1;
    const relativeChannel = (channel: number) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    for (let index = 0; index < canvas.width * canvas.height; index += 1) {
      const offset = index * 4;
      if ((pixels[offset + 3] ?? 0) === 0) continue;
      const luminance =
        0.2126 * relativeChannel(pixels[offset] ?? 0) +
        0.7152 * relativeChannel(pixels[offset + 1] ?? 0) +
        0.0722 * relativeChannel(pixels[offset + 2] ?? 0);
      if (lightIndex < 0 && luminance > 0.179) lightIndex = index;
      if (darkIndex < 0 && luminance <= 0.179) darkIndex = index;
      if (lightIndex >= 0 && darkIndex >= 0) break;
    }
    if (lightIndex < 0 || darkIndex < 0) {
      throw new Error('Imported fixture must contain both light and dark cells');
    }
    return { lightIndex, darkIndex };
  });
  const importedCodes = page.locator('.h5-image-cell-code');
  const lightImportedCode = importedCodes.nth(contrastCells.lightIndex);
  const darkImportedCode = importedCodes.nth(contrastCells.darkIndex);
  await expect(lightImportedCode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(lightImportedCode).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(lightImportedCode).toHaveCSS('text-shadow', 'none');
  await expect(darkImportedCode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(darkImportedCode).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(darkImportedCode).toHaveCSS('text-shadow', 'none');
  const importedPseudoBackgrounds = await Promise.all([
    lightImportedCode.evaluate((node) => getComputedStyle(node, '::before').backgroundColor),
    darkImportedCode.evaluate((node) => getComputedStyle(node, '::before').backgroundColor),
  ]);
  expect(importedPseudoBackgrounds).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
  const codeCellMetrics = await page.locator('.h5-image-artboard').evaluate((node) => {
    const artboardRect = node.getBoundingClientRect();
    const canvas = node.querySelector('canvas') as HTMLCanvasElement | null;
    const codeCell = node.querySelector('.h5-image-cell-code') as HTMLElement | null;
    if (!canvas || !codeCell) throw new Error('Missing imported canvas code overlay');
    const codeRect = codeCell.getBoundingClientRect();
    const codeStyle = getComputedStyle(codeCell);
    return {
      expectedCellWidth: artboardRect.width / canvas.width,
      expectedCellHeight: artboardRect.height / canvas.height,
      codeWidth: codeRect.width,
      codeHeight: codeRect.height,
      codeFontSize: Number.parseFloat(codeStyle.fontSize),
      codeFontWeight: Number.parseInt(codeStyle.fontWeight, 10),
    };
  });
  expect(codeCellMetrics.codeWidth).toBeCloseTo(codeCellMetrics.expectedCellWidth, 0);
  expect(codeCellMetrics.codeHeight).toBeCloseTo(codeCellMetrics.expectedCellHeight, 0);
  expect(codeCellMetrics.codeFontSize).toBeLessThanOrEqual(4);
  expect(codeCellMetrics.codeFontWeight).toBeLessThanOrEqual(720);
});

test('shows canvas row and column rulers for counting grid cells', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page, 32, 32);

  await expect(page.getByLabel('画布列标 1', { exact: true })).toBeVisible();
  await expect(page.getByLabel('画布列标 6', { exact: true })).toBeVisible();
  await expect(page.getByLabel('画布列标 31', { exact: true })).toBeVisible();
  await expect(page.getByLabel('画布行标 1', { exact: true })).toBeVisible();
  await expect(page.getByLabel('画布行标 6', { exact: true })).toBeVisible();
  await expect(page.getByLabel('画布行标 31', { exact: true })).toBeVisible();

  const firstCellClassBefore = await page.getByRole('button', { name: '格子 1,1', exact: true }).getAttribute('class');
  await page.getByLabel('画布列标 1', { exact: true }).click({ force: true });
  await page.getByLabel('画布行标 1', { exact: true }).click({ force: true });
  await expect(page.getByRole('button', { name: '格子 1,1', exact: true })).toHaveClass(firstCellClassBefore ?? '');
});

test('fits a default grid canvas inside a narrow phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await createBlankCanvasFromHome(page, 32, 32);

  const metrics = await page.locator('.canvas-workbench').evaluate((node) => {
    const wrapper = node.querySelector('.react-transform-wrapper')?.getBoundingClientRect();
    const artboard = node.querySelector('.h5-artboard')?.getBoundingClientRect();
    const firstRowLabel = node.querySelector('[aria-label="画布行标 1"]')?.getBoundingClientRect();
    if (!wrapper || !artboard || !firstRowLabel) throw new Error('Missing transform wrapper, grid artboard, or row ruler');
    return {
      wrapperLeft: wrapper.left,
      wrapperRight: wrapper.right,
      artboardLeft: artboard.left,
      artboardRight: artboard.right,
      rowLabelLeft: firstRowLabel.left,
      rowLabelRight: firstRowLabel.right,
    };
  });
  expect(metrics.artboardLeft).toBeGreaterThanOrEqual(metrics.wrapperLeft);
  expect(metrics.artboardRight).toBeLessThanOrEqual(metrics.wrapperRight);
  expect(metrics.rowLabelLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.rowLabelRight).toBeLessThanOrEqual(metrics.artboardLeft);
});

test('keeps editable grid cells inside compact artboards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page, 18, 18);

  const metrics = await page.locator('.h5-artboard').evaluate((node) => {
    const artboard = node.getBoundingClientRect();
    const cells = Array.from(node.querySelectorAll('.h5-canvas-cell'));
    const first = cells.at(0)?.getBoundingClientRect();
    const last = cells.at(-1)?.getBoundingClientRect();
    if (!first || !last) throw new Error('Missing editable grid cells');
    return {
      artboardLeft: artboard.left,
      artboardRight: artboard.right,
      artboardBottom: artboard.bottom,
      firstLeft: first.left,
      lastRight: last.right,
      lastBottom: last.bottom,
    };
  });
  expect(metrics.firstLeft).toBeGreaterThanOrEqual(metrics.artboardLeft);
  expect(metrics.lastRight).toBeLessThanOrEqual(metrics.artboardRight);
  expect(metrics.lastBottom).toBeLessThanOrEqual(metrics.artboardBottom);
});

test('keeps mobile canvas labels compact and clear of the toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page, 18, 18);

  const chromeMetrics = await page.locator('.canvas-workbench').evaluate((node) => {
    const rail = node.querySelector('.canvas-rail')?.getBoundingClientRect();
    const wrapper = node.querySelector('.react-transform-wrapper')?.getBoundingClientRect();
    if (!rail || !wrapper) throw new Error('Missing canvas toolbar or transform wrapper');
    return {
      gapBelowWrapper: rail.top - wrapper.bottom,
    };
  });
  expect(chromeMetrics.gapBelowWrapper).toBeGreaterThanOrEqual(12);

  await page.getByRole('button', { name: '选择色号 A7', exact: true }).click();
  const statusMetrics = await page.locator('.canvas-workbench').evaluate((node) => {
    const rail = node.querySelector('.canvas-rail')?.getBoundingClientRect();
    const status = node.querySelector('.canvas-status')?.getBoundingClientRect();
    if (!rail || !status) throw new Error('Missing canvas toolbar or status');
    return {
      statusBottom: status.bottom,
      railTop: rail.top,
    };
  });
  expect(statusMetrics.statusBottom).toBeLessThanOrEqual(statusMetrics.railTop - 8);

  const topbarMetrics = await page.locator('.canvas-topbar').evaluate((node) => {
    const topbar = node.getBoundingClientRect();
    const controls = Array.from(node.querySelectorAll('.top-icon-btn, .canvas-size-pill, .current-color-dot'))
      .map((child) => child.getBoundingClientRect());
    return {
      topbarLeft: topbar.left,
      topbarRight: topbar.right,
      controlsLeft: Math.min(...controls.map((rect) => rect.left)),
      controlsRight: Math.max(...controls.map((rect) => rect.right)),
    };
  });
  expect(topbarMetrics.controlsLeft).toBeGreaterThanOrEqual(topbarMetrics.topbarLeft + 8);
  expect(topbarMetrics.controlsRight).toBeLessThanOrEqual(topbarMetrics.topbarRight - 8);

  await page.setViewportSize({ width: 320, height: 700 });
  const narrowTopbarMetrics = await page.locator('.canvas-topbar').evaluate((node) => {
    const topbar = node.getBoundingClientRect();
    const controls = Array.from(node.querySelectorAll('.top-icon-btn, .canvas-size-pill, .current-color-dot'))
      .map((child) => child.getBoundingClientRect());
    const leftGroup = node.querySelector('.topbar-left')?.getBoundingClientRect();
    const centerGroup = node.querySelector('.topbar-center')?.getBoundingClientRect();
    const rightGroup = node.querySelector('.topbar-right')?.getBoundingClientRect();
    if (!leftGroup || !centerGroup || !rightGroup) throw new Error('Missing topbar group');
    return {
      topbarLeft: topbar.left,
      topbarRight: topbar.right,
      controlsLeft: Math.min(...controls.map((rect) => rect.left)),
      controlsRight: Math.max(...controls.map((rect) => rect.right)),
      leftRight: leftGroup.right,
      centerLeft: centerGroup.left,
      centerRight: centerGroup.right,
      rightLeft: rightGroup.left,
    };
  });
  expect(narrowTopbarMetrics.controlsLeft).toBeGreaterThanOrEqual(narrowTopbarMetrics.topbarLeft + 6);
  expect(narrowTopbarMetrics.controlsRight).toBeLessThanOrEqual(narrowTopbarMetrics.topbarRight - 6);
  expect(narrowTopbarMetrics.leftRight).toBeLessThanOrEqual(narrowTopbarMetrics.centerLeft);
  expect(narrowTopbarMetrics.centerRight).toBeLessThanOrEqual(narrowTopbarMetrics.rightLeft);
  await page.setViewportSize({ width: 390, height: 844 });

  const paletteMetrics = await page.locator('.palette-strip').evaluate((node) => {
    const strip = node.getBoundingClientRect();
    const sixthColor = node.children.item(5)?.getBoundingClientRect();
    if (!sixthColor) throw new Error('Missing sixth palette color');
    return {
      stripLeft: strip.left,
      stripRight: strip.right,
      sixthLeft: sixthColor.left,
      sixthRight: sixthColor.right,
    };
  });
  expect(paletteMetrics.sixthLeft).toBeGreaterThanOrEqual(paletteMetrics.stripLeft);
  expect(paletteMetrics.sixthRight).toBeLessThanOrEqual(paletteMetrics.stripRight);

  const rulerMetrics = await page.getByLabel('画布列标 1', { exact: true }).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: Number.parseInt(style.fontWeight, 10),
      width: rect.width,
      height: rect.height,
    };
  });
  expect(rulerMetrics.fontSize).toBeLessThanOrEqual(7.5);
  expect(rulerMetrics.fontWeight).toBeLessThanOrEqual(720);
  expect(rulerMetrics.width).toBeLessThanOrEqual(15);
  expect(rulerMetrics.height).toBeLessThanOrEqual(14);

  await page.getByRole('button', { name: '画笔工具' }).click();
  await page.getByRole('button', { name: '格子 1,1', exact: true }).click();
  await page.getByRole('button', { name: '放大画布' }).click();
  await page.getByRole('button', { name: '放大画布' }).click();
  await page.getByRole('button', { name: '放大画布' }).click();

  const cellCodeMetrics = await page.locator('.h5-cell-code').first().evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: Number.parseInt(style.fontWeight, 10),
    };
  });
  expect(cellCodeMetrics.fontSize).toBeLessThanOrEqual(4);
  expect(cellCodeMetrics.fontWeight).toBeLessThanOrEqual(720);
});

test('aligns the split grid to an existing pixel drawing before import', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  await expect(page.getByRole('heading', { name: '分割' })).toBeVisible();
  await page.getByRole('button', { name: '对格子' }).click();
  await expect(page.locator('.split-align-readout')).toContainText('格距');
  const initialReadout = await page.locator('.split-align-readout').innerText();
  const [, cellSizeText, offsetXText, offsetYText] = initialReadout.match(/格距 ([\d.]+)px.*偏移 X ([\d.]+) Y ([\d.]+)/) ?? [];
  const [cropWidthText, cropHeightText] = (await page.locator('.split-image-frame').getAttribute('style'))
    ?.match(/aspect-ratio:\s*([\d.]+)\s*\/\s*([\d.]+)/)
    ?.slice(1) ?? [];
  const initialGridSize = gridSizeFromText(await page.locator('.split-info-value').innerText());
  const cellSize = Number(cellSizeText);
  const offsetX = Number(offsetXText);
  const offsetY = Number(offsetYText);
  const cropWidth = Number(cropWidthText);
  const cropHeight = Number(cropHeightText);
  expect(offsetX).toBeCloseTo((cropWidth - initialGridSize.cols * cellSize) / 2, 0);
  expect(offsetY).toBeCloseTo((cropHeight - initialGridSize.rows * cellSize) / 2, 0);
  await expect(page.getByLabel('按住移动网格')).toBeVisible();
  await expect(page.getByLabel('按住缩放网格')).toBeVisible();
  const alignmentHitTargetSizes = await page.locator('.split-grid-handle').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  for (const target of alignmentHitTargetSizes) {
    expect(target.width).toBeGreaterThanOrEqual(42);
    expect(target.height).toBeGreaterThanOrEqual(42);
  }
  const alignmentHandleSizes = await page.locator('.split-grid-handle-ring').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }));
  expect(alignmentHandleSizes).toHaveLength(2);
  for (const handle of alignmentHandleSizes) {
    expect(handle.width).toBeGreaterThanOrEqual(30);
    expect(handle.height).toBeGreaterThanOrEqual(30);
    expect(handle.width).toBeLessThanOrEqual(34);
    expect(handle.height).toBeLessThanOrEqual(34);
  }

  const imageFrameBox = await page.locator('.split-image-frame').boundingBox();
  const controlFrame = page.locator('.split-grid-control-frame');
  await expect(controlFrame).toHaveAttribute('data-grid-span', '6');
  const controlFrameBox = await controlFrame.boundingBox();
  expect(imageFrameBox).not.toBeNull();
  expect(controlFrameBox).not.toBeNull();
  expect(controlFrameBox!.width).toBeCloseTo((imageFrameBox!.width * cellSize * 6) / cropWidth, 0);
  expect(controlFrameBox!.height).toBeCloseTo((imageFrameBox!.height * cellSize * 6) / cropHeight, 0);

  const initialMoveHandleBox = await page.getByLabel('按住移动网格').boundingBox();
  const initialScaleHandleBox = await page.getByLabel('按住缩放网格').boundingBox();
  expect(initialMoveHandleBox).not.toBeNull();
  expect(initialScaleHandleBox).not.toBeNull();
  expect(initialMoveHandleBox!.x + initialMoveHandleBox!.width / 2).toBeCloseTo(controlFrameBox!.x, 0);
  expect(initialMoveHandleBox!.y + initialMoveHandleBox!.height / 2).toBeCloseTo(controlFrameBox!.y, 0);
  expect(initialScaleHandleBox!.x + initialScaleHandleBox!.width / 2).toBeCloseTo(controlFrameBox!.x + controlFrameBox!.width, 0);
  expect(initialScaleHandleBox!.y + initialScaleHandleBox!.height / 2).toBeCloseTo(controlFrameBox!.y + controlFrameBox!.height, 0);

  const beforeSize = gridSizeFromText(await page.locator('.split-info-value').innerText());
  const moveBox = await page.getByLabel('按住移动网格').boundingBox();
  const scaleBoxBeforeMove = await page.getByLabel('按住缩放网格').boundingBox();
  const frameBoxBeforeMove = await page.locator('.split-grid-control-frame').boundingBox();
  expect(moveBox).not.toBeNull();
  expect(scaleBoxBeforeMove).not.toBeNull();
  expect(frameBoxBeforeMove).not.toBeNull();
  const moveStartCenter = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  };
  const expectedMoveDelta = {
    x: Math.min(40, imageFrameBox!.x + imageFrameBox!.width - (frameBoxBeforeMove!.x + frameBoxBeforeMove!.width)),
    y: Math.min(30, imageFrameBox!.y + imageFrameBox!.height - (frameBoxBeforeMove!.y + frameBoxBeforeMove!.height)),
  };
  await page.mouse.move(moveBox!.x + moveBox!.width / 2, moveBox!.y + moveBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBox!.x + moveBox!.width / 2 + 40, moveBox!.y + moveBox!.height / 2 + 30, { steps: 5 });
  const draggingMoveBox = await page.getByLabel('按住移动网格').boundingBox();
  expect(draggingMoveBox).not.toBeNull();
  expect(draggingMoveBox!.x + draggingMoveBox!.width / 2 - moveStartCenter.x).toBeCloseTo(expectedMoveDelta.x, 0);
  expect(draggingMoveBox!.y + draggingMoveBox!.height / 2 - moveStartCenter.y).toBeCloseTo(expectedMoveDelta.y, 0);
  await page.mouse.up();
  const droppedMoveBox = await page.getByLabel('按住移动网格').boundingBox();
  expect(droppedMoveBox).not.toBeNull();
  expect(droppedMoveBox!.x + droppedMoveBox!.width / 2 - moveStartCenter.x).toBeCloseTo(expectedMoveDelta.x, 0);
  expect(droppedMoveBox!.y + droppedMoveBox!.height / 2 - moveStartCenter.y).toBeCloseTo(expectedMoveDelta.y, 0);
  const scaleBoxAfterMove = await page.getByLabel('按住缩放网格').boundingBox();
  const frameBoxAfterMove = await page.locator('.split-grid-control-frame').boundingBox();
  expect(scaleBoxAfterMove).not.toBeNull();
  expect(frameBoxAfterMove).not.toBeNull();
  expect(scaleBoxAfterMove!.x - scaleBoxBeforeMove!.x).toBeCloseTo(expectedMoveDelta.x, 0);
  expect(scaleBoxAfterMove!.y - scaleBoxBeforeMove!.y).toBeCloseTo(expectedMoveDelta.y, 0);
  expect(frameBoxAfterMove!.x - frameBoxBeforeMove!.x).toBeCloseTo(expectedMoveDelta.x, 0);
  expect(frameBoxAfterMove!.y - frameBoxBeforeMove!.y).toBeCloseTo(expectedMoveDelta.y, 0);
  await expect.poll(async () => page.locator('.split-align-readout').innerText()).not.toBe(initialReadout);

  for (let index = 0; index < Math.ceil(cellSize * 2); index += 1) {
    await page.getByRole('button', { name: '右移网格' }).click();
    const readout = await page.locator('.split-align-readout').innerText();
    const [, , currentOffsetXText] = readout.match(/格距 ([\d.]+)px.*偏移 X ([\d.]+) Y ([\d.]+)/) ?? [];
    if (Number(currentOffsetXText) >= cellSize - 2) break;
  }
  await expect.poll(async () => countGridPixelsInCanvasBand(page, 'left')).toBeGreaterThan(1500);
  await expect.poll(async () => countGridPixelsInCanvasBand(page, 'right')).toBeGreaterThan(1500);

  await page.getByRole('button', { name: '重置对格' }).click();
  const movedReadout = await page.locator('.split-align-readout').innerText();
  const frameBeforeScale = await page.locator('.split-grid-control-frame').boundingBox();
  const scaleBox = await page.getByLabel('按住缩放网格').boundingBox();
  expect(frameBeforeScale).not.toBeNull();
  expect(scaleBox).not.toBeNull();
  await page.mouse.move(scaleBox!.x + scaleBox!.width / 2, scaleBox!.y + scaleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(scaleBox!.x + scaleBox!.width / 2 + 60, scaleBox!.y + scaleBox!.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => page.locator('.split-align-readout').innerText()).not.toBe(movedReadout);
  const frameAfterScale = await page.locator('.split-grid-control-frame').boundingBox();
  expect(frameAfterScale).not.toBeNull();
  expect(frameAfterScale!.x).toBeCloseTo(frameBeforeScale!.x, 0);
  expect(frameAfterScale!.y).toBeCloseTo(frameBeforeScale!.y, 0);
  expect(frameAfterScale!.width).toBeGreaterThan(frameBeforeScale!.width);
  expect(frameAfterScale!.height).toBeGreaterThan(frameBeforeScale!.height);
  const scaledReadout = await page.locator('.split-align-readout').innerText();
  const [, scaledCellSizeText] = scaledReadout.match(/格距 ([\d.]+)px/) ?? [];
  const scaledCellSize = Number(scaledCellSizeText);
  expect(frameAfterScale!.width).toBeCloseTo((imageFrameBox!.width * scaledCellSize * 6) / cropWidth, 0);
  expect(frameAfterScale!.height).toBeCloseTo((imageFrameBox!.height * scaledCellSize * 6) / cropHeight, 0);
  const afterSize = gridSizeFromText(await page.locator('.split-info-value').innerText());
  expect(afterSize.cols * afterSize.rows).toBeLessThan(beforeSize.cols * beforeSize.rows);

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByRole('heading', { name: '浏览' })).toBeVisible();
  await expect(page.locator('.split-meta-chip')).toContainText(`${afterSize.cols} × ${afterSize.rows}`);
  await page.getByRole('button', { name: '导入画布' }).click();

  const importedSize = await page.locator('.h5-image-canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    return { cols: canvas.width, rows: canvas.height };
  });
  expect(importedSize).toEqual(afterSize);
});

test('opens upload drawing modal and extracts an image from a Xiaohongshu link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/xiaohongshu/extract', async (route) => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    const body = request.postDataJSON() as { url?: string };
    expect(body.url).toContain('xiaohongshu.com');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        imageDataUrl: `data:image/png;base64,${fs.readFileSync(uploadFixture).toString('base64')}`,
        title: '小红书图纸',
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '上传', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: '上传图纸' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '选择图纸' })).toBeVisible();

  await dialog.getByRole('button', { name: '小红书提取' }).click();
  const loginDialog = page.getByRole('dialog', { name: '登录面板' });
  await expect(loginDialog).toBeVisible();
  await loginFromDialog(loginDialog);
  await expect(loginDialog).toHaveCount(0);
  await dialog.getByRole('textbox', { name: '小红书链接' }).fill('https://www.xiaohongshu.com/explore/test-note');
  await dialog.getByRole('button', { name: '提取图片', exact: true }).click();

  await expect(page.getByRole('heading', { name: '分割' })).toBeVisible();
  await expect(page.getByLabel('分割预览图')).toBeVisible();
  await expect(page.locator('.split-info-value')).toContainText('18');
});

test('opens the upload modal from the profile tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: '我的' }).click();
  await page.getByRole('button', { name: '上传', exact: true }).click();

  await expect(page.getByRole('heading', { name: '超级拼' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '上传图纸' })).toBeVisible();
});

test('keeps login validation messages visible outside the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: '我的' }).click();
  await page.getByRole('button', { name: '登录' }).click();
  await page.getByRole('button', { name: '登录并继续' }).click();

  await expect(page.getByRole('status')).toContainText('请输入用户名和密码。');
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 4000 });
});

test('ignores late Xiaohongshu extraction responses after closing the upload modal', async ({ page }) => {
  const imageDataUrl = `data:image/png;base64,${fs.readFileSync(uploadFixture).toString('base64')}`;
  let releaseExtraction!: () => void;
  const extractionReleased = new Promise<void>((resolve) => {
    releaseExtraction = resolve;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/xiaohongshu/extract', async (route) => {
    await extractionReleased;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        imageDataUrl,
        title: '迟到的小红书图纸',
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '上传', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '上传图纸' });
  await dialog.getByRole('button', { name: '小红书提取' }).click();
  const loginDialog = page.getByRole('dialog', { name: '登录面板' });
  await expect(loginDialog).toBeVisible();
  await loginFromDialog(loginDialog);
  await dialog.getByRole('textbox', { name: '小红书链接' }).fill('https://www.xiaohongshu.com/explore/test-note');
  await dialog.getByRole('button', { name: '提取图片', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '提取中...' })).toBeVisible();

  await dialog.getByRole('button', { name: '关闭上传图纸' }).click();
  releaseExtraction();

  await expect(page.getByRole('dialog', { name: '上传图纸' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '分割' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '超级拼' })).toBeVisible();
});

test('lets users choose one image when Xiaohongshu extraction returns multiple note images', async ({ page }) => {
  const imageDataUrl = `data:image/png;base64,${fs.readFileSync(uploadFixture).toString('base64')}`;
  let imageDownloadCount = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/xiaohongshu/extract', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        imageUrl: 'https://ci.xiaohongshu.com/note-1',
        title: '多图笔记',
        images: [
          { imageUrl: 'https://ci.xiaohongshu.com/note-1' },
          { imageUrl: 'https://ci.xiaohongshu.com/note-2' },
        ],
      }),
    });
  });
  await page.route('**/api/xiaohongshu/image', async (route) => {
    imageDownloadCount += 1;
    const body = route.request().postDataJSON() as { imageUrl?: string };
    expect(body.imageUrl).toBe('https://ci.xiaohongshu.com/note-2');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ imageDataUrl }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: '上传', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '上传图纸' });
  await dialog.getByRole('button', { name: '小红书提取' }).click();
  const loginDialog = page.getByRole('dialog', { name: '登录面板' });
  await expect(loginDialog).toBeVisible();
  await loginFromDialog(loginDialog);
  await dialog.getByRole('textbox', { name: '小红书链接' }).fill('https://www.xiaohongshu.com/explore/test-note');
  await dialog.getByRole('button', { name: '提取图片', exact: true }).click();

  await expect(dialog.getByText('选择笔记图片')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '选择第 2 张小红书图片' })).toBeVisible();
  await expect(dialog.locator('.xhs-image-grid img').first()).toHaveAttribute('src', /\/api\/xiaohongshu\/proxy\?url=/);
  await expect(dialog.locator('.xhs-image-grid img').first()).not.toHaveAttribute('src', /^https:\/\/ci\.xiaohongshu\.com/);
  expect(imageDownloadCount).toBe(0);
  await dialog.getByRole('button', { name: '选择第 2 张小红书图片' }).click();
  await expect(page.getByRole('heading', { name: '分割' })).toBeVisible();
  expect(imageDownloadCount).toBe(1);
});

test('shows STL export only in the peg board workflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: /敲豆豆图纸/ }).click();
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '导入画布' }).click();

  await expect(page.getByLabel('H5 画布编辑器')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 STL' })).toBeVisible();
});

test('logs in from profile and manages bead warehouse stock by count and grams', async ({ page }) => {
  const warehouseName = `MARD 常用色仓库 ${Date.now()}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: '我的' }).click();
  await page.getByRole('button', { name: /豆子仓库/ }).click();
  const loginDialog = page.getByRole('dialog', { name: '登录面板' });
  await expect(loginDialog).toBeVisible();
  await loginFromDialog(loginDialog);

  await expect(page.getByLabel('豆子仓库')).toBeVisible();
  await page.getByLabel('仓库列表').getByRole('button', { name: '新建豆子仓库' }).click();
  const warehouseDialog = page.getByRole('dialog', { name: '新建豆子仓库' });
  await warehouseDialog.getByRole('textbox', { name: '仓库名称' }).fill(warehouseName);
  await warehouseDialog.getByRole('textbox', { name: '仓库备注' }).fill('E2E');
  await warehouseDialog.getByRole('button', { name: '创建仓库' }).click();
  await expect(page.getByRole('button', { name: warehouseName })).toBeVisible();

  await page.getByRole('button', { name: /^A1 库存 0 颗$/ }).click();
  await page.getByRole('button', { name: /^A2 库存 0 颗$/ }).click();
  await page.getByRole('spinbutton', { name: '数量' }).fill('30');
  await page.getByRole('button', { name: '入库' }).click();
  await expect(page.getByRole('button', { name: /^A1 库存 30 颗$/ })).toContainText('30颗');
  await expect(page.getByRole('button', { name: /^A2 库存 30 颗$/ })).toContainText('30颗');

  await page.getByRole('button', { name: '按克' }).click();
  await page.getByRole('spinbutton', { name: '数量' }).fill('1');
  await page.getByRole('button', { name: '出库' }).click();
  await expect(page.getByRole('button', { name: /^A1 库存 15 颗$/ })).toContainText('15颗');
  await expect(page.getByRole('button', { name: /^A2 库存 15 颗$/ })).toContainText('15颗');
});

test('rejects invalid warehouse inventory mutations', async ({ request }) => {
  const loginResponse = await request.post('/api/auth/login', {
    data: { username: testUsername, password: testPassword },
  });
  expect(loginResponse.ok()).toBe(true);
  const { token } = (await loginResponse.json()) as { token: string };

  const warehouseResponse = await request.post('/api/warehouses', {
    headers: { authorization: `Bearer ${token}` },
    data: { name: 'API 校验仓库', remark: 'E2E' },
  });
  expect(warehouseResponse.ok()).toBe(true);
  const { warehouse } = (await warehouseResponse.json()) as { warehouse: { id: string } };

  const invalidCodeResponse = await request.post(`/api/warehouses/${warehouse.id}/inventory`, {
    headers: { authorization: `Bearer ${token}` },
    data: { codes: ['Z99'], type: 'in', quantity: 1, inputUnit: 'count', inputValue: 1 },
  });
  expect(invalidCodeResponse.status()).toBe(400);

  const invalidQuantityResponse = await request.post(`/api/warehouses/${warehouse.id}/inventory`, {
    headers: { authorization: `Bearer ${token}` },
    data: { codes: ['A1'], type: 'in', quantity: 0, inputUnit: 'count', inputValue: 0 },
  });
  expect(invalidQuantityResponse.status()).toBe(400);

  const invalidTypeResponse = await request.post(`/api/warehouses/${warehouse.id}/inventory`, {
    headers: { authorization: `Bearer ${token}` },
    data: { codes: ['A1'], type: 'increase', quantity: 1, inputUnit: 'count', inputValue: 1 },
  });
  expect(invalidTypeResponse.status()).toBe(400);

  const overdrawResponse = await request.post(`/api/warehouses/${warehouse.id}/inventory`, {
    headers: { authorization: `Bearer ${token}` },
    data: { codes: ['A1'], type: 'out', quantity: 1, inputUnit: 'count', inputValue: 1 },
  });
  expect(overdrawResponse.status()).toBe(400);

  const seedResponse = await request.post(`/api/warehouses/${warehouse.id}/inventory`, {
    headers: { authorization: `Bearer ${token}` },
    data: { codes: ['A1'], type: 'in', quantity: 5, inputUnit: 'count', inputValue: 5 },
  });
  expect(seedResponse.ok()).toBe(true);

  const partialOverdrawResponse = await request.post(`/api/warehouses/${warehouse.id}/inventory`, {
    headers: { authorization: `Bearer ${token}` },
    data: { codes: ['A1', 'A2'], type: 'out', quantity: 1, inputUnit: 'count', inputValue: 1 },
  });
  expect(partialOverdrawResponse.status()).toBe(400);

  const inventoryResponse = await request.get(`/api/warehouses/${warehouse.id}/inventory`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const { inventory } = (await inventoryResponse.json()) as { inventory: Record<string, number> };
  expect(inventory.A1).toBe(5);
  expect(inventory.A2 ?? 0).toBe(0);
});

test('keeps existing admin sessions valid after another admin login', async ({ request }) => {
  const firstLogin = await request.post('/api/auth/login', {
    data: { username: testUsername, password: testPassword },
  });
  expect(firstLogin.ok()).toBe(true);
  const { token: firstToken } = (await firstLogin.json()) as { token: string };

  const secondLogin = await request.post('/api/auth/login', {
    data: { username: testUsername, password: testPassword },
  });
  expect(secondLogin.ok()).toBe(true);

  const meResponse = await request.get('/api/me', {
    headers: { authorization: `Bearer ${firstToken}` },
  });
  expect(meResponse.ok()).toBe(true);
  const { user } = (await meResponse.json()) as { user: { username: string } };
  expect(user.username).toBe(testUsername);
});

test('rejects malformed API JSON bodies as client errors', async ({ request }) => {
  const response = await request.post('/api/auth/login', {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('{"username":'),
  });

  expect(response.status()).toBe(400);
});

test('edits a preset H5 grid canvas with brush, eraser, fill, and bottom palette', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);

  await expect(page.locator('.h5-image-canvas')).toHaveCount(0);
  await expect(page.locator('.h5-canvas-grid')).toBeVisible();
  await expect(page.locator('.h5-canvas-cell')).toHaveCount(32 * 32);

  const toolbarButtons = page.locator('.canvas-rail .rail-tool');
  await expect(toolbarButtons.first()).toHaveAccessibleName('手抓移动工具');
  await expect(toolbarButtons.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(toolbarButtons.first().locator('svg')).toHaveCount(1);
  await expect(page.locator('.canvas-stage')).toHaveCSS('cursor', 'grab');

  const keyboardCell = page.locator('.h5-canvas-cell').nth(299);
  await page.getByRole('button', { name: '画笔工具' }).click();
  await page.getByRole('button', { name: '选择色号 A7' }).click();
  await expect(page.locator('.canvas-status')).toContainText('已选择色号 A7');
  await keyboardCell.focus();
  await page.keyboard.press('Enter');
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect(keyboardCell).toHaveCSS('background-color', 'rgb(254, 139, 76)');

  await page.getByRole('button', { name: '选择色号 A7' }).click();
  await expect(page.locator('.canvas-status')).toContainText('已选择色号 A7');
  await page.getByRole('button', { name: '橡皮工具' }).click();
  await expect(page.locator('.canvas-status')).toContainText('已选择色号 A7');
  await keyboardCell.focus();
  await page.keyboard.press('Enter');
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect(keyboardCell).toHaveClass(/transparent/);

  const panKeyboardCell = page.locator('.h5-canvas-cell').nth(298);
  await page.getByRole('button', { name: '选择色号 A7' }).click();
  await expect(page.locator('.canvas-status')).toContainText('已选择色号 A7');
  await page.getByRole('button', { name: '手抓移动工具' }).click();
  await expect(page.getByRole('button', { name: '手抓移动工具' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.canvas-status')).toContainText('已选择色号 A7');
  await panKeyboardCell.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.canvas-status')).toContainText('已选择色号 A7');
  await expect(panKeyboardCell).toHaveClass(/transparent/);

  await page.getByRole('button', { name: '选择色号 A7' }).click();
  const fastDragStart = await page.getByRole('button', { name: '格子 1,2', exact: true }).boundingBox();
  const fastDragEnd = await page.getByRole('button', { name: '格子 10,2', exact: true }).boundingBox();
  expect(fastDragStart).not.toBeNull();
  expect(fastDragEnd).not.toBeNull();
  await page.mouse.move(fastDragStart!.x + fastDragStart!.width / 2, fastDragStart!.y + fastDragStart!.height / 2);
  await page.mouse.down();
  await page.mouse.move(fastDragEnd!.x + fastDragEnd!.width / 2, fastDragEnd!.y + fastDragEnd!.height / 2, { steps: 1 });
  await page.mouse.up();
  for (let col = 1; col <= 10; col += 1) {
    await expect(page.getByRole('button', { name: `格子 ${col},2`, exact: true })).toHaveCSS('background-color', 'rgb(254, 139, 76)');
  }
  await page.getByRole('button', { name: '手抓移动工具' }).click();

  const transformMatrix = async () =>
    page.locator('.react-transform-component').evaluate((node) => getComputedStyle(node).transform);
  const dragStage = async (dx: number, dy: number) => {
    const box = await page.locator('.h5-canvas-grid').boundingBox();
    expect(box, 'grid box for pan drag').not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 8 });
    await page.mouse.up();
  };

  const beforePanMatrix = await transformMatrix();
  const panDragCellIndexes = [360, 361, 362];
  for (const index of panDragCellIndexes) {
    await expect(page.locator('.h5-canvas-cell').nth(index), `pan precheck ${index}`).toHaveClass(/transparent/);
  }
  await expect(page.locator('.canvas-stage')).toHaveCSS('cursor', 'grab');
  await dragStage(48, 28);
  await expect.poll(transformMatrix).not.toBe(beforePanMatrix);
  for (const index of panDragCellIndexes) {
    await expect(page.locator('.h5-canvas-cell').nth(index), `pan leaves cell ${index}`).toHaveClass(/transparent/);
  }

  await page.getByRole('button', { name: '选择色号 A7' }).click();
  await expect(page.locator('.canvas-status')).toContainText('已选择色号 A7');
  await page.locator('.h5-canvas-cell').nth(300).click();
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect(page.locator('.h5-canvas-cell').nth(300)).not.toHaveClass(/transparent/);
  await expect(page.locator('.h5-canvas-cell').nth(300)).toHaveCSS('background-color', 'rgb(254, 139, 76)');

  await page.locator('.h5-canvas-cell').nth(300).click();
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect(page.locator('.h5-canvas-cell').nth(300)).not.toHaveClass(/transparent/);
  await expect(page.locator('.h5-canvas-cell').nth(300)).toHaveCSS('background-color', 'rgb(254, 139, 76)');

  const dragCellIndexes = [165, 166, 167, 168];
  const dragAcrossGridCells = async (indexes: number[]) => {
    const boxes = [];
    for (const index of indexes) {
      const box = await page.locator('.h5-canvas-cell').nth(index).boundingBox();
      expect(box, `cell ${index} box`).not.toBeNull();
      boxes.push(box!);
    }
    await page.mouse.move(boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2);
    await page.mouse.down();
    for (const box of boxes.slice(1)) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    }
    await page.mouse.up();
  };

  await dragAcrossGridCells(dragCellIndexes);
  expect(await page.locator('.canvas-status').count()).toBe(0);
  for (const index of dragCellIndexes) {
    await expect(page.locator('.h5-canvas-cell').nth(index), `brush dragged over ${index}`).not.toHaveClass(/transparent/);
    await expect(page.locator('.h5-canvas-cell').nth(index), `brush dragged A7 over ${index}`).toHaveCSS('background-color', 'rgb(254, 139, 76)');
  }
  await page.getByRole('button', { name: '撤销' }).click();
  for (const index of dragCellIndexes) {
    await expect(page.locator('.h5-canvas-cell').nth(index), `undo brush stroke ${index}`).toHaveClass(/transparent/);
  }
  await dragAcrossGridCells(dragCellIndexes);
  expect(await page.locator('.canvas-status').count()).toBe(0);
  for (const index of dragCellIndexes) {
    await expect(page.locator('.h5-canvas-cell').nth(index), `brush repainted A7 over ${index}`).toHaveCSS('background-color', 'rgb(254, 139, 76)');
  }
  await page.getByRole('button', { name: '橡皮工具' }).click();
  await dragAcrossGridCells(dragCellIndexes);
  expect(await page.locator('.canvas-status').count()).toBe(0);
  for (const index of dragCellIndexes) {
    await expect(page.locator('.h5-canvas-cell').nth(index), `eraser dragged over ${index}`).toHaveClass(/transparent/);
  }
  await page.getByRole('button', { name: '画笔工具' }).click();

  const singleClickCell = page.locator('.h5-canvas-cell').nth(301);
  await singleClickCell.click();
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(singleClickCell).toHaveClass(/transparent/);

  await singleClickCell.click();
  await expect(singleClickCell).not.toHaveClass(/transparent/);

  await page.getByRole('button', { name: '橡皮工具' }).click();
  await singleClickCell.click();
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect(singleClickCell).toHaveClass(/transparent/);

  await singleClickCell.click();
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect(singleClickCell).toHaveClass(/transparent/);

  await page.getByRole('button', { name: '填充工具' }).click();
  await page.locator('.h5-canvas-cell').nth(0).click();
  await expect(page.locator('.canvas-status')).toContainText(/已填充/);

  const paletteMetrics = await page.locator('.palette-strip').evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  expect(paletteMetrics.scrollWidth).toBeGreaterThan(paletteMetrics.clientWidth);

  await page.getByRole('button', { name: '筛选色卡' }).click();
  const paletteDialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  await paletteDialog.getByRole('searchbox', { name: '搜索色号' }).fill('M15');
  await paletteDialog.getByRole('button', { name: /选择色号 M15/ }).click();
  await page.locator('.h5-canvas-cell').nth(301).click();
  expect(await page.locator('.canvas-status').count()).toBe(0);
  await expect(page.locator('.h5-canvas-cell').nth(301)).toHaveCSS('background-color', 'rgb(117, 125, 120)');
});

test('resets new canvases to pan tool after editing another canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);

  await page.getByRole('button', { name: '选择色号 A7', exact: true }).click();
  await expect(page.getByRole('button', { name: '画笔工具' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '关闭画布' }).click();

  await createBlankCanvasFromHome(page);
  await expect(page.getByRole('button', { name: '手抓移动工具' })).toHaveAttribute('aria-pressed', 'true');
});

test('does not paint when a two-finger pinch starts on the grid canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page, 10, 10);

  const firstCell = page.getByRole('button', { name: '格子 1,1', exact: true });
  await page.getByRole('button', { name: '选择色号 A7', exact: true }).click();
  await expect(page.getByRole('button', { name: '画笔工具' })).toHaveAttribute('aria-pressed', 'true');
  await twoFingerPinchOnGridCell(page, '格子 1,1');

  await expect(firstCell).toHaveClass(/transparent/);
});

test('does not connect brush strokes across off-canvas gaps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page, 10, 10);

  await page.getByRole('button', { name: '选择色号 A7', exact: true }).click();
  const start = await page.getByRole('button', { name: '格子 1,1', exact: true }).boundingBox();
  const end = await page.getByRole('button', { name: '格子 5,5', exact: true }).boundingBox();
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();

  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(start!.x - 30, start!.y - 30, { steps: 2 });
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, { steps: 1 });
  await page.mouse.up();

  await expect(page.getByRole('button', { name: '格子 1,1', exact: true })).toHaveCSS('background-color', 'rgb(254, 139, 76)');
  await expect(page.getByRole('button', { name: '格子 5,5', exact: true })).toHaveCSS('background-color', 'rgb(254, 139, 76)');
  for (const name of ['格子 2,2', '格子 3,3', '格子 4,4']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveClass(/transparent/);
  }
});

test('prioritizes drawing colors in the bottom palette and updates after undo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);

  const cells = page.locator('.h5-canvas-cell');
  const strip = page.locator('.palette-strip');
  const bottomCodes = () => strip.locator('.palette-code-label').allTextContents();

  await page.getByRole('button', { name: '选择色号 A7', exact: true }).click();
  for (const index of [10, 11, 12]) await cells.nth(index).click();

  await page.getByRole('button', { name: '筛选色卡' }).click();
  let dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  await dialog.getByRole('searchbox', { name: '搜索色号' }).fill('M15');
  await dialog.getByRole('button', { name: '选择色号 M15', exact: true }).click();
  await cells.nth(20).click();

  await expect.poll(async () => (await bottomCodes()).slice(0, 2)).toEqual(['A7', 'M15']);
  await expect(strip.getByRole('button', { name: '选择色号 C8', exact: true })).toHaveCount(1);

  await page.getByRole('button', { name: '筛选色卡' }).click();
  dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  const modalCodes = await dialog.locator('.palette-search-option strong').allTextContents();
  expect(modalCodes.slice(0, 2)).toEqual(['A7', 'M15']);
  await dialog.getByRole('button', { name: '关闭筛选' }).click();

  await page.getByRole('button', { name: '撤销' }).click();
  await expect.poll(async () => (await bottomCodes()).slice(0, 2)).toEqual(['A7', 'A1']);
});

test('keeps compact bottom palette controls scrollable at H5 breakpoints', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);

  const strip = page.locator('.palette-strip');
  const firstCard = strip.locator('.palette-code').first();
  const filterButton = page.getByRole('button', { name: '筛选色卡' });
  const geometry = async () => ({
    card: await firstCard.boundingBox(),
    filter: await filterButton.boundingBox(),
  });

  for (const width of [600, 390, 350]) {
    await page.setViewportSize({ width, height: 844 });
    const current = await geometry();
    expect(current.card).not.toBeNull();
    expect(current.filter).not.toBeNull();
    expect(current.card!.width).toBeCloseTo(44, 0);
    expect(current.card!.height).toBeCloseTo(44, 0);
    expect(current.filter!.width).toBeCloseTo(44, 0);
    expect(current.filter!.height).toBeCloseTo(44, 0);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(firstCard.locator('.palette-code-label')).toHaveCSS('font-size', '12px');
  const indicator = firstCard.locator('.palette-active-indicator');
  const indicatorBox = await indicator.boundingBox();
  expect(indicatorBox).not.toBeNull();
  expect(indicatorBox!.width).toBeCloseTo(12, 0);
  expect(indicatorBox!.height).toBeCloseTo(3, 0);
  await expect(indicator).toHaveCSS('bottom', '4px');

  const initial = await strip.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
    scrollLeft: node.scrollLeft,
    overscrollBehaviorX: getComputedStyle(node).overscrollBehaviorX,
  }));
  expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth);
  expect(initial.overscrollBehaviorX).toBe('contain');
  await strip.hover();
  await page.mouse.wheel(600, 0);
  await expect.poll(() => strip.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);

  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.dataset.horizontalScrollFixture = 'true';
    Object.assign(spacer.style, {
      position: 'absolute', left: '0', top: '0', width: '2000px', height: '1px', pointerEvents: 'none',
    });
    document.body.append(spacer);
    document.documentElement.style.overflowX = 'auto';
    window.scrollTo(300, 0);
  });
  await strip.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  await strip.hover();
  const documentX = await page.evaluate(() => window.scrollX);
  expect(documentX).toBeGreaterThan(0);
  await page.mouse.wheel(600, 0);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect(await page.evaluate(() => window.scrollX)).toBe(documentX);
});

test('prioritizes colors used in the drawing inside palette search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);

  const cells = page.locator('.h5-canvas-cell');
  await page.getByRole('button', { name: '选择色号 A7', exact: true }).click();
  for (const index of [10, 11, 12]) await cells.nth(index).click();

  await page.getByRole('button', { name: '筛选色卡' }).click();
  let dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  await dialog.getByRole('searchbox', { name: '搜索色号' }).fill('M15');
  await dialog.getByRole('button', { name: '选择色号 M15', exact: true }).click();
  await cells.nth(20).click();

  await page.getByRole('button', { name: '筛选色卡' }).click();
  dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  const results = dialog.locator('.palette-search-results');
  const resultCodes = () => results.locator('.palette-search-option strong').allTextContents();
  await expect.poll(resultCodes).toHaveLength(221);
  expect((await resultCodes()).slice(0, 2)).toEqual(['A7', 'M15']);

  const search = dialog.getByRole('searchbox', { name: '搜索色号' });
  await search.fill('A');
  await expect.poll(async () => (await resultCodes())[0]).toBe('A7');
  await expect(dialog.getByRole('button', { name: '选择色号 M15', exact: true })).toHaveCount(0);

  await dialog.getByRole('button', { name: '关闭筛选' }).click();
  await page.getByRole('button', { name: '选择色号 A1', exact: true }).click();
  await page.getByRole('button', { name: '筛选色卡' }).click();
  dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  await dialog.getByRole('searchbox', { name: '搜索色号' }).fill('M15');
  await dialog.getByRole('button', { name: '选择色号 M15', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '筛选色卡面板' })).toHaveCount(0);
  await expect(page.locator('.canvas-status')).toContainText('已选择色号 M15');
  await cells.nth(21).click();
  await expect(cells.nth(21)).toHaveCSS('background-color', 'rgb(117, 125, 120)');

  await page.getByRole('button', { name: '筛选色卡' }).click();
  await expect(page.getByRole('searchbox', { name: '搜索色号' })).toHaveValue('');
});

test('scrolls palette results without moving the canvas page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);
  await page.getByRole('button', { name: '筛选色卡' }).click();

  const dialog = page.getByRole('dialog', { name: '筛选色卡面板' });
  const panel = dialog.locator('.palette-search-panel');
  const header = dialog.locator('.palette-search-head');
  const search = dialog.getByRole('searchbox', { name: '搜索色号' });
  const results = dialog.locator('.palette-search-results');
  const scrollMetrics = () => results.evaluate((node) => ({
    clientHeight: node.clientHeight,
    scrollHeight: node.scrollHeight,
    scrollTop: node.scrollTop,
    overscrollBehaviorY: getComputedStyle(node).overscrollBehaviorY,
  }));

  const initial = await scrollMetrics();
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight);
  expect(initial.clientHeight).toBeGreaterThan(0);
  expect(initial.overscrollBehaviorY).toBe('contain');
  const headerBefore = await header.boundingBox();
  const searchBefore = await search.boundingBox();
  expect(headerBefore).not.toBeNull();
  expect(searchBefore).not.toBeNull();
  await page.evaluate(() => {
    document.body.style.minHeight = '2000px';
    document.documentElement.style.overflowY = 'auto';
    window.scrollTo(0, 400);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const documentScrollBefore = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));

  await results.hover();
  await page.mouse.wheel(0, 700);
  await expect.poll(async () => (await scrollMetrics()).scrollTop).toBeGreaterThan(0);
  const headerAfter = await header.boundingBox();
  const searchAfter = await search.boundingBox();
  expect(headerAfter).not.toBeNull();
  expect(searchAfter).not.toBeNull();
  for (const coordinate of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(headerAfter![coordinate] - headerBefore![coordinate])).toBeLessThanOrEqual(1);
    expect(Math.abs(searchAfter![coordinate] - searchBefore![coordinate])).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(documentScrollBefore);

  await results.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await results.hover();
  await page.mouse.wheel(0, 700);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect(await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))).toEqual(documentScrollBefore);

  const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
  const panelRule = styles.match(/\.palette-search-panel\s*\{([^}]*)\}/)?.[1] ?? '';
  const resultsRule = styles.match(/\.palette-search-results\s*\{([^}]*)\}/)?.[1] ?? '';
  expect(panelRule).toContain('height: min(72vh, 620px)');
  expect(panelRule).toContain('height: min(72svh, 620px)');
  expect(panelRule).toContain('height: min(72dvh, 620px)');
  expect(panelRule).toContain('max-height: calc(100vh - 18px - max(18px, env(safe-area-inset-bottom)))');
  expect(panelRule).toContain('max-height: calc(100dvh - 18px - max(18px, env(safe-area-inset-bottom)))');
  expect(resultsRule).toContain('-webkit-overflow-scrolling: touch');

  await page.setViewportSize({ width: 390, height: 500 });
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  expect(panelBox!.y).toBeGreaterThanOrEqual(0);
  expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(viewportHeight + 1);
  const shortMetrics = await scrollMetrics();
  expect(shortMetrics.clientHeight).toBeGreaterThan(0);
  expect(shortMetrics.scrollHeight).toBeGreaterThan(shortMetrics.clientHeight);
  const shortHeaderBox = await header.boundingBox();
  const shortSearchBox = await search.boundingBox();
  expect(shortHeaderBox).not.toBeNull();
  expect(shortSearchBox).not.toBeNull();
  for (const childBox of [shortHeaderBox!, shortSearchBox!]) {
    expect(childBox.x).toBeGreaterThanOrEqual(panelBox!.x - 1);
    expect(childBox.y).toBeGreaterThanOrEqual(panelBox!.y - 1);
    expect(childBox.x + childBox.width).toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);
    expect(childBox.y + childBox.height).toBeLessThanOrEqual(panelBox!.y + panelBox!.height + 1);
  }
});

test('exports a coded bead pattern PNG from the H5 canvas', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);
  await page.getByRole('button', { name: '选择色号 A7' }).click();
  await page.locator('.h5-canvas-cell').nth(300).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出拼豆图纸' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/qiaoqiaole-h5-pattern\.png$/);

  const outputPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(outputPath);
  const fileBytes = fs.readFileSync(outputPath);
  expect([...fileBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(fileBytes.length).toBeGreaterThan(10_000);
});
