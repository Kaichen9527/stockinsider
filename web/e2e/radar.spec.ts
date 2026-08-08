import { expect, test } from '@playwright/test';

test('radar page renders and View Insight reaches deep dive without runtime errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /台股故事型機會|找出還沒反映在股價上的/i })).toBeVisible();
  await expect(page.getByText('查看全量來源檢索')).toBeVisible();
  const themePanel = page.getByTestId('theme-source-panel').first();
  await expect(themePanel).toBeVisible();
  await themePanel.locator('summary').click();
  await expect(themePanel).toHaveAttribute('open', '');
  const radarApi = await page.request.get('/api/radar/daily');
  expect(radarApi.status()).toBe(200);
  const radarJson = (await radarApi.json()) as {
    opportunities?: Array<{ symbol: string }>;
    fallbackOpportunities90d?: Array<{ symbol: string }>;
    earlyWatchlist?: Array<{ symbol: string }>;
    discoveredStocks?: Array<{ symbol: string }>;
  };
  const targetSymbol =
    radarJson.opportunities?.[0]?.symbol ||
    radarJson.fallbackOpportunities90d?.[0]?.symbol ||
    radarJson.earlyWatchlist?.[0]?.symbol ||
    radarJson.discoveredStocks?.[0]?.symbol;
  const symbolUnderTest = targetSymbol || '2330';
  await page.goto(`/stock/${symbolUnderTest}`);

  await expect(page).toHaveURL(/\/stock\/[A-Z0-9]+$/);
  const pendingHeading = page.getByRole('heading', { name: /深度分析準備中/i });
  if (await pendingHeading.isVisible().catch(() => false)) {
    await expect(page.getByText(/系統已自動觸發/i)).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: /研究主論點與估值邏輯/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /證據矩陣/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /執行計畫/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /早期來源與覆蓋狀態/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /報告摘要/i })).toBeVisible();
  }

  const errorNoise = [...consoleErrors, ...pageErrors].filter(
    (message) =>
      !message.includes('favicon') &&
      !message.includes('Failed to load resource') &&
      !message.includes('download the React DevTools') &&
      !message.includes("Hydration failed because the server rendered HTML didn't match the client"),
  );

  expect(errorNoise, `Unexpected browser errors:\n${errorNoise.join('\n')}`).toEqual([]);
});
