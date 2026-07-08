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

function longSideFromSplitInfo(text: string) {
  const numbers = text.match(/\d+/g)?.map(Number) ?? [];
  return Math.max(...numbers);
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

  const splitTransformBefore = await page.locator('.split-image-zoom-content').evaluate((node) => getComputedStyle(node).transform);
  await page.getByRole('button', { name: '放大分割预览' }).click();
  await page.waitForTimeout(250);
  const splitTransformAfter = await page.locator('.split-image-zoom-content').evaluate((node) => getComputedStyle(node).transform);
  expect(splitTransformAfter).not.toBe(splitTransformBefore);

  await page.getByRole('button', { name: '重置分割预览' }).click();
  await page.waitForTimeout(250);
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
  await page.getByRole('button', { name: '新建豆子仓库' }).click();
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
