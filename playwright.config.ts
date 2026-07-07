import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'SQLITE_PATH=/tmp/qiaoqiaole-e2e.sqlite QIAOQIAOLE_USERNAME=admin QIAOQIAOLE_PASSWORD=qiaoqiaole123 npm run dev:api',
      url: 'http://127.0.0.1:3000/api/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev:web -- --port 5173',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev:h5 -- --port 5174',
      url: 'http://127.0.0.1:5174',
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
        baseURL: 'http://127.0.0.1:5174',
      },
    },
  ],
});
