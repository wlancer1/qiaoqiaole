import { defineConfig, devices } from '@playwright/test';

const h5Port = Number(process.env.H5_E2E_PORT || 5174);
const h5BaseUrl = `http://127.0.0.1:${h5Port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'SQLITE_PATH=/tmp/qiaoqiaole-e2e.sqlite QIAOQIAOLE_USERNAME=admin QIAOQIAOLE_PASSWORD=qiaoqiaole123 npm run dev:api',
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev:web -- --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run dev:h5 -- --port ${h5Port}`,
      url: h5BaseUrl,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'web-chromium',
      testMatch: /app\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:5173',
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
