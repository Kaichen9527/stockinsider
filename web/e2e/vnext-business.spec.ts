import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { expectCompleteArticle } from './vnext-article-assertions';

const root = process.env.VNEXT_BROWSER_FIXTURES;
if (!root || !path.isAbsolute(root)) throw Error('owned_business_snapshots_required');
const home = JSON.parse(fs.readFileSync(path.join(root, 'home-before.json'), 'utf8'));
const detailBefore = JSON.parse(fs.readFileSync(path.join(root, 'detail-before.json'), 'utf8'));
const detailAfter = JSON.parse(fs.readFileSync(path.join(root, 'detail.json'), 'utf8'));

test('current source-bound business inference is visible without score approval and disappears on committed source withdrawal', async ({ page, request }, info) => {
  const bridge = 'http://127.0.0.1:' + process.env.VNEXT_BROWSER_BRIDGE_PORT;
  const headers = { 'x-test-control': process.env.VNEXT_BROWSER_CONTROL_KEY || '' };
  const original = detailBefore.history[0];
  const historical = detailAfter.history[0];
  const revisionUrl = '/stock/2409?vnextRevision=' + original.revisionId;
  const member = (symbol: string) => page.getByTestId('vnext-member').filter({
    has: page.getByRole('link', { name: symbol, exact: true }),
  });

  expect(home.members).toHaveLength(2);
  expect(original.sourceRights.current).toBe(true);
  expect(historical.sourceRights.current).toBe(false);
  expect(historical.revisionId).toBe(original.revisionId);
  expect(historical.content).toEqual(original.content);

  await test.step('current business evidence and independent score status', async () => {
    expect((await request.post(bridge + '/__fixture/control', { headers, data: { mode: 'before' } })).status(), 'fixture control before').toBe(200);
    await page.goto('/');
    const main = page.getByTestId('vnext-home').filter({ visible: true });
    await expect(main).toHaveCount(1);
    await expect(main.locator(':scope > section')).toHaveCount(2);
    await expect(page.getByTestId('vnext-member')).toHaveCount(2);
    await expect(page.getByText('研究條件符合', { exact: true })).toHaveCount(0);

    const card = member('2409');
    await expect(card).toHaveCount(1);
    await card.getByText('來源支持的分析與限制', { exact: true }).click();
    await expect(card.getByText('競爭優勢分析：有條件支持（推論）', { exact: true })).toBeVisible();
    await expect(card.getByText('論點風險分析：證據不足（推論）', { exact: true })).toBeVisible();
    await expect(card.getByText('證據尚不足，暫無當期分數')).toBeVisible();
    await page.screenshot({ path: info.outputPath('business-current-inference.png'), fullPage: true });

    await card.getByRole('link', { name: '2409', exact: true }).click();
    await expectCompleteArticle(page, original.content.sections);
  });

  await test.step('withdrawn inference disappears while a separate original remains', async () => {
    expect((await request.post(bridge + '/__fixture/control', { headers, data: { mode: 'full' } })).status(), 'fixture control full').toBe(200);
    await page.goto('/');
    const withdrawn = member('2409');
    await expect(withdrawn.getByText('來源支持的分析與限制', { exact: true })).toHaveCount(0);
    await expect(withdrawn.getByText('原始來源權利或版本驗證有缺口；保留歷史研究，目前不具新進場條件。', { exact: true })).toBeVisible();
    await expect(page.getByText('研究條件符合', { exact: true })).toHaveCount(0);

    const remaining = member('2383');
    await remaining.getByText('來源支持的分析與限制', { exact: true }).click();
    await expect(remaining.getByText('競爭優勢分析：有反證（推論）', { exact: true })).toBeVisible();
    const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
    await page.screenshot({ path: info.outputPath('business-withdrawn-inference.png'), fullPage: true });
  });

  await test.step('the exact historical article remains readable', async () => {
    await page.goto(revisionUrl);
    await expect(page.getByText('原始來源權利目前無法驗證；內容保留為歷史紀錄，不具新進場條件。', { exact: true })).toBeVisible();
    await expectCompleteArticle(page, original.content.sections);
    await expect(page.getByRole('link', { name: original.publishedAt, exact: true })).toHaveAttribute('href', revisionUrl);
    await page.screenshot({ path: info.outputPath('business-retained-history.png'), fullPage: true });
  });
});
