import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';
const port = new URL(baseURL).port || '3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: `npm run dev -- --port ${port}`,
        env: {
          ...process.env,
          DATA_MODE: process.env.DATA_MODE || 'demo',
        },
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
