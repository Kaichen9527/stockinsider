import {test,expect,type Page} from '@playwright/test';
import {unsafeCitationUrls,unknownRightsCitationUrls} from '../src/lib/vnext/launch-citation.test-fixture';
const bridgePort=process.env.LAUNCH_RANKING_BROWSER_BRIDGE_PORT;
if(!bridgePort||!/^\d{4,5}$/u.test(bridgePort)||Number(bridgePort)<1024||Number(bridgePort)>65535)throw Error('loopback_citation_bridge_port_required');
const bridge=`http://127.0.0.1:${bridgePort}`;
const headers={'x-test-control':'launch-ui-test-only'};
const query='rankingRunId=00000000-0000-4000-8000-000000000001&symbol=5274';
const detail='/stock/5274?launchRunId=00000000-0000-4000-8000-000000000001&launchResearchRevision=00000000-0000-4000-8000-000000000010&launchScoreRevision=00000000-0000-4000-8000-000000000100';
const externalCounts=new WeakMap<Page,{count:number}>();
test.beforeEach(async({page,request})=>{
  const count={count:0};externalCounts.set(page,count);
  await page.route('**/*',async route=>{
    const host=new URL(route.request().url()).hostname;
    if(!['127.0.0.1','localhost','[::1]'].includes(host)){count.count++;await route.abort();}else await route.continue();
  });
  expect((await request.post(bridge+'/__fixture/control',{headers,maxRedirects:0,data:{mode:'ready'}})).ok()).toBeTruthy();
});
test.afterEach(({page})=>{expect(externalCounts.get(page)?.count).toBe(0);});
test('actual SSR and readonly public GET retain explicit licensed attribution and frozen source permission metadata',async({page,request})=>{
  const response=await request.get('/api/launch-ranking?'+query,{maxRedirects:0});expect(response.status()).toBe(200);expect(response.headers()['cache-control']).toBe('no-store');
  const body=await response.json(),citation=body.result.detail.citations[0];
  expect(citation.url).toBe('https://data.gov.tw/dataset/11370');expect(citation.publicRights.license).toBe('Taiwan Open Government Data License 1.0');
  expect(citation.publicRights.attribution).toBe('Securities and Futures Bureau, Financial Supervisory Commission');expect(citation.publicRights.rightsRevision).toMatch(/^[a-f0-9]{64}$/u);
  await page.goto(detail);const sources=page.getByRole('region',{name:'公開來源'});
  await expect(sources.getByRole('link',{name:/licensed-dataset:11370/u})).toHaveAttribute('href',citation.url);
  await expect(sources).toContainText(citation.publicRights.attribution);await expect(sources.getByRole('link',{name:citation.publicRights.license})).toHaveAttribute('href','https://data.gov.tw/license');
});
test('actual SSR and public GET reject member, encoded secrets, tracking, unknown rights and unbound metadata without echo',async({page,request})=>{
  const modes=[...[...unsafeCitationUrls,...unknownRightsCitationUrls].map((_,i)=>`citation_${i}`),
    ...['missing_rights','wrong_license','wrong_binding','unknown_revision','private_extra','wrong_attribution'].map(name=>`citation_${name}`)];
  for(const mode of modes){
    expect((await request.post(bridge+'/__fixture/control',{headers,maxRedirects:0,data:{mode}})).ok()).toBeTruthy();
    const response=await request.get('/api/launch-ranking?'+query,{maxRedirects:0});expect(response.status(),mode).toBe(503);expect(response.headers()['cache-control']).toBe('no-store');
    const body=await response.text();expect(body,mode).not.toContain('SYNTHETIC_');expect(body,mode).not.toContain('vip_contents');
    await page.goto(detail);await expect(page.getByTestId('launch-detail')).toContainText('暫時無法讀取');
    await expect(page.getByRole('region',{name:'公開來源'})).toHaveCount(0);
    const html=await page.content();expect(html,mode).not.toContain('SYNTHETIC_PRIVATE_ONLY');expect(html,mode).not.toContain('SYNTHETIC_ONLY');expect(html,mode).not.toContain('vip_contents');
  }
  expect((await(await request.get(bridge+'/__fixture/stats',{maxRedirects:0})).json()).unsupported).toBe(0);
});
test('actual public GET closed queries perform zero RPC work and never echo attempted URLs',async({request})=>{
  const before=(await(await request.get(bridge+'/__fixture/stats',{maxRedirects:0})).json()).reads;
  for(const query of ['symbol=5274&symbol=6488','symbol=00981A','rankingRunId=bad','url=https%3A%2F%2Fexample.org%2Fuser%2Fvip_contents%2FSYNTHETIC_ONLY','access_token=SYNTHETIC_ONLY']){
    const response=await request.get('/api/launch-ranking?'+query,{maxRedirects:0});expect(response.status()).toBe(400);expect(response.headers()['cache-control']).toBe('no-store');
    expect(await response.text()).not.toContain('SYNTHETIC_ONLY');
  }
  expect((await(await request.get(bridge+'/__fixture/stats',{maxRedirects:0})).json()).reads).toBe(before);
});
