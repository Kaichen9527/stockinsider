import {expect,test,type Page} from '@playwright/test';

const port=process.env.LAUNCH_RANKING_BROWSER_BRIDGE_PORT;
if(!port||!/^\d{4,5}$/u.test(port))throw Error('controlled_launch_rpc_bridge_required');
const bridge='http://127.0.0.1:'+port;
const headers={'x-test-control':'launch-ui-test-only'};

async function openRankedDetail(page:Page){
  await page.goto('/');
  await page.getByTestId('launch-home').getByRole('link',{name:'5274',exact:true}).click();
  await expect(page.getByTestId('launch-ranking-binding')).toBeVisible();
  return page.getByRole('region',{name:'上榜後成效'});
}

test('ranked detail separates tracked price, modeled fill, costs and uncertain boundaries',async({page,request})=>{
  expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode:'outcome_ready'}})).ok()).toBeTruthy();
  const detail=await openRankedDetail(page);
  await expect(detail).toContainText('連續上榜');
  await expect(detail).toContainText('發榜日收盤追蹤');
  await expect(detail).toContainText('次一交易日開盤模擬');
  await expect(detail).toContainText('同日觸及上下界，先後不明');
  await expect(detail).toContainText('依開盤價模擬成交');
  await expect(detail).toContainText('較同市場 +9.25 個百分點');
  await expect(detail.getByRole('table').first()).toContainText('0%');
  await expect(detail.getByRole('table').last()).toContainText('+19.25%');
  await expect(detail).toContainText('尚未到期');
  await expect(detail).toContainText('交易日資料不足');
  await expect(detail).toContainText('買賣各 0.1425%');
});

test('ranked detail separates an unfillable opening, an evidence gap and private performance data',async({page,request})=>{
  expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode:'outcome_unfillable'}})).ok()).toBeTruthy();
  const detail=await openRankedDetail(page);
  await expect(detail).toContainText('無法成交 · 開盤時停牌');
  await expect(detail.getByRole('table')).toHaveCount(1);
  await expect(detail.getByRole('table').first()).toContainText('0%');
  expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode:'outcome_evidence_gap'}})).ok()).toBeTruthy();
  await page.reload();
  await expect(detail).toContainText('開盤證據不足');
  await expect(detail).not.toContainText('無法成交');
  await expect(detail.getByRole('table')).toHaveCount(1);
  expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode:'outcome_private'}})).ok()).toBeTruthy();
  await page.reload();
  await expect(detail).toContainText('成效資料暫時無法讀取');
  await expect(detail.getByRole('table')).toHaveCount(0);
  expect(await page.content()).not.toContain('SYNTHETIC_PRIVATE_OUTCOME');
});

test('performance page shows first and repeated signals with independent denominators',async({page,request})=>{
  expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode:'ready'}})).ok()).toBeTruthy();
  await page.goto('/');
  await page.getByRole('link',{name:'上榜成效統計'}).click();
  await expect(page.getByRole('heading',{name:'上榜成效統計'})).toBeVisible();
  const sampleRow=page.getByRole('table',{name:'上榜樣本'}).getByRole('row').filter({hasText:'已發布訊號'});
  await expect(sampleRow.getByRole('cell')).toHaveText(['2','1']);
  const execution=page.getByRole('region',{name:'次一交易日開盤模擬'});
  const opening=execution.getByRole('table',{name:'開盤結果'});
  await expect(opening.getByRole('row',{name:/無法成交/u}).getByRole('cell')).toHaveText(['1','0']);
  await expect(opening.getByRole('row',{name:/模擬成交/u}).getByRole('cell')).toHaveText(['0','1']);
  const period=execution.getByRole('region',{name:'20 交易日',exact:true});
  await expect(period).toContainText('平均扣除成本報酬 0%');
  await expect(period).toContainText('平均同市場超額 -3 個百分點');
  await expect(execution.getByRole('region',{name:'60 交易日',exact:true})).toContainText('未到期 1 筆');
  const before=await (await request.get(bridge+'/__fixture/stats')).json();
  expect(before.unsupported).toBe(0);
  const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  expect(size.scroll).toBeLessThanOrEqual(size.width+1);
});
