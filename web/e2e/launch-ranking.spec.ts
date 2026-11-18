import {test,expect} from '@playwright/test';
const port=process.env.LAUNCH_RANKING_BROWSER_BRIDGE_PORT;
if(!port||!/^\d{4,5}$/u.test(port))throw Error('controlled_launch_rpc_bridge_required');
const bridge=`http://127.0.0.1:${port}`,headers={'x-test-control':'launch-ui-test-only'};
test.beforeEach(async({request})=>{expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode:'ready'}})).ok()).toBeTruthy();});
test('real Home/stock route reads newpolicy Top10/nullfinance/16rules through exactnewRPC withoutlegacyfallback',async({page,request},info)=>{
  await page.goto('/');const home=page.getByTestId('launch-home');await expect(home).toBeVisible();await expect(home.locator(':scope > section')).toHaveCount(2);
  await expect(page.getByTestId('launch-ranked-member')).toHaveCount(1);await expect(home).toContainText('技術 70、籌碼 20、市場 10');
  await expect(home).not.toContainText('基本面 70');await expect(home).toContainText('基本面與估值：尚無可用資料');
  const link=home.getByRole('link',{name:'5274',exact:true});await expect(link).toHaveAttribute('href',/launchRunId=.*launchResearchRevision=.*launchScoreRevision=/u);
  await link.click();const detail=page.getByTestId('launch-detail');await expect(detail).toBeVisible();await expect(page.getByTestId('launch-ranking-binding')).toBeVisible();
  await expect(detail.getByRole('table').locator('tbody tr')).toHaveCount(16);await expect(detail).toContainText('已確認分數 100.0 / 100');
  await expect(detail).toContainText('尚無經驗證的調整後圖表資料');await expect(detail).toContainText('Synthetic public research summary');
  await expect(detail.getByRole('link',{name:/licensed-dataset:11370:/u})).toHaveAttribute('href','https://data.gov.tw/dataset/11370');
  const stats=await (await request.get(bridge+'/__fixture/stats')).json();expect(stats.reads).toBeGreaterThanOrEqual(2);expect(stats.unsupported).toBe(0);
  const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));expect(width.scroll).toBeLessThanOrEqual(width.viewport+1);
  await page.screenshot({path:info.outputPath('launch-version-bound-detail.png'),fullPage:true});
});
test('frozen detail charts switch daily, calendar week and month at the original cutoff',async({page,request})=>{
  await request.post(bridge+'/__fixture/control',{headers,data:{mode:'chart'}});
  await page.goto('/');
  await page.getByRole('link',{name:'5274',exact:true}).click();
  const section=page.getByRole('region',{name:'榜單價格圖表'});
  const highs=section.getByTestId('launch-frozen-price-highs');
  await expect(highs).toContainText('榜單日調整後最高價 108 元');
  await expect(highs).toContainText('高於前 25 個交易日高點');
  await expect(highs).toContainText('52 週新高');
  await expect(highs).toContainText('已知期間新高');
  await expect(highs).toContainText('全交易歷史涵蓋範圍未確認');
  await expect(section.getByRole('button',{name:'日線'})).toHaveAttribute('aria-pressed','true');
  await expect(section.getByTestId('launch-price-chart').locator('canvas').first()).toBeVisible();
  const before=await (await request.get(bridge+'/__fixture/stats')).json();
  for(const [label,period] of [['週線','依台灣曆週聚合'],['月線','依台灣曆月聚合']]){
    await section.getByRole('button',{name:label}).click();
    await expect(section.getByRole('button',{name:label})).toHaveAttribute('aria-pressed','true');
    await expect(section).toContainText(period);
    await expect(section).toContainText('K 線與成交量只計入顯示期間內、截至榜單日的交易日');
    await expect(section.getByTestId('launch-price-chart').locator('canvas').first()).toBeVisible();
  }
  const stats=await (await request.get(bridge+'/__fixture/stats')).json();
  expect(stats.reads).toBe(before.reads);
  expect(stats.companionReads).toBe(before.companionReads);
  expect(stats.unsupported).toBe(0);
  const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport+1);
});
test('missing schema,missingproducer,notpublished and genuineTop0 remainvisiblydifferent',async({page,request})=>{
  for(const [mode,text] of [['schema_unavailable','資料服務尚未就緒'],['producer_unavailable','必要來源資料尚未完成驗證'],['not_published','尚無已發布的強勢發動榜單'],['empty','本版沒有符合完整證據與審查條件的標的']] as const){
    expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode}})).ok()).toBeTruthy();await page.goto('/');
    await expect(page.getByTestId('launch-home')).toContainText(text);await expect(page.getByTestId('launch-ranked-member')).toHaveCount(0);
    await expect(page.getByTestId('vnext-ranked-member')).toHaveCount(0);await expect(page.getByTestId('launch-empty')).toHaveCount(mode==='empty'?1:0);
  }
});
test('partialweights/mixedpolicy/privateextra reject;expiredcurrentproof preservesfrozenrankingwithouteligiblelabel',async({page,request})=>{
  for(const mode of ['partial','wrong_policy','private']){
    await request.post(bridge+'/__fixture/control',{headers,data:{mode}});await page.goto('/');
    await expect(page.getByTestId('launch-ranked-member')).toHaveCount(0);await expect(page.getByTestId('launch-home')).toContainText('暫時無法讀取');
    expect(await page.content()).not.toContain('DO_NOT_RENDER_PRIVATE_FIXTURE');
  }
  await request.post(bridge+'/__fixture/control',{headers,data:{mode:'expired'}});await page.goto('/');
  await expect(page.getByTestId('launch-ranked-member')).toHaveCount(1);await expect(page.getByTestId('launch-home')).toContainText('原榜單保留');
  await expect(page.getByText('當前研究條件符合，仍須另行評估。',{exact:true})).toHaveCount(0);
});
test('explicitunknownrun,mismatchedresearch,arrayandmixedlegacyquery neverdisplaylatestoroldpolicycontent',async({page,request})=>{
  await page.goto('/');const href=await page.getByRole('link',{name:'5274',exact:true}).getAttribute('href');expect(href).toBeTruthy();
  const url=new URL(href!,'http://localhost');url.searchParams.set('launchRunId','00000000-0000-4000-8000-000000000999');
  await page.goto(url.pathname+url.search);await expect(page.getByTestId('launch-detail')).toContainText('指定的強勢發動榜單版本不存在');
  await expect(page.getByRole('table')).toHaveCount(0);
  for(const key of ['launchResearchRevision','launchScoreRevision']){
    const wrong=new URL(href!,'http://localhost');wrong.searchParams.set(key,'00000000-0000-4000-8000-000000000999');
    await page.goto(wrong.pathname+wrong.search);await expect(page.getByTestId('launch-detail')).toContainText('參數不一致');await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByTestId('vnext-detail')).toHaveCount(0);
  }
  for(const suffix of ['&vnextRevision=00000000-0000-4000-8000-000000000010','&launchRunId=00000000-0000-4000-8000-000000000999']){
    await page.goto(href!+suffix);await expect(page.getByTestId('launch-detail')).toContainText('參數不一致');await expect(page.getByRole('table')).toHaveCount(0);
  }
  const stats=await(await request.get(bridge+'/__fixture/stats')).json();expect(stats.unsupported).toBe(0);
});
test('openpage automaticallydemotes shortqualification withoutreadingorrenewingproof andkeepsfrozenrun',async({page,request})=>{
  await request.post(bridge+'/__fixture/control',{headers,data:{mode:'short_expiry'}});await page.goto('/');
  const status=page.getByTestId('launch-current-status');await expect(status).toHaveAttribute('data-current','true');
  const run=await page.getByTestId('launch-top10').getAttribute('data-ranking-run-id');
  const before=await(await request.get(bridge+'/__fixture/stats')).json();
  await expect(status).toHaveAttribute('data-current','false',{timeout:10000});await expect(status).toContainText('核對已逾期');
  await expect(page.getByTestId('launch-ranked-member')).toHaveCount(1);await expect(page.getByTestId('launch-top10')).toHaveAttribute('data-ranking-run-id',run!);
  const after=await(await request.get(bridge+'/__fixture/stats')).json();expect(after.reads).toBe(before.reads);expect(after.controls).toBe(before.controls);expect(after.unsupported).toBe(0);
});

test('ranked detail and API show only the same-run reported EPS projection',async({page,request})=>{
  for(const mode of ['reported_eps','reported_eps_private']){
    expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode}})).ok()).toBeTruthy();
    await page.goto('/');
    const href=await page.getByRole('link',{name:'5274',exact:true}).getAttribute('href');
    expect(href).toBeTruthy();
    await page.goto(href!);
    const region=page.getByRole('region',{name:'基本面與估值'});
    await expect(region).toBeVisible();
    await expect(region).toContainText('此榜單版本無可公開的季度 EPS 預估。');
    const run=new URL(href!,page.url()).searchParams.get('launchRunId');
    const response=await request.get('/api/launch-ranking',{params:{rankingRunId:run!,symbol:'5274'}});
    expect(response.ok()).toBeTruthy();
    const payload=await response.json();
    expect(payload.result.detail.rankingRunId).toBe(run);
    expect(payload.result.snapshot.members[0].totalScore).toBe(100);
    expect(JSON.stringify(payload)).not.toContain('SYNTHETIC_PRIVATE_FINANCIAL_ONLY');
    if(mode==='reported_eps'){
      await expect(region).toContainText('2026-07-01 至 2026-09-30');
      await expect(region).toContainText('稀釋 EPS -0.125');
      await expect(region.getByRole('link',{name:'公開資訊觀測站原件'})).toHaveAttribute('href',/co_id=5274&year=2026&season=3$/u);
      expect(payload.result.detail.reportedEps[0].amount).toBe(-0.125);
    }else{
      await expect(region).toContainText('財報資料目前無法讀取');
      expect(payload.result.detail.reportedEps).toBeUndefined();
    }
  }
});

test('ranked detail keeps quarterly EPS and annual forecasts distinct and omits a misbound ratio',async({page,request})=>{
  for (const mode of ['issuer_forecasts','issuer_forecast_misbound']) {
    expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode}})).ok()).toBeTruthy();
    await page.goto('/');
    await page.getByRole('link',{name:'5274',exact:true}).click();
    const region=page.getByRole('region',{name:'基本面與估值'});
    await expect(region).toContainText('稀釋 EPS 預估 2.5');
    if (mode==='issuer_forecasts') {
      await expect(region.getByRole('heading',{name:'公司來源的年度與四季 EPS 預估'})).toBeVisible();
      await expect(region).toContainText('參考本益比 22 倍');
    } else {
      await expect(region).toContainText('年度與四季 EPS 預估目前無法讀取。');
      await expect(region.getByTestId('launch-forward-pe-reference')).toHaveCount(0);
    }
  }
  expect((await (await request.get(bridge+'/__fixture/stats')).json()).unsupported).toBe(0);
});

test('frozen stock scenarios show three reviewed prices and suppress a private packet',async({page,request})=>{
  for (const mode of ['scenario_ready','scenario_private','ready']) {
    expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode}})).ok()).toBeTruthy();
    await page.goto('/');
    await page.getByRole('link',{name:'5274',exact:true}).click();
    const section=page.getByRole('region',{name:'基本面與估值'});
    if (mode==='scenario_ready') {
      const scenarios=section.getByTestId('launch-reviewed-valuation');
      await expect(scenarios).toContainText('現金流量折現估值');
      await expect(scenarios.locator('dd')).toHaveText(['65 元／股','80 元／股','95 元／股']);
    } else {
      await expect(section.getByTestId('launch-reviewed-valuation')).toHaveCount(0);
      await expect(section).toContainText(mode==='ready'?'此榜單版本無可公開的研究股價情境。':'研究股價情境目前無法讀取。');
      expect(await page.content()).not.toContain('SYNTHETIC_PRIVATE_REVIEWED_SCENARIO');
    }
  }
});

test('P/E scenarios present disclosed EPS and multiples separately from prices',async({page,request})=>{
  for(const mode of ['scenario_pe_ready','scenario_pe_hidden']){
    expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode}})).ok()).toBeTruthy();
    await page.goto('/');
    await page.getByRole('link',{name:'5274',exact:true}).click();
    const scenarios=page.getByTestId('launch-reviewed-valuation');
    await expect(scenarios).toContainText('預估本益比估值');
    await expect(scenarios).toContainText('95 元／股');
    if(mode==='scenario_pe_ready'){
      await expect(scenarios).toContainText('研究採用的四季 EPS 5 元 × 13 倍');
      await expect(scenarios).toContainText('來源年度 EPS 預估 5 元 × 16 倍');
      await expect(scenarios).toContainText('來源四季 EPS 預估 5 元 × 19 倍');
    }else{
      await expect(scenarios).not.toContainText('EPS');
      await expect(scenarios).not.toContainText('13 倍');
    }
  }
});

test('reviewed falsifier remains independent of valuation and requires a closed public projection',async({page,request})=>{
  for(const mode of ['falsifier_ready','falsifier_private','ready']){
    expect((await request.post(bridge+'/__fixture/control',{headers,data:{mode}})).ok()).toBeTruthy();
    await page.goto('/');
    await page.getByRole('link',{name:'5274',exact:true}).click();
    const section=page.getByRole('region',{name:'論點失效條件'});
    await expect(page.getByTestId('launch-reviewed-valuation')).toHaveCount(0);
    if(mode==='falsifier_ready'){
      await expect(section).toContainText('如果公司未完成原定的認證，相關營收假設需要重新評估。');
      await expect(section).toContainText('獨立審查的研究判斷');
      await expect(section.getByRole('link',{name:'查閱原始公告'})).toHaveAttribute('href','https://www.twse.com.tw/docs/falsifier');
    }else{
      await expect(section.getByRole('link')).toHaveCount(0);
      await expect(section).toContainText(mode==='ready'?'此榜單版本無可公開的失效條件。':'論點失效條件目前無法讀取。');
    }
    expect(await page.content()).not.toContain('SYNTHETIC_PRIVATE_FALSIFIER_ORIGINAL');
  }
});
