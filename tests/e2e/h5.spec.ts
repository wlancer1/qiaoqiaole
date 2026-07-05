import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.use({ baseURL: 'http://127.0.0.1:5174' });

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

test('uploads from the H5 home page, configures split count, previews, then imports into canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expectNoPageScrollbar(page);

  await expect(page.getByRole('heading', { name: '超级拼' })).toBeVisible();
  await expect(page.getByRole('button', { name: '首页' })).toBeVisible();
  await expect(page.getByRole('button', { name: '上传', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '我的' })).toBeVisible();
  await expect(page.getByText('上传图片生成图纸')).toHaveCount(0);

  await page.locator('input[type="file"]').setInputFiles(path.resolve('178811783249756_.pic.jpg'));

  await expect(page.getByRole('heading', { name: '分割' })).toBeVisible();
  await expectNoPageScrollbar(page);
  await expect(page.locator('.split-info-value')).toContainText('18');
  await expect(page.getByLabel('分割预览图')).toBeVisible();
  await expect(page.locator('.split-red-line')).toHaveCount(0);

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
  await expect(page.getByRole('button', { name: '画笔工具' })).toHaveClass(/active/);
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

test('shows STL export only in the peg board workflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: /敲豆豆图纸/ }).click();
  await page.locator('input[type="file"]').setInputFiles(path.resolve('178811783249756_.pic.jpg'));
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '导入画布' }).click();

  await expect(page.getByLabel('H5 画布编辑器')).toBeVisible();
  await expect(page.getByRole('button', { name: '导出 STL' })).toBeVisible();
});

test('edits a preset H5 grid canvas with brush, eraser, fill, and bottom palette', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page);

  await expect(page.locator('.h5-image-canvas')).toHaveCount(0);
  await expect(page.locator('.h5-canvas-grid')).toBeVisible();
  await expect(page.locator('.h5-canvas-cell')).toHaveCount(32 * 32);

  await page.getByRole('button', { name: '选择色号 A7' }).click();
  await page.locator('.h5-canvas-cell').nth(300).click();
  await expect(page.locator('.h5-canvas-cell').nth(300)).not.toHaveClass(/transparent/);

  await page.locator('.h5-canvas-cell').nth(300).click();
  await page.getByRole('button', { name: '撤销' }).click();
  await expect(page.locator('.h5-canvas-cell').nth(300)).toHaveClass(/transparent/);

  await page.locator('.h5-canvas-cell').nth(300).click();
  await expect(page.locator('.h5-canvas-cell').nth(300)).not.toHaveClass(/transparent/);

  await page.getByRole('button', { name: '橡皮工具' }).click();
  await page.locator('.h5-canvas-cell').nth(300).click();
  await expect(page.locator('.h5-canvas-cell').nth(300)).toHaveClass(/transparent/);

  await page.getByRole('button', { name: '填充工具' }).click();
  await page.locator('.h5-canvas-cell').nth(0).click();
  await expect(page.getByText(/已填充/)).toBeVisible();

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
  await expect(page.locator('.canvas-status')).toContainText('已绘制 M15');
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
