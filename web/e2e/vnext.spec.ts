import { test, expect, type APIRequestContext } from '@playwright/test';
const bridge = `http://127.0.0.1:${process.env.VNEXT_BROWSER_BRIDGE_PORT}`;
const controlHeaders = { 'x-test-control': process.env.VNEXT_BROWSER_CONTROL_KEY || '' };
async function control(request: APIRequestContext, mode: string, delayMs = 0) {
  const r = await request.post(bridge + '/__fixture/control', { headers: controlHeaders, data: { mode, delayMs } }); expect(r.ok()).toBeTruthy();
}
test.beforeEach(async ({ request }) => { await control(request, 'full'); });
test('same published contract drives exactly two primary blocks and detail/history', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByTestId('vnext-home').filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId('vnext-home').filter({ visible: true }).locator(':scope > section')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: '市場判斷', exact: true })).toBeVisible();
  await expect(page.getByTestId('vnext-market')).toContainText('資料信心');
  await expect(page.getByRole('heading', { name: '主要依據', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '近三個月背景', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '轉換與等待條件', exact: true })).toBeVisible();
  await expect(page.getByTestId('vnext-member')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('homepage.png'), fullPage: true });
  await page.getByTestId('vnext-member').getByRole('link', { name: '2409', exact: true }).click();
  await expect(page.getByTestId('vnext-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: '2409 研究紀錄' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '歷史版本', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic isolated research conclusion', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '重要論點與計算', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '研究結論', exact: true })).toBeVisible();
  const bounds = await page.evaluate(() => ({ full: document.documentElement.scrollWidth, view: innerWidth }));
  expect(bounds.full).toBeLessThanOrEqual(bounds.view + 1);
});
test('empty and unavailable states never fill from legacy cards', async ({ page, request }) => {
  await control(request, 'empty'); await page.goto('/');
  await expect(page.getByTestId('vnext-empty')).toBeVisible(); await expect(page.getByTestId('vnext-member')).toHaveCount(0);
  await control(request, 'error'); await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: '暫時無法讀取' })).toContainText('暫時無法讀取');
  await expect(page.getByTestId('vnext-member')).toHaveCount(0);
});
test('unknown revision cannot fall back to a different research version', async ({ page }) => {
  await page.goto('/stock/2409?vnextRevision=00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('status')).toContainText('指定研究版本不存在');
  await expect(page.getByText('Synthetic isolated research conclusion', { exact: true })).toHaveCount(0);
});
test('every internal trigger rejects unauthorized callers and empty authorized scope performs no RPC work', async ({ request }) => {
  const routes = ['pipeline-run', 'pipeline-research-run', 'stock-research-refresh', 'candidate-research-run', 'research-report-build', 'deep-dive-build', 'candidate-dossier-bundle', 'candidate-dossier-outbox', 'candidate-dossier-submission', 'candidate-financial-documents', 'candidate-financial-documents/worker', 'candidate-financial-documents/retry', 'candidate-financial-queue-drain', 'thesis-refresh', 'recommendation-run', 'report-build'];
  for (const route of routes) {
    const bad = await request.post('/api/internal/' + route, { data: { symbols: [] } }); expect(bad.status(), route).toBe(401);
    const empty = await request.post('/api/internal/' + route, { headers: { authorization: `Bearer ${process.env.VNEXT_E2E_OPERATOR_KEY}` }, data: { symbols: [] } });
    expect(empty.status(), route).toBe(200); expect((await empty.json()).result).toMatchObject({ reason: 'empty_scope', expensiveCalls: 0 });
  }
  const mixed = await request.post('/api/internal/vnext-research', { headers: { authorization: `Bearer ${process.env.VNEXT_E2E_OPERATOR_KEY}` }, data: { symbols: [], symbol: '2330', action: 'execute', jobId: 'must-not-run' } });
  expect(mixed.status()).toBe(200); expect((await mixed.json()).result.expensiveCalls).toBe(0);
  const badGet = await request.get('/api/internal/candidate-dossier-bundle'); expect(badGet.status()).toBe(401);
  const goodGet = await request.get('/api/internal/candidate-dossier-bundle', { headers: { authorization: `Bearer ${process.env.VNEXT_E2E_OPERATOR_KEY}` } });
  expect(goodGet.status()).toBe(409); expect((await goodGet.json()).error).toBe('vnext_explicit_scope_required');
  const trace = await request.get(bridge + '/__fixture/control', { headers: controlHeaders });
  expect((await trace.json()).trace).toEqual([]);
});

test('loading remains an explicit two-block state and preserves source links', async ({ page, request }, testInfo) => {
  await control(request, 'full', 1000);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.getByText('研究資料載入中', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('loading.png'), fullPage: true });
  await expect(page.getByTestId('vnext-member')).toHaveCount(1);
  await page.getByTestId('vnext-member').getByRole('link', { name: '2409', exact: true }).click();
  await expect(page.getByTestId('vnext-detail')).toBeVisible();
  await expect(page.locator('a[href="https://synthetic-local.invalid/eps"]')).toHaveCount(1);
});
