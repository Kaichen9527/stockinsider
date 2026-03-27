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
  await expect(page.getByRole('heading', { name: /台股故事型機會/i })).toBeVisible();
  await expect(page.getByText('Agent 控制台')).toBeVisible();
  await expect(page.getByTestId('theme-source-panel')).toBeVisible();
  await page.getByTestId('theme-source-panel').locator('summary').click();
  await expect(page.getByText(/缺漏來源|PTT Stock|Threads|股市爆料同學會/i).first()).toBeVisible();
  await expect(page.getByTestId('view-insight-link')).toBeVisible();

  await page.getByTestId('view-insight-link').click();

  await expect(page).toHaveURL(/\/stock\/[A-Z0-9]+$/);
  await expect(page.getByRole('heading', { name: /研究主論點與估值邏輯/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /證據矩陣/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /執行計畫/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /早期來源與覆蓋狀態/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /報告摘要/i })).toBeVisible();

  const errorNoise = [...consoleErrors, ...pageErrors].filter(
    (message) =>
      !message.includes('favicon') &&
      !message.includes('Failed to load resource') &&
      !message.includes('download the React DevTools'),
  );

  expect(errorNoise, `Unexpected browser errors:\n${errorNoise.join('\n')}`).toEqual([]);
});
