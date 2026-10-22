import { defineConfig, devices } from '@playwright/test';
if (!process.env.E2E_BASE_URL || process.env.PLAYWRIGHT_SKIP_WEBSERVER !== '1') throw new Error('vnext_e2e_requires_explicit_isolated_server');
export default defineConfig({
  testDir: './e2e', testMatch: ['vnext.spec.ts','vnext-revision.spec.ts','vnext-worker.spec.ts','vnext-rights.spec.ts','vnext-current.spec.ts'], timeout: 120_000, workers: 1, fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: process.env.VNEXT_E2E_JSON || 'test-results/vnext-results.json' }]],
  use: { baseURL: process.env.E2E_BASE_URL, trace: 'retain-on-failure', screenshot: 'on',
    launchOptions: { executablePath: process.env.VNEXT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium' } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});
