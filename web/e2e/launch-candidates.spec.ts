import { expect, test } from '@playwright/test';

const port = process.env.LAUNCH_RANKING_BROWSER_BRIDGE_PORT;
if (!port || !/^\d{4,5}$/u.test(port)) throw Error('controlled_launch_rpc_bridge_required');
const bridge = 'http://127.0.0.1:' + port;
const privateSentinel = 'SYNTHETIC_PRIVATE_CANDIDATE_ONLY';
const version = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

test.beforeEach(async ({ request }) => {
  const control = await request.post(bridge + '/__fixture/control', {
    headers: { 'x-test-control': 'launch-ui-test-only' },
    data: { mode: 'candidate_pool' },
  });
  expect(control.ok()).toBeTruthy();
});

test('candidate history selects a Taipei date and pins the page and adjacent snapshots', async ({ page, request }) => {
  const before = await (await request.get(bridge + '/__fixture/stats')).json();
  await page.goto('/candidates?limit=1');
  const catalog = page.getByTestId('launch-candidate-catalog');
  const versionText = (n: number) => catalog.getByText('目錄版本：' + version(n));
  const stockCells = catalog.locator('tbody tr td:first-child');
  await expect(versionText(903)).toBeVisible();

  await catalog.getByLabel('快照日期（台北）').fill('2026-11-10');
  await catalog.getByRole('button', { name: '查看日期' }).click();
  await expect(versionText(902)).toBeVisible();
  expect(new URL(page.url()).searchParams.get('catalogId')).toBeNull();
  await expect(stockCells).toHaveText(['2301']);

  await catalog.getByRole('link', { name: '下一頁' }).click();
  await expect(stockCells).toHaveText(['2302']);
  const params = new URL(page.url()).searchParams;
  expect(params.get('catalogId')).toBe(version(902));
  expect(params.get('date')).toBe('2026-11-10');
  expect(params.get('cursor')).toBeTruthy();

  await catalog.getByRole('link', { name: '較早版本' }).click();
  await expect(versionText(901)).toBeVisible();
  await expect(stockCells).toHaveText(['2301']);
  expect(new URL(page.url()).searchParams.has('date')).toBe(false);

  await catalog.getByRole('link', { name: '較新版本' }).click();
  await expect(versionText(902)).toBeVisible();
  await catalog.getByLabel('已記錄狀態').selectOption('snapshot_eligible');
  await catalog.getByLabel('快照產業').selectOption('24');
  await catalog.getByRole('button', { name: '篩選' }).click();
  await expect(stockCells).toHaveText(['2303']);
  await expect(catalog.getByRole('cell', { name: '半導體', exact: true })).toBeVisible();
  await expect(catalog.getByRole('link', { name: '下一頁' })).toHaveCount(0);

  const after = await (await request.get(bridge + '/__fixture/stats')).json();
  expect(after.candidateDayReads - before.candidateDayReads).toBeGreaterThanOrEqual(1);
  expect(after.candidatePinnedReads - before.candidatePinnedReads).toBeGreaterThanOrEqual(4);
  expect(after.controls).toBe(before.controls);
  expect(after.unsupported).toBe(before.unsupported);
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport + 1);
});

test('candidate data gaps and private packets fail closed in the page and API', async ({ page, request }) => {
  await page.goto('/candidates?date=2026-11-13');
  await expect(page.getByRole('status')).toContainText('指定日期目前沒有可讀取的已發布研究池快照');
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByLabel('快照日期（台北）').fill('2026-11-10');
  await page.getByRole('button', { name: '查看日期' }).click();
  await expect(page.getByText('目錄版本：' + version(902))).toBeVisible();

  const prefix = '/api/launch/candidates?date=';
  const ready = await request.get(prefix + '2026-11-10');
  expect(ready.status()).toBe(200);
  expect(ready.headers()['cache-control']).toBe('no-store');
  expect((await ready.json()).result.catalogId).toBe(version(902));
  const unavailable = await request.get(prefix + '2026-11-13');
  expect(unavailable.status()).toBe(503);
  expect(unavailable.headers()['cache-control']).toBe('no-store');
  expect((await unavailable.json()).result.rows).toEqual([]);

  const invalid = await request.get(prefix + '2026-11-12');
  expect(invalid.status()).toBe(400);
  expect(invalid.headers()['cache-control']).toBe('no-store');
  expect(await invalid.json()).toEqual({ ok: false, error: 'launch_candidate_query_invalid' });
  await page.goto('/candidates?date=2026-11-12');
  await expect(page.getByTestId('launch-candidate-invalid')).toBeVisible();
  expect(await page.content()).not.toContain(privateSentinel);
});

test('candidate sources filter the original mention date inside the pinned catalog', async ({ page, request }) => {
  const before = await (await request.get(bridge + '/__fixture/stats')).json();
  await page.goto('/candidates?catalogId=' + version(902));
  await page.getByRole('link', { name: '來源候選（含未入池）' }).click();
  const catalog = page.getByTestId('launch-candidate-catalog');
  await expect(catalog.getByRole('row', { name: /未列入本版研究池/u })).toBeVisible();
  await catalog.getByLabel('原始提及日期（台北）').fill('2026-11-09');
  await catalog.getByLabel('來源', { exact: true }).fill('ptt');
  await catalog.getByRole('button', { name: '篩選' }).click();
  await expect(catalog.locator('tbody tr td:first-child')).toHaveText(['2305']);
  const params = new URL(page.url()).searchParams;
  expect(params.get('catalogId')).toBe(version(902));
  expect(params.get('date')).toBe('2026-11-09');
  expect(params.get('view')).toBe('sources');
  await expect(catalog).toContainText('2026-11-10T13:30:00Z');

  const after = await (await request.get(bridge + '/__fixture/stats')).json();
  expect(after.candidateDayReads).toBe(before.candidateDayReads);
  expect(after.candidateSourceReads - before.candidateSourceReads).toBeGreaterThanOrEqual(2);
  expect(after.unsupported).toBe(before.unsupported);
  expect(after.controls).toBe(before.controls);
});
