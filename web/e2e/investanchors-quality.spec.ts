import { expect, test } from '@playwright/test';

test('investanchors search avoids homepage and member-login noise', async ({ page }) => {
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const res = await page.request.get(`/api/sources/search?platform=investanchors&from=${from}&pageSize=30`);
  expect(res.status()).toBe(200);

  const payload = (await res.json()) as {
    items?: Array<{ title?: string | null; summary?: string | null; documentUrl?: string | null }>;
  };

  const items = payload.items || [];
  if (items.length === 0) return;

  const noisyItems = items.filter((item) => {
    const combined = `${item.title || ''} ${item.summary || ''} ${item.documentUrl || ''}`;
    return /登入|註冊|會員專區|訂閱方案|常見問題|會員權益|investanchors\.com\/?$|investanchors\.com\/user\//i.test(combined);
  });
  expect(noisyItems.length).toBe(0);
});
