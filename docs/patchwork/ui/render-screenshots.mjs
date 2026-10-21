/**
 * 在项目根目录运行：
 *   node docs/patchwork/ui/render-screenshots.mjs
 * 所有截图保存在 docs/patchwork/ui/screenshots/，不会启动真实 H5 或调用 API。
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const out = join(base, 'screenshots');
const labels = [
  '01-my-fabric-warehouse',
  '02-upload-fabric',
  '03-fabric-detail',
  '04-select-own-fabric',
  '05-missing-fabric-canvas',
  '06-project-requirements',
  '07-confirm-cutting',
  '08-inventory-ledger',
];

await mkdir(out, {recursive: true});
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--allow-file-access-from-files'],
});
try {
  const page = await browser.newPage({
    viewport: {width: 1520, height: 980},
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(join(base, 'index.html')).href, {waitUntil: 'load'});
  await page.evaluate(() => document.fonts.ready);
  const frames = page.locator('.device[data-screen]');
  if (await frames.count() !== labels.length) throw new Error('Expected 8 screens');
  const images = await page.locator('img').evaluateAll(imgs =>
    imgs.map(img => ({ src: img.getAttribute('src'), ok: img.complete && img.naturalWidth > 0 }))
  );
  const failures = images.filter(image => !image.ok);
  if (failures.length) throw new Error('Missing image assets: ' + JSON.stringify(failures));
  for (let i = 0; i < labels.length; i++) {
    await frames.nth(i).screenshot({path: join(out, labels[i] + '.png'), animations: 'disabled'});
    console.log('Captured', labels[i], await frames.nth(i).evaluate(el => ({
      width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height,
    })));
  }
  await page.screenshot({path: join(out, '00-all-screens.png'), fullPage: true, animations: 'disabled'});
  // 验证静态原型交互是可操作的，而不是只输出无效按钮。
  const filter = page.locator('#s01 [data-filter="insufficient"]');
  await filter.click();
  const shown = await page.locator('#s01 .fabric-card[data-state]:visible').count();
  if (shown !== 1) throw new Error('Filter interaction failed: ' + shown);
  const input = page.locator('#fabric-photo-input');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#pick-fabric-photo').click();
  const chooser = await chooserPromise;
  if (!chooser || !(await input.count())) throw new Error('File chooser interaction failed');
  const confirm = page.locator('#confirm-cut');
  if (!(await confirm.isDisabled())) throw new Error('Stock confirmation not guarded');
  await page.locator('#cut-confirm-row').click();
  if (await confirm.isDisabled()) throw new Error('Confirmation checkbox failed');
  await confirm.click();
  if (!(await page.locator('#prototype-toast').textContent()).includes('未实际扣减')) throw new Error('Prototype warning missing');
  if (errors.length) throw new Error('Browser JS errors: ' + errors.join('; '));
  console.log('VALIDATION PASSED: 8 screens,', images.length, 'images, filters, file chooser, guarded cutting button');
} finally {
  await browser.close();
}
