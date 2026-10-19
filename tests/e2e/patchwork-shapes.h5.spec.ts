import { expect, test } from '@playwright/test';
import { createMockPhoneUser } from '../../apps/api/src/testPhoneUser.mjs';

for (const width of [320, 390, 414]) {
  test(`shape selection and placement fit a ${width}px mobile viewport`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 740 });
    await page.addInitScript(() => localStorage.setItem('qiaoqiaole:patchwork:templates', JSON.stringify([{ name: '测试叶片', points: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 40, y: 120 }] }])));
    await page.goto('/patchwork');
    await page.getByRole('button', { name: '添加', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '添加形状', exact: true });
    await expect(dialog.getByRole('tab', { name: '我的形状', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('button', { name: '下一步', exact: true })).toBeDisabled();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('tab')).toHaveCount(2);
    const controls = await dialog.locator('.pw-add-search-row').evaluate(el => {
      const search = el.querySelector('.pw-add-search')!.getBoundingClientRect();
      const button = el.querySelector('button')!.getBoundingClientRect();
      const font = parseFloat(getComputedStyle(el.querySelector('input')!).fontSize);
      return { y: Math.abs(search.y - button.y), height: Math.abs(search.height - button.height), font };
    });
    expect(controls.y).toBeLessThan(1); expect(controls.height).toBeLessThan(1);
    expect(controls.font).toBeLessThan(14);
    const searchSize = await dialog.locator('.pw-add-search').evaluate(el => ({ height: el.getBoundingClientRect().height, inputHeight: el.querySelector('input')!.getBoundingClientRect().height, rem: parseFloat(getComputedStyle(document.documentElement).fontSize) }));
    expect(searchSize.height).toBeLessThanOrEqual(searchSize.rem * 1.2);
    expect(searchSize.inputHeight).toBeLessThanOrEqual(searchSize.height);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: '/tmp/qiaoqiaole-add-choose.png' });
    await dialog.getByRole('button', { name: '选择形状 测试叶片', exact: true }).click();
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('spinbutton', { name: '形状宽度', exact: true }).fill('100');
    await expect(page.getByRole('spinbutton', { name: '形状高度', exact: true })).toHaveValue('150');
    await page.getByRole('spinbutton', { name: '形状缝份', exact: true }).fill('5');
    await page.getByRole('button', { name: '旋转 90°', exact: false }).click();
    const footer = dialog.getByRole('button', { name: '放置到画布', exact: true });
    await expect(footer).toBeVisible();
    const pane = await dialog.boundingBox(), action = await footer.boundingBox();
    expect(action!.y + action!.height).toBeLessThanOrEqual(pane!.y + pane!.height);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: '/tmp/qiaoqiaole-add-params.png' });
    await footer.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled();
  });
}

test('imported contours save to My Shapes before any canvas placement', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/patchwork');
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 240;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 240, 240);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 8; ctx.strokeRect(40, 40, 160, 160);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await page.locator('.pw-add-import').click();
  const fileChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择图片生成线稿', exact: true }).click();
  await (await fileChooser).setFiles({ name: 'outline.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
  await page.getByRole('button', { name: '下一步：提取轮廓', exact: true }).click();
  await page.getByRole('textbox', { name: '导入形状名称', exact: true }).fill('导入轮廓');
  await page.getByRole('button', { name: /保存 \d+ 个到我的形状/ }).click();
  const dialog = page.getByRole('dialog', { name: '添加形状', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /选择形状 导入轮廓/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('qiaoqiaole:patchwork:templates') || '[]').length)).toBeGreaterThan(0);
});

test('account shapes migrate and load on another device with full original geometry', async ({ browser, request, baseURL }) => {
  test.setTimeout(90_000);
  const { token, user } = await createMockPhoneUser(baseURL!);
  const name = '跨设备形状-' + Date.now();
  const original = Array.from({ length: 100 }, (_, i) => ({ x: 50 + 50 * Math.cos(i * Math.PI / 50), y: 50 + 50 * Math.sin(i * Math.PI / 50) }));
  const context1 = await browser.newContext({ viewport: { width: 390, height: 740 } });
  const context2 = await browser.newContext({ viewport: { width: 390, height: 740 } });
  try {
    await context1.addInitScript(({ token, user, name, original }) => {
      localStorage.setItem('qiaoqiaole.auth', JSON.stringify({ token, username: user.username, userId: user.id }));
      localStorage.setItem('qiaoqiaole:patchwork:templates', JSON.stringify([{ id: 'migrated-shape', name, points: original }]));
    }, { token, user, name, original });
    const first = await context1.newPage(); await first.goto('/patchwork');
    await first.getByRole('button', { name: '添加', exact: true }).click();
    await expect(first.getByText('形状保存到当前账号', { exact: true })).toBeVisible();
    await expect.poll(async () => (await request.get('/api/patchwork-shapes/migrated-shape', { headers: { authorization: 'Bearer ' + token } })).status()).toBe(200);
    expect(await first.evaluate(() => localStorage.getItem('qiaoqiaole:patchwork:templates'))).toBeNull();
    await context2.addInitScript(({ token, user }) => localStorage.setItem('qiaoqiaole.auth', JSON.stringify({ token, username: user.username, userId: user.id })), { token, user });
    const second = await context2.newPage(); await second.goto('/patchwork');
    await second.getByRole('button', { name: '添加', exact: true }).click();
    await second.getByRole('button', { name: '选择形状 ' + name, exact: true }).click();
    await second.getByRole('button', { name: '下一步', exact: true }).click();
    const detail = second.waitForResponse(res => res.url().includes('/patchwork-shapes/migrated-shape') && res.request().method() === 'GET');
    await second.getByRole('button', { name: '放置到画布', exact: true }).click();
    expect((await (await detail).json()).shape.points).toHaveLength(100);
    await expect(second.getByRole('dialog', { name: '添加形状', exact: true })).toHaveCount(0);
    expect((await request.get('/api/patchwork-shapes')).status()).toBe(401);
    const other = await createMockPhoneUser(baseURL!);
    const otherHeaders = { authorization: 'Bearer ' + other.token };
    expect((await (await request.get('/api/patchwork-shapes', { headers: otherHeaders })).json()).total).toBe(0);
    expect((await request.get('/api/patchwork-shapes/migrated-shape', { headers: otherHeaders })).status()).toBe(404);
  } finally { await context1.close(); await context2.close(); }
});
