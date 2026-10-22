/** New acceptance: resumes the exact retained, stopped thesis-native06 lab.
 * It does not reinstall/replay old prefixes or run any previous green test entry.
 * Original synthetic articles/facts remain unqualified; no real source/model claim. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {workerFixture,hash} from './vnext-worker-fixture.mjs';
import {sourceWithdrawalOperation,validateWithdrawalReceipt} from '../web/src/lib/vnext/source-withdrawal.ts';
import {roles} from './vnext-synthetic-research-vectors.mjs';
await test('per-content append-only withdrawal fences retained research and resists policy ABA',{timeout:60000},async t=>{
 const x=await workerFixture();const events=[];let contentHash,request,receipt,baseline;
 const step=async(name,work)=>{let failed=false;await t.test(name,async()=>{try{await work();}catch(e){failed=true;throw e;}});if(failed)throw Error('dependent_withdrawal_stage_failed');};
 const rpc=async(name,args,expected)=>{const c=await x.connect();try{await c.query('SET ROLE service_role');const ready=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));const [q,r]=await Promise.allSettled([c.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)+(i===args.length-1 && typeof args[i]==='object'?'::jsonb':'')).join(',')}) AS result`,args.map(a=>typeof a==='object'?JSON.stringify(a):a)),ready]);assert.equal(r.status,'fulfilled');assert.equal(r.value,'I');events.push({name,pid:c.processID,ready:r.value,querySettled:true,status:q.status,...q.status==='rejected'?{code:q.reason.code,message:q.reason.message}:{committed:true}});if(expected){assert.equal(q.status,'rejected');assert.equal(q.reason.code,'P0001');assert.match(q.reason.message,expected);return;}if(q.status==='rejected')throw q.reason;return q.value.rows[0].result;}finally{await x.close(c);}};
 const source=(action,body)=>rpc('vnext_analysis_command_v1',[roles.operator.principal,action,body]);
 const deps={writer:async work=>work(),rpc:(principal,op,body)=>rpc('vnext_source_withdrawal_v1',[principal,op,body])};
 const current=()=>rpc('vnext_read_v1',['2409']);
 const catalog=async()=>{const p=(await x.observer.query("SELECT oid,to_jsonb(p) AS row FROM pg_proc p WHERE pronamespace='public'::regnamespace ORDER BY oid")).rows;const tables=(await x.observer.query("SELECT to_jsonb(c) AS row FROM pg_class c WHERE relnamespace='public'::regnamespace ORDER BY oid")).rows;const roles=(await x.observer.query("SELECT to_jsonb(r) AS row FROM pg_roles r WHERE rolname!~'^pg_' ORDER BY rolname")).rows;return {functions:p,tables,roles};};
 try{
  await step('exact retained committed withdrawal recovers by explicit READ without mutation',async()=>{
   baseline=await x.snapshot();assert.deepEqual(baseline,JSON.parse(fs.readFileSync('/tmp/stockinsider-vnext-oct22-private/withdrawal-native-02/final-state.json')));assert.equal(baseline.vnext_publications_v1.count,3);assert.equal(baseline.production_write_leases.count,0);assert.equal(baseline.vnext_source_withdrawals_v1.count,1);
   const actual=await catalog();const first=JSON.parse(fs.readFileSync('/tmp/stockinsider-vnext-oct22-private/withdrawal-native-01/catalog.json'));assert.deepEqual(actual,first.after);
   contentHash=baseline.vnext_source_withdrawals_v1.rows[0].content_hash;request={contentHash,reason:'rights_revoked',citation:'https://www.twse.com.tw/synthetic-withdrawal-receipt'};
   receipt=await sourceWithdrawalOperation(roles.operator,'read',{contentHash},deps);validateWithdrawalReceipt(receipt,request,'commit',roles.operator.principal);assert.deepEqual(receipt,JSON.parse(fs.readFileSync('/tmp/stockinsider-vnext-oct22-private/withdrawal-native-02/withdrawal.json')).receipt);assert.deepEqual(await x.snapshot(),baseline);
   x.save('recovery',{receipt,catalog:actual,firstInstaller:'native01 component actualCOMMIT',firstEvent:'native02 component actualCOMMIT; overallFAIL wrong operator inspect (existing worker role guard correctly refused); no original run relabelled'});
  });
  await step('current article/source/clue/provider/market checks refuse withdrawn hash with no new calls or mutations',async()=>{
   const before=await x.snapshot();const pub=await current();assert.equal(pub.history[0].sourceRights.current,false);assert.deepEqual(pub.history[0].content,baseline.vnext_publications_v1.rows.find(p=>p.symbol==='2409').content);
   assert.deepEqual((await source('source-projection',{symbols:['2409']}))['2409'],{clues:[],evidence:[]});assert.deepEqual((await source('source-clues',{})).clues,[]);
   const original=(await x.observer.query('SELECT original FROM public.vnext_extractions_v1 WHERE content_hash=$1',[contentHash])).rows[0].original;
   const repeat=await source('source-reserve',{item:{contentHash,source:original.source,scope:original.scope,original}});assert.equal(repeat.parse,false);assert.equal(repeat.deferred,'source_content_withdrawn');
   const job=before.vnext_jobs_v1.rows.find(j=>j.symbol==='2409');await x.rpc(roles.reviewer.principal,'publish',{jobId:job.job_id,inputHash:job.input_hash,executionId:job.reviewer_execution},false,/vnext_research_original_rights_no_longer_current/u);
   assert.equal((await x.rpc(roles.author.principal,'inspect',{jobId:job.job_id},true)).state,'published_historical');
   // Private market predicate is invoked as its existing owner, not newly exposed to service_role.
   await x.writer.query('SET ROLE stockinsider_vnext_owner');const market=(await x.writer.query('SELECT public.vnext_market_events_current_v1($1::jsonb) AS current',[JSON.stringify({input:JSON.stringify({events:[{content_hash:contentHash,original}]})})])).rows[0];await x.writer.query('RESET ROLE');assert.equal(market.current,false);
   assert.deepEqual(await x.snapshot(),before);x.save('current-read',{article:pub,market,wholeStateUnchanged:true});
  });
  await step('policy disable then re-enable cannot revive a tombstone; explicitREAD and exact replay are immutable',async()=>{
   await x.writer.query("UPDATE public.vnext_source_policies_v1 SET enabled=false WHERE source='official'");await x.writer.query("UPDATE public.vnext_source_policies_v1 SET enabled=true WHERE source='official'");const before=await x.snapshot();
   assert.equal((await current()).history[0].sourceRights.current,false);assert.deepEqual(await sourceWithdrawalOperation(roles.operator,'read',{contentHash},deps),receipt);assert.deepEqual(await sourceWithdrawalOperation(roles.operator,'commit',request,deps),receipt);assert.deepEqual(await x.snapshot(),before);
   await rpc('vnext_source_withdrawal_v1',[roles.operator.principal,'commit',{...request,reason:'source_retracted'}],/vnext_withdrawal_replay_conflict/u);await rpc('vnext_source_withdrawal_v1',[roles.author.principal,'read',{contentHash}],/vnext_operator_required/u);assert.deepEqual(await x.snapshot(),before);
   for(const statement of ['UPDATE public.vnext_source_withdrawals_v1 SET event_hash=event_hash','DELETE FROM public.vnext_source_withdrawals_v1'])await assert.rejects(()=>x.writer.query(statement),e=>e.code==='P0001'&&e.message==='vnext_source_withdrawal_append_only');
   assert.deepEqual(await x.snapshot(),before);x.save('aba-state',before);
  });
 }finally{x.save('withdrawal-events',{events,syntheticOriginalResearch:true,realSourceAcquisition:false,providerInvocations:0,publicationOrSemanticApproval:false});await x.finish();}
});
