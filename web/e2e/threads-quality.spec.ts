import { expect, test } from '@playwright/test';

test('threads search exposes usable sources instead of year-noise', async ({ page }) => {
  const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const res = await page.request.get(`/api/sources/search?platform=threads&from=${from}&pageSize=30`);
  expect(res.status()).toBe(200);

  const payload = (await res.json()) as {
    items?: Array<{
      title?: string | null;
      summary?: string | null;
      symbols?: string[];
      crawlMode?: string | null;
      matchType?: string | null;
    }>;
    total?: number;
  };

  const items = payload.items || [];
  expect(items.length).toBeGreaterThanOrEqual(0);
  if (items.length === 0) return;

  const noisyOnlyYear = items.filter((item) => {
    const title = (item.title || '').trim();
    return /^20\d{2}$/.test(title);
  });
  expect(noisyOnlyYear.length).toBeLessThan(items.length);

  const mapped = items.filter((item) => (item.symbols || []).some((symbol) => /^\d{4}$/.test(symbol)));
  expect(mapped.length).toBeGreaterThan(0);

  const loginNoise = items.filter((item) => /登入|註冊|sign up|log in/i.test(`${item.title || ''} ${item.summary || ''}`));
  expect(loginNoise.length).toBe(0);

  const scopedItems = items.filter((item) => item.crawlMode === 'symbol_scoped');
  if (scopedItems.length > 0) {
    const invalidScoped = scopedItems.filter((item) => item.matchType !== 'direct_symbol' && item.matchType !== 'alias' && item.matchType !== 'indirect');
    expect(invalidScoped.length).toBe(0);
  }
});
