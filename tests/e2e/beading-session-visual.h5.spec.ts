import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
] as const;

type Rect = { x: number; y: number; width: number; height: number };

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

async function assertCanvasAlignment(page: Page) {
  const geometry = await page.evaluate(() => {
    const artboard = document.querySelector<HTMLElement>('.beading-canvas-artboard');
    const layers = [...document.querySelectorAll<HTMLCanvasElement>(
      '.beading-canvas-artboard canvas',
    )];
    if (!artboard || layers.length !== 4) throw new Error('Expected one artboard and four Canvas layers');
    const rect = (node: Element) => {
      const value = node.getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };
    return { artboard: rect(artboard), layers: layers.map(rect) };
  });

  for (const layer of geometry.layers) {
    expect.soft(layer.x).toBeCloseTo(geometry.artboard.x, 0);
    expect.soft(layer.y).toBeCloseTo(geometry.artboard.y, 0);
    expect.soft(layer.width).toBeCloseTo(geometry.artboard.width, 0);
    expect.soft(layer.height).toBeCloseTo(geometry.artboard.height, 0);
  }
}

for (const viewport of VIEWPORTS) {
  test(`matches the mobile beading workspace at ${viewport.name}px`, async ({ page }) => {
    await page.addInitScript(() => {
      Date.now = () => 1_786_276_800_000;
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(viewport);
    await page.goto('/?beading-fixture=1');
    const workspace = page.getByRole('main', { name: '开始拼豆' });
    await expect(workspace).toBeVisible();
    await expect(page.locator('.h5-overlay-canvas')).toBeVisible();
    await expect(page.locator('.beading-color-chip.is-current')).toBeVisible();

    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect.poll(async () => {
      const stage = await page.locator('.beading-canvas-stage').boundingBox();
      const artboard = await page.locator('.beading-canvas-artboard').boundingBox();
      if (!stage || !artboard || artboard.width <= 0) return false;
      return artboard.x >= stage.x - 4
        && artboard.x + artboard.width <= stage.x + stage.width + 4;
    }).toBe(true);
    const overlayInk = await page.locator('.h5-overlay-canvas').evaluate((canvas) => {
      const context = (canvas as HTMLCanvasElement).getContext('2d');
      if (!context) return 0;
      const pixels = context.getImageData(0, 0, (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height).data;
      let count = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if ((pixels[index] ?? 0) > 0) count += 1;
      }
      return count;
    });
    expect(overlayInk).toBeGreaterThan(0);

    const controls = page.locator('button:visible');
    for (let index = 0; index < await controls.count(); index += 1) {
      const box = await controls.nth(index).boundingBox();
      expect.soft(box, `button ${index} should have geometry`).not.toBeNull();
      if (box) {
        expect.soft(box.width, `button ${index} width`).toBeGreaterThanOrEqual(44);
        expect.soft(box.height, `button ${index} height`).toBeGreaterThanOrEqual(44);
      }
    }

    const toolbar = await page.locator('.beading-toolbar').boundingBox();
    const stage = await page.locator('.beading-canvas-stage').boundingBox();
    const artboard = await page.locator('.beading-canvas-artboard').boundingBox();
    const tools = await page.locator('.beading-tool-row').boundingBox();
    const colors = await page.locator('.beading-color-section').boundingBox();
    expect(toolbar).not.toBeNull();
    expect(stage).not.toBeNull();
    expect(artboard).not.toBeNull();
    expect(tools).not.toBeNull();
    expect(colors).not.toBeNull();
    expect(toolbar!.height).toBeLessThanOrEqual(96);
    expect(tools!.height + colors!.height).toBeLessThanOrEqual(190);
    expect(artboard!.width / stage!.width).toBeGreaterThanOrEqual(0.78);
    expect(artboard!.x).toBeGreaterThanOrEqual(stage!.x - 4);
    expect(artboard!.x + artboard!.width).toBeLessThanOrEqual(stage!.x + stage!.width + 4);
    expect(overlaps(stage!, toolbar!)).toBe(false);
    expect(overlaps(stage!, tools!)).toBe(false);
    expect(overlaps(stage!, colors!)).toBe(false);

    const currentBorder = await page.locator('.beading-color-chip.is-current').evaluate((node) => (
      getComputedStyle(node).boxShadow
    ));
    expect(currentBorder).toContain('240, 165, 23');

    await assertCanvasAlignment(page);

    await expect(workspace).toHaveScreenshot(`beading-${viewport.name}.png`, {
      animations: 'disabled',
      caret: 'hide',
    });

    await page.getByRole('button', { name: '进入专注模式' }).click();
    await expect(workspace).toHaveClass(/is-focus/);
    await expect(page.getByRole('button', { name: '退出专注模式' })).toBeVisible();
    await page.getByRole('button', { name: '退出专注模式' }).click();
    await expect(workspace).not.toHaveClass(/is-focus/);
  });
}
