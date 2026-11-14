/** Owner-run loopback Next smoke only. No server start, env files, fixture
 * producer, source/DB work or package/browser installation. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,realpath} from 'node:fs/promises';
import path from 'node:path';
import {chromium,devices,request} from '@playwright/test';

function refuse(){throw Error('candidate_browser_smoke_refused');}
function configuration(){
 if(process.argv.length!==2||process.env.PLAYWRIGHT_SKIP_WEBSERVER!=='1')refuse();
 const base=process.env.E2E_BASE_URL,port=process.env.LAUNCH_RANKING_BROWSER_BRIDGE_PORT,sourceCommit=process.env.LAUNCH_CANDIDATE_SOURCE_SHA;
 if(!base||!port||!/^[1-9]\d{3,4}$/u.test(port)||Number(port)<1024||Number(port)>65535||!sourceCommit||!/^[a-f0-9]{40}$/u.test(sourceCommit))refuse();
 const target=new URL(base);
 if(target.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash||!target.port)refuse();
 const workDir=process.env.LAUNCH_CANDIDATE_WORK_DIR,receipt=process.env.LAUNCH_CANDIDATE_RECEIPT;
 if(!workDir||!receipt||!path.isAbsolute(workDir)||!path.isAbsolute(receipt)||path.resolve(workDir)!==workDir||path.resolve(receipt)!==receipt
  ||!workDir.startsWith('/workspace/')||!workDir.split(path.sep).includes('work')||path.dirname(receipt)!==workDir||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,90}\.json$/u.test(path.basename(receipt)))refuse();
 return {origin:target.origin,bridge:`http://127.0.0.1:${port}`,sourceCommit,workDir,receipt};
}
async function boundedJson(response,max=16384){
 const bytes=await response.body();if(bytes.length>max)refuse();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
async function stats(api,bridge){
 const response=await api.get(`${bridge}/__fixture/stats`,{maxRedirects:0,timeout:5000});observed.statsStatus=response.status();assert.equal(response.status(),200);
 const v=await boundedJson(response,4096);assert.equal(v.synthetic,true);
 for(const key of ['reads','unsupported','controls'])assert.ok(Number.isSafeInteger(v[key])&&v[key]>=0);
 return {reads:v.reads,unsupported:v.unsupported,controls:v.controls};
}
let browser,api,output,receipt;
let stage='config',profileName=null,observed={},firstFailure=null;
function recordFailure(error){
 if(firstFailure)return;
 const code=error?.code;
 const errorCode=['ERR_ASSERTION','ENOENT','EEXIST','EACCES'].includes(code)?code:error?.name==='TimeoutError'?'TIMEOUT':'OTHER';
 firstFailure={failureStage:stage,profile:profileName,errorCode,observed:{...observed}};
 if(error instanceof assert.AssertionError){
  if(typeof error.actual==='number'&&Number.isFinite(error.actual))firstFailure.actualNumber=error.actual;
  if(typeof error.expected==='number'&&Number.isFinite(error.expected))firstFailure.expectedNumber=error.expected;
 }
 if(receipt)Object.assign(receipt,firstFailure);
}
const cacheKind=value=>value==='no-store'?'no-store':value?'other':'missing';
try{
 const config=configuration();if(await realpath(config.workDir)!==config.workDir)refuse();
 // Fresh owner-selected file only; never follow/overwrite an existing target.
 output=await open(config.receipt,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 receipt={schemaVersion:'launch-candidate-loopback-browser-smoke-v1',sourceCommit:config.sourceCommit,sourceIdentity:'owner_supplied_label',nodeVersion:process.version,
  scope:'actual_next_unavailable_boundary_only',passed:false,cases:[],blockedRequests:0,blockedNonLoopbackRequests:0,ownedBrowserClosed:false,
  producerAuthority:false,realSourceCatalog:false,synthetic21ProjectionAcceptedHere:false,serverStarted:false,sourceOrDatabaseWork:false};
 stage='api_client';api=await request.newContext({baseURL:config.origin,timeout:5000});
 stage='browser_launch';browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
 for(const profile of [{name:'desktop',options:{viewport:{width:1440,height:1000}}},{name:'mobile',options:{...devices['Pixel 7']}}]){
  profileName=profile.name;observed={};stage='stats_before';
  const before=await stats(api,config.bridge);let blocked=0,blockedNonLoopback=0;
  stage='context_create';const context=await browser.newContext({...profile.options,serviceWorkers:'block'});
  try{
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.protocol==='http:'&&url.origin===config.origin){await route.continue();return;}
    blocked++;if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))blockedNonLoopback++;
    await route.abort('blockedbyclient');
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);
   stage='navigation';const navigation=await page.goto(`${config.origin}/candidates`,{waitUntil:'networkidle',timeout:20000});observed.pageStatus=navigation?.status()??0;assert.equal(navigation?.status(),200);
   observed.pageOriginMatches=new URL(page.url()).origin===config.origin;observed.pagePathMatches=new URL(page.url()).pathname==='/candidates';
   assert.equal(new URL(page.url()).origin,config.origin);assert.equal(new URL(page.url()).pathname,'/candidates');
   stage='page_marker';const catalog=page.getByTestId('launch-candidate-catalog');await catalog.waitFor({state:'visible'});
   stage='page_content';const text=await catalog.innerText();observed.unavailableText=text.includes('正式生產者尚未接線');observed.notEmptyClaim=text.includes('這不代表沒有候選');assert.ok(text.includes('正式生產者尚未接線'));assert.ok(text.includes('這不代表沒有候選'));
   stage='page_empty';observed.tableCount=await catalog.getByRole('table').count();observed.legacyCount=await page.getByTestId('vnext-candidates').count();observed.rankedCount=await page.getByTestId('launch-ranked-member').count();
   assert.equal(observed.tableCount,0);assert.equal(observed.legacyCount,0);assert.equal(observed.rankedCount,0);
   stage='page_fixture_absence';for(const forbidden of ['受控合成投影示例','synthetic_original_mention','本版沒有符合完整證據','2300','2320'])assert.ok(!text.includes(forbidden));
   stage='api_503';const response=await api.get('/api/launch/candidates',{maxRedirects:0,timeout:5000});observed.apiStatus=response.status();observed.apiCache=cacheKind(response.headers()['cache-control']);assert.equal(response.status(),503);assert.equal(response.headers()['cache-control'],'no-store');
   stage='api_envelope';const body=await boundedJson(response);assert.equal(body.ok,false);assert.equal(body.result.availability,'producer_unavailable');assert.equal(body.result.activation,'disabled_not_connected');
   assert.deepEqual(body.result.rows,[]);assert.equal(body.result.nextCursor,null);assert.equal(body.result.publicationAuthority,false);assert.equal(body.result.coverage.sourceComplete,false);assert.equal(body.result.coverage.membershipComplete,false);
   const sentinel='candidate_smoke_private_echo_sentinel';
   stage='malformed_400';const negative=await api.get(`/api/launch/candidates?mode=fixture&private=${sentinel}`,{maxRedirects:0,timeout:5000});observed.malformedStatus=negative.status();observed.malformedCache=cacheKind(negative.headers()['cache-control']);assert.equal(negative.status(),400);assert.equal(negative.headers()['cache-control'],'no-store');
   const rejected=await boundedJson(negative);assert.deepEqual(rejected,{ok:false,error:'launch_candidate_query_invalid'});assert.ok(!JSON.stringify(rejected).includes(sentinel));
   stage='stats_unchanged';const after=await stats(api,config.bridge);observed.readDelta=after.reads-before.reads;observed.unsupportedDelta=after.unsupported-before.unsupported;observed.controlDelta=after.controls-before.controls;assert.deepEqual(after,before,'candidate reads must not call even the synthetic ranking RPC or unsupported work');
   stage='network_blocked_zero';assert.equal(blocked,0);assert.equal(blockedNonLoopback,0);
   receipt.cases.push({name:profile.name,passed:true,pageStatus:200,apiStatus:503,malformedStatus:400,bridgeBefore:before,bridgeAfter:after,rpcReadDelta:0,unsupportedDelta:0,blockedRequests:blocked,blockedNonLoopbackRequests:blockedNonLoopback});
  }catch(error){recordFailure(error);throw error;}finally{receipt.blockedRequests+=blocked;receipt.blockedNonLoopbackRequests+=blockedNonLoopback;stage='context_close';await context.close();}
 }
 assert.equal(receipt.cases.length,2);receipt.passed=true;
}catch(error){recordFailure(error);if(receipt)receipt.error='candidate_browser_smoke_failed';process.exitCode=1;process.stderr.write('candidate_browser_smoke_failed\n');}
finally{
 if(browser){try{stage='browser_close';await browser.close();if(receipt)receipt.ownedBrowserClosed=!browser.isConnected();}catch(error){recordFailure(error);process.exitCode=1;if(receipt)receipt.passed=false;}}
 if(api){try{stage='api_close';await api.dispose();}catch(error){recordFailure(error);process.exitCode=1;if(receipt)receipt.passed=false;}}
 if(receipt&&!receipt.ownedBrowserClosed){receipt.passed=false;process.exitCode=1;}
 if(output){try{await output.writeFile(JSON.stringify(receipt,null,2)+'\n');}catch{process.exitCode=1;}finally{await output.close();}}
}
