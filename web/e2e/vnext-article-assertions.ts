import { expect, type Page } from '@playwright/test';

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

export async function expectCompleteArticle(page: Page, sections: Record<string, { text: string }>) {
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
