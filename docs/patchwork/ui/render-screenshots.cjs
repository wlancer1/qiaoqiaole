#!/usr/bin/env node
/** 将 fabric-inventory-ui.html 的八张手机稿导出为 PNG。
 * 运行方式（从项目根目录）：node docs/patchwork/ui/render-screenshots.cjs
 * 此脚本只截取视觉设计稿，不启动/修改真实应用，也不访问业务 API。
 */
const { chromium } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const directory = __dirname;
const output = path.join(directory, 'screenshots');
const screens = [
  ['warehouse', '01-my-fabric-warehouse.png'],
  ['upload', '02-upload-fabric.png'],
  ['detail', '03-fabric-stock-detail.png'],
  ['picker', '04-editor-fabric-picker.png'],
  ['editor', '05-canvas-missing-warning.png'],
  ['requirements', '06-project-fabric-requirements.png'],
  ['cutting', '07-confirm-cutting-stock.png'],
  ['ledger', '08-stock-deduction-record.png'],
];

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1510, height: 950 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(directory, 'fabric-inventory-ui.html')).href, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => null))));
    for (const [id, name] of screens) {
      const device = page.locator('#' + id + ' .device');
      if (await device.count() !== 1) throw new Error('没有找到画面：' + id);
      await device.screenshot({ path: path.join(output, name), animations: 'disabled' });
      console.log(name);
    }
    // 完整总览适合做评审目录。
    await page.screenshot({ path: path.join(output, '00-all-screens-overview.png'), fullPage: true, animations: 'disabled' });
    const badImages = await page.evaluate(() => [...document.images].filter((i) => !i.complete || !i.naturalWidth).map((i) => i.getAttribute('src')));
    if (badImages.length) throw new Error('丢失布料图片：' + badImages.join(', '));
    if (errors.length) throw new Error('浏览器运行错误：' + errors.join(' | '));
    console.log('通过：8 个设计稿画面、完整总览，图片均加载，页面无脚本错误。');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
