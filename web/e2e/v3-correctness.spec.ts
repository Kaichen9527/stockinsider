import { expect, test } from '@playwright/test';

test('disabled correctness surface preserves public legacy reads and V3 exact 404', async ({ request }) => {
  for (const path of ['/', '/api/radar/daily', '/api/radar/hot', '/api/radar/weekly']) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
  const unauthenticatedHealth = await request.get('/api/internal/health-check');
  expect(unauthenticatedHealth.status()).toBe(401);
  const health = await request.get('/api/internal/health-check', {
    headers: { authorization: `Bearer ${process.env.E2E_INTERNAL_API_KEY}` },
  });
  expect(health.status()).toBe(200);
  expect(health.headers()['cache-control']).toContain('private');
  const disabled = await request.get('/api/opportunity-v3');
  expect(disabled.status()).toBe(404);
  expect(await disabled.json()).toEqual({ code: 'v3_disabled', error: 'v3_request_rejected' });
});

test('PCR-024 exercises the decision matrix at 320px, 200% zoom, keyboard, reduced motion and both themes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto('/v3-correctness-fixture');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });

  const articles = page.getByRole('article');
  await expect(articles).toHaveCount(5);
  await expect(page.getByRole('region', { name: '研究與進場判斷' }).first()).toBeVisible();
  await expect(page.getByText('已跌破支撐，原支撐現為收復觸發；未收復前不把它顯示成回測買點。')).toBeVisible();
  await expect(page.getByLabel('四軸研究評分').first()).toBeAttached();
  await expect(page.getByText(/MA20 -4\.2%/u).first()).toBeVisible();
  await expect(page.getByText(/交易所 12\.8 · 模型 13\.4/u).first()).toBeVisible();
  await expect(page.getByText(/沒有重大變化/u).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
  await page.keyboard.press('Tab');
  const keyboardFocus = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    const box = element?.getBoundingClientRect();
    return { text: element?.textContent ?? '', tag: element?.tagName ?? '', height: box?.height ?? 0, outline: element ? getComputedStyle(element).outlineStyle : 'none' };
  });
  expect(keyboardFocus.tag).toBe('A');
  expect(keyboardFocus.text).toMatch(/深度分析/u);
  expect(keyboardFocus.height).toBeGreaterThanOrEqual(44);
  expect(keyboardFocus.outline).not.toBe('none');

  const lightBackground = await page.locator('main').evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  const darkBackground = await page.locator('main').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);
  await expect(page.getByRole('article', { name: /9005/u })).toBeVisible();
});
