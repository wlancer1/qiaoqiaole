import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

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

async function readSettledPanelMetrics(
  page: import('@playwright/test').Page,
  panel: import('@playwright/test').Locator,
) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return panel.evaluate(async (node) => {
    const animations = node.getAnimations({ subtree: true });
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    const rect = node.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      viewportBottom: window.innerHeight,
    };
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

async function countGridPixelsInCanvasBand(
  page: import('@playwright/test').Page,
  band: 'left' | 'right',
) {
  return page.locator('.split-preview-canvas').evaluate((node, bandName) => {
    const canvas = node as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const bandWidth = Math.max(8, Math.floor(canvas.width * 0.12));
    const startX = bandName === 'left'
      ? Math.floor(canvas.width * 0.32)
      : Math.floor(canvas.width * 0.56);
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

test('shows the reference-driven home hierarchy with only real tools', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const uploadHero = page.getByRole('button', { name: '上传图片制作拼豆图纸', exact: true });
  const tools = page.locator('.home-creation-tools');
  const createPatternTool = tools.getByRole('button', { name: '创建拼豆图纸', exact: true });
  const createPegboardTool = tools.getByRole('button', { name: '创建敲豆图纸', exact: true });
  const createBlankCanvasTool = tools.getByRole('button', { name: '新建空白画布', exact: true });
  await expect(page.locator('.home-brand-hero')).toBeVisible();
  await expect(page.getByRole('heading', { name: '超级拼', exact: true })).toBeVisible();
  await expect(uploadHero).toBeVisible();
  await expect(uploadHero).toHaveClass(/(?:^|\s)home-upload-hero(?:\s|$)/);
  await expect(tools.locator('button.quick-action-card')).toHaveCount(3);
  await expect(createPatternTool).toBeVisible();
  await expect(createPatternTool).toHaveClass(/(?:^|\s)quick-action-card(?:\s|$)/);
  await expect(createPegboardTool).toBeVisible();
  await expect(createPegboardTool).toHaveClass(/(?:^|\s)quick-action-card(?:\s|$)/);
  await expect(createBlankCanvasTool).toBeVisible();
  await expect(createBlankCanvasTool).toHaveClass(/(?:^|\s)quick-action-card(?:\s|$)/);
  await expect(page.getByRole('button', { name: '消息中心' })).toBeVisible();
  await expect(page.locator('.home-brand-planet')).toBeVisible();
  await expect(page.locator('.home-upload-watermark')).toBeVisible();
  await expect(page.getByText('最近项目', { exact: true })).toBeVisible();
  await expect(page.locator('.home-recent-card')).toHaveCount(4);
  await expect(page.locator('.bottom-tabs button')).toHaveCount(3);
  const uploadFloatMetrics = await page.locator('.home-upload-hero').evaluate((node) => {
    const card = node as HTMLElement;
    const hero = card.closest('.home-brand-hero') as HTMLElement | null;
    if (!hero) throw new Error('Missing home brand hero');
    const cardRect = card.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    const cardStyle = getComputedStyle(card);
    const heroStyle = getComputedStyle(hero);
    return {
      cardBottom: cardRect.bottom,
      heroBottom: heroRect.bottom,
      heroHeight: heroRect.height,
      shadow: cardStyle.boxShadow,
      heroOverflow: heroStyle.overflow,
    };
  });
  expect(uploadFloatMetrics.heroHeight).toBeLessThanOrEqual(200);
  expect(uploadFloatMetrics.cardBottom).toBeGreaterThan(uploadFloatMetrics.heroBottom + 20);
  expect(uploadFloatMetrics.shadow).not.toBe('none');
  expect(uploadFloatMetrics.heroOverflow).toBe('visible');
  const recentSpacingMetrics = await page.locator('.home-recent-projects').evaluate((node) => {
    const recent = node as HTMLElement;
    const card = document.querySelector('.home-upload-hero');
    const heading = recent.querySelector('.home-section-heading');
    if (!(card instanceof HTMLElement) || !(heading instanceof HTMLElement)) throw new Error('Missing upload card or recent heading');
    return {
      cardBottom: card.getBoundingClientRect().bottom,
      headingTop: heading.getBoundingClientRect().top,
    };
  });
  expect(recentSpacingMetrics.headingTop).toBeGreaterThanOrEqual(recentSpacingMetrics.cardBottom + 20);

  const touchTargets = await page.locator(
    'button.home-upload-hero, .home-creation-tools button.quick-action-card, .home-brand-notify, .bottom-tabs button',
  ).evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      label: node.getAttribute('aria-label') ?? node.textContent?.trim() ?? node.className,
      width: rect.width,
      height: rect.height,
    };
  }));
  for (const target of touchTargets) {
    expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }
  await expectNoPageScrollbar(page);

  await uploadHero.click();
  await expect(page.getByRole('dialog', { name: '上传图纸' })).toBeVisible();
});

test('keeps home and profile hero cards on the same height system', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const homeGeometry = await page.locator('.home-brand-hero').evaluate((hero) => {
    const card = document.querySelector('.home-upload-hero');
    if (!(card instanceof HTMLElement)) throw new Error('Missing home upload card');
    const heroRect = hero.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      heroHeight: heroRect.height,
      cardHeight: cardRect.height,
    };
  });

  await page.getByRole('button', { name: '我的' }).click();
  const profileGeometry = await page.locator('.profile-hero').evaluate((hero) => {
    const card = document.querySelector('.profile-account-card');
    if (!(card instanceof HTMLElement)) throw new Error('Missing profile account card');
    const heroRect = hero.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      heroHeight: heroRect.height,
      cardHeight: cardRect.height,
    };
  });

  expect(profileGeometry.heroHeight).toBeCloseTo(homeGeometry.heroHeight, 0);
  expect(profileGeometry.cardHeight).toBeCloseTo(homeGeometry.cardHeight, 0);
});

test('keeps invalid upload feedback visible on the redesigned home', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('status')).toHaveCount(0);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'not-an-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });

  const status = page.getByRole('status');
  await expect(status).toBeVisible();
  await expect(status).toContainText('请上传 PNG、JPG 或 WebP 图片');
});

test('uploads from the H5 home page, configures split count, previews, then imports into canvas', async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 940 });
  await page.goto('/');
  await expectNoPageScrollbar(page);

  await expect(page.getByRole('heading', { name: '超级拼' })).toBeVisible();
  await expect(page.getByRole('button', { name: '首页' })).toBeVisible();
  await expect(page.getByRole('button', { name: '上传', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '我的' })).toBeVisible();
  await expect(page.getByText('上传图片生成图纸')).toHaveCount(0);

  const creationIconStyles = await page.locator('.home-creation-tools .qa-icon').evaluateAll((nodes) => (
    nodes.map((node) => ({
      color: getComputedStyle(node).color,
      backgroundColor: getComputedStyle(node).backgroundColor,
    }))
  ));
  expect(creationIconStyles.length).toBeGreaterThan(0);
  expect(creationIconStyles.every(({ color }) => color === 'rgb(20, 108, 255)')).toBe(true);
  expect(creationIconStyles.every(({ backgroundColor }) => backgroundColor === 'rgb(234, 242, 255)')).toBe(true);

  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
  await expectNoPageScrollbar(page);
  const splitModeTabs = page.getByRole('tablist', { name: '分割模式' });
  const quickSplitTab = splitModeTabs.getByRole('tab', { name: '快速分割', exact: true });
  const alignGridTab = splitModeTabs.getByRole('tab', { name: '对格子', exact: true });
  await expect(splitModeTabs).toBeVisible();
  await expect(splitModeTabs.getByRole('tab')).toHaveCount(2);
  await expect(quickSplitTab).toHaveAttribute('aria-selected', 'true');
  await expect(alignGridTab).toHaveAttribute('aria-selected', 'false');
  await expect(quickSplitTab).toHaveAttribute('id', 'split-mode-quick-tab');
  await expect(quickSplitTab).toHaveAttribute('aria-controls', 'split-mode-quick-panel');
  await expect(alignGridTab).toHaveAttribute('id', 'split-mode-align-tab');
  await expect(alignGridTab).toHaveAttribute('aria-controls', 'split-mode-align-panel');
  const quickSplitPanel = page.getByRole('tabpanel', { name: '快速分割' });
  await expect(quickSplitPanel).toHaveAttribute('id', 'split-mode-quick-panel');
  await expect(quickSplitPanel).toHaveAttribute('aria-labelledby', 'split-mode-quick-tab');
  await expect(quickSplitPanel.getByLabel('分割预览图')).toBeVisible();
  await expect(quickSplitPanel.locator('.split-pattern-summary')).toHaveCount(0);
  const quickControls = quickSplitPanel.locator('.split-quick-controls');
  await expect(quickControls).toBeVisible();
  await expect(quickControls.locator('.split-quick-output')).toHaveText(/\d+\s*×\s*\d+/);
  await expect(page.getByRole('slider', { name: '长边格数' })).toHaveAttribute('min', '8');
  await expect(page.getByRole('slider', { name: '长边格数' })).toHaveAttribute('max', '144');
  await expect(page.getByRole('slider', { name: '长边格数' })).toHaveValue('144');
  await expect(page.getByRole('button', { name: '减少格数' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '增加格数' })).toHaveCount(0);
  await expect(page.getByText('默认众数投票生成主色')).toHaveCount(0);
  await expect(page.getByRole('slider', { name: '长边格数' })).toHaveAttribute('aria-describedby', 'split-quick-output');
  await expect(page.getByRole('tabpanel')).toHaveCount(1);

  await quickSplitTab.press('ArrowRight');
  await expect(alignGridTab).toBeFocused();
  await expect(alignGridTab).toHaveAttribute('aria-selected', 'true');
  const keyboardAlignPanel = page.getByRole('tabpanel', { name: '对格子' });
  await expect(keyboardAlignPanel).toHaveAttribute('id', 'split-mode-align-panel');
  await expect(keyboardAlignPanel).toHaveAttribute('aria-labelledby', 'split-mode-align-tab');
  await expect(keyboardAlignPanel.locator('.split-align-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: '对格子', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeVisible();
  await expect(keyboardAlignPanel.locator('.split-align-readout')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '重置对格' })).toHaveCount(0);
  await expect(keyboardAlignPanel.locator('.split-nudge-readout')).toBeVisible();
  await expect(keyboardAlignPanel.locator('.split-grid-size-output')).toBeVisible();
  await expect(keyboardAlignPanel.locator('.split-nudge-pad button')).toHaveCount(4);
  await expect(page.getByRole('status', { name: '网格偏移' })).not.toHaveAttribute('tabindex');
  await expect(page.getByRole('status', { name: '格距' })).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await alignGridTab.press('ArrowLeft');
  await expect(quickSplitTab).toBeFocused();
  await expect(quickSplitTab).toHaveAttribute('aria-selected', 'true');
  const splitModeTabTargets = await splitModeTabs.getByRole('tab').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      label: node.textContent?.trim() ?? node.getAttribute('aria-label') ?? 'split mode tab',
      width: rect.width,
      height: rect.height,
    };
  }));
  for (const target of splitModeTabTargets) {
    expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeVisible();
  await expect(page.locator('.split-quick-output')).toHaveText(/\d+\s*×\s*\d+/);
  await expect(page.getByLabel('分割预览图')).toBeVisible();
  await expect(page.locator('.split-preview-canvas')).toBeVisible();
  await expect(page.locator('.split-image-zoom-wrapper')).toHaveCSS('touch-action', 'none');
  await expect(page.locator('.split-image-zoom-content')).toHaveCSS('touch-action', 'none');
  await expect(page.locator('.split-preview-canvas')).toHaveCSS('touch-action', 'none');
  await expect(page.locator('.split-zoom-controls')).toHaveCount(0);
  const splitControlsCard = page.locator('.split-controls-card');
  const segmented = page.locator('.flow-segmented');
  const preview = page.locator('.split-image-container');
  const quickPanelMetrics = await readSettledPanelMetrics(page, splitControlsCard);
  const quickSegmentedMetrics = await readSettledPanelMetrics(page, segmented);
  const previewMetrics = await readSettledPanelMetrics(page, preview);
  expect(quickPanelMetrics.top - quickSegmentedMetrics.bottom).toBeGreaterThanOrEqual(4);
  expect(quickPanelMetrics.top - quickSegmentedMetrics.bottom).toBeLessThanOrEqual(8);
  expect(quickPanelMetrics.viewportBottom - quickPanelMetrics.bottom).toBeCloseTo(0, 0);
  expect(previewMetrics.height).toBeGreaterThanOrEqual(300);

  await expect(page.getByRole('button', { name: '下一步', exact: true })).toHaveCSS('background-color', 'rgb(10, 132, 255)');

  const splitTouchTargets = await page.locator('.split-topbar button, .split-range').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        label: node.getAttribute('aria-label') ?? node.textContent?.trim() ?? node.className,
        isTopbarButton: node.closest('.split-topbar') !== null,
        width: rect.width,
        height: rect.height,
      };
    }),
  );
  expect(splitTouchTargets.length).toBeGreaterThan(0);
  for (const target of splitTouchTargets) {
    const minSize = target.isTopbarButton ? 38 : 44;
    expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(minSize);
    expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(minSize);
  }
  await alignGridTab.click();
  await expect(quickSplitTab).toHaveAttribute('aria-selected', 'false');
  await expect(alignGridTab).toHaveAttribute('aria-selected', 'true');
  const alignPanelMetrics = await readSettledPanelMetrics(page, splitControlsCard);
  expect(alignPanelMetrics.width).toBeCloseTo(quickPanelMetrics.width, 0);
  expect(alignPanelMetrics.height).toBeCloseTo(quickPanelMetrics.height, 0);
  expect(alignPanelMetrics.bottom).toBeCloseTo(quickPanelMetrics.bottom, 0);
  const nudgeGeometry = await page.locator('.split-nudge-pad').evaluate((pad) => {
    const boxes = [...pad.querySelectorAll<HTMLElement>('button, output')].map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        name: node.getAttribute('aria-label'),
        width: rect.width,
        height: rect.height,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      };
    });
    return boxes;
  });
  expect(nudgeGeometry).toHaveLength(5);
  for (const item of nudgeGeometry) {
    expect(item.width, `${item.name} width`).toBeCloseTo(52, 0);
    expect(item.height, `${item.name} height`).toBeCloseTo(52, 0);
  }
  const up = nudgeGeometry.find((item) => item.name === '上移网格')!;
  const down = nudgeGeometry.find((item) => item.name === '下移网格')!;
  const left = nudgeGeometry.find((item) => item.name === '左移网格')!;
  const right = nudgeGeometry.find((item) => item.name === '右移网格')!;
  const center = nudgeGeometry.find((item) => item.name === '网格偏移')!;
  expect(up.centerX).toBeCloseTo(center.centerX, 0);
  expect(down.centerX).toBeCloseTo(center.centerX, 0);
  expect(left.centerY).toBeCloseTo(center.centerY, 0);
  expect(right.centerY).toBeCloseTo(center.centerY, 0);
  const gridSizeButtons = page.getByRole('button', { name: /减小格距|增大格距/ });
  await expect(gridSizeButtons).toHaveCount(2);
  for (const box of await gridSizeButtons.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()))) {
    expect(box.width).toBeCloseTo(48, 0);
    expect(box.height).toBeCloseTo(48, 0);
  }
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
  expect(alignTouchTargets.length).toBeGreaterThan(0);
  for (const target of alignTouchTargets) {
    expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }
  await quickSplitTab.click();
  await expect(quickSplitTab).toHaveAttribute('aria-selected', 'true');
  await expect(alignGridTab).toHaveAttribute('aria-selected', 'false');
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
  const quickOutput = page.locator('.split-quick-output');
  const gridSizeBeforePinch = {
    cols: Number(await quickOutput.getAttribute('data-grid-cols')),
    rows: Number(await quickOutput.getAttribute('data-grid-rows')),
  };
  const imageScaleBeforePinch = Number(await page.locator('.split-image-container').getAttribute('data-image-scale'));
  await pinchOpenSplitPreview(page);
  await expect.poll(async () => ({
    cols: Number(await quickOutput.getAttribute('data-grid-cols')),
    rows: Number(await quickOutput.getAttribute('data-grid-rows')),
  })).toEqual(gridSizeBeforePinch);
  await expect.poll(async () => Number(await page.locator('.split-image-container').getAttribute('data-image-scale'))).toBeGreaterThan(imageScaleBeforePinch);
  await expect.poll(async () => readCssScale(page, '.split-image-zoom-content')).toBeCloseTo(touchScaleBefore, 1);

  await page.getByRole('slider', { name: '长边格数' }).fill('8');
  const quickSplitInfo = page.locator('.split-quick-output');
  await expect(quickSplitInfo).toBeVisible();
  await expect.poll(async () => {
    const cols = Number(await quickSplitInfo.getAttribute('data-grid-cols'));
    const rows = Number(await quickSplitInfo.getAttribute('data-grid-rows'));
    return Math.max(cols, rows);
  }).toBe(8);
  const quickPreviewSize = {
    cols: Number(await quickSplitInfo.getAttribute('data-grid-cols')),
    rows: Number(await quickSplitInfo.getAttribute('data-grid-rows')),
  };
  expect(quickPreviewSize.cols).toBeGreaterThan(0);
  expect(quickPreviewSize.rows).toBeGreaterThan(0);
  const nextActionButton = page.getByRole('button', { name: '下一步', exact: true });
  const nextActionStyles = await nextActionButton.evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      height: Math.round(rect.height),
    };
  });
  await page.getByRole('button', { name: '下一步' }).click();

  await expect(page.getByRole('heading', { name: '浏览', exact: true })).toBeVisible();
  await expect(page.locator('.split-preview-eyebrow')).toHaveCount(0);
  const patternMeta = page.locator('.split-pattern-meta');
  await expect(patternMeta).toContainText(`${quickPreviewSize.cols} × ${quickPreviewSize.rows}`);

  await expect(page.getByRole('tablist', { name: '浏览设置页签', exact: true })).toHaveCount(0);
  const beadListButton = page.getByRole('button', { name: /查看豆子清单/ });
  await expect(beadListButton).toBeVisible();
  const settingsPanel = page.getByRole('tabpanel');
  await expect(settingsPanel).toHaveAttribute('id', 'split-preview-settings-panel');
  await expect(settingsPanel).toHaveAttribute('aria-label', '参数设置');
  await expect(page.getByText('众数投票', { exact: true })).toBeVisible();
  await expect(page.getByText('均值匹配')).toHaveCount(0);
  await expect(page.getByText('K-means')).toHaveCount(0);
  await expect(page.getByText(/若没有常用颜色，则保留原色/)).toBeVisible();

  const previewPage = page.locator('.split-preview-page');
  const browserContainer = previewPage.locator('.split-browser-container');
  await expect(browserContainer).toBeVisible();
  const scrollOwnership = await previewPage.evaluate((node) => {
    const browser = node.querySelector('.split-browser-container');
    if (!(browser instanceof HTMLElement)) throw new Error('Missing split browser container');
    return {
      pageOverflow: getComputedStyle(node).overflow,
      browserOverflowY: getComputedStyle(browser).overflowY,
      documentScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    };
  });
  expect(scrollOwnership.pageOverflow).toBe('hidden');
  expect(scrollOwnership.browserOverflowY).toBe('auto');
  expect(scrollOwnership.documentScrollHeight).toBeLessThanOrEqual(scrollOwnership.viewportHeight);
  await expectNoPageScrollbar(page);

  await expect(page.getByLabel('分割浏览预览')).toBeVisible();
  const previewGrid = page.locator('.split-grid-preview');
  await expect(previewGrid).toHaveCSS('aspect-ratio', `${quickPreviewSize.cols} / ${quickPreviewSize.rows}`);
  const previewGridBox = await previewGrid.boundingBox();
  expect(previewGridBox).not.toBeNull();
  expect(previewGridBox!.width / previewGridBox!.height).toBeCloseTo(quickPreviewSize.cols / quickPreviewSize.rows, 1);
  await expect(page.locator('.split-preview-cell')).toHaveCount(quickPreviewSize.cols * quickPreviewSize.rows);
  expect(await page.locator('.split-preview-cell').count()).toBeGreaterThan(20);

  const importCanvasButton = page.getByRole('button', { name: '导入画布', exact: true });
  await expect(importCanvasButton).toBeVisible();
  await expect(importCanvasButton).toBeEnabled();
  const importActionStyles = await importCanvasButton.evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
      color: style.color,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      height: Math.round(rect.height),
    };
  });
  expect(importActionStyles).toEqual(nextActionStyles);
  const mergeThreshold = page.getByRole('slider', { name: '颜色合并阈值' });
  await expect(mergeThreshold).toBeVisible();
  await expect(mergeThreshold).toHaveValue('0');
  await mergeThreshold.fill('12');
  await expect(mergeThreshold).toHaveValue('12');
  await expect(page.locator('.split-merge-controls output')).toHaveText('≤ 12');
  const thresholdBeforeSheet = await mergeThreshold.inputValue();
  await beadListButton.click();
  const beadSheet = page.getByRole('dialog', { name: '豆子清单' });
  await expect(beadSheet).toBeVisible();
  await expect(beadSheet).toHaveClass(/split-bead-sheet/);
  const beadRows = page.locator('.split-bead-row');
  await expect.poll(() => beadRows.count()).toBeGreaterThan(0);
  const beadRowCount = await beadRows.count();
  const beadRowData = await beadRows.evaluateAll((nodes) => nodes.map((node) => {
    const codes = node.querySelectorAll('.split-bead-code');
    const swatches = node.querySelectorAll('.split-bead-swatch');
    const hexes = node.querySelectorAll('.split-bead-hex');
    const counts = node.querySelectorAll('.split-bead-count');
    return {
      codeFieldCount: codes.length,
      swatchFieldCount: swatches.length,
      hexFieldCount: hexes.length,
      countFieldCount: counts.length,
      code: codes[0]?.textContent?.trim() ?? '',
      swatchLabel: swatches[0]?.getAttribute('aria-label') ?? '',
      hex: hexes[0]?.textContent?.trim() ?? '',
      displayedCount: counts[0]?.textContent?.trim() ?? '',
      dataCount: node.getAttribute('data-count') ?? '',
    };
  }));
  expect(beadRowData).toHaveLength(beadRowCount);
  for (const row of beadRowData) {
    expect(row.codeFieldCount).toBe(1);
    expect(row.swatchFieldCount).toBe(1);
    expect(row.hexFieldCount).toBe(1);
    expect(row.countFieldCount).toBe(1);
    expect(row.code).toMatch(/^[A-Z]+\d+$/);
    expect(row.swatchLabel).toMatch(/^颜色 #[0-9A-F]{6}$/);
    expect(row.hex).toMatch(/^#[0-9A-F]{6}$/);
    expect(row.displayedCount).toMatch(/^× \d+$/);
    expect(row.dataCount).toMatch(/^\d+$/);
    expect(Number(row.dataCount)).toBeGreaterThan(0);
    expect(Number(row.displayedCount.replace(/^×\s*/, ''))).toBe(Number(row.dataCount));
  }
  const beadCounts = beadRowData.map((row) => Number(row.dataCount));
  expect(beadCounts.length).toBeGreaterThan(0);
  expect(beadCounts).toEqual([...beadCounts].sort((left, right) => right - left));

  const sheetScrollMetrics = await beadSheet.locator('.split-bead-list').evaluate((node) => ({
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
  }));
  expect(sheetScrollMetrics.clientHeight).toBeGreaterThan(0);
  expect(sheetScrollMetrics.scrollHeight).toBeGreaterThanOrEqual(sheetScrollMetrics.clientHeight);
  const documentScrollBefore = await page.evaluate(() => ({
    documentElement: document.documentElement.scrollTop,
    body: document.body.scrollTop,
  }));
  expect(documentScrollBefore).toEqual({ documentElement: 0, body: 0 });
  await beadSheet.locator('.split-bead-list').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect.poll(() => beadSheet.locator('.split-bead-list').evaluate((node) => node.scrollTop)).toBeGreaterThanOrEqual(0);
  await expect(beadRows.last()).toBeInViewport();
  expect(await page.evaluate(() => ({
    documentElement: document.documentElement.scrollTop,
    body: document.body.scrollTop,
  }))).toEqual(documentScrollBefore);

  await beadSheet.getByRole('button', { name: '关闭豆子清单' }).click();
  await expect(beadSheet).toHaveCount(0);
  await expect(page.getByLabel('颜色合并阈值')).toHaveValue(thresholdBeforeSheet);
  await importCanvasButton.click();

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

test('links split mode tabs to the single active panel and preserves arrow-key switching', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  const tablist = page.getByRole('tablist', { name: '分割模式' });
  const quickTab = tablist.getByRole('tab', { name: '快速分割', exact: true });
  const alignTab = tablist.getByRole('tab', { name: '对格子', exact: true });
  await expect(quickTab).toHaveAttribute('id', 'split-mode-quick-tab');
  await expect(quickTab).toHaveAttribute('aria-controls', 'split-mode-quick-panel');
  await expect(alignTab).toHaveAttribute('id', 'split-mode-align-tab');
  await expect(alignTab).toHaveAttribute('aria-controls', 'split-mode-align-panel');

  const quickPanel = page.getByRole('tabpanel', { name: '快速分割' });
  await expect(tablist.locator('[role="tabpanel"]')).toHaveCount(0);
  expect(await tablist.evaluate((list, panel) => Boolean(
    list.compareDocumentPosition(panel as Node) & Node.DOCUMENT_POSITION_FOLLOWING
  ), await quickPanel.elementHandle())).toBe(true);
  await expect(quickPanel).toHaveAttribute('id', 'split-mode-quick-panel');
  await expect(quickPanel).toHaveAttribute('aria-labelledby', 'split-mode-quick-tab');
  await expect(quickPanel.getByLabel('分割预览图')).toBeVisible();
  await expect(quickPanel.locator('.split-pattern-summary')).toHaveCount(0);
  await expect(quickPanel.locator('.split-quick-controls')).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);

  await quickTab.press('ArrowRight');
  await expect(alignTab).toBeFocused();
  await expect(alignTab).toHaveAttribute('aria-selected', 'true');
  const alignPanel = page.getByRole('tabpanel', { name: '对格子' });
  await expect(alignPanel).toHaveAttribute('id', 'split-mode-align-panel');
  await expect(alignPanel).toHaveAttribute('aria-labelledby', 'split-mode-align-tab');
  await expect(alignPanel.getByLabel('分割预览图')).toBeVisible();
  await expect(alignPanel.locator('.split-align-panel')).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);

  await alignTab.press('ArrowLeft');
  await expect(quickTab).toBeFocused();
  await expect(quickTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: '快速分割' })).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
});

test('uses a single slider for quick split sizing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  const quickPanel = page.getByRole('tabpanel', { name: '快速分割' });
  await expect(quickPanel.locator('.split-quick-controls')).toBeVisible();
  await expect(page.getByRole('slider', { name: '长边格数' })).toHaveValue('144');
  await expect(quickPanel.locator('.split-quick-output')).toHaveText(/\d+\s*×\s*\d+/);
  await expect(page.getByRole('slider', { name: '长边格数' })).toHaveAttribute('aria-describedby', 'split-quick-output');
  await expect(page.getByRole('button', { name: '减少格数' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '增加格数' })).toHaveCount(0);
  await expect(page.locator('.split-step-row')).toHaveCount(0);
});

test('renders the redesigned creation flow cleanly at phone and desktop sizes', async ({ page }) => {
  const artifactDir = path.resolve('test-results/h5-ui-review');
  const artifactNames = [
    'phone-home.png',
    'phone-split-quick.png',
    'phone-split-align.png',
    'phone-browse-settings.png',
    'phone-browse-beads.png',
    'desktop-home.png',
    'desktop-split-quick.png',
    'desktop-split-align.png',
    'desktop-browse-settings.png',
    'desktop-browse-beads.png',
  ];
  fs.mkdirSync(artifactDir, { recursive: true });
  for (const artifactName of artifactNames) {
    fs.rmSync(path.join(artifactDir, artifactName), { force: true });
  }
  const consoleProblems: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      const location = message.location();
      const source = location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : '';
      consoleProblems.push(`${message.type()}: ${message.text()}${source}`);
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.stack ?? error.message);
  });

  const takeAcceptanceScreenshot = async (filename: string, fullPage = false) => {
    await page.screenshot({
      path: path.join(artifactDir, filename),
      fullPage,
      animations: 'disabled',
    });
  };

  const scrollBrowseContainerWithWheel = async (
    container: import('@playwright/test').Locator,
    target: import('@playwright/test').Locator,
    alignment: 'fully-visible' | 'top-visible',
  ) => {
    await expect(container).toBeVisible();
    await container.hover();
    const viewportSize = page.viewportSize();
    expect(viewportSize).not.toBeNull();

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const [containerBox, targetBox] = await Promise.all([
        container.boundingBox(),
        target.boundingBox(),
      ]);
      expect(containerBox).not.toBeNull();
      expect(targetBox).not.toBeNull();
      const visibleTop = Math.max(0, containerBox!.y) + 8;
      const visibleBottom = Math.min(viewportSize!.height, containerBox!.y + containerBox!.height) - 8;
      const targetTop = targetBox!.y;
      const targetBottom = targetBox!.y + targetBox!.height;
      const isVisible = alignment === 'fully-visible'
        ? targetTop >= visibleTop && targetBottom <= visibleBottom
        : targetTop >= visibleTop && targetTop <= visibleTop + 24;
      if (isVisible) return;

      const distance = alignment === 'fully-visible'
        ? targetTop < visibleTop ? targetTop - visibleTop : targetBottom - visibleBottom
        : targetTop - visibleTop;
      const wheelDistance = Math.sign(distance) * Math.min(180, Math.max(1, Math.abs(distance)));
      const scrollTopBefore = await container.evaluate((node) => node.scrollTop);
      await page.mouse.wheel(0, wheelDistance);
      const readScrollTop = () => container.evaluate((node) => node.scrollTop);
      if (wheelDistance > 0) {
        await expect.poll(readScrollTop, { timeout: 750, intervals: [10, 25, 50, 100] })
          .toBeGreaterThan(scrollTopBefore);
      } else {
        await expect.poll(readScrollTop, { timeout: 750, intervals: [10, 25, 50, 100] })
          .toBeLessThan(scrollTopBefore);
      }
    }

    const [containerBox, targetBox] = await Promise.all([
      container.boundingBox(),
      target.boundingBox(),
    ]);
    expect(containerBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    const visibleTop = Math.max(0, containerBox!.y) + 8;
    const visibleBottom = Math.min(viewportSize!.height, containerBox!.y + containerBox!.height) - 8;
    if (alignment === 'fully-visible') {
      expect(targetBox!.y).toBeGreaterThanOrEqual(visibleTop);
      expect(targetBox!.y + targetBox!.height).toBeLessThanOrEqual(visibleBottom);
    } else {
      expect(targetBox!.y).toBeGreaterThanOrEqual(visibleTop);
      expect(targetBox!.y).toBeLessThanOrEqual(visibleTop + 24);
    }
  };

  for (const viewport of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 800 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await takeAcceptanceScreenshot(`${viewport.name}-home.png`, true);

    await page.locator('input[type="file"]').first().setInputFiles(uploadFixture);
    await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
    await expect(page.locator('.split-preview-canvas')).toBeVisible();
    await page.waitForFunction(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.split-preview-canvas');
      return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
    });
    const canvasHasPaintedAlpha = await page.locator('.split-preview-canvas').evaluate((node) => {
      const canvas = node as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      if (!context) return false;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] !== 0) return true;
      }
      return false;
    });
    expect(canvasHasPaintedAlpha).toBe(true);
    await takeAcceptanceScreenshot(`${viewport.name}-split-quick.png`);

    const alignGridTab = page.getByRole('tablist', { name: '分割模式' })
      .getByRole('tab', { name: '对格子', exact: true });
    await alignGridTab.click();
    await expect(alignGridTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: '对格子', exact: true })).toBeVisible();
    await takeAcceptanceScreenshot(`${viewport.name}-split-align.png`);

    await page.getByRole('button', { name: '完成', exact: true }).click();
    await expect(page.getByRole('heading', { name: '浏览', exact: true })).toBeVisible();
    await expect(page.locator('.split-grid-preview')).toBeVisible();
    const browseContainer = page.locator('.split-browser-container');
    const settingsPanel = page.getByRole('tabpanel', { name: '参数设置' });
    const thresholdControl = settingsPanel.locator('.split-threshold-control');
    await scrollBrowseContainerWithWheel(browseContainer, thresholdControl, 'fully-visible');
    await expect(settingsPanel).toBeVisible();
    await expect(thresholdControl).toBeVisible();
    await expect(thresholdControl).toBeInViewport();
    await takeAcceptanceScreenshot(`${viewport.name}-browse-settings.png`, true);

    const beadListTab = page.getByRole('tablist', { name: '浏览设置页签', exact: true })
      .getByRole('tab', { name: /豆子清单/ });
    await expect(beadListTab).toBeInViewport();
    await beadListTab.click();
    await expect(beadListTab).toHaveAttribute('aria-selected', 'true');
    const beadListPanel = page.getByRole('tabpanel', { name: /豆子清单/ });
    const beadList = beadListPanel.locator('.split-bead-list-panel');
    await scrollBrowseContainerWithWheel(browseContainer, beadList, 'top-visible');
    await expect(beadListPanel).toBeVisible();
    await expect(beadList).toBeVisible();
    await expect(beadList).toBeInViewport();
    await expect(beadList.locator('.split-bead-row').first()).toBeInViewport();
    await takeAcceptanceScreenshot(`${viewport.name}-browse-beads.png`, true);

    await expectNoPageScrollbar(page);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const transitionDurations = await page.locator('.home-upload-hero').evaluate((node) => (
    getComputedStyle(node).transitionDuration.split(',').map((duration) => {
      const value = Number.parseFloat(duration);
      return duration.trim().endsWith('ms') ? value / 1000 : value;
    })
  ));
  expect(Math.max(...transitionDurations)).toBeLessThanOrEqual(0.01);
  expect(consoleProblems).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('binds browse import availability to the real preview cells', async ({ page }) => {
  const source = fs.readFileSync(path.resolve('apps/h5/src/H5App.tsx'), 'utf8');
  const sourceFile = ts.createSourceFile('H5App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let h5AppFunction: ts.FunctionDeclaration | undefined;
  const findH5App = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'H5App') {
      h5AppFunction = node;
      return;
    }
    ts.forEachChild(node, findH5App);
  };
  findH5App(sourceFile);
  expect(h5AppFunction, 'missing H5App function declaration').toBeDefined();

  let matchingActionBindings = 0;
  const inspectH5App = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sourceFile) === 'FlowTopbar') {
      const titleAttribute = node.attributes.properties.find((property): property is ts.JsxAttribute => (
        ts.isJsxAttribute(property) && property.name.getText(sourceFile) === 'title'
      ));
      const actionAttribute = node.attributes.properties.find((property): property is ts.JsxAttribute => (
        ts.isJsxAttribute(property) && property.name.getText(sourceFile) === 'action'
      ));
      const hasBrowseTitle = titleAttribute?.initializer !== undefined
        && ts.isStringLiteral(titleAttribute.initializer)
        && titleAttribute.initializer.text === '浏览';
      const expression = actionAttribute?.initializer && ts.isJsxExpression(actionAttribute.initializer)
        ? actionAttribute.initializer.expression
        : undefined;
      if (
        hasBrowseTitle
        && expression
        && ts.isCallExpression(expression)
        && ts.isIdentifier(expression.expression)
        && expression.expression.text === 'getImportAction'
        && expression.arguments.length === 2
      ) {
        const [cellCountArgument, importArgument] = expression.arguments;
        const hasCellCountArgument = ts.isPropertyAccessExpression(cellCountArgument)
          && ts.isIdentifier(cellCountArgument.expression)
          && cellCountArgument.expression.text === 'splitPreviewCells'
          && cellCountArgument.name.text === 'length';
        const hasImportArgument = ts.isIdentifier(importArgument) && importArgument.text === 'importSplitToCanvas';
        if (hasCellCountArgument && hasImportArgument) matchingActionBindings += 1;
      }
    }
    ts.forEachChild(node, inspectH5App);
  };
  inspectH5App(h5AppFunction!);
  expect.soft(matchingActionBindings).toBeGreaterThan(0);

  await page.goto('/');
  const disabledStyles = await page.evaluate(() => {
    const button = document.createElement('button');
    button.className = 'split-action-btn';
    button.disabled = true;
    button.textContent = '导入画布';
    document.body.append(button);
    const style = getComputedStyle(button);
    const result = {
      opacity: Number.parseFloat(style.opacity),
      boxShadow: style.boxShadow,
      cursor: style.cursor,
    };
    button.remove();
    return result;
  });
  expect.soft(disabledStyles.opacity).toBeLessThan(1);
  expect.soft(disabledStyles.boxShadow).toBe('none');
  expect.soft(disabledStyles.cursor).toBe('not-allowed');
});

test('ellipsizes a long pattern name in browse without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const longFilename = `${'very-long-pattern-name-'.repeat(6)}.png`;
  await page.locator('input[type="file"]').first().setInputFiles({
    name: longFilename,
    mimeType: 'image/png',
    buffer: fs.readFileSync(uploadFixture),
  });

  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
  const nextButton = page.getByRole('button', { name: '下一步', exact: true });
  await expect(nextButton).toBeVisible();
  await expect(nextButton).toBeEnabled();
  await nextButton.click();
  await expect(page.getByRole('heading', { name: '浏览', exact: true })).toBeVisible();

  const patternName = page.locator('.split-pattern-name');
  await expect(patternName).toBeVisible();
  await expect(patternName).toHaveText(longFilename);
  const nameMetrics = await patternName.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      overflow: style.overflow,
      textOverflow: style.textOverflow,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    };
  });
  expect(nameMetrics.overflow).toBe('hidden');
  expect(nameMetrics.textOverflow).toBe('ellipsis');
  expect(nameMetrics.clientWidth).toBeGreaterThan(0);
  expect(nameMetrics.scrollWidth).toBeGreaterThan(nameMetrics.clientWidth);
  await expectNoPageScrollbar(page);
});

test('keeps the 320px browse bead list inside its own scroll container', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/');
  await page.locator('input[type="file"]').first().setInputFiles(uploadFixture);
  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('heading', { name: '浏览', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /豆子清单/ }).click();

  const browserContainer = page.locator('.split-browser-container');
  const beadRows = page.locator('.split-bead-row');
  await expect.poll(() => beadRows.count()).toBeGreaterThan(0);
  await expectNoPageScrollbar(page);

  const horizontalMetrics = await browserContainer.evaluate((node) => {
    const containerRect = node.getBoundingClientRect();
    const rows = [...node.querySelectorAll('.split-bead-row')];
    return {
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      rowsInside: rows.every((row) => {
        const rect = row.getBoundingClientRect();
        return rect.left >= containerRect.left - 1 && rect.right <= containerRect.right + 1;
      }),
    };
  });
  expect(horizontalMetrics.scrollWidth).toBeLessThanOrEqual(horizontalMetrics.clientWidth);
  expect(horizontalMetrics.rowsInside).toBe(true);

  const documentScrollBefore = await page.evaluate(() => ({
    documentElement: document.documentElement.scrollTop,
    body: document.body.scrollTop,
  }));
  await browserContainer.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const bottomMetrics = await browserContainer.evaluate((node) => {
    const lastRow = node.querySelector('.split-bead-row:last-child');
    if (!(lastRow instanceof HTMLElement)) throw new Error('Missing final bead row');
    const containerRect = node.getBoundingClientRect();
    const rowRect = lastRow.getBoundingClientRect();
    return {
      scrollTop: node.scrollTop,
      lastRowVisible: rowRect.top >= containerRect.top - 1 && rowRect.bottom <= containerRect.bottom + 1,
    };
  });
  expect(bottomMetrics.scrollTop).toBeGreaterThan(0);
  expect(bottomMetrics.lastRowVisible).toBe(true);
  await expectNoPageScrollbar(page);
  expect(await page.evaluate(() => ({
    documentElement: document.documentElement.scrollTop,
    body: document.body.scrollTop,
  }))).toEqual(documentScrollBefore);
});

test('keeps the split preview usable at desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
  await expect(page.locator('.split-preview-canvas')).toBeVisible();
  const geometry = await page.locator('.split-flow-inner').evaluate((wrapper) => {
    const preview = wrapper.querySelector('.split-image-container');
    if (!(preview instanceof HTMLElement)) throw new Error('Missing split image container');
    const wrapperRect = wrapper.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    return {
      wrapperWidth: wrapperRect.width,
      wrapperLeft: wrapperRect.left,
      wrapperRight: wrapperRect.right,
      previewTop: previewRect.top,
      previewBottom: previewRect.bottom,
      previewHeight: previewRect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry.wrapperWidth).toBeGreaterThanOrEqual(360);
  expect(geometry.wrapperWidth).toBeLessThanOrEqual(720);
  expect(geometry.wrapperLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.wrapperRight).toBeLessThanOrEqual(geometry.viewportWidth);
  const leftWhitespace = geometry.wrapperLeft;
  const rightWhitespace = geometry.viewportWidth - geometry.wrapperRight;
  expect(Math.abs(leftWhitespace - rightWhitespace)).toBeLessThanOrEqual(2);
  expect(geometry.previewTop).toBeGreaterThanOrEqual(0);
  expect(geometry.previewBottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.previewHeight).toBeGreaterThanOrEqual(360);
  await expectNoPageScrollbar(page);
});

test('keeps split bottom safe area in the fixed controls only', async () => {
  const styles = fs.readFileSync(path.resolve('apps/h5/src/styles.css'), 'utf8');
  const splitMainRule = styles.match(/\.split-main\s*\{([^}]*)\}/)?.[1];
  const splitControlsRule = styles.match(/\.split-controls-card\s*\{([^}]*)\}/)?.[1];

  expect(splitMainRule, 'missing .split-main CSS rule').toBeDefined();
  expect(splitControlsRule, 'missing .split-controls-card CSS rule').toBeDefined();
  expect(splitMainRule).toMatch(/padding-bottom:\s*var\(--split-controls-space\)\s*;/);
  expect(splitMainRule).not.toContain('env(safe-area-inset-bottom)');
  expect(splitControlsRule).toContain('env(safe-area-inset-bottom)');
});

test('keeps split settings header and controls compact', async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 940 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  const geometry = await page.locator('.split-page').evaluate((root) => {
    const rect = (selector: string) => {
      const node = root.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`Missing ${selector}`);
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    };
    return {
      preview: { ...rect('.split-image-container'), width: root.querySelector<HTMLElement>('.split-image-container')!.getBoundingClientRect().width },
      segmented: rect('.flow-segmented'),
      controls: rect('.split-controls-card'),
    };
  });

  expect(geometry.preview.top).toBeLessThanOrEqual(62);
  expect(geometry.preview.width).toBeCloseTo(414, 0);
  expect(geometry.segmented.top - geometry.preview.bottom).toBeCloseTo(8, 0);
  expect(geometry.segmented.height).toBeLessThanOrEqual(46);
  expect(geometry.controls.top - geometry.segmented.bottom).toBeLessThanOrEqual(6);
  expect(geometry.controls.height).toBeLessThanOrEqual(224);
  expect(geometry.controls.bottom).toBeCloseTo(940, 0);
});

test('keeps split modes on one canvas size and uses the Figma segmented control width', async ({ page }) => {
  await page.setViewportSize({ width: 414, height: 940 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  const quickGeometry = await page.locator('.split-page').evaluate((root) => {
    const preview = root.querySelector<HTMLElement>('.split-image-container')?.getBoundingClientRect();
    const segmented = root.querySelector<HTMLElement>('.flow-segmented')?.getBoundingClientRect();
    if (!preview || !segmented) throw new Error('Missing split controls');
    return { previewHeight: preview.height, segmentedLeft: segmented.left, segmentedWidth: segmented.width };
  });
  await page.getByRole('tab', { name: '对格子', exact: true }).click();
  const alignGeometry = await page.locator('.split-page').evaluate((root) => {
    const preview = root.querySelector<HTMLElement>('.split-image-container')?.getBoundingClientRect();
    if (!preview) throw new Error('Missing alignment preview');
    return { previewHeight: preview.height };
  });

  expect(quickGeometry.previewHeight).toBeGreaterThan(300);
  expect(alignGeometry.previewHeight).toBeCloseTo(quickGeometry.previewHeight, 0);
  expect(quickGeometry.segmentedLeft).toBeCloseTo(24, 0);
  expect(quickGeometry.segmentedWidth).toBeCloseTo(366, 0);
});

test('opens the Figma bead list as a responsive bottom drawer', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);
  await page.getByRole('button', { name: '下一步', exact: true }).click();

  await page.getByRole('button', { name: '查看豆子清单', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '豆子清单' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.split-bead-stats > div')).toHaveCount(2);
  await expect(drawer.locator('.split-bead-list-summary')).toBeVisible();
  await page.getByRole('button', { name: '关闭豆子清单' }).click();
  await expect(drawer).toHaveCount(0);
});

test('keeps alignment controls usable at 320px width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
  const alignTab = page.getByRole('tablist', { name: '分割模式' }).getByRole('tab', { name: '对格子', exact: true });
  await alignTab.click();
  await expect(alignTab).toHaveAttribute('aria-selected', 'true');
  await readSettledPanelMetrics(page, page.locator('.split-controls-card'));

  const geometry = await page.locator('.split-controls-card').evaluate((panel) => {
    const panelStyle = getComputedStyle(panel);
    const panelRect = panel.getBoundingClientRect();
    const contentLeft = panelRect.left + parseFloat(panelStyle.borderLeftWidth) + parseFloat(panelStyle.paddingLeft);
    const contentRight = panelRect.right - parseFloat(panelStyle.borderRightWidth) - parseFloat(panelStyle.paddingRight);
    const controls = panel.querySelector('.split-align-controls');
    const readout = panel.querySelector('.split-nudge-readout');
    if (!(controls instanceof HTMLElement) || !(readout instanceof HTMLElement)) {
      throw new Error('Missing alignment controls');
    }
    const nodes = [controls, ...controls.querySelectorAll('button')];
    return {
      documentHasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      panelScrollWidth: panel.scrollWidth,
      panelClientWidth: panel.clientWidth,
      nudgeSizes: [...panel.querySelectorAll<HTMLElement>('.split-nudge-pad button, .split-nudge-readout')].map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
      targets: nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          label: node.getAttribute('aria-label') ?? node.textContent?.trim() ?? node.className,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          inside: rect.left >= contentLeft - 1 && rect.right <= contentRight + 1,
        };
      }),
    };
  });

  expect(geometry.documentHasHorizontalScroll).toBe(false);
  expect(geometry.panelScrollWidth).toBeLessThanOrEqual(geometry.panelClientWidth);
  expect(geometry.nudgeSizes).toHaveLength(5);
  for (const size of geometry.nudgeSizes) {
    expect(size.width).toBeCloseTo(44, 0);
    expect(size.height).toBeCloseTo(44, 0);
  }
  for (const target of geometry.targets) {
    expect(target.inside, `${target.label} stays inside panel content`).toBe(true);
    if (target.label !== 'split-align-controls') {
      expect(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
    }
  }
});

test('centers the alignment grid size controls in their section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  const alignTab = page.getByRole('tablist', { name: '分割模式' }).getByRole('tab', { name: '对格子', exact: true });
  await alignTab.click();
  await expect(alignTab).toHaveAttribute('aria-selected', 'true');

  const geometry = await page.locator('.split-grid-size-section').evaluate((section) => {
    const sectionRect = section.getBoundingClientRect();
    const centerOf = (selector: string) => {
      const node = section.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`Missing ${selector}`);
      const rect = node.getBoundingClientRect();
      return rect.left + rect.width / 2;
    };
    const sectionCenter = sectionRect.left + sectionRect.width / 2;
    return {
      titleCenter: centerOf('h3'),
      actionsCenter: centerOf('.split-cell-actions'),
      outputCenter: centerOf('.split-grid-size-output'),
      sectionCenter,
    };
  });

  expect(Math.abs(geometry.titleCenter - geometry.sectionCenter)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.actionsCenter - geometry.sectionCenter)).toBeLessThanOrEqual(1);
  expect(Math.abs(geometry.outputCenter - geometry.sectionCenter)).toBeLessThanOrEqual(1);
});

test('keeps the alignment canvas usable at 844 by 390 landscape', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);

  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
  const alignTab = page.getByRole('tablist', { name: '分割模式' }).getByRole('tab', { name: '对格子', exact: true });
  await alignTab.click();
  await expect(alignTab).toHaveAttribute('aria-selected', 'true');
  const panelMetrics = await readSettledPanelMetrics(page, page.locator('.split-controls-card'));
  const preview = page.locator('.split-image-container');
  await expect(preview).toBeVisible();
  const previewBox = await preview.boundingBox();
  expect(previewBox).not.toBeNull();

  expect(previewBox!.height).toBeGreaterThanOrEqual(96);
  expect(Math.abs(panelMetrics.bottom - panelMetrics.viewportBottom)).toBeLessThanOrEqual(1);
  expect(panelMetrics.height).toBeLessThanOrEqual(260);
  const scrollability = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    overflowY: getComputedStyle(document.documentElement).overflowY,
  }));
  expect(scrollability.scrollHeight).toBeGreaterThanOrEqual(scrollability.viewportHeight);
  expect(scrollability.overflowY).not.toBe('hidden');
});

test('keeps the split workspace responsive across common phone widths', async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 393, height: 852 },
    { width: 414, height: 896 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(uploadFixture);
    await expect(page.locator('.split-preview-canvas')).toBeVisible();

    const metrics = await page.locator('.split-page').evaluate((root) => {
      const preview = root.querySelector<HTMLElement>('.split-image-container');
      const controls = root.querySelector<HTMLElement>('.split-controls-card');
      if (!preview || !controls) throw new Error('Missing split workspace controls');
      const previewRect = preview.getBoundingClientRect();
      const controlsRect = controls.getBoundingClientRect();
      return {
        pageWidth: root.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
        documentHasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        previewRight: previewRect.right,
        controlsLeft: controlsRect.left,
        controlsRight: controlsRect.right,
        controlsBottom: controlsRect.bottom,
        viewportHeight: window.innerHeight,
      };
    });

    expect(metrics.pageWidth).toBeCloseTo(metrics.viewportWidth, 0);
    expect(metrics.documentHasHorizontalScroll).toBe(false);
    expect(metrics.previewRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.controlsLeft).toBeGreaterThanOrEqual(-1);
    expect(metrics.controlsRight).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.controlsBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  }
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

test('allows panning and wheel zooming from the canvas area outside the grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await createBlankCanvasFromHome(page, 12, 12);
  await page.getByRole('button', { name: '画笔工具' }).click();

  const stage = page.locator('.canvas-stage');
  const artboard = page.locator('.h5-artboard');
  const stageBox = await stage.boundingBox();
  const artboardBox = await artboard.boundingBox();
  expect(stageBox).not.toBeNull();
  expect(artboardBox).not.toBeNull();

  const outsideX = stageBox!.x + 24;
  const outsideY = stageBox!.y + 24;
  expect(outsideX < artboardBox!.x || outsideX > artboardBox!.x + artboardBox!.width).toBeTruthy();

  await page.getByRole('button', { name: '放大画布' }).click();
  const beforeDrag = await readCssScale(page, '.react-transform-component');
  const beforeTransform = await page.locator('.react-transform-component').evaluate((node) => getComputedStyle(node).transform);

  await page.mouse.move(outsideX, outsideY);
  await page.mouse.down();
  await page.mouse.move(outsideX + 48, outsideY + 24, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  const afterTransform = await page.locator('.react-transform-component').evaluate((node) => getComputedStyle(node).transform);
  expect(afterTransform).not.toBe(beforeTransform);

  await page.mouse.move(outsideX, outsideY);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(150);
  expect(await readCssScale(page, '.react-transform-component')).toBeGreaterThan(beforeDrag);
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
  expect(metrics.rowLabelLeft).toBeGreaterThanOrEqual(metrics.wrapperLeft);
  expect(metrics.rowLabelRight).toBeLessThanOrEqual(metrics.wrapperRight);
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

  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '对格子', exact: true }).click();
  await expect(page.getByRole('heading', { name: '对格子', exact: true })).toBeVisible();
  const offsetOutput = page.getByRole('status', { name: '网格偏移' });
  const cellSizeOutput = page.getByRole('status', { name: '格距' });
  await expect(offsetOutput).toBeVisible();
  await expect(cellSizeOutput).toBeVisible();
  const initialOffsetAttributes = {
    x: await offsetOutput.getAttribute('data-offset-x'),
    y: await offsetOutput.getAttribute('data-offset-y'),
  };
  const initialOffset = {
    x: Number(initialOffsetAttributes.x),
    y: Number(initialOffsetAttributes.y),
  };
  const cellSize = Number(await cellSizeOutput.getAttribute('data-cell-size'));
  const cropWidthText = await page.locator('.split-image-frame').getAttribute('data-crop-width');
  const cropHeightText = await page.locator('.split-image-frame').getAttribute('data-crop-height');
  const initialGridSize = {
    cols: Number(await cellSizeOutput.getAttribute('data-grid-cols')),
    rows: Number(await cellSizeOutput.getAttribute('data-grid-rows')),
  };
  const cropWidth = Number(cropWidthText);
  const cropHeight = Number(cropHeightText);
  expect(initialOffset.x).toBeCloseTo((cropWidth - initialGridSize.cols * cellSize) / 2, 0);
  expect(initialOffset.y).toBeCloseTo((cropHeight - initialGridSize.rows * cellSize) / 2, 0);
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
  expect(imageFrameBox).not.toBeNull();
  await expect(page.locator('.split-grid-control-frame')).toHaveCount(1);
  await expect(page.locator('.split-grid-control-frame')).toHaveAttribute('data-grid-span', '3');

  const initialMoveHandleBox = await page.getByLabel('按住移动网格').boundingBox();
  const initialScaleHandleBox = await page.getByLabel('按住缩放网格').boundingBox();
  expect(initialMoveHandleBox).not.toBeNull();
  expect(initialScaleHandleBox).not.toBeNull();
  expect(initialScaleHandleBox!.x).toBeGreaterThan(initialMoveHandleBox!.x);
  expect(initialScaleHandleBox!.y).toBeGreaterThan(initialMoveHandleBox!.y);

  const beforeSize = initialGridSize;
  const moveBox = await page.getByLabel('按住移动网格').boundingBox();
  const scaleBoxBeforeMove = await page.getByLabel('按住缩放网格').boundingBox();
  expect(moveBox).not.toBeNull();
  expect(scaleBoxBeforeMove).not.toBeNull();
  const moveStartCenter = {
    x: moveBox!.x + moveBox!.width / 2,
    y: moveBox!.y + moveBox!.height / 2,
  };
  await page.mouse.move(moveBox!.x + moveBox!.width / 2, moveBox!.y + moveBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(moveBox!.x + moveBox!.width / 2 + 40, moveBox!.y + moveBox!.height / 2 + 30, { steps: 5 });
  const draggingMoveBox = await page.getByLabel('按住移动网格').boundingBox();
  expect(draggingMoveBox).not.toBeNull();
  expect(draggingMoveBox!.x + draggingMoveBox!.width / 2).not.toBe(moveStartCenter.x);
  await page.mouse.up();
  const droppedMoveBox = await page.getByLabel('按住移动网格').boundingBox();
  expect(droppedMoveBox).not.toBeNull();
  expect(droppedMoveBox!.x + droppedMoveBox!.width / 2).not.toBe(moveStartCenter.x);
  const scaleBoxAfterMove = await page.getByLabel('按住缩放网格').boundingBox();
  expect(scaleBoxAfterMove).not.toBeNull();
  expect(scaleBoxAfterMove!.x).not.toBe(scaleBoxBeforeMove!.x);
  await expect.poll(async () => ({
    x: await offsetOutput.getAttribute('data-offset-x'),
    y: await offsetOutput.getAttribute('data-offset-y'),
  })).not.toEqual(initialOffsetAttributes);

  for (let index = 0; index < Math.ceil(cellSize * 2); index += 1) {
    await page.getByRole('button', { name: '右移网格' }).click();
    const currentOffsetX = Number(await offsetOutput.getAttribute('data-offset-x'));
    if (currentOffsetX >= cellSize - 2) break;
  }
  await expect.poll(async () => countGridPixelsInCanvasBand(page, 'left')).toBeGreaterThan(250);
  await expect.poll(async () => countGridPixelsInCanvasBand(page, 'right')).toBeGreaterThan(250);

  const movedCellSize = Number(await cellSizeOutput.getAttribute('data-cell-size'));
  const scaleBox = await page.getByLabel('按住缩放网格').boundingBox();
  expect(scaleBox).not.toBeNull();
  await page.mouse.move(scaleBox!.x + scaleBox!.width / 2, scaleBox!.y + scaleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(scaleBox!.x + scaleBox!.width / 2 + 60, scaleBox!.y + scaleBox!.height / 2 + 60, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await cellSizeOutput.getAttribute('data-cell-size'))).not.toBe(movedCellSize);
  const scaledCellSize = Number(await cellSizeOutput.getAttribute('data-cell-size'));
  expect(scaledCellSize).not.toBe(movedCellSize);
  const afterSize = {
    cols: Number(await cellSizeOutput.getAttribute('data-grid-cols')),
    rows: Number(await cellSizeOutput.getAttribute('data-grid-rows')),
  };
  expect(afterSize.cols * afterSize.rows).toBeLessThan(beforeSize.cols * beforeSize.rows);

  await page.getByRole('button', { name: '完成' }).click();
  await expect(page.getByRole('heading', { name: '浏览' })).toBeVisible();
  await expect(page.locator('.split-pattern-meta')).toContainText(`${afterSize.cols} × ${afterSize.rows}`);
  await page.getByRole('button', { name: '导入画布' }).click();

  const importedSize = await page.locator('.h5-image-canvas').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    return { cols: canvas.width, rows: canvas.height };
  });
  expect(importedSize).toEqual(afterSize);
});

test('zooms the image outside the alignment controls without changing the grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);
  await page.getByRole('tab', { name: '对格子', exact: true }).click();

  const stage = page.locator('.split-image-container');
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  const previewCanvas = page.locator('.split-preview-canvas');
  const initialCanvasBox = await previewCanvas.boundingBox();
  expect(initialCanvasBox).not.toBeNull();
  expect(initialCanvasBox!.width).toBeCloseTo(stageBox!.width, 0);
  expect(initialCanvasBox!.height).toBeCloseTo(stageBox!.height, 0);
  const moveHandle = page.getByLabel('按住移动网格');
  const moveBox = await moveHandle.boundingBox();
  expect(moveBox).not.toBeNull();
  const outsidePoint = {
    x: stageBox!.x + 18,
    y: stageBox!.y + 18,
  };
  expect(
    outsidePoint.x < moveBox!.x || outsidePoint.x > moveBox!.x + moveBox!.width
      || outsidePoint.y < moveBox!.y || outsidePoint.y > moveBox!.y + moveBox!.height,
  ).toBeTruthy();

  const offsetOutput = page.getByRole('status', { name: '网格偏移' });
  const cellSizeOutput = page.getByRole('status', { name: '格距' });
  const initialReadout = {
    x: await offsetOutput.getAttribute('data-offset-x'),
    y: await offsetOutput.getAttribute('data-offset-y'),
    cellSize: await cellSizeOutput.getAttribute('data-cell-size'),
  };
  await expect(stage).toHaveAttribute('data-image-scale', '1');
  await page.mouse.move(outsidePoint.x, outsidePoint.y);
  await page.mouse.wheel(0, -240);
  await expect.poll(async () => Number(await stage.getAttribute('data-image-scale'))).toBeGreaterThan(1);
  const zoomedCanvasBox = await previewCanvas.boundingBox();
  expect(zoomedCanvasBox).not.toBeNull();
  expect(zoomedCanvasBox!.width).toBeCloseTo(initialCanvasBox!.width, 0);
  expect(zoomedCanvasBox!.height).toBeCloseTo(initialCanvasBox!.height, 0);
  expect({
    x: await offsetOutput.getAttribute('data-offset-x'),
    y: await offsetOutput.getAttribute('data-offset-y'),
    cellSize: await cellSizeOutput.getAttribute('data-cell-size'),
  }).toEqual(initialReadout);
});

test('clicks outside the alignment controls to zoom the image', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);
  await page.getByRole('tab', { name: '对格子', exact: true }).click();

  const stage = page.locator('.split-image-container');
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  await page.mouse.click(stageBox!.x + 18, stageBox!.y + 18);
  await expect.poll(async () => Number(await stage.getAttribute('data-image-scale'))).toBeGreaterThan(1);
});

test('pans the image and attached grid outside the alignment controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(uploadFixture);
  await page.getByRole('tab', { name: '对格子', exact: true }).click();

  const stage = page.locator('.split-image-container');
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  const beforeX = Number(await stage.getAttribute('data-image-offset-x'));
  const beforeY = Number(await stage.getAttribute('data-image-offset-y'));
  await page.mouse.move(box!.x + 20, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + 60, box!.y + 36, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => Number(await stage.getAttribute('data-image-offset-x'))).not.toBe(beforeX);
  await expect.poll(async () => Number(await stage.getAttribute('data-image-offset-y'))).not.toBe(beforeY);
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

  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
  await expect(page.getByLabel('分割预览图')).toBeVisible();
  await expect(page.locator('.split-quick-output')).toHaveText(/\d+\s*×\s*\d+/);
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
  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toHaveCount(0);
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
  await expect(page.getByRole('heading', { name: '分割设置', exact: true })).toBeVisible();
  expect(imageDownloadCount).toBe(1);
});

test('shows STL export only in the peg board workflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('button', { name: '创建敲豆图纸', exact: true }).click();
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
