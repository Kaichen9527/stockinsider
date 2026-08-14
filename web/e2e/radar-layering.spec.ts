import { expect, test } from '@playwright/test';
import { installConsoleErrorGate } from './support/console';

test.describe.configure({ mode: 'serial' });

test('V3.13 landing separates actionable, conditional, and source-only decisions', async ({ page }) => {
  const assertNoConsoleErrors = installConsoleErrorGate(page);
  await page.goto('/v313-decision-fixture');

  for (const heading of ['現在可行動', '等待條件', '新來源待研究']) {
    await expect(page.getByRole('heading', { name: heading })).toHaveCount(1);
  }
  await expect(page.getByRole('article')).toHaveCount(4);
  await expect(page.getByText('研究型小量分批', { exact: true })).toBeVisible();
  await expect(page.getByText('等待收復支撐', { exact: true })).toBeVisible();
  await expect(page.getByText('資料待補', { exact: true })).toBeVisible();
  await expect(page.getByText('接近買點・待深度驗證', { exact: true })).toBeVisible();
  await expect(page.getByText('高信念正式推薦', { exact: true })).toHaveCount(0);
  for (const card of await page.getByTestId('decision-card').all()) {
    expect(await card.locator('[data-decision-numeric-value]').count()).toBeLessThanOrEqual(6);
  }
  await assertNoConsoleErrors();
});

test('homepage decision stays consistent with its revision-bound detail envelope', async ({ page }) => {
  const assertNoConsoleErrors = installConsoleErrorGate(page);
  const revision=`decision-v3.13:${'a'.repeat(64)}`;
  await page.goto('/v313-decision-fixture');
  const card=page.getByRole('article',{name:/9101/u});
  await expect(card.getByText('研究型小量分批',{exact:true})).toBeVisible();
  const link=card.getByRole('link',{name:/查看決策摘要/u});
  await expect(link).toHaveAttribute('href',`/stock/9101?decisionRevisionId=${encodeURIComponent(revision)}`);
  await link.click();
  await expect(page.getByTestId('detail-revision')).toHaveText(revision);
  await expect(page.getByTestId('detail-action')).toHaveText('research_starter');
  await expect(page.getByTestId('detail-authority')).toHaveText('conditional_research');
  await expect(page.getByTestId('detail-valuation')).toHaveText('90 / 117.65 / 135');
  await assertNoConsoleErrors();
});
