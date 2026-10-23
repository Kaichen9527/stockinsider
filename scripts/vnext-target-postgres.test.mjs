/** NEW retained-state installer/authority acceptance. No old native entry import.
 * Actual target-positive/HTTP/fresh-prefix coverage is explicitly separate. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {workerFixture,hash} from './vnext-worker-fixture.mjs';
import {roles} from './vnext-synthetic-research-vectors.mjs';
const baseline='/tmp/stockinsider-vnext-oct22-private/catalyst-native-retained-o23/final-state.json';
const baselineHash='15b5d243b7c6036f77c6292bddcce2a2c24415f6c263c037c1e79fab0c610926';
const migration='migrations/20261022_vnext_target_exit_v1.sql';
const profile=JSON.parse(fs.readFileSync('scripts/opportunity-v3/vnext-target-exit-profile-v1.json','utf8'));
assert.equal(process.env.VNEXT_TEST_CONTAINER,'stockinsider-vnext-oct22-worker-11');
assert.equal(process.env.VNEXT_WORKER_SOCKET_PARENT,'/tmp/stockinsider-vnext-oct22-private/worker-pg-socket-11');
await test('new target-exit actual retained PostgreSQL installer and service authority (not target-positive acceptance)',{timeout:120000},async t=>{
 const x=await workerFixture(),events=[];
 const step=async(name,work)=>{let failed=false;await t.test(name,async()=>{try{await work();}catch(error){failed=true;const safe={stage:name,code:/^[0-9A-Z_]{1,40}$/u.test(error.code||'')?error.code:'UNKNOWN',message:/^vnext_[a-z0-9_:]{1,180}$/u.test(error.message||'')?error.message:'hash:'+hash(String(error.message))};x.save('failure-safe',safe);console.log('TARGET_FAILURE_SAFE '+JSON.stringify(safe));throw error;}});if(failed)throw Error('dependent_target_stage_failed');};
 const query=async(sql,args=[],role='service_role',expected)=>{const c=await x.connect();try{assert.ok(['service_role','stockinsider_vnext_owner'].includes(role));await c.query('SET ROLE '+role);const ready=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));const[q,r]=await Promise.allSettled([c.query(sql,args),ready]);assert.equal(r.status,'fulfilled');assert.equal(r.value,'I');events.push({sqlHash:hash(sql),role,pid:c.processID,settled:true,ready:r.value,...q.status==='rejected'?{code:q.reason.code,message:q.reason.message}:{committed:true}});if(expected){assert.equal(q.status,'rejected');assert.equal(q.reason.code,expected.code);assert.match(q.reason.message,expected.message);return;}if(q.status==='rejected')throw q.reason;return q.value;}finally{await x.close(c);}};
 const routines=async()=>(await x.observer.query("SELECT oid,oid::regprocedure::text AS signature,to_jsonb(p)-'prosrc' AS metadata,encode(sha256(convert_to(prosrc,'UTF8')),'hex') AS body FROM pg_proc p WHERE pronamespace='public'::regnamespace ORDER BY oid")).rows;
 let pristine;
 try{
  await step('exact retained rows; full candidate COMMIT with one existing body, three functions and finite read-only edges',async()=>{
   const old=fs.readFileSync(baseline);assert.equal(hash(old),baselineHash);pristine=JSON.parse(old);assert.deepEqual(await x.snapshot(),pristine);await x.observer.query('SET default_transaction_read_only=on');
   const before=await routines(),bytes=fs.readFileSync(migration);assert.equal(hash(bytes),profile.migrationSha256);
   const catalog=/catalog_sql constant text:=\$catalog\$([\s\S]*?)\$catalog\$/u.exec(bytes.toString())[1];const edges=Object.fromEntries([...new Set(profile.readEdges.map(e=>e.relation))].map(name=>[name,profile.readEdges.filter(e=>e.relation===name).map(e=>e.column)]));const target=before.find(f=>f.signature==='vnext_command_v1(text,text,jsonb)');assert.ok(target);
   const fullBefore=(await x.observer.query(catalog,[[target.oid],[],JSON.stringify(edges)])).rows[0];
   const ready=new Promise(resolve=>x.writer.connection.once('readyForQuery',m=>resolve(m.status)));await x.writer.query(bytes.toString());assert.equal(await ready,'I');
   const after=await routines();assert.equal(after.length,before.length+3);const additions=after.filter(f=>!before.some(p=>p.oid===f.oid));
   for(const old of before){const current=after.find(f=>f.oid===old.oid);assert.ok(current);const p=profile.routines.find(p=>p.signature.replace('public.','')===old.signature);if(p){assert.equal(old.body,p.predecessorBodySha256);assert.equal(current.body,p.successorBodySha256);assert.deepEqual(current.metadata,old.metadata);}else assert.deepEqual(current,old);}
   for(const p of [...profile.newPrivateRoutines,{signature:profile.newServiceRoutine,bodySha256:profile.newServiceRoutineBodySha256}]){const actual=additions.find(f=>f.signature===p.signature.replace('public.',''));assert.ok(actual);assert.equal(actual.body,p.bodySha256);}
   const fullAfter=(await x.observer.query(catalog,[[target.oid],additions.map(f=>f.oid),JSON.stringify(edges)])).rows[0];assert.deepEqual(fullAfter,fullBefore);assert.deepEqual(await x.snapshot(),pristine);
   const permissions=(await x.observer.query("SELECT c.relname,a.attname,acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE c.relname=ANY($1::text[]) ORDER BY c.relname,a.attname",[Object.keys(edges)])).rows;assert.equal(permissions.length,50);assert.ok(permissions.every(p=>p.privilege_type==='SELECT'&&!p.is_grantable));
   const policies=(await x.observer.query("SELECT p.oid,c.relname,to_jsonb(p) AS metadata,pg_get_expr(p.polqual,p.polrelid) AS expression FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE polname='vnext_target_read_v1' ORDER BY c.relname")).rows;assert.equal(policies.length,5);assert.ok(policies.every(p=>p.expression==='true'&&p.metadata.polcmd==='r'));
   x.save('install',{migration,bytes:bytes.length,sha256:hash(bytes),before,after,fullBefore,fullAfter,permissions,policies,wholeBusinessRowsUnchanged:true,scope:'actual retained catalyst-complete predecessor only; fresh bundle/target-positive/HTTP NOT_RUN'});
  });
  await step('private source/quote functions deny service role; actual owner unknown identity defers without writes',async()=>{
   await query('SELECT public.vnext_target_current_v1($1,$2,$3)',['2409','00000000-0000-4000-8000-000000000099','a'.repeat(64)],'service_role',{code:'42501',message:/permission denied/u});
   await query('SELECT public.vnext_target_quote_v1($1,$2,$3,$4,$5)',['00000000-0000-4000-8000-000000000099','2409','TWSE','2026-10-22',new Date().toISOString()],'service_role',{code:'42501',message:/permission denied/u});
   const value=await query('SELECT public.vnext_target_current_v1($1,$2,$3) AS result',['2409','00000000-0000-4000-8000-000000000099','a'.repeat(64)],'stockinsider_vnext_owner');assert.equal(value.rows[0].result.deferred,'target_current_revision_input_or_rights_unavailable');assert.deepEqual(await x.snapshot(),pristine);
  });
  await step('actual service direct target-hit forgery and arbitrary quote selectors reject before any mutation; current observer only defers',async()=>{
   for(const proof of [undefined,true,{revisionId:'invalid',inputHash:'a'.repeat(64)},{revisionId:'00000000-0000-4000-8000-000000000099',inputHash:'a'.repeat(64),proofHash:'b'.repeat(64)}])await query('SELECT public.vnext_command_v1($1,$2,$3::jsonb)',[roles.operator.principal,'exit',JSON.stringify({symbol:'2408',reason:'target_hit',evidence:['1'],...(proof===undefined?{}:{targetProof:proof})})],'service_role',{code:'P0001',message:/vnext_target_current_authority_required/u});
   await query('SELECT public.vnext_target_command_v1($1,$2::jsonb)',[roles.operator.principal,JSON.stringify({price:100,target:1})],'service_role',{code:'P0001',message:/vnext_target_server_scope_only/u});
   await query('SELECT public.vnext_target_command_v1($1,$2::jsonb)',[roles.author.principal,'{}'],'service_role',{code:'P0001',message:/vnext_target_operator_mode_required/u});
   const receipt=(await query('SELECT public.vnext_target_command_v1($1,$2::jsonb) AS result',[roles.operator.principal,'{}'])).rows[0].result;assert.equal(receipt.policyVersion,'vnext-target-exit-v1');assert.ok(receipt.observations.every(o=>o.status==='deferred'));assert.deepEqual(await x.snapshot(),pristine);x.save('authority',{receipt,events,wholeBusinessRowsUnchanged:true,positiveTargetHitExecuted:false});
  });
  await step('first-only repeat actual error ReadyE then explicit rollback ReadyI keeps rows and complete functions unchanged',async()=>{
   const before=await routines(),ready=new Promise(resolve=>x.writer.connection.once('readyForQuery',m=>resolve(m.status)));const[q,r]=await Promise.allSettled([x.writer.query(fs.readFileSync(migration,'utf8')),ready]);assert.equal(q.status,'rejected');assert.equal(q.reason.code,'P0001');assert.match(q.reason.message,/first_install_required/u);assert.equal(r.status,'fulfilled');assert.equal(r.value,'E');const rollback=new Promise(resolve=>x.writer.connection.once('readyForQuery',m=>resolve(m.status)));await x.writer.query('ROLLBACK');assert.equal(await rollback,'I');assert.deepEqual(await routines(),before);assert.deepEqual(await x.snapshot(),pristine);x.save('repeat',{code:q.reason.code,ready:'E',rollbackReady:'I',wholeRowsAndFunctionsUnchanged:true});
  });
 }finally{x.save('target-query-events',{events,scope:'retained installer/permission/direct-forgery only; fresh actual positive and HTTP NOT_RUN'});await x.finish();}
});
