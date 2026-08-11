import { expect, test } from '@playwright/test';
import { installConsoleErrorGate } from './support/console';

test('technical page uses chart-room layout instead of deep-dive report layout', async ({ page }) => {
  const assertNoConsoleErrors = installConsoleErrorGate(page);
  await page.goto('/stock/6230/technical');

  await expect(page.getByText('Chart Room', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('技術 Watchlist', { exact: true })).toBeVisible();
  await expect(page.getByText('Alert levels', { exact: true })).toBeVisible();
  await expect(page.getByText('籌碼面板', { exact: true })).toBeVisible();
  await expect(page.getByText('兩年日 K', { exact: true })).toBeVisible();
  await expect(page.getByText('深度分析報告', { exact: true })).toHaveCount(0);

  await assertNoConsoleErrors();
});
