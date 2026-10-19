import { expect, test } from '@playwright/test';

test('patchwork imports images from Add instead of the canvas topbar', async ({ page }) => {
  await page.goto('/patchwork');
  const topbar = page.locator('.patchwork-page .canvas-topbar');
  await expect(topbar.getByRole('button', { name: '导入图片', exact: true })).toHaveCount(0);
  await expect(topbar.getByRole('button', { name: '我的拼布作品', exact: true })).toHaveCount(0);
  await expect(topbar.getByRole('button', { name: '导出', exact: true })).toBeVisible();
  await expect(topbar.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '添加', exact: true }).click();
  await page.locator('.pw-add-import').click();
  await expect(page.getByRole('button', { name: '选择图片生成线稿', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '仅作为参考图', exact: true })).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '选择图片生成线稿', exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'import.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
  await expect(page.getByAltText('待导入图片，框选导入区域')).toBeVisible();
});
