import { expect, test, type Locator, type Page } from '@playwright/test';

const GRID_SIZE = 108;
const TARGET_CELL = { col: 54, row: 54 };
const MAX_ZOOM = 12;

async function createBlankCanvas(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '新建空白画布' }).click();
  const dialog = page.getByRole('dialog', { name: '新建画布设置' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('spinbutton', { name: '宽度列数' }).fill(String(GRID_SIZE));
  await dialog.getByRole('spinbutton', { name: '高度行数' }).fill(String(GRID_SIZE));
  await dialog.getByRole('button', { name: '创建画布' }).click();
  await expect(page.getByLabel('H5 画布编辑器')).toBeVisible();
}

async function artworkSurface(page: Page): Promise<Locator> {
  const interaction = page.locator('.h5-canvas-interaction');
  return await interaction.count() > 0 ? interaction : page.locator('.h5-grid-canvas');
}

async function paintKnownCell(page: Page) {
  await page.getByRole('button', { name: '选择色号 A10', exact: true }).click();
  const artwork = await artworkSurface(page);
  const box = await artwork.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(
    box!.x + ((TARGET_CELL.col + 0.5) / GRID_SIZE) * box!.width,
    box!.y + ((TARGET_CELL.row + 0.5) / GRID_SIZE) * box!.height,
  );
}

async function cameraScale(page: Page) {
  return page.locator('.react-transform-component').evaluate((node) => {
    const transform = getComputedStyle(node).transform;
    if (!transform || transform === 'none') return 1;
    return new DOMMatrixReadOnly(transform).a;
  });
}

async function waitTwoAnimationFrames(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function zoomByButtonsTo(page: Page, target: number) {
  const zoomIn = page.getByRole('button', { name: '放大画布' });
  let scale = await cameraScale(page);
  let clicks = 0;
  while (scale < target - 0.05) {
    const previousScale = scale;
    clicks += 1;
    await zoomIn.click();
    await expect.poll(() => cameraScale(page), {
      message: `camera should advance after zoom step ${clicks}`,
      timeout: 2_000,
      intervals: [16, 32, 64, 100],
    }).toBeGreaterThan(previousScale + 0.02);
    await expect.poll(async () => {
      const first = await cameraScale(page);
      await waitTwoAnimationFrames(page);
      const second = await cameraScale(page);
      return Math.abs(second - first);
    }, {
      message: `camera matrix should settle after zoom step ${clicks}`,
      timeout: 2_000,
      intervals: [16, 32, 64, 100],
    }).toBeLessThan(0.002);
    scale = await cameraScale(page);
  }
  await waitTwoAnimationFrames(page);
}

type LayerMetrics = {
  css: { x: number; y: number; width: number; height: number };
  backing: { width: number; height: number };
  transform: string;
  identityTransform: boolean;
};

type ZoomMetrics = {
  dpr: number;
  scale: number;
  wrapper: { x: number; y: number; width: number; height: number };
  artboard: { x: number; y: number; width: number; height: number };
  layers: LayerMetrics[];
  codeInk: { width: number; height: number; pixels: number };
  gridStrokeBackingPixels: number;
  effectiveRenderScale: number;
};

async function readZoomMetrics(page: Page): Promise<ZoomMetrics> {
  return page.evaluate(({ gridSize, targetCell }) => {
    const wrapper = document.querySelector('.react-transform-wrapper');
    const artboard = document.querySelector('.h5-canvas-interaction')
      ?? document.querySelector('.h5-artboard');
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>(
      '.h5-color-canvas, .h5-code-canvas, .h5-grid-canvas',
    )];
    if (!(wrapper instanceof HTMLElement) || !(artboard instanceof HTMLElement) || canvases.length !== 3) {
      throw new Error('Missing viewport, artboard, or three Canvas layers');
    }

    const rectObject = (rect: DOMRect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
    const wrapperRect = wrapper.getBoundingClientRect();
    const artboardRect = artboard.getBoundingClientRect();
    const codeCanvas = document.querySelector<HTMLCanvasElement>('.h5-code-canvas')!;
    const gridCanvas = document.querySelector<HTMLCanvasElement>('.h5-grid-canvas')!;
    const codeRect = codeCanvas.getBoundingClientRect();
    const gridRect = gridCanvas.getBoundingClientRect();

    const cellScreenBounds = {
      left: artboardRect.left + (targetCell.col / gridSize) * artboardRect.width,
      right: artboardRect.left + ((targetCell.col + 1) / gridSize) * artboardRect.width,
      top: artboardRect.top + (targetCell.row / gridSize) * artboardRect.height,
      bottom: artboardRect.top + ((targetCell.row + 1) / gridSize) * artboardRect.height,
    };
    const toBackingX = (screenX: number, canvas: HTMLCanvasElement, rect: DOMRect) => (
      ((screenX - rect.left) / rect.width) * canvas.width
    );
    const toBackingY = (screenY: number, canvas: HTMLCanvasElement, rect: DOMRect) => (
      ((screenY - rect.top) / rect.height) * canvas.height
    );

    const codeLeft = Math.max(0, Math.floor(toBackingX(cellScreenBounds.left, codeCanvas, codeRect)));
    const codeRight = Math.min(codeCanvas.width, Math.ceil(toBackingX(cellScreenBounds.right, codeCanvas, codeRect)));
    const codeTop = Math.max(0, Math.floor(toBackingY(cellScreenBounds.top, codeCanvas, codeRect)));
    const codeBottom = Math.min(codeCanvas.height, Math.ceil(toBackingY(cellScreenBounds.bottom, codeCanvas, codeRect)));
    const codeContext = codeCanvas.getContext('2d');
    if (!codeContext || codeRight <= codeLeft || codeBottom <= codeTop) {
      throw new Error('Target code cell is outside the visible Canvas');
    }
    const codePixels = codeContext.getImageData(
      codeLeft,
      codeTop,
      codeRight - codeLeft,
      codeBottom - codeTop,
    ).data;
    let inkLeft = Number.POSITIVE_INFINITY;
    let inkRight = Number.NEGATIVE_INFINITY;
    let inkTop = Number.POSITIVE_INFINITY;
    let inkBottom = Number.NEGATIVE_INFINITY;
    let inkPixels = 0;
    const codeWidth = codeRight - codeLeft;
    for (let index = 3; index < codePixels.length; index += 4) {
      if ((codePixels[index] ?? 0) <= 16) continue;
      const pixel = (index - 3) / 4;
      const x = pixel % codeWidth;
      const y = Math.floor(pixel / codeWidth);
      inkLeft = Math.min(inkLeft, x);
      inkRight = Math.max(inkRight, x);
      inkTop = Math.min(inkTop, y);
      inkBottom = Math.max(inkBottom, y);
      inkPixels += 1;
    }

    const effectiveRenderScale = gridCanvas.width / gridRect.width;
    const boundaryBackingX = toBackingX(cellScreenBounds.left, gridCanvas, gridRect);
    const sampleBackingY = Math.max(0, Math.min(
      gridCanvas.height - 1,
      Math.round(toBackingY((cellScreenBounds.top + cellScreenBounds.bottom) / 2, gridCanvas, gridRect)),
    ));
    const scanRadius = Math.max(3, Math.ceil(effectiveRenderScale * 2));
    const scanLeft = Math.max(0, Math.floor(boundaryBackingX) - scanRadius);
    const scanRight = Math.min(gridCanvas.width, Math.ceil(boundaryBackingX) + scanRadius + 1);
    const gridContext = gridCanvas.getContext('2d');
    if (!gridContext) throw new Error('Missing grid context');
    const gridPixels = gridContext.getImageData(
      scanLeft,
      sampleBackingY,
      scanRight - scanLeft,
      1,
    ).data;
    let strokeAlpha = 0;
    let maximumStrokeAlpha = 0;
    for (let index = 3; index < gridPixels.length; index += 4) {
      const alpha = gridPixels[index] ?? 0;
      strokeAlpha += alpha;
      maximumStrokeAlpha = Math.max(maximumStrokeAlpha, alpha);
    }

    const transform = getComputedStyle(document.querySelector('.react-transform-component')!).transform;
    const scale = !transform || transform === 'none' ? 1 : new DOMMatrixReadOnly(transform).a;
    return {
      dpr: window.devicePixelRatio,
      scale,
      wrapper: rectObject(wrapperRect),
      artboard: rectObject(artboardRect),
      layers: canvases.map((canvas) => ({
        css: rectObject(canvas.getBoundingClientRect()),
        backing: { width: canvas.width, height: canvas.height },
        transform: getComputedStyle(canvas).transform,
        identityTransform: (() => {
          const canvasTransform = getComputedStyle(canvas).transform;
          return !canvasTransform
            || canvasTransform === 'none'
            || new DOMMatrixReadOnly(canvasTransform).isIdentity;
        })(),
      })),
      codeInk: {
        width: inkPixels === 0 ? 0 : inkRight - inkLeft + 1,
        height: inkPixels === 0 ? 0 : inkBottom - inkTop + 1,
        pixels: inkPixels,
      },
      gridStrokeBackingPixels: maximumStrokeAlpha === 0 ? 0 : strokeAlpha / maximumStrokeAlpha,
      effectiveRenderScale,
    };
  }, { gridSize: GRID_SIZE, targetCell: TARGET_CELL });
}

function expectRectClose(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
  evidence: string,
) {
  expect.soft(actual.x, evidence).toBeCloseTo(expected.x, 0);
  expect.soft(actual.y, evidence).toBeCloseTo(expected.y, 0);
  expect.soft(actual.width, evidence).toBeCloseTo(expected.width, 0);
  expect.soft(actual.height, evidence).toBeCloseTo(expected.height, 0);
}

test('redraws a 108×108 grid sharply at viewport DPR through 12× zoom', async ({ page }, testInfo) => {
  await createBlankCanvas(page);
  await paintKnownCell(page);

  await zoomByButtonsTo(page, 2);
  const atTwo = await readZoomMetrics(page);
  expect(atTwo.scale).toBeCloseTo(2, 0);

  await zoomByButtonsTo(page, MAX_ZOOM);
  const atTwelve = await readZoomMetrics(page);
  expect(atTwelve.scale).toBeCloseTo(MAX_ZOOM, 1);

  await testInfo.attach('viewport-canvas-metrics.json', {
    body: JSON.stringify({ atTwo, atTwelve }, null, 2),
    contentType: 'application/json',
  });
  const evidence = [
    `DPR ${atTwo.dpr}; wrapper ${atTwo.wrapper.width}×${atTwo.wrapper.height}`,
    `~2×: scale ${atTwo.scale}, canvas ${atTwo.layers[0]?.css.width}×${atTwo.layers[0]?.css.height}, backing ${atTwo.layers[0]?.backing.width}×${atTwo.layers[0]?.backing.height}, ink ${atTwo.codeInk.width}×${atTwo.codeInk.height}`,
    `12×: scale ${atTwelve.scale}, canvas ${atTwelve.layers[0]?.css.width}×${atTwelve.layers[0]?.css.height}, backing ${atTwelve.layers[0]?.backing.width}×${atTwelve.layers[0]?.backing.height}, ink ${atTwelve.codeInk.width}×${atTwelve.codeInk.height}`,
  ].join('\n');

  expect.soft(atTwo.dpr, evidence).toBe(3);
  expect.soft(atTwelve.dpr, evidence).toBe(3);
  for (const metrics of [atTwo, atTwelve]) {
    for (const layer of metrics.layers) {
      expectRectClose(layer.css, metrics.wrapper, evidence);
      expect.soft(layer.identityTransform, `${layer.transform}\n${evidence}`).toBe(true);
      expect.soft(layer.backing.width, evidence).toBeCloseTo(Math.round(metrics.wrapper.width * metrics.dpr), 0);
      expect.soft(layer.backing.height, evidence).toBeCloseTo(Math.round(metrics.wrapper.height * metrics.dpr), 0);
    }
    const expectedStroke = 0.75 * metrics.effectiveRenderScale;
    expect.soft(metrics.gridStrokeBackingPixels, evidence).toBeGreaterThanOrEqual(expectedStroke - 1.25);
    expect.soft(metrics.gridStrokeBackingPixels, evidence).toBeLessThanOrEqual(expectedStroke + 1.25);
  }

  expect.soft(atTwelve.layers.map((layer) => layer.backing), evidence).toEqual(
    atTwo.layers.map((layer) => layer.backing),
  );
  expect.soft(atTwo.codeInk.pixels, evidence).toBeGreaterThan(0);
  expect.soft(atTwelve.codeInk.pixels, evidence).toBeGreaterThan(0);
  expect.soft(atTwelve.codeInk.width, evidence).toBeGreaterThanOrEqual(atTwo.codeInk.width * 3);
  expect.soft(atTwelve.codeInk.height, evidence).toBeGreaterThanOrEqual(atTwo.codeInk.height * 3);
});
