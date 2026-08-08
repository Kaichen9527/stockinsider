import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3101';
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';
const port = new URL(baseURL).port || '3101';
const internalKey = process.env.E2E_INTERNAL_API_KEY || 'stockinsider-v3-e2e-internal-key';
process.env.E2E_INTERNAL_API_KEY = internalKey;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'v3-correctness.spec.ts',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL },
  webServer: skipWebServer ? undefined : {
    command: `bash -lc 'test -f .next/BUILD_ID || npm run build; set -a; source ../.env 2>/dev/null || true; set +a; DATA_MODE=demo SOURCE_LED_OPPORTUNITY_V3=disabled OPPORTUNITY_V3_UI_FIXTURE=enabled npm run start -- --port ${port}'`,
    env: { ...process.env, INTERNAL_API_KEY: internalKey, DATA_MODE: 'demo', SOURCE_LED_OPPORTUNITY_V3: 'disabled', OPPORTUNITY_V3_UI_FIXTURE: 'enabled' },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
