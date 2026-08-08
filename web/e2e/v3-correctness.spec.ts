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
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto('/v3-correctness-fixture');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });

  const articles = page.getByRole('article');
  await expect(articles).toHaveCount(8);
  await expect(page.getByRole('region', { name: '研究與進場判斷' }).first()).toBeVisible();
  await expect(page.getByText('已跌破支撐，原支撐現為收復觸發；未收復前不把它顯示成回測買點。')).toBeVisible();
  await expect(page.getByLabel('四軸研究評分').first()).toBeAttached();
  await expect(page.getByText(/MA20 -4\.2%/u).first()).toBeVisible();
  await expect(page.getByText(/交易所 12\.8 · 模型 13\.4/u).first()).toBeVisible();
  await expect(page.getByText(/沒有重大變化/u).first()).toBeVisible();
  const availableCard = page.getByRole('article', { name: /9003/u });
  await expect(availableCard.getByText('研究：決策資料完整')).toBeVisible();
  await expect(availableCard.getByText('動作：等待技術觸發')).toBeVisible();
  await expect(availableCard.getByText('技術：需先收復支撐')).toBeVisible();
  const unavailableCard = page.getByRole('article', { name: /9006/u });
  await expect(page.getByRole('button', { name: /股票研究/u })).toBeVisible();
  await expect(page.getByRole('heading', { name: '研究證據待補（非建議）' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '研究完成／暫不進場（非買進建議）' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '高信念正式推薦' })).toHaveCount(0);
  await expect(unavailableCard).toHaveCount(1);
  const incompleteAvailableCard = page.getByRole('article', { name: /9001/u }).last();
  await expect(incompleteAvailableCard.getByText('研究待補', { exact: true })).toBeVisible();
  await expect(incompleteAvailableCard.getByText('+50.0%')).toHaveCount(0);
  await expect(unavailableCard.getByText('研究：來源訊號')).toBeVisible();
  await expect(unavailableCard.getByText('動作：估值待覆核')).toBeVisible();
  await expect(unavailableCard.getByText('研究資料待補：財務資料尚未完整，暫不產生估值或買進建議')).toBeVisible();
  await expect(unavailableCard.getByText('研究待補', { exact: true })).toBeVisible();
  await expect(unavailableCard.getByText('暫停估值')).toBeVisible();
  await expect(unavailableCard.getByText('研究證據待補，暫不判斷估值空間')).toBeVisible();
  await expect(unavailableCard.getByText('高信念正式推薦')).toHaveCount(0);
  await expect(unavailableCard.getByText('+42.0%')).toHaveCount(0);
  await expect(unavailableCard.getByText(/Base 200/u)).toHaveCount(0);
  await expect(unavailableCard.getByText('高 90')).toHaveCount(0);
  await expect(unavailableCard.getByText('80%')).toHaveCount(0);
  await expect(unavailableCard.getByText('暫不評分')).toHaveCount(2);
  await expect(unavailableCard.getByText('暫不提供進場建議')).toBeVisible();
  await expect(unavailableCard.getByText('待研究證據補齊後再評估')).toHaveCount(2);
  await expect(unavailableCard.getByText('等待量價確認')).toHaveCount(0);
  const avoidCard = page.getByRole('article', { name: /9007/u });
  await expect(avoidCard).toHaveCount(1);
  await expect(avoidCard.getByText('暫不進場', { exact: true })).toHaveCount(2);
  await expect(avoidCard.getByText('研究決策已完成，目前動作為避開')).toBeVisible();
  await expect(avoidCard.getByText('研究完成 · 暫不進場')).toBeVisible();
  await expect(avoidCard.getByText('研究資料待補', { exact: false })).toHaveCount(0);
  await expect(avoidCard.getByText('暫停估值')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  const horizontalOverflow = await page.evaluate(() => ({
    document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
    elements: [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => ({
        tag: element.tagName,
        text: (element.textContent || '').trim().slice(0, 120),
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
        width: element.getBoundingClientRect().width,
      }))
      .filter((element) => element.right > document.documentElement.clientWidth + 0.5 || element.left < -0.5)
      .slice(0, 20),
  }));
  expect(horizontalOverflow, JSON.stringify(horizontalOverflow, null, 2)).toMatchObject({ document: { clientWidth: expect.any(Number), scrollWidth: expect.any(Number) }, elements: [] });
  expect(horizontalOverflow.document.scrollWidth).toBeLessThanOrEqual(horizontalOverflow.document.clientWidth);

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
