/** Actual local Next HTTP/Chromium with synthetic read-only RPC transport.
 * Not native PG, source/model review, actual source or two-session acceptance. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { inputHash, POLICY } from '../web/src/lib/vnext/policy.ts';
import { REQUIRED_SECTIONS } from '../web/src/lib/vnext/research.ts';
const require=createRequire(import.meta.url),{chromium}=require('../web/node_modules/playwright');
const root=process.cwd();
assert.equal(process.version,'v22.14.0');
const built=process.env.VNEXT_RANKING_BUILD_SOURCE_SHA;
assert.match(built||'',/^[a-f0-9]{40}$/u,'exact build commit required');
const harnessCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const runtimeWebTree=execFileSync('git',['rev-parse',built+':web'],{encoding:'utf8'}).trim();
assert.equal(runtimeWebTree,execFileSync('git',['rev-parse','HEAD:web'],{encoding:'utf8'}).trim(),'runtime web tree equals fixed build');
execFileSync('git',['diff','--quiet','--','web/src']);
const out=path.resolve(process.env.VNEXT_RANKING_SMOKE_OUTPUT||'work/v2-integration/browser');
if(fs.existsSync(out))throw Error('fresh_output_required');
fs.mkdirSync(out,{recursive:true,mode:0o700});
for(const dir of [root,'/tmp']){const s=fs.statfsSync(dir,{bigint:true});assert.ok(s.bavail*s.bsize>=8589934592n+268435456n,'original floor plus browser workset');}
const run='11111111-1111-4111-8111-111111111111',revision='22222222-2222-4222-8222-222222222222',newer='33333333-3333-4333-8333-333333333333';
const cutoff=new Date().toISOString(),marketRevision='a'.repeat(64);let mode='one';const calls=[];let app,browser,bridge;
function content(text){const x={schemaVersion:'stockinsider-vnext-research-v1',inputHash:'b'.repeat(64),outputHash:'',modelVersion:'synthetic-no-provider',quoteDate:'2026-11-06',valuationDate:'2026-11-06',claims:[],sections:Object.fromEntries(REQUIRED_SECTIONS.map(k=>[k,{text:text+' '+k,evidenceIds:[],claimIds:[]}])),gaps:['synthetic_http_ui_not_actual_research']};x.outputHash=inputHash({...x,outputHash:undefined});return x;}
const oldContent=content('Synthetic frozen revision'),newContent=content('LATEST MUST NOT REPLACE FROZEN');
function envelope(symbol){const size=mode==='zero'?0:mode==='ten'?10:1;
 const members=Array.from({length:size},(_,i)=>({rank:i+1,symbol:String(1000+i),revisionId:revision,inputHash:'b'.repeat(64),confirmedPoints:0,availableWeight:100,entryEligible:false,reasons:['synthetic_wait'],revisions:{research:revision,score:'s',financial:'f',price:'p',market:marketRevision}}));
 const candidates=Array.from({length:20},(_,i)=>({symbol:String(1000+i),state:'waiting',date:'2026-11-06',revisionId:i===19?null:revision,entryEligible:false,source:null,industry:null,raw:'PRIVATE_MUST_NOT_RENDER'}));
 const market={risk:'unknown',confidence:'insufficient',session:'2026-11-06',sourceAt:cutoff,expiresAt:cutoff,continuity:false,provenance:[],gaps:['synthetic_market'],overseas:[],reasons:[],risks:[],conditions:[],sessions:[]};
 return {snapshot:{schemaVersion:'vnext-ranking-snapshot-v1',rankingRunId:run,previousRankingRunId:null,cutoff,policyVersion:POLICY.version,marketRevision,market,members,candidates},current:{home:{version:run,market,members:[],publishedAt:cutoff},detail:symbol?{symbol,membership:{state:'waiting',inputHash:'b'.repeat(64)},history:[{revisionId:newer,inputHash:'b'.repeat(64),publishedAt:cutoff,content:newContent,sourceRights:{current:false}},{revisionId:revision,inputHash:'b'.repeat(64),publishedAt:cutoff,content:oldContent,sourceRights:{current:false}}]}:null}};
}
const receipts=[];let code=0;
try{
 bridge=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000){res.writeHead(413).end();return;}}
  const args=JSON.parse(raw||'{}');calls.push({method:req.method,path:req.url,args});
  if(req.method!=='POST'||req.url!=='/rest/v1/rpc/vnext_ranking_read_v1'){res.writeHead(500,{'content-type':'application/json'}).end(JSON.stringify({message:'unexpected_nonread_rpc'}));return;}
  const value=envelope(args.p_symbol);if(args.p_ranking_run_id&&args.p_ranking_run_id!==run)value.snapshot=null;
  res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(value));
 });bridge.listen(34235,'127.0.0.1');await once(bridge,'listening');
 const env={...process.env};for(const k of Object.keys(env))if(/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|OPPORTUNITY_V3_|STOCKINSIDER_|INTERNAL_|CRON_|OPENAI_|ANTHROPIC_|RESEARCH_)/u.test(k))delete env[k];
 Object.assign(env,{PATH:'/workspace/.tools/node22/node_modules/node/bin:'+env.PATH,NODE_TEST_CONTEXT:'child-v8',LEGACY_RADAR_CORRECTNESS_PROJECTION:'enabled',SUPABASE_URL:'http://127.0.0.1:34235',SUPABASE_SERVICE_ROLE_KEY:'synthetic-browser-read-only-token-0000000000000000',STOCKINSIDER_VNEXT_ENABLED:'true',STOCKINSIDER_VNEXT_TOP10_ENABLED:'true',NEXT_TELEMETRY_DISABLED:'1'});
 const fd=fs.openSync(path.join(out,'next.log'),'w',0o600);app=spawn('/workspace/.tools/node22/node_modules/node/bin/node',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34236'],{cwd:path.join(root,'web'),env,stdio:['ignore',fd,fd]});fs.closeSync(fd);
 let ready=false;for(let i=0;i<100;i++){if(app.exitCode!==null)throw Error('app_exited');try{const r=await fetch('http://127.0.0.1:34236/');if(r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'server_ready');
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
 for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport});await context.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:34236/')?route.continue():route.abort());
  const page=await context.newPage();
  for(const [state,count]of [['zero',0],['one',1],['ten',10]]){mode=state;await page.goto('http://127.0.0.1:34236/');await page.getByTestId('vnext-top10').waitFor({state:'visible'});assert.equal(await page.getByTestId('vnext-ranked-member').filter({visible:true}).count(),count);assert.equal(await page.getByTestId('vnext-home').filter({visible:true}).locator(':scope > section').count(),2);await page.screenshot({path:path.join(out,viewport.name+'-'+state+'.png'),fullPage:true});receipts.push(viewport.name+':top'+count);}
  mode='one';await page.goto('http://127.0.0.1:34236/');await page.getByTestId('vnext-top10').waitFor({state:'visible'});await page.getByTestId('vnext-ranked-member').filter({visible:true}).getByRole('link').click();await page.getByTestId('vnext-ranking-binding').waitFor();const text=await page.getByTestId('vnext-detail').filter({visible:true}).innerText();assert.ok(text.includes('Synthetic frozen revision conclusion'));assert.ok(!text.includes('LATEST MUST NOT REPLACE FROZEN'));assert.ok(text.includes('當前財務與股價資格已逾期或無法驗證'));assert.ok(text.includes('原版本保留'));receipts.push(viewport.name+':bound-detail-invalidity');
  await page.goto('http://127.0.0.1:34236/stock/1000?vnextRevision='+newer+'&rankingRunId='+run);await page.getByTestId('vnext-detail').filter({visible:true}).getByRole('alert').waitFor();assert.ok((await page.getByTestId('vnext-detail').filter({visible:true}).innerText()).includes('研究資料暫時無法讀取'));receipts.push(viewport.name+':wrong-revision-closed');
  await page.goto('http://127.0.0.1:34236/candidates?limit=1');await page.getByTestId('vnext-candidates').waitFor({state:'visible'});assert.equal(await page.locator('tbody tr').count(),1);const href=await page.getByRole('link',{name:'下一頁',exact:true}).getAttribute('href');assert.ok(href.includes('cursor='),'cursor_link_present');await page.getByRole('link',{name:'下一頁',exact:true}).click();await page.locator('tbody').getByRole('link',{name:'1001',exact:true}).waitFor();assert.equal(await page.locator('tbody tr').count(),1);assert.ok((await page.locator('tbody').innerText()).includes('1001'),'next_cursor_page_1001');assert.ok(!(await page.content()).includes('PRIVATE_MUST_NOT_RENDER'),'private_allowlist_html_and_flight');receipts.push(viewport.name+':stable-page-private-allowlist');
  const bounds=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(bounds.scroll<=bounds.width+1,'no_horizontal_overflow_'+JSON.stringify(bounds));await page.screenshot({path:path.join(out,viewport.name+'-candidates.png'),fullPage:true});await context.close();
 }
 assert.ok(calls.length>0&&calls.every(c=>c.path==='/rest/v1/rpc/vnext_ranking_read_v1'));
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({scope:'actual isolated HTTP/SSR/Chromium desktop/mobile; synthetic RPC transport only, no native PG/review authority',status:'PASS',source:built,harnessCommit,runtimeWebTree,browserVersion:browser.version(),checks:receipts,readRpcCalls:calls.length,writeRpcCalls:0,providerCalls:0},null,2)+'\n');
}catch(e){code=1;fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({status:'FAIL',error:e.message,checks:receipts,readRpcCalls:calls.length},null,2)+'\n');}
finally{if(browser)await browser.close();if(bridge)await new Promise(r=>bridge.close(r));if(app&&app.exitCode===null){app.kill('SIGTERM');await once(app,'exit');}fs.writeFileSync(path.join(out,'cleanup.json'),JSON.stringify({appPid:app?.pid,appExit:app?.exitCode,appSignal:app?.signalCode,bridgeClosed:!bridge?.listening})+'\n');}
process.exitCode=code;
