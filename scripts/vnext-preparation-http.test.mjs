/** Future fresh actual Next HTTP -> finite REST facade -> PostgreSQL17.11.
 * NOT a PG-wire-loss test. No existing native entry is imported/replayed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {hash} from './vnext-worker-fixture.mjs';
import {preparationHttpFixture,verifyPreparationReadSource} from './vnext-preparation-http-fixture.mjs';
const root=process.cwd(),port=34242,bridgePort=34241;
function requireBuiltSource(){
 assert.equal(process.version,'v22.14.0');const head=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});assert.equal(head.status,0);const sha=head.stdout.trim();assert.match(sha,/^[a-f0-9]{40}$/u);assert.equal(process.env.VNEXT_PREPARATION_BUILD_SOURCE_SHA,sha,'runner must bind this same-built source');
 assert.equal(spawnSync('git',['diff','--quiet','--','web/src'],{stdio:'ignore'}).status,0,'tracked runtime source must equal built HEAD');
 const buildId=fs.readFileSync(path.join(root,'web/.next/BUILD_ID'),'utf8').trim();assert.ok(buildId&&buildId.length<200);const required=fs.readFileSync(path.join(root,'web/.next/required-server-files.json'));assert.ok(required.length<1048576);
 return {sourceCommit:sha,buildId,requiredServerFilesSha256:hash(required),scope:'runner-bound same source; build command/receipt must be preserved by outer CI'};
}
await test('running cached preparation HTTP read, actual committed response loss and explicit immutable read recovery',{timeout:480000},async t=>{
 let f,app,appLog,appClosed=false,appError,containmentUsed=false;const receipts=[];let failedStage='preflight';
 const safeErrors=new WeakMap();
 const safeFailure=error=>{
  if(error&&typeof error==='object'&&safeErrors.has(error))return safeErrors.get(error);
  const original=error instanceof Error?error:new Error(String(error));
  if(f)f.x.save('failure-'+failedStage,{name:original.name,message:original.message,stack:original.stack});
  const primitive=value=>value===null||typeof value==='number'||typeof value==='boolean'?value:'REDACTED';
  console.log('PREPARATION_HTTP_FAILURE_SAFE '+JSON.stringify({stage:failedStage,code:/^[A-Z0-9_]{1,40}$/u.test(String(original.code||''))?String(original.code):'UNKNOWN',actual:primitive(original.actual),expected:primitive(original.expected),messageHash:hash(original.message)}));
  const safe=new Error('preparation_http_stage_failed_'+failedStage);safe.stack='';safeErrors.set(original,safe);safeErrors.set(safe,safe);return safe;
 };
 const step=async(name,work)=>{failedStage=name;let failed;await t.test(name,async()=>{try{await work();}catch(e){failed=e;throw safeFailure(e);}});if(failed)throw safeFailure(failed);};
 const post=async(body,key)=>{const res=await fetch(`http://127.0.0.1:${port}/api/internal/vnext-research`,{method:'POST',headers:{'content-type':'application/json',...(key?{authorization:'Bearer '+key}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});return {status:res.status,body:await res.json()};};
 try{
  const built=requireBuiltSource();verifyPreparationReadSource();f=await preparationHttpFixture();f.x.save('built-source',built);await f.install();
  await new Promise((resolve,reject)=>{f.bridge.once('error',reject);f.bridge.listen(bridgePort,'127.0.0.1',resolve);});
  const bootstrap=path.join(f.x.output,'next-fetch-boundary.mjs');const deniedPath=path.join(f.x.output,'unexpected-network.jsonl');const lossFetchPath=path.join(f.x.output,'actual-fetch-rejections.jsonl');
  fs.writeFileSync(bootstrap,`import fs from 'node:fs';const actual=globalThis.fetch;globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);if(url.origin!=='http://127.0.0.1:${bridgePort}'||!url.pathname.startsWith('/rest/v1/')){fs.appendFileSync(${JSON.stringify(deniedPath)},JSON.stringify({origin:url.origin,path:url.pathname})+'\\n',{mode:0o600});throw Error('owned_preparation_network_scope');}return actual(input,init).catch(error=>{fs.appendFileSync(${JSON.stringify(lossFetchPath)},JSON.stringify({path:url.pathname,name:error.name,code:typeof error.cause?.code==='string'?error.cause.code:'UNKNOWN'})+'\\n',{mode:0o600});throw error;});};\n`,{mode:0o600,flag:'wx'});
  const env={...process.env};for(const name of Object.keys(env))if(/^(SUPABASE_|NEXT_PUBLIC_SUPABASE_|OPPORTUNITY_V3_|STOCKINSIDER_|RESEARCH_|INTERNAL_|CRON_|OPENAI_|ANTHROPIC_|VERCEL|CREDENTIALS_DIRECTORY|NODE_OPTIONS)/u.test(name))delete env[name];
  Object.assign(env,{NODE_TEST_CONTEXT:'child-v8',LEGACY_RADAR_CORRECTNESS_PROJECTION:'enabled',STOCKINSIDER_VNEXT_ENABLED:'true',STOCKINSIDER_DATA_PLANE:'supabase',SUPABASE_URL:`http://127.0.0.1:${bridgePort}`,SUPABASE_SERVICE_ROLE_KEY:f.keys.bridge,INTERNAL_API_KEY:f.keys.operator,STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL:'synthetic-preparation-operator',STOCKINSIDER_VNEXT_AUTHOR_KEY:f.keys.author,STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL:'synthetic-preparation-author',STOCKINSIDER_VNEXT_REVIEWER_KEY:f.keys.reviewer,STOCKINSIDER_VNEXT_REVIEWER_PRINCIPAL:'synthetic-preparation-reviewer',STOCKINSIDER_WRITER_RELEASE_ID:f.releaseId,NEXT_TELEMETRY_DISABLED:'1'});
  appLog=fs.openSync(path.join(f.x.output,'next.log'),'wx',0o600);app=spawn(process.execPath,['--import',bootstrap,'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:path.join(root,'web'),env,stdio:['ignore',appLog,appLog]});app.once('close',()=>{appClosed=true;});app.once('error',error=>{appError=error;});
  const until=Date.now()+30000;let ready=false;while(Date.now()<until){if(appError)throw appError;if(appClosed||app.exitCode!==null||app.signalCode!==null)throw Error('owned_next_exited');try{if((await post({action:'preparation-read',jobId:'bad'})).status===401){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.equal(ready,true);
  await step('auth_first_and_closed_author_selectors',async()=>{
   const baseline=await f.x.snapshot(),start=f.trace.length;const jobId='11111111-1111-4111-8111-111111111111';
   assert.equal((await post({action:'preparation-read',jobId})).status,401);
   assert.equal((await post({action:'preparation-read',jobId},f.keys.operator)).status,409);
   for(const body of [{action:'preparation-read',jobId:'bad'},{action:'preparation-read',jobId,principal:'caller'},{action:'resume-preparation',jobId,inputHash:'caller'},{action:'resume-preparation',jobId,evidence:[]}]){const r=await post(body,f.keys.author);assert.equal(r.status,409);assert.equal(r.body.error,'vnext_preparation_job_id_only');}
   assert.equal(f.trace.length,start);assert.deepEqual(await f.x.snapshot(),baseline);receipts.push({authFirst:true,closedSelectors:true,zeroRpc:true});
  });
  const claim=await f.enqueueAndClaim();let readyState;
  await step('running_read_reports_real_cached_financial_ready_without_any_write',async()=>{
   const baseline=await f.x.snapshot(),start=f.trace.length;const r=await post({action:'preparation-read',jobId:claim.jobId},f.keys.author);assert.equal(r.status,200);assert.equal(r.body.result.status,'ready');assert.equal(r.body.result.prepared,false);assert.equal(r.body.result.financialFacts,1);assert.equal(r.body.result.sourceReceipts,1);assert.equal(r.body.result.priceAvailable,false);assert.equal(r.body.result.entryEligible,false);assert.equal(r.body.result.currentRights,'checked');assert.equal(r.body.result.nextAction,'resume-preparation');assert.equal(r.body.result.automaticResume,false);assert.equal(r.body.result.reinvoke,false);assert.equal('evidence'in r.body.result,false);
   readyState=await f.x.snapshot();assert.deepEqual(readyState,baseline);const events=f.trace.slice(start);assert.equal(events.some(e=>e.rpc?.includes('production_write_lease')||['prepare','claim','reserve'].includes(e.action)),false);assert.ok(events.some(e=>e.table==='candidate_financial_fact_provenance_v4'));assert.equal(readyState.vnext_provider_invocations_v1.count,0);receipts.push({cacheReady:r,wholePublicStateUnchanged:true,actualReadOnlyContext:true});
  });
  await step('real_prepare_commit_then_bridge_socket_loss_yields_uncertain_without_resend',async()=>{
   const start=f.trace.length;f.armLoss();const r=await post({action:'resume-preparation',jobId:claim.jobId},f.keys.author);assert.equal(r.status,200);assert.equal(r.body.result.status,'unresolved');assert.equal(r.body.result.reason,'preparation_write_outcome_uncertain');assert.equal(r.body.result.nextAction,'preparation-read');assert.equal(r.body.result.automaticResume,false);assert.equal(r.body.result.reinvoke,false);
   assert.ok(f.loss);assert.equal(f.loss.commitReady,'I');assert.equal(f.loss.responseBytesSent,0);assert.equal(f.loss.socketClosed,true);assert.equal(f.loss.socketDestroyed,true);const failedFetchBytes=fs.readFileSync(lossFetchPath);assert.ok(failedFetchBytes.length<4096);const failedFetches=failedFetchBytes.toString().trim().split('\n').map(JSON.parse);assert.equal(failedFetches.length,1);assert.equal(failedFetches[0].path,'/rest/v1/rpc/vnext_command_v1');assert.equal(failedFetches[0].name,'TypeError');assert.equal(f.trace.slice(start).filter(e=>e.kind==='rpc-attempt'&&e.action==='prepare').length,1);assert.equal(f.trace.slice(start).filter(e=>e.action==='prepare'&&e.committed).length,1);assert.equal(f.trace.slice(start).filter(e=>e.kind==='rpc'&&e.rpc==='acquire_production_write_lease').length,1);assert.equal(f.trace.slice(start).filter(e=>e.kind==='rpc'&&e.rpc==='release_production_write_lease').length,1);
   const after=await f.x.snapshot();assert.equal(after.vnext_preparations_v1.count,1);assert.equal(after.vnext_jobs_v1.count,1);assert.equal(after.vnext_jobs_v1.rows.filter(j=>j.started_at!==null).length,1);assert.equal(after.vnext_jobs_v1.rows[0].execution_id,claim.executionId);assert.equal(after.vnext_jobs_v1.rows[0].deadline_at,claim.deadline);assert.equal(after.vnext_provider_invocations_v1.count,0);assert.equal(after.production_write_leases.count,0);
   for(const table of Object.keys(readyState))if(!['vnext_preparations_v1','vnext_jobs_v1','vnext_members_v1','vnext_home_v1','vnext_audit_v1'].includes(table))assert.deepEqual(after[table],readyState[table],table);for(const table of Object.keys(f.committed))if(table!=='production_write_leases')assert.deepEqual(after[table],f.committed[table],table+' changed after observed COMMIT');assert.deepEqual(after.production_write_leases,readyState.production_write_leases);f.x.save('after-uncertain-response',after);receipts.push({uncertain:r,actualHttpSocketLoss:f.loss,oneOriginalAttempt:true});
  });
  await step('explicit_http_read_and_prepared_resume_observe_same_frozen_state_without_reprepare',async()=>{
   const baseline=await f.x.snapshot(),start=f.trace.length;for(const action of ['preparation-read','resume-preparation']){const r=await post({action,jobId:claim.jobId},f.keys.author);assert.equal(r.status,200);assert.equal(r.body.result.status,'prepared');assert.equal(r.body.result.inputHash,f.loss.inputHash);assert.equal(r.body.result.prepared,true);assert.equal(r.body.result.currentRights,'checked');assert.equal(r.body.result.preparationObservation.immutableRowReceiptExposed,false);assert.equal(r.body.result.preparationObservation.source,'existing_job_and_work_context');assert.equal(r.body.result.automaticResume,false);assert.equal(r.body.result.reinvoke,false);assert.equal('evidence'in r.body.result,false);receipts.push({action,result:r});}
   assert.deepEqual(await f.x.snapshot(),baseline);const events=f.trace.slice(start);assert.equal(events.some(e=>e.kind==='cache'&&e.table!=='production_writer_releases'||e.rpc?.includes('production_write_lease')||['prepare','claim','reserve'].includes(e.action)),false);assert.equal(f.trace.filter(e=>e.kind==='rpc-attempt'&&e.action==='prepare').length,1);assert.equal(f.trace.filter(e=>e.action==='prepare'&&e.committed).length,1);assert.equal(f.trace.filter(e=>e.kind==='bridge-error').length,0);assert.equal(f.trace.filter(e=>e.action==='reserve'||e.action==='claim').length,0);assert.equal(baseline.vnext_provider_invocations_v1.count,0);assert.ok(!fs.existsSync(deniedPath));
   f.x.save('read-recovery-full-state',baseline);f.x.save('preparation-http-receipt',{built,receipts,actualHttp:true,actualDatabase:true,syntheticIssuerParserOnly:true,actualModel:false,actualAcquiredDocument:false,noSecondClaimPrepareProviderOrLease:true,scope:'immutable frozen-state observation; original DB row separately proven by owned observer, not exposed as HTTP receipt'});
  });
 }catch(error){throw safeFailure(error);}finally{
  let cleanupError;
  if(app){
   const settled=()=>appClosed||app.exitCode!==null||app.signalCode!==null;
   const waitUntil=async end=>{while(!settled()&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,50));};
   const end=Date.now()+35000;
   if(!settled()){app.kill('SIGTERM');await waitUntil(Math.min(end,Date.now()+5000));}
   if(!settled()){containmentUsed=true;app.kill('SIGKILL');await waitUntil(end);}
   if(!settled()||(app.pid&&fs.existsSync('/proc/'+app.pid)))cleanupError=Error('owned_next_process_unsettled');else if(containmentUsed)cleanupError=Error('owned_next_containment_required');
  }
  if(appLog!==undefined)fs.closeSync(appLog);
  if(f){f.x.save('http-process-settlement',{appExit:app?.exitCode,appSignal:app?.signalCode,appClosed,containmentUsed,appError:appError?.message,appProcessAbsent:app?.pid?!fs.existsSync('/proc/'+app.pid):true,ownedOnly:true});try{await f.close();}catch(error){cleanupError=error;}}
  if(cleanupError)throw safeFailure(cleanupError);
 }
});
