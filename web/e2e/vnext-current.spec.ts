import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const root = process.env.VNEXT_BROWSER_FIXTURES;
if (!root || !path.isAbsolute(root)) throw Error('owned_current_snapshots_required');
const prior = JSON.parse(fs.readFileSync(path.join(root, 'detail-before.json'), 'utf8'));
const current = JSON.parse(fs.readFileSync(path.join(root, 'detail.json'), 'utf8'));
const home = JSON.parse(fs.readFileSync(path.join(root, 'home-before.json'), 'utf8'));
const expectedSectionHeadings: Record<string, string> = {
  conclusion: '研究結論',
  productsRevenue: '產品與收益模式',
  competitionDemand: '需求、競爭與市占證據',
  profitBridge: '獲利推估',
  cashflows: '現金流',
  valuation: '估值情境',
  catalysts: '催化劑',
  falsifiers: '反證與失效條件',
  technical: '技術與籌碼條件',
  history: '更新紀錄',
};

async function expectCompleteArticle(page: Page, sections: Record<string, { text: string }>) {
  const detail = page.getByTestId('vnext-detail');
  await expect(detail).toBeVisible();
  expect(Object.keys(sections).sort()).toEqual(Object.keys(expectedSectionHeadings).sort());
  for (const [key, heading] of Object.entries(expectedSectionHeadings)) {
    // The immutable source fixture can repeat the same paragraph in several
    // sections. Each heading must still have exactly one matching paragraph.
    const region = detail.locator(':scope > section').filter({
      has: page.getByRole('heading', { name: heading, exact: true }),
    });
    await expect(region, heading).toHaveCount(1);
    await expect(region.getByText(sections[key].text, { exact: true }), heading).toBeVisible();
  }
  await expect(detail.getByRole('table')).toContainText('10 TWD/share');
  await expect(detail.getByRole('table')).toContainText('0.5 ratio');
}

test('current durable EPS claims and complete article persist after actual content withdrawal', async ({ page, request }, info) => {
  const before = prior.history[0];
  const after = current.history[0];
  const bridge = 'http://127.0.0.1:' + process.env.VNEXT_BROWSER_BRIDGE_PORT;
  const headers = { 'x-test-control': process.env.VNEXT_BROWSER_CONTROL_KEY || '' };
  const revisionUrl = '/stock/2409?vnextRevision=' + before.revisionId;

  await test.step('immutable before and after snapshots', async () => {
    expect(before.sourceRights.current).toBe(true);
    expect(after.sourceRights.current).toBe(false);
    expect(after.revisionId).toBe(before.revisionId);
    expect(after.content).toEqual(before.content);
    expect(before.content.annualEps).toBe(10);
    expect(before.content.nextFourQuarterEps).toBeNull();
    expect(before.content.gaps).toContain('quote_authority_missing');
    expect(before.content.gaps).toContain('next_four_quarter_eps_missing');
  });

  await test.step('article before rights withdrawal', async () => {
    expect((await request.post(bridge + '/__fixture/control', { headers, data: { mode: 'before' } })).status(), 'fixture control before').toBe(200);
    await page.goto('/');
    const main = page.getByTestId('vnext-home').filter({ visible: true });
    await expect(main).toHaveCount(1);
    await expect(main.locator(':scope > section')).toHaveCount(2);
    await expect(page.getByTestId('vnext-member')).toHaveCount(home.members.length);
    await expect(page.getByText('研究條件符合', { exact: true })).toHaveCount(0);
    const card = page.getByTestId('vnext-member').filter({
      has: page.getByRole('link', { name: '2409', exact: true }),
    });
    await expect(card).toHaveCount(1);
    await card.getByRole('link', { name: '2409', exact: true }).click();
    await expectCompleteArticle(page, before.content.sections);
    await expect(page.getByText(/資料缺口：/)).toContainText('next_four_quarter_eps_missing');
    await page.screenshot({ path: info.outputPath('current-complete-article.png'), fullPage: true });
  });

  await test.step('versioned history after rights withdrawal', async () => {
    expect((await request.post(bridge + '/__fixture/control', { headers, data: { mode: 'full' } })).status(), 'fixture control full').toBe(200);
    await page.goto(revisionUrl);
    await expect(page.getByText('原始來源權利目前無法驗證；內容保留為歷史紀錄，不具新進場條件。', { exact: true })).toBeVisible();
    await expectCompleteArticle(page, before.content.sections);
    await expect(page.getByRole('link', { name: before.publishedAt, exact: true })).toHaveAttribute('href', revisionUrl);
    const bounds = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(bounds.width).toBeLessThanOrEqual(bounds.viewport + 1);
    await page.screenshot({ path: info.outputPath('current-withdrawn-history.png'), fullPage: true });
  });
});
