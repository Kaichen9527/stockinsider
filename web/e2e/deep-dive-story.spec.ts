import { expect, test } from '@playwright/test';
import { installConsoleErrorGate } from './support/console';

test.describe.configure({ mode: 'serial' });

test('deep-dive page surfaces unified target snapshot, chart + valuation row, and single report container', async ({ page }) => {
  const assertNoConsoleErrors = installConsoleErrorGate(page);
  const radarRes = await page.request.get('/api/radar/daily');
  expect(radarRes.status()).toBe(200);
  const radar = (await radarRes.json()) as {
    opportunities?: Array<{ symbol: string }>;
    scenarioUpsideCandidates?: Array<{ symbol: string }>;
    fallbackOpportunities90d?: Array<{ symbol: string }>;
    earlyWatchlist?: Array<{ symbol: string }>;
  };

  const symbol =
    radar.opportunities?.[0]?.symbol ||
    radar.scenarioUpsideCandidates?.[0]?.symbol ||
    radar.fallbackOpportunities90d?.[0]?.symbol ||
    radar.earlyWatchlist?.[0]?.symbol ||
    '2454';

  await page.goto(`/stock/${symbol}`);
  const pendingHeading = page.getByRole('heading', { name: /深度分析準備中/i });
  if (await pendingHeading.isVisible().catch(() => false)) {
    await expect(page.getByText(/系統已自動觸發/i)).toBeVisible();
    await assertNoConsoleErrors();
    return;
  }

  await expect(page.getByText('目前股價', { exact: true })).toBeVisible();
  await expect(page.getByText('Base 目標價', { exact: true })).toBeVisible();
  await expect(page.getByText('情境目標價', { exact: true })).toBeVisible();
  await expect(page.getByText('Base 空間', { exact: true })).toBeVisible();
  await expect(page.getByText('情境空間', { exact: true })).toBeVisible();
  await expect(page.getByText('資料健康', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('K 線與量價節奏', { exact: true })).toBeVisible();
  await expect(page.getByText('主要財務數據及估值', { exact: true })).toBeVisible();
  await expect(page.getByText('深度分析報告', { exact: true })).toBeVisible();
  await expect(page.getByText('焦點內容', { exact: true })).toBeVisible();
  await expect(page.getByText('評論及分析', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('共同基底與來源', { exact: true })).toBeVisible();
  await expect(page.getByText('進場計畫', { exact: true })).toBeVisible();
  await expect(page.getByText('Base 財務推導', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('情境差分推導', { exact: true }).first()).toBeVisible();
  const scenarioHeading = page.getByText('情境差分推導', { exact: true }).first();
  const scenarioCollapsedNote = page.getByText(/目前尚無獨立上行情境|Base 已涵蓋主要已知故事/).first();
  const hasScenarioHeading = await scenarioHeading.isVisible().catch(() => false);
  const hasScenarioNote = await scenarioCollapsedNote.isVisible().catch(() => false);
  expect(hasScenarioHeading || hasScenarioNote).toBeTruthy();
  await expect(page.getByText('最新證據', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('資金與籌碼', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('投資建議', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('投資風險', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Appendix', { exact: true })).toBeVisible();
  await assertNoConsoleErrors();
});
