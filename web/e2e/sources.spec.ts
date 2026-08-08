import { expect, test } from '@playwright/test';

test('sources explorer shows connector status and audit evidence', async ({ page }) => {
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

  await page.goto('/sources');
  await expect(page.getByRole('heading', { name: /全量來源檢索中心/i })).toBeVisible();
  await expect(page.getByText('Connector 狀態')).toBeVisible();
  await expect(page.getByText('最近 Connector Runs')).toBeVisible();
  await expect(page.getByText('抓取稽核證據（Source Audits）')).toBeVisible();
  await expect(page.getByText(/定錨投筆|Threads|Instagram|Telegram|PTT Stock/i).first()).toBeVisible();
  await page.goto('/sources?symbol=2330');
  await expect(page.getByRole('link', { name: /研究這檔/i }).first()).toBeVisible();

  const errorNoise = [...consoleErrors, ...pageErrors].filter(
    (message) =>
      !message.includes('favicon') &&
      !message.includes('Failed to load resource') &&
      !message.includes('download the React DevTools'),
  );

  expect(errorNoise, `Unexpected browser errors:\n${errorNoise.join('\n')}`).toEqual([]);
});
