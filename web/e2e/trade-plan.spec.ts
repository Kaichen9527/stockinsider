import { expect, test } from '@playwright/test';

test('P1-02/P1-06/P1-10: same-plan chart, blocked raw signal and responsive layers', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/trade-plan-fixture');
  const breakout = page.getByTestId('trade-plan-breakout');
  await expect(breakout).toHaveAttribute('data-plan-id', 'fixture-breakout');
  await expect(breakout.getByTestId('trade-plan-raw-signal')).toHaveText('技術條件已確認');
  await expect(breakout.getByTestId('trade-plan-eligibility')).toHaveText('當時正式門檻未通過');
  await expect(page.getByTestId('candidate-trade-summary')).toContainText('技術條件已確認');
  await expect(page.getByTestId('candidate-trade-summary')).toContainText('目前正式資格未通過');
  await expect(page.getByTestId('trade-candlestick-canvas').locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '上升趨勢回檔', exact: true }).click();
  await expect(page.getByRole('button', { name: '上升趨勢回檔', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('checkbox', { name: '水平支撐壓力', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: '水平支撐壓力', exact: true })).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '收盤突破', exact: true }).click();
  await page.getByRole('checkbox', { name: '水平支撐壓力', exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath('trade-plan-mobile-360.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByTestId('trade-candlestick-canvas').locator('canvas').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('trade-plan-desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('P1-05/P1-09: no synthetic candles for missing OHLCV or old publication', async ({ page }) => {
  await page.goto('/trade-plan-fixture?mode=missing');
  await expect(page.getByTestId('trade-chart-missing')).toBeVisible();
  await expect(page.getByTestId('trade-candlestick-canvas')).toHaveCount(0);
  await page.goto('/trade-plan-fixture?mode=legacy');
  await expect(page.getByTestId('trade-plan-unavailable')).toBeVisible();
  await expect(page.getByTestId('trade-candlestick-canvas')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '日線收盤與均線', exact: true })).toBeVisible();
});

test('P1-04/P1-07/P1-08: expired, preliminary and stale snapshots never imply current eligibility', async ({ page }) => {
  await page.goto('/trade-plan-fixture?mode=expired');
  await expect(page.getByTestId('trade-plan-breakout').getByTestId('trade-plan-display-state')).toHaveText('已到期，僅供歷史研究');
  await expect(page.getByTestId('trade-plan-breakout').getByTestId('trade-plan-raw-signal')).toHaveText('技術條件已確認');
  await expect(page.getByTestId('candidate-trade-summary')).toContainText('僅供歷史回看');
  await expect(page.getByTestId('trade-plan-breakout')).toContainText('未推定你的持倉');
  await page.goto('/trade-plan-fixture?mode=stale');
  await expect(page.getByTestId('trade-plan-publication-block')).toContainText('舊版研究，只供回看');
  await expect(page.getByTestId('candidate-trade-summary')).toContainText('目前正式資格停用');
  await page.goto('/trade-plan-fixture?mode=preliminary');
  await expect(page.getByTestId('trade-plan-publication-block')).toContainText('初步研究版本');
  await expect(page.getByRole('button', { name: /買進|下單|賣出/ })).toHaveCount(0);
});

test('source-signal current research navigation preserves exact historical decision links', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/trade-plan-fixture?mode=source-navigation');
  const cards = page.getByTestId('decision-card');
  await expect(cards).toHaveCount(3);
  const taiwan = cards.filter({ hasText: '合成來源 2330' });
  await expect(taiwan.getByTestId('decision-detail-link')).toHaveAttribute('href', `/stock/2330?decisionRevisionId=${encodeURIComponent(`decision-v3.13:${'a'.repeat(64)}`)}`);
  await expect(taiwan.getByTestId('current-technical-research-link')).toHaveAttribute('href', '/stock/2330');
  await expect(taiwan.getByTestId('current-technical-research-link')).toHaveText('目前技術研究 →');
  await expect(page.getByTestId('current-technical-research-link')).toHaveCount(1);
  await expect(page.getByTestId('candidate-trade-summary')).toHaveCount(0);
  await expect(taiwan).toContainText('連結不代表已有可用計畫');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

  await page.goto('/v313-decision-fixture');
  const frozenLink = page.getByTestId('decision-detail-link').first();
  await expect(frozenLink).toHaveAttribute('href', `/stock/9101?decisionRevisionId=${encodeURIComponent(`decision-v3.13:${'a'.repeat(64)}`)}`);
  await frozenLink.click();
  await expect(page).toHaveURL(/\/stock\/9101\?decisionRevisionId=decision-v3\.13%3A/);
  await expect(page.getByTestId('detail-entry')).toHaveText('101–103');
  await expect(page.getByTestId('current-technical-research-link')).toHaveAttribute('href', '/stock/9101');
  await expect(page.getByTestId('candidate-trade-plans')).toHaveCount(0);
  await page.goto(`/stock/2303?decisionRevisionId=${encodeURIComponent(`decision-v3.13:${'3'.repeat(64)}`)}`);
  await expect(page.getByTestId('research-only-detail')).toBeVisible();
  await expect(page.getByTestId('current-technical-research-link')).toHaveAttribute('href', '/stock/2303');
  await expect(page.getByTestId('candidate-trade-plans')).toHaveCount(0);
});
