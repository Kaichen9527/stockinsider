/** New retained-state acceptance: synthetic Fetch Responses -> actual PG17
 * append/read authority. No live TWSE acquisition, complete event window,
 * hostile-service attestation, HTTP route or formal source rights are claimed. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {workerFixture,hash} from './vnext-worker-fixture.mjs';
import {captureTwseSnapshot,snapshotCoverage,TWSE_SNAPSHOT_ENDPOINTS} from '../web/src/lib/vnext/twse-snapshot.ts';
import {inputHash} from '../web/src/lib/vnext/policy.ts';
const candidate='migrations/20261022_vnext_twse_snapshot_receipts_v1.sql';
const profile=JSON.parse(fs.readFileSync('scripts/opportunity-v3/vnext-twse-snapshot-profile-v1.json','utf8'));
const stage=process.env.VNEXT_TWSE_TEST_STAGE??'fresh';assert.ok(['fresh','retained-semantic-o23'].includes(stage));
const baselinePath='/tmp/stockinsider-vnext-oct22-private/semantic-native-retained-o23/final-state.json';
const baseline=stage==='retained-semantic-o23'?fs.readFileSync(baselinePath):null;
if(baseline)assert.equal(hash(baseline),'b8637ca706af165aaee3dce944e400b0c60aeb4f0a6b5b6a352053a18958ad19');
const suffix=stage==='fresh'?'05':'11';
assert.equal(process.env.VNEXT_TEST_CONTAINER,'stockinsider-vnext-oct22-worker-'+suffix);
assert.equal(process.env.VNEXT_WORKER_SOCKET_PARENT,'/tmp/stockinsider-vnext-oct22-private/worker-pg-socket-'+suffix);
await test('new TWSE snapshot transport receipts: '+stage+' engineering PG authority',{timeout:240000},async t=>{
 const x=await workerFixture(),events=[];let before,functionsBefore,principal,connectorRunId,request,receipt,leaseAcquired=false;
 const releaseId='b'.repeat(40),leaseOwner=randomUUID();
 const step=async(name,body)=>{let failed=false;await t.test(name,async()=>{try{await body();}catch(error){failed=true;throw error;}});if(failed)throw Error('dependent_twse_snapshot_stage_failed');};
 const catalog=async()=>(await x.observer.query("SELECT p.oid,p.oid::regprocedure::text AS signature,to_jsonb(p) AS metadata FROM pg_proc p WHERE p.pronamespace='public'::regnamespace ORDER BY p.oid")).rows;
 const rpc=async(operation,body,{expected,actor=principal}={})=>{
  const c=await x.connect();try{await c.query('SET ROLE service_role');await c.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({'x-stockinsider-writer-release':releaseId})]);
   const ready=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));
   const [query,settled]=await Promise.allSettled([c.query('SELECT public.vnext_twse_snapshot_v1($1,$2,$3::jsonb) AS result',[actor,operation,JSON.stringify(body)]),ready]);
   assert.equal(settled.status,'fulfilled');assert.equal(settled.value,'I');events.push({operation,pid:c.processID,ready:'I',querySettled:true,...query.status==='rejected'?{code:query.reason.code,message:query.reason.message}:{committed:true}});
   if(expected){assert.equal(query.status,'rejected');assert.equal(query.reason.code,'P0001');assert.match(query.reason.message,expected);return;}
   if(query.status==='rejected')throw query.reason;return query.value.rows[0].result;
  }finally{await x.close(c);}
 };
 try{
  await step('full candidate commits with exact source pins, no existing function or business row changes',async()=>{
   if(stage==='fresh'){await x.install();await x.writer.query(fs.readFileSync('migrations/20261022_vnext_analysis_sources_v1.sql','utf8'));}
   await x.observer.query('SET default_transaction_read_only=on');before=await x.snapshot();if(baseline)assert.deepEqual(before,JSON.parse(baseline));functionsBefore=await catalog();
   const bytes=fs.readFileSync(candidate);assert.equal(hash(bytes),profile.migrationSha256);await x.writer.query(bytes.toString());
   const after=await catalog();for(const old of functionsBefore)assert.deepEqual(after.find(row=>row.oid===old.oid),old);
   const added=after.filter(row=>!functionsBefore.some(old=>old.oid===row.oid));assert.deepEqual(added.map(row=>row.signature).sort(),['vnext_twse_snapshot_immutable_v1()','vnext_twse_snapshot_v1(text,text,jsonb)']);
   const state=await x.snapshot();assert.equal(state.vnext_twse_snapshot_receipts_v1.count,0);delete state.vnext_twse_snapshot_receipts_v1;assert.deepEqual(state,before);
   const acl=(await x.observer.query("SELECT has_table_privilege('service_role','public.vnext_twse_snapshot_receipts_v1','SELECT') AS service_read,has_table_privilege('service_role','public.vnext_twse_snapshot_receipts_v1','INSERT') AS service_insert,has_function_privilege('anon','public.vnext_twse_snapshot_v1(text,text,jsonb)','EXECUTE') AS anonymous_execute,has_function_privilege('service_role','public.vnext_twse_snapshot_immutable_v1()','EXECUTE') AS service_trigger,relrowsecurity FROM pg_class WHERE oid='public.vnext_twse_snapshot_receipts_v1'::regclass")).rows[0];
   assert.deepEqual(acl,{service_read:false,service_insert:false,anonymous_execute:false,service_trigger:false,relrowsecurity:true});
   x.save('install',{candidate,bytes:bytes.length,sha256:hash(bytes),profile,oldFunctions:functionsBefore,newFunctions:added,existingWholeRowsUnchanged:true,acl,stage,scope:stage==='fresh'?'fresh original captured50/pub26/vNext worker plus analysis setup; later unrelated candidates not installed':'retained-state new-object install; fresh complete bundle not run'});
  });
  await step('original writer lease and explicit synthetic connector/policy setup precede real service-role append',async()=>{
   if(stage==='fresh')await x.writer.query("INSERT INTO public.vnext_principals_v1(principal,role,enabled) VALUES('synthetic-twse-snapshot-operator','operator',true)");
   principal=(await x.observer.query("SELECT principal FROM public.vnext_principals_v1 WHERE enabled AND role='operator' ORDER BY principal")).rows[0]?.principal;assert.ok(principal);
   assert.equal(before.production_writer_releases.count,0);assert.equal(before.production_write_leases.count,0);assert.equal(before.vnext_source_policies_v1.count,0);
   await x.writer.query("INSERT INTO public.production_writer_releases(release_id,writer_kind,active,activated_at) VALUES($1,'vps',true,clock_timestamp())",[releaseId]);
   await x.writer.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({'x-stockinsider-writer-release':releaseId})]);
   assert.equal((await x.writer.query("SELECT public.acquire_production_write_lease('production-data-plane',$1::uuid,300) AS acquired",[leaseOwner])).rows[0].acquired,true);leaseAcquired=true;
   await x.writer.query("INSERT INTO public.vnext_source_policies_v1(source,scope,license_basis,rights_subject,valid_until,enabled) VALUES('official','official_original','synthetic-twse-snapshot-fixture','synthetic-engineering-only',clock_timestamp()+interval'1 hour',true)");
   const c=await x.connect();try{await c.query('SET ROLE service_role');await c.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({'x-stockinsider-writer-release':releaseId})]);
    const run=(await c.query("INSERT INTO public.connector_runs(connector_name,platform,status,metadata) VALUES('source-sync','twse_insider','running','{\"syntheticEngineeringFixture\":true}') RETURNING id,connector_name,platform,started_at")).rows[0];
    connectorRunId=run.id;assert.equal(run.connector_name,'source-sync');assert.equal(run.platform,'twse_insider');
    x.save('synthetic-setup',{connector:run,scope:'finite original connector row insertion as explicit fixture setup, not actual connector acquisition; no new role/grant/identity-fence changes'});
   }finally{await x.close(c);}
   const context={connectorRunId,endpointKey:'holding_listed',querySymbol:null,requestedAt:new Date().toISOString()};
   const body=JSON.stringify([{'公司代號':'2330','出表日期':'1151023','姓名':'Synthetic person never retained','目前持股':'100'}]);
   const response=new Response(body,{status:200});Object.defineProperty(response,'url',{value:TWSE_SNAPSHOT_ENDPOINTS.holding_listed});
   const captured=await captureTwseSnapshot(response,context);assert.equal(captured.error,null);request={observation:captured.observation};receipt=await rpc('append',request);
   assert.deepEqual(receipt.observation,request.observation);assert.equal(receipt.receiptHash,inputHash(request.observation));assert.equal(receipt.observation.responseSha256,hash(body));assert.equal(JSON.stringify(receipt).includes('Synthetic person'),false);
   const saved=(await x.observer.query('SELECT * FROM public.vnext_twse_snapshot_receipts_v1 WHERE receipt_id=$1',[receipt.receiptId])).rows;assert.equal(saved.length,1);assert.deepEqual(saved[0].observation,request.observation);assert.equal(saved[0].receipt_hash,receipt.receiptHash);
   assert.equal(saved[0].recorded_at.toISOString(),new Date(receipt.recordedAt).toISOString());x.save('committed-receipt',{receipt,stored:saved,syntheticResponse:true,realAcquisition:false,eventCoverage:'unknown',eventVolume:null});
  });
  await step('exact replay/read/latest preserve full rows; direct schema/identity mutants reject with actual ReadyI',async()=>{
   const state=await x.snapshot();assert.deepEqual(await rpc('append',request),receipt);assert.deepEqual(await rpc('read',{connectorRunId,endpointKey:'holding_listed'}),receipt);
   const latest=await rpc('latest',{}),coverage=snapshotCoverage(latest);assert.equal(coverage.eventVolume,null);assert.equal(coverage.eventCoverage,'unknown');assert.equal(coverage.observations.length,1);
   for(const mutation of [{...request.observation,eventWindow:{complete:true}},{...request.observation,selectedRows:true},{...request.observation,eventVolume:1}])await rpc('append',{observation:mutation},{expected:/vnext_twse_snapshot_(profile|count)_invalid/u});
   await rpc('read',{connectorRunId,endpointKey:'holding_listed'},{actor:'synthetic-unregistered-not-operator',expected:/operator_mode_required/u});
   assert.deepEqual(await x.snapshot(),state);x.save('replay-and-negatives',{wholeRowsUnchanged:true,coverage,expectedRejectedMutants:4,notCovered:'No hostile-service transport proof or complete event-day/source-root volume authority'});
  });
  await step('current source-policy withdrawal blocks historical reads without mutating the retained receipt',async()=>{
   const old=await x.snapshot();await x.writer.query("UPDATE public.vnext_source_policies_v1 SET enabled=false WHERE source='official' AND scope='official_original'");const state=await x.snapshot();
   for(const operation of ['read','latest'])await rpc(operation,operation==='read'?{connectorRunId,endpointKey:'holding_listed'}:{},{expected:/current_rights_required/u});
   assert.deepEqual(await x.snapshot(),state);assert.deepEqual(state.vnext_twse_snapshot_receipts_v1,old.vnext_twse_snapshot_receipts_v1);
   for(const [name,value]of Object.entries(old))if(name!=='vnext_source_policies_v1')assert.deepEqual(state[name],value);
   x.save('withdrawal',{before:old,after:state,receiptUnchanged:true,policyOnlyExpectedDelta:true});
  });
  await step('first-only full installer rejects and rollback preserves all rows and function metadata',async()=>{
   const state=await x.snapshot(),functions=await catalog();const ready=new Promise(resolve=>x.writer.connection.once('readyForQuery',message=>resolve(message.status)));
   const [q,r]=await Promise.allSettled([x.writer.query(fs.readFileSync(candidate,'utf8')),ready]);assert.equal(q.status,'rejected');assert.equal(q.reason.code,'P0001');assert.match(q.reason.message,/first_install_required/u);assert.equal(r.status,'fulfilled');assert.equal(r.value,'E');
   const rollback=new Promise(resolve=>x.writer.connection.once('readyForQuery',message=>resolve(message.status)));await x.writer.query('ROLLBACK');assert.equal(await rollback,'I');assert.deepEqual(await x.snapshot(),state);assert.deepEqual(await catalog(),functions);
   x.save('repeat',{code:q.reason.code,ready:'E',rollbackReady:'I',wholeRowsAndFunctionsUnchanged:true});
  });
 }finally{
  if(leaseAcquired)assert.equal((await x.writer.query("SELECT public.release_production_write_lease('production-data-plane',$1::uuid) AS released",[leaseOwner])).rows[0].released,true);
  x.save('twse-query-events',events);await x.finish();
 }
});
