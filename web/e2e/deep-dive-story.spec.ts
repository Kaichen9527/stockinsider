import { expect, test } from '@playwright/test';
import { installConsoleErrorGate } from './support/console';

test.describe.configure({ mode: 'serial' });

test('revision-bound detail renders the exact Decision Brief selected by the V3.13 Landing card', async ({ page }) => {
  const assertNoConsoleErrors = installConsoleErrorGate(page);
  const revision=`decision-v3.13:${'a'.repeat(64)}`;
  await page.goto('/v313-decision-fixture');
  const link=page.getByRole('link',{name:/查看決策摘要/u}).first();
  await expect(link).toHaveAttribute('href',`/stock/9101?decisionRevisionId=${encodeURIComponent(revision)}`);

  await link.click();
  await expect(page.getByTestId('decision-brief')).toBeVisible();
  await expect(page.getByTestId('detail-action')).toHaveText('research_starter');
  await expect(page.getByTestId('detail-authority')).toHaveText('conditional_research');
  await expect(page.getByTestId('detail-valuation')).toHaveText('90 / 117.65 / 135');
  await expect(page.getByTestId('detail-entry')).toHaveText('101–103');
  await expect(page.getByTestId('detail-invalidation')).toHaveText('92');
  await expect(page.getByTestId('detail-thesis').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('detail-risks').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('detail-source-dates')).toContainText('評估：');
  await expect(page.getByTestId('detail-revision')).toHaveText(revision);
  await assertNoConsoleErrors();
});
