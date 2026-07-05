import { expect, test } from '@playwright/test';

test('switches between scrollable 2D editor and non-empty 3D preview canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('拼豆 / 敲豆豆生成器')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 STL' })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 SVG' })).toBeVisible();
  await expect(page.locator('.pixel-cell')).toHaveCount(8 * 8);
  await expect(page.getByText('颜色用量')).toBeVisible();

  await page.getByRole('slider', { name: '网格大小滑杆' }).fill('60');
  await expect(page.locator('.pixel-cell')).toHaveCount(60 * 60);
  const hasHorizontalScroll = await page.locator('.canvas-scroll').evaluate((node) => node.scrollWidth > node.clientWidth);
  expect(hasHorizontalScroll).toBe(true);

  await page.getByRole('button', { name: '敲豆豆图纸', exact: true }).click();
  await expect(page.getByText('打印参数')).toBeVisible();
  await page.getByRole('button', { name: '3D 预览' }).click();
  await expect(page.getByRole('button', { name: '3D 预览' })).toHaveClass(/active/);
  await expect(page.getByLabel('模型尺寸')).toContainText('600.0 × 600.0');

  await page.getByRole('slider', { name: '格子尺寸滑杆' }).fill('12');
  await expect(page.getByLabel('模型尺寸')).toContainText('720.0 × 720.0');

  const canvas = page.locator('.three-preview canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(350);

  const previewMetrics = await canvas.evaluate((node) => {
    const canvasElement = node as HTMLCanvasElement;
    const context = canvasElement.getContext('webgl2') ?? canvasElement.getContext('webgl');
    if (!context) return null;
    const width = canvasElement.width;
    const height = canvasElement.height;
    const imageData = new Uint8Array(width * height * 4);
    context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, imageData);
    const background = [imageData[0], imageData[1], imageData[2]];
    const isModelPixel = (index: number) => {
      const distance = Math.hypot(
        imageData[index] - background[0],
        imageData[index + 1] - background[1],
        imageData[index + 2] - background[2],
      );
      return imageData[index + 3] > 0 && distance > 18;
    };
    let count = 0;
    let minY = height;
    let maxY = -1;
    for (let i = 0; i < imageData.length; i += 4) {
      if (isModelPixel(i)) {
        count += 1;
        const y = Math.floor(i / 4 / width);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return {
      count,
      visibleHeight: maxY >= minY ? maxY - minY + 1 : 0,
    };
  });

  expect(previewMetrics).not.toBeNull();
  expect(previewMetrics!.count).toBeGreaterThan(500);
  expect(previewMetrics!.visibleHeight).toBeGreaterThan(240);

  await page.getByRole('button', { name: '2D' }).click();
  await expect(page.locator('.pixel-cell')).toHaveCount(60 * 60);
  await expect(page.locator('.peg-board-sheet-cell')).toHaveCount(60 * 60);
});

test('presents bead pattern and peg board tools side by side through shared grid data', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: '拼豆图纸', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '敲豆豆图纸', exact: true })).toBeVisible();
  await expect(page.getByText('拼豆清单')).toBeVisible();
  await expect(page.getByText('颜色用量')).toBeVisible();
  await expect(page.getByText('共 64 颗', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '敲豆豆图纸', exact: true }).click();
  await expect(page.getByText('打印参数')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 STL' }).first()).toBeVisible();
  await expect(page.locator('.peg-board-sheet-cell')).toHaveCount(8 * 8);

  await page.getByRole('button', { name: '拼豆图纸', exact: true }).click();
  await expect(page.getByText('颜色用量')).toBeVisible();
  await expect(page.locator('.pattern-sheet-cell')).toHaveCount(8 * 8);
});

test('supports core workflows on a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByText('拼豆 / 敲豆豆生成器')).toBeVisible();
  await expect(page.getByRole('button', { name: '拼豆图纸', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 SVG' })).toBeVisible();
  await expect(page.locator('.pattern-sheet-cell')).toHaveCount(8 * 8);

  const hasPageOverflow = await page.locator('body').evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasPageOverflow).toBe(false);

  const uploadBox = page.locator('.upload-zone');
  await expect(uploadBox).toBeVisible();
  await expect(page.getByRole('slider', { name: '网格大小滑杆' })).toBeVisible();

  await page.getByRole('button', { name: '敲豆豆图纸', exact: true }).click();
  await page.getByRole('button', { name: '3D 预览' }).click();
  await expect(page.locator('.three-preview canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 STL' }).first()).toBeVisible();

  const touchTargetHeight = await page.getByRole('button', { name: '3D 预览' }).evaluate((node) => node.getBoundingClientRect().height);
  expect(touchTargetHeight).toBeGreaterThanOrEqual(36);
});
