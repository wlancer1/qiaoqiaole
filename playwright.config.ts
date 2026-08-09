import { defineConfig, devices } from '@playwright/test';

function validPort(name: string, value: string | undefined, fallback: number): number {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return port;
}

const apiPort = validPort('API_E2E_PORT', process.env.API_E2E_PORT, 3100);
const webPort = validPort('WEB_E2E_PORT', process.env.WEB_E2E_PORT, 5183);
const h5Port = validPort('H5_E2E_PORT', process.env.H5_E2E_PORT, 5184);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const h5BaseUrl = `http://127.0.0.1:${h5Port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  use: { trace: 'retain-on-failure' },
  webServer: [
    {
      command: `PORT=${apiPort} SQLITE_PATH=/tmp/qiaoqiaole-e2e.sqlite QIAOQIAOLE_USERNAME=admin QIAOQIAOLE_PASSWORD=qiaoqiaole123 npm run dev:api`,
      url: `${apiBaseUrl}/api/health`,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_API === '1',
    },
    {
      command: `QIAOQIAOLE_API_URL=${apiBaseUrl} npm run dev:web -- --port ${webPort} --strictPort`,
      url: webBaseUrl,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_FRONTENDS === '1',
    },
    {
      command: `QIAOQIAOLE_API_URL=${apiBaseUrl} npm run dev:h5 -- --port ${h5Port} --strictPort`,
      url: h5BaseUrl,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_FRONTENDS === '1',
    },
  ],
  projects: [
    {
      name: 'web-chromium',
      testMatch: /app\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: webBaseUrl,
      },
    },
    {
      name: 'h5-chromium',
      testMatch: /h5\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: h5BaseUrl,
      },
    },
    {
      name: 'h5-dpr3',
      testMatch: /h5-viewport-canvas\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: h5BaseUrl,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
      },
    },
  ],
});
