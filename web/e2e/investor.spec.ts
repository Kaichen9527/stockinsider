import { expect, test } from '@playwright/test';
import { installConsoleErrorGate } from './support/console';

test.describe.configure({ mode: 'serial' });

test('investor view: radar fallback, deep-dive hero snapshot, chart row, and threads source visibility', async ({ page }) => {
  const assertNoConsoleErrors = installConsoleErrorGate(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /找出還沒反映在股價上的/i })).toBeVisible();

  const radarApi = await page.request.get('/api/radar/daily');
  expect(radarApi.status()).toBe(200);
  const radarJson = (await radarApi.json()) as {
    opportunities?: Array<{ symbol: string; chineseName?: string | null; recommendationBucket?: string | null }>;
    recentFormal7d?: Array<{ symbol: string }>;
    fallbackOpportunities90d?: Array<{ symbol: string; chineseName?: string | null }>;
    scenarioUpsideCandidates?: Array<{ symbol: string; chineseName?: string | null; expectedUpsidePct?: number | null }>;
    earlyWatchlist?: Array<{ symbol: string }>;
    discoveredStocks?: Array<{ symbol: string }>;
  };

  const availableCount =
    (radarJson.opportunities?.length || 0) +
    (radarJson.recentFormal7d?.length || 0) +
    (radarJson.fallbackOpportunities90d?.length || 0) +
    (radarJson.earlyWatchlist?.length || 0);
  expect(availableCount).toBeGreaterThan(0);
  const firstFormal = radarJson.opportunities?.[0];
  if (firstFormal) {
    expect(firstFormal.symbol).toMatch(/^\d{4}$/);
    expect(firstFormal.chineseName).toBeTruthy();
    if (firstFormal.recommendationBucket) {
      expect(['high_conviction', 'early_formal', 'historical_fallback', 'scenario_upside']).toContain(firstFormal.recommendationBucket);
    }
  }

  const memoTitle = page
    .locator('section:has-text("研究 memo 與發佈內容") h3')
    .first();
  if ((await memoTitle.count()) > 0) {
    await expect(memoTitle).toHaveText(/\[\d{4}\].+｜/);
  }

  const targetSymbol =
    radarJson.opportunities?.[0]?.symbol ||
    radarJson.scenarioUpsideCandidates?.[0]?.symbol ||
    radarJson.earlyWatchlist?.[0]?.symbol ||
    radarJson.recentFormal7d?.[0]?.symbol ||
    radarJson.fallbackOpportunities90d?.[0]?.symbol ||
    radarJson.discoveredStocks?.[0]?.symbol ||
    '2330';

  await page.goto(`/stock/${targetSymbol}`);
  await expect(page).toHaveURL(/\/stock\/[A-Z0-9]+$/);

  const pendingHeading = page.getByRole('heading', { name: /深度分析準備中/i });
  if (await pendingHeading.isVisible().catch(() => false)) {
    await expect(page.getByText(/系統已自動觸發/i)).toBeVisible();
    await assertNoConsoleErrors();
    return;
  }

  await expect(page.getByText('目前股價', { exact: true })).toBeVisible();
  await expect(page.getByText(/正式目標價|情境目標價|已接近反映/).first()).toBeVisible();
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

  const today = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.goto(`/sources?platform=threads&from=${today}`);
  await expect(page.getByRole('heading', { name: '全量來源檢索中心' })).toBeVisible();
  const hasSourceLink = (await page.getByRole('link', { name: /開啟來源|查看稽核目標/ }).count()) > 0;
  const hasErrorText = (await page.getByText(/錯誤：|查無符合條件的來源資料。/).count()) > 0;
  expect(hasSourceLink || hasErrorText).toBeTruthy();
  await assertNoConsoleErrors();
});
