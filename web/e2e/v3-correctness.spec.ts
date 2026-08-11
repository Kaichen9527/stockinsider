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
  await expect(articles).toHaveCount(9);
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
  const incompleteAvoidCard = page.getByRole('article', { name: /9008/u });
  await expect(incompleteAvoidCard).toHaveCount(1);
  await expect(incompleteAvoidCard.getByText('研究待補', { exact: true })).toBeVisible();
  await expect(incompleteAvoidCard.getByText('研究完成 · 暫不進場')).toHaveCount(0);
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

test('V3.13 Landing has three exclusive action sections and at most six collapsed numbers per card', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.goto('/v313-decision-fixture');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });

  for (const heading of ['現在可行動', '等待條件', '新來源待研究']) {
    await expect(page.getByRole('heading', { name: heading })).toHaveCount(1);
  }
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByText('研究型小量分批', { exact: true })).toBeVisible();
  await expect(page.getByText('等待收復支撐', { exact: true })).toBeVisible();
  await expect(page.getByText('資料待補', { exact: true })).toBeVisible();

  const cards=page.getByTestId('decision-card');
  await expect(cards).toHaveCount(3);
  for(let index=0;index<await cards.count();index+=1){
    expect(await cards.nth(index).locator('[data-decision-numeric-value]').count()).toBeLessThanOrEqual(6);
  }
  const links = page.getByRole('link', { name: /查看決策摘要/u });
  await expect(links).toHaveCount(3);
  await links.first().focus();
  await expect(links.first()).toBeFocused();
  await expect(links.first()).toHaveAttribute('href', /\/stock\/9101[?]decisionRevisionId=decision-v3[.]13%3A/u);

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expect(page.getByRole('article', { name: /9103/u })).toBeVisible();
  await links.first().click();
  await expect(page.getByTestId('detail-revision')).toHaveText(`decision-v3.13:${'a'.repeat(64)}`);
  await expect(page.getByTestId('detail-action')).toHaveText('research_starter');
  await expect(page.getByTestId('detail-authority')).toHaveText('conditional_research');
  await expect(page.getByTestId('detail-valuation')).toHaveText('90 / 117.65 / 135');
  await expect(page.getByTestId('detail-entry')).toHaveText('101–103');
  await expect(page.getByTestId('detail-invalidation')).toHaveText('92');
  await expect(page.getByTestId('detail-thesis').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByTestId('detail-risks').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByTestId('detail-source-dates')).toContainText('發布：');
  await expect(page.getByTestId('detail-source-dates')).toContainText('收集：');
  await expect(page.getByTestId('detail-source-dates')).toContainText('評估：');
  await expect(page.getByTestId('detail-citations').getByRole('link', { name: '授權來源 fixture' }))
    .toHaveAttribute('href', 'https://example.com/fixture');
  await page.goto(`/stock/9103?decisionRevisionId=${encodeURIComponent(`decision-v3.13:${'c'.repeat(64)}`)}`);
  await expect(page.getByTestId('detail-valuation')).toHaveText('尚缺：diluted_shares、cash_debt');
  await expect(page.getByText('已反映')).toHaveCount(0);
  await page.goto('/stock/9101');
  await expect(page.getByTestId('detail-action')).toHaveText('research_starter');
  await page.goto('/stock/9199');
  await expect(page.getByTestId('detail-unavailable')).toContainText('authoritative_decision_envelope_missing');
  await expect(page.getByText(/可買進|可分批|研究型小量分批/u)).toHaveCount(0);
  await page.goto(`/stock/9105?decisionRevisionId=${encodeURIComponent(`decision-v3.13:${'e'.repeat(64)}`)}`);
  await expect(page.getByTestId('detail-unavailable')).toContainText('projection_stale_readonly');
  await expect(page.getByText(/可買進|可分批|研究型小量分批/u)).toHaveCount(0);
  await page.goto(`/stock/9104?decisionRevisionId=${encodeURIComponent(`decision-v3.13:${'d'.repeat(64)}`)}`);
  await expect(page.getByTestId('detail-unavailable')).toContainText('revision_envelope_brief_or_provenance_invalid');
  for (const suffix of [
    'bad&refresh=1',
    `decision-v3.13:${'A'.repeat(64)}&refresh=1`,
    `decision-v3.13:${'a'.repeat(63)}&refresh=1`,
    `decision-v3.13:${'a'.repeat(64)}&decisionRevisionId=decision-v3.13:${'b'.repeat(64)}&refresh=1`,
  ]) {
    await page.goto(`/stock/9101?decisionRevisionId=${suffix}`);
    await expect(page.getByTestId('detail-unavailable')).toContainText('decision_revision_parameter_invalid_or_ambiguous');
    await expect(page.getByText('深度分析準備中')).toHaveCount(0);
    await expect(page.getByTestId('detail-revision')).toHaveCount(0);
  }
  const duplicateQuery=`decisionRevisionId=decision-v3.13:${'a'.repeat(64)}`+
    `&decisionRevisionId=decision-v3.13:${'b'.repeat(64)}`;
  await page.goto(`/stock/9101/technical?${duplicateQuery}`);
  await expect(page.getByTestId('detail-unavailable'))
    .toContainText('decision_revision_parameter_invalid_or_ambiguous');
  for(const apiPath of ['deep-dive','insight']){
    const response=await page.request.get(`/api/stocks/9101/${apiPath}?${duplicateQuery}`);
    expect(response.status()).toBe(409);
    expect(await response.json()).toMatchObject({status:'unavailable',reason:'decision_revision_ambiguous'});
  }
  expect(pageErrors).toEqual([]);
});
