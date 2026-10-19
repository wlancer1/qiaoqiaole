import { expect, test } from '@playwright/test';

test('saved patchwork can be published and browsed in the community', async ({ page }) => {
  test.setTimeout(90_000);
  const login = await page.request.post('/api/auth/login', { data: { username: 'admin', password: 'qiaoqiaole123' } });
  expect(login.ok()).toBe(true);
  const auth = await login.json();
  const headers = { authorization: `Bearer ${auth.token}` };
  const created = await page.request.post('/api/projects', { headers, data: {
    kind: 'patchwork', name: `社区拼布 ${Date.now()}`, rows: 300, cols: 400,
    content: JSON.stringify({ version: 1, widthMm: 400, heightMm: 300, materials: [], pieces: [], guides: [] }),
    thumbnailImagePath: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  } });
  expect(created.ok()).toBe(true);
  const { project } = await created.json();
  await page.route('**/api/v1/auth/me', route => route.fulfill({ json: { data: { user: auth.user, likesCount: 0, followingCount: 0, followersCount: 0 } } }));
  await page.addInitScript(({ token, user }) => localStorage.setItem('qiaoqiaole.auth', JSON.stringify({ token, username: user.username, userId: user.id })), auth);
  try {
    await page.goto('/projects?kind=patchwork');
    await page.locator(`[data-project-card-id="${project.id}"]`).click();
    await page.getByRole('button', { name: '分享作品', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '发布到社区' });
    await expect(dialog).toContainText('拼布 · 40 × 30 cm');
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.locator(`[data-project-card-id="${project.id}"]`).click();
    await page.getByRole('button', { name: '分享作品', exact: true }).click();
    await page.getByRole('button', { name: '选择标签 植物', exact: true }).click();
    const response = page.waitForResponse(r => r.url().endsWith(`/projects/${project.id}/share`) && r.request().method() === 'POST');
    await page.getByRole('button', { name: '确认发布', exact: true }).click();
    expect((await response).ok()).toBe(true);
    await expect(dialog).toHaveCount(0);
    await page.goto('/discover?sort=latest');
    await page.getByRole('heading', { name: project.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/community/posts/${project.id}`));
    await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
    await expect(page.getByText('40 × 30 cm', { exact: true })).toBeVisible();
    await expect(page.getByText('作品类型', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '豆子清单' })).toHaveCount(0);
    const image = page.locator('.detail-hero-art img');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`, { headers });
  }
});
