import { expect,test } from '@playwright/test';
import { installConsoleErrorGate } from './support/console';

test('V3.14 V3.12 last-good compatibility preserves all 46 unique stocks and 30 source signals',async({page})=>{
  const assertNoConsoleErrors=installConsoleErrorGate(page);
  await page.goto('/v314-readonly-fixture');
  await expect(page.getByRole('tab',{name:/股票研究 46/u})).toBeVisible();
  await expect(page.getByRole('tab',{name:/社群發現 30/u})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('只讀顯示 last-good');
  await expect(page.getByTestId('readonly-report-link')).toHaveAttribute('href','/stock/9000');
  await expect(page.getByRole('link',{name:'深度分析 →'})).toHaveCount(0);
  await page.getByRole('tab',{name:/社群發現 30/u}).click();
  await expect(page.getByRole('article')).toHaveCount(30);
  await expect(page.getByTestId('research-only-detail-link')).toHaveCount(30);
  await expect(page.getByRole('link',{name:'查看決策摘要 →'})).toHaveCount(0);
  await page.getByTestId('research-only-detail-link').first().click();
  await expect(page.getByTestId('research-only-detail')).toContainText('研究模式 · 買進動作已停用');
  await expect(page.getByTestId('research-only-blockers')).toContainText('舊研究快照缺少現行決策權威');
  await assertNoConsoleErrors();
});

test('stale V3.14 card preserves its exact revision link and reaches a typed readonly detail',async({page})=>{
  const assertNoConsoleErrors=installConsoleErrorGate(page);
  const revision=`decision-v3.14:${'f'.repeat(64)}`;
  await page.goto('/v314-stale-decision-fixture');
  const card=page.getByRole('article',{name:/9106/u});
  await expect(card.getByText('資料待補',{exact:true})).toBeVisible();
  const link=card.getByRole('link',{name:'查看決策摘要 →'});
  await expect(link).toHaveAttribute('href',`/stock/9106?decisionRevisionId=${encodeURIComponent(revision)}`);
  await link.click();
  await expect(page.getByTestId('detail-revision')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(revision);
  await expect(page.getByTestId('detail-unavailable')).toContainText('研究快照已過期，目前僅顯示上次結果');
  await expect(page.getByTestId('detail-unavailable')).not.toContainText('projection_stale_readonly');
  await expect(page.getByTestId('decision-brief')).toHaveCount(0);
  await assertNoConsoleErrors();
});
