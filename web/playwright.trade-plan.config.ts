import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3112';
const port = new URL(baseURL).port || '3112';
export default defineConfig({
  testDir: './e2e', testMatch: ['trade-plan.spec.ts'], timeout: 60_000, workers: 1,
  reporter: [['list']], use: { baseURL, screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--disable-gpu', '--no-zygote'] } : undefined,
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1' ? undefined : {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    env: { ...process.env, OPPORTUNITY_V3_UI_FIXTURE: 'enabled', DATA_MODE: 'demo' },
    url: `${baseURL}/trade-plan-fixture`, reuseExistingServer: false, timeout: 120_000,
  },
});
