// SOURCE-ONLY delivery: this new entry must be separately reviewed before native execution.
// Three fresh isolated fixtures, no imported test entry or author/business lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {withLegalVersionedFixture} from './research-versioned-legal-fixture-helper.mjs';
import {readPrerequisiteState,stateDescriptor,canonical,digest,prerequisiteDescriptor} from './research-versioned-prerequisite-profile.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const SQL_PATH='migrations/20261015_research_author_durable_union_candidate_v3.sql';
const SQL_SHA='18b0e4814410601ab8b254f274a7fe085230b922656038cc1f8fe2539c056f76';
const PROFILE_PATH='docs/operations/2026-10-15/v3-author-durable-union/source-derived-profile.json';
const PROFILE_SHA='19526e0199a406857de4c9869afd3cb243f74603ee960f06bc5e812c5d291243';
const sqlBytes=fs.readFileSync(SQL_PATH),profileBytes=fs.readFileSync(PROFILE_PATH);
assert.equal(hash(sqlBytes),SQL_SHA);assert.equal(hash(profileBytes),PROFILE_SHA);
const sql=sqlBytes.toString('utf8'),profile=JSON.parse(profileBytes);
// Only these two exact transaction-boundary byte strings may be removed.
function transactionMiddle(bytes){
 assert.equal(hash(bytes),SQL_SHA);const first=Buffer.from('BEGIN;\n'),last=Buffer.from('COMMIT;\n');
 assert.deepEqual(bytes.subarray(0,first.length),first);assert.deepEqual(bytes.subarray(-last.length),last);
 const middle=bytes.subarray(first.length,bytes.length-last.length);
 assert.deepEqual(Buffer.concat([first,middle,last]),bytes);return middle;
}
const middle=transactionMiddle(sqlBytes);
const LOCK="SELECT pg_try_advisory_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) AS locked";
const UNLOCK="SELECT pg_advisory_unlock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0)) AS unlocked";
const DRIFT_SIGNATURE='read_research_author_result_v2(jsonb,uuid,text,text)';
const DRIFT_VALUE='application_name=synthetic-author-installer-drift';
const DRIFT_SQL="ALTER FUNCTION public.read_research_author_result_v2(jsonb,uuid,text,text) SET application_name='synthetic-author-installer-drift'";
const metadataQuery=`SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('identity',to_jsonb(p)-'prosrc','bodySha256',encode(sha256(convert_to(prosrc,'UTF8')),'hex'),'signature',p.oid::regprocedure::text) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','extensions')),'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_default_acl d)) value`;
const tables=['research_input_preparations_v2','research_article_input_revisions_v2','research_source_seals_v2','research_deep_jobs_v1','research_deep_job_attempts_v1','research_deep_admission_charges_v1','research_model_reservations_v1','research_model_completions_v1','source_raw_documents','research_author_assignments_v2','research_author_results_v2','research_source_fence_events_v2','research_source_seal_invalidations_v2'];
async function readSnapshot(client){
 const state=await readPrerequisiteState(client),metadata=(await client.query(metadataQuery)).rows[0].value;
 const definitions=(await client.query("SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.oid::regprocedure::text")).rows;
 for(const fn of state.catalog.functions)assert.equal(fn.definitionSha256,hash(definitions.find(d=>d.signature===fn.signature).definition));
 const rows={};for(const table of tables)rows[table]=(await client.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') rows FROM public.${table} t`)).rows[0].rows;
 return {state,metadata,definitions,rows};
}
// Independent observer snapshots own one RR/RO transaction. Writer snapshots stay in its existing transaction.
async function observe(client){
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{assert.equal((await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');return await readSnapshot(client);}
 finally{await client.query('ROLLBACK');}
}
function assertPristine(snapshot){
 assert.deepEqual(stateDescriptor(snapshot.state),prerequisiteDescriptor().successor);
 assert.equal(digest(snapshot.state.namespace),profile.predecessorNamespaceHash);
 assert.equal(digest(snapshot.state.catalog),profile.predecessorCatalogHash);
 for(const f of profile.functions){const matches=snapshot.metadata.functions.filter(v=>v.signature.startsWith(f.name+'('));assert.equal(matches.length,1);assert.equal(matches[0].bodySha256,f.sha);}
}
// Finite known delta reconstruction, never a generic filter/normalization of unknown metadata.
function assertDelta(before,after,kind){
 assert.ok(kind==='drift'||kind==='successor');const expected=structuredClone(before);
 const changed=kind==='drift'?[profile.functions.find(f=>f.name==='read_research_author_result_v2')]:profile.functions.filter(f=>f.changed);
 assert.equal(changed.length,kind==='drift'?1:4);
 for(const f of changed){
  const m=expected.metadata.functions.find(v=>v.signature.startsWith(f.name+'('));assert.ok(m);
  const sig=m.signature,n=expected.state.namespace.routines.find(v=>v.signature===sig&&v.schema==='public'),c=expected.state.catalog.functions.find(v=>v.signature===sig);
  assert.ok(n&&c);const actualN=after.state.namespace.routines.find(v=>v.signature===sig&&v.schema==='public');
  if(kind==='drift'){
   assert.equal(sig,DRIFT_SIGNATURE);assert.ok(Array.isArray(m.identity.proconfig));assert.ok(!m.identity.proconfig.some(v=>v.startsWith('application_name=')));
   const config=[...m.identity.proconfig,DRIFT_VALUE];m.identity.proconfig=config;n.config=config;c.config=config;
  }else{
   assert.equal(hash(actualN.body),f.successorBodySha256);m.bodySha256=f.successorBodySha256;n.body=actualN.body;
  }
  const oldDef=expected.definitions.find(v=>v.signature===sig),newDef=after.definitions.find(v=>v.signature===sig);assert.ok(oldDef&&newDef);
  // pg_get_functiondef's hash is derived from the same exact pg_proc identity+prosrc independently compared below.
  assert.notEqual(oldDef.definition,newDef.definition);oldDef.definition=newDef.definition;c.definitionSha256=hash(newDef.definition);
 }
 assert.deepEqual(after,expected);
}
function summary(snapshot){return {stateHash:digest(snapshot.state),metadataHash:digest(snapshot.metadata),definitionsHash:digest(snapshot.definitions),tables:Object.fromEntries(Object.entries(snapshot.rows).map(([k,v])=>[k,{count:v.length,sha256:digest(v)}]))};}
async function expectedError(client,statement,code,message,save){
 // node-pg rejects on ErrorResponse before ReadyForQuery. Wait for BOTH real events;
 // an error promise alone cannot establish failed-transaction state or settlement.
 let onReady,onEnd,onError;
 const ready=new Promise((resolve,reject)=>{
  onReady=msg=>resolve(msg.status);onEnd=()=>reject(Error('writer_ended_before_ready'));onError=error=>reject(error);
  client.connection.once('readyForQuery',onReady);client.connection.once('end',onEnd);client.connection.once('error',onError);
 });
 let results;try{results=await Promise.allSettled([client.query(statement),ready]);}
 finally{client.connection.removeListener('readyForQuery',onReady);client.connection.removeListener('end',onEnd);client.connection.removeListener('error',onError);}
 const [queryResult,readyResult]=results;
 if(queryResult.status==='rejected'){const error=queryResult.reason;save('expected-error-private.json',{code:error.code,message:error.message,where:error.where,position:error.position});}
 assert.equal(readyResult.status,'fulfilled','actual ReadyForQuery required');assert.equal(readyResult.value,'E');
 assert.equal(queryResult.status,'rejected','required PostgreSQL rejection absent');const caught=queryResult.reason;
 assert.equal(caught.code,code);assert.equal(caught.message,message);return {code:caught.code,message:caught.message};
}
async function installerCase(kind,{client:writer,connect,close,save,setStage}){
 const observer=await connect();let holder,locked=false,primary,ids;
 const fd=globalThis[Symbol.for('stockinsider.local.prerequisite.fs-witness')];assert.ok(fd);const fdBefore={...fd};
 const statuses=[];const onReady=message=>statuses.push(message.status);writer.connection.on('readyForQuery',onReady);
 const status=expected=>{assert.equal(statuses.at(-1),expected);save('transaction-status.json',{statuses});};
 try{
  await observer.query('SET default_transaction_read_only=on');
  ids={writer:(await writer.query('SELECT pg_backend_pid() pid')).rows[0].pid,observer:(await observer.query('SELECT pg_backend_pid() pid')).rows[0].pid};
  assert.notEqual(ids.writer,ids.observer);status('I');save('connections.json',ids);
  save('input-identity.json',{product:'c08b1591f27522748c2f2a8b1ebadc128f857d77',sqlSha256:hash(sqlBytes),profileSha256:hash(profileBytes),middleSha256:hash(middle),middleBytes:middle.length,derivedEnvelope:kind==='forced-rollback',fullOriginalCommit:false});
  setStage(kind+': pristine observer');const before=await observe(observer);save('00-pristine-private.json',before);assertPristine(before);
  const codec={};for(const key of ['namespace','catalog']){const js=canonical(before.state[key]),db=(await observer.query('SELECT research_observed_canonical_json_v1($1::jsonb) text',[JSON.stringify(before.state[key])])).rows[0].text;codec[key]={jsSha256:hash(js),dbSha256:hash(db),equal:js===db};save('codec-'+key+'-private.json',{js,db});assert.equal(db,js);}save('codecs.json',codec);
  let baseline=before,error;
  if(kind==='busy'){
   holder=await connect();ids.holder=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;assert.equal(new Set(Object.values(ids)).size,3);
   locked=(await holder.query(LOCK)).rows[0].locked;assert.equal(locked,true);
   const held=(await observer.query("SELECT pid,mode,granted,classid::text,objid::text,objsubid FROM pg_locks WHERE locktype='advisory' AND pid=$1 ORDER BY classid,objid,objsubid",[ids.holder])).rows;assert.equal(held.length,1);assert.equal(held[0].granted,true);assert.equal(held[0].mode,'ExclusiveLock');
   save('busy-held.json',{ids,held,sessionLockQuery:LOCK});setStage('busy: full original SQL');
   error=await expectedError(writer,sql,'P0001','author_union_busy',save);status('E');
  }else if(kind==='drift'){
   setStage('drift: one disposable proconfig mutation');await writer.query(DRIFT_SQL);status('I');baseline=await observe(observer);save('01-drift-private.json',baseline);assertDelta(before,baseline,'drift');
   setStage('drift: full original SQL');error=await expectedError(writer,sql,'P0001','author_union_predecessor_namespace',save);status('E');
  }else{
   assert.equal(kind,'forced-rollback');setStage('forced rollback: exact private transaction envelope');
   await writer.query('BEGIN');status('T');assert.equal((await writer.query('SHOW transaction_isolation')).rows[0].transaction_isolation,'read committed');
   await writer.query(middle.toString('utf8'));status('T');const inside=await readSnapshot(writer);save('01-writer-successor-private.json',inside);assertDelta(before,inside,'successor');save('writer-successor-witness.json',{summary:summary(inside),bodyChanges:profile.functions.filter(f=>f.changed).map(f=>({name:f.name,sha256:f.successorBodySha256})),status:statuses.at(-1),committed:false});
   const outside=await observe(observer);save('02-observer-before-rollback-private.json',outside);assert.deepEqual(outside,before);
   const activity=(await observer.query('SELECT pid,state,xact_start IS NOT NULL AS transaction_open FROM pg_stat_activity WHERE pid=$1',[ids.writer])).rows;assert.equal(activity.length,1);assert.equal(activity[0].state,'idle in transaction');assert.equal(activity[0].transaction_open,true);save('writer-intrans.json',{activity,status:statuses.at(-1)});
   setStage('forced rollback: fixed division by zero');error=await expectedError(writer,'SELECT 1/0','22012','division by zero',save);status('E');
  }
  await writer.query('ROLLBACK');status('I');const after=await observe(observer),writerAfter=await readSnapshot(writer);save('03-observer-after-rollback-private.json',after);save('04-writer-after-rollback-private.json',writerAfter);assert.deepEqual(after,baseline);assert.deepEqual(writerAfter,baseline);
  if(locked){assert.equal((await holder.query(UNLOCK)).rows[0].unlocked,true);locked=false;assert.equal((await observer.query("SELECT count(*)::int count FROM pg_locks WHERE locktype='advisory' AND pid=$1",[ids.holder])).rows[0].count,0);await close(holder);holder=null;assert.equal((await observer.query('SELECT count(*)::int count FROM pg_stat_activity WHERE pid=$1',[ids.holder])).rows[0].count,0);save('holder-release.json',{unlocked:true,querySettled:true,clientEnded:true,backendAbsent:true});}
  assert.deepEqual({...fd},fdBefore);save('negative-witness.json',{kind,ids,error,fdBefore,fdAfter:{...fd},pristine:summary(before),baseline:summary(baseline),after:summary(after),writerAfter:summary(writerAfter),statuses,rollbackConfirmed:true,originalScriptCommit:false,formalApproval:false});
 }catch(error){primary=error;save('unexpected-error-private.json',{code:error.code,message:error.message,where:error.where});throw error;}
 finally{
  const cleanupErrors=[];
  try{await writer.query('ROLLBACK');status('I');}catch(e){cleanupErrors.push({step:'writer rollback',message:e.message});}
  if(holder){try{if(locked){assert.equal((await holder.query(UNLOCK)).rows[0].unlocked,true);locked=false;}}catch(e){cleanupErrors.push({step:'holder unlock',message:e.message});}try{await close(holder);}catch(e){cleanupErrors.push({step:'holder close',message:e.message});}}
  if(primary){try{save('unexpected-after-rollback-private.json',{observer:await observe(observer),writer:await readSnapshot(writer)});}catch(e){cleanupErrors.push({step:'failure snapshot',message:e.message});}}
  try{await close(observer);if(ids){const remaining=(await writer.query('SELECT pid,state FROM pg_stat_activity WHERE pid=ANY($1::int[])',[[ids.observer,...(ids.holder?[ids.holder]:[])]] )).rows;save('installer-backends-after-close.json',{pids:[ids.observer,...(ids.holder?[ids.holder]:[])],remaining});assert.deepEqual(remaining,[]);}}catch(e){cleanupErrors.push({step:'observer close/backend absence',message:e.message});}
  writer.connection.removeListener('readyForQuery',onReady);save('installer-cleanup.json',{cleanupErrors,lockStillUnconfirmed:locked,statuses});
  if(cleanupErrors.length){if(primary)primary.cleanupErrors=cleanupErrors;else throw Error('installer_negative_cleanup_unconfirmed');}
 }
}
await test('author union installer: three isolated negative contracts',async t=>{
 for(const kind of ['busy','drift','forced-rollback']){let failure;await t.test(kind,async()=>{
  const label='author-installer-'+kind;
  try{await withLegalVersionedFixture('2409',{label,wireVersion:'research-article-input-v3',afterPrerequisite:context=>installerCase(kind,context)},async x=>{
   // Existing fixture finishes its original neutral setup after the installer-only callback. No business invocation.
   const audit=await x.auditState(),ledger=await x.ledger(x.audit);assert.equal(ledger.preparations.length,1);assert.equal(ledger.revisions.length,0);
   assert.equal(x.witness.opens,x.opensInitial);assert.equal(x.witness.closes,x.closesInitial);assert.equal(x.rpcTrace.length,0);
   x.save('neutral-setup-private.json',{audit,ledger,fd:{...x.witness},rpcTrace:x.rpcTrace});
   x.save('neutral-setup-witness.json',{audit,ledgerSha256:hash(canonical(ledger)),preparations:1,revisions:0,logicalBytes:ledger.preparations[0].logical_bytes,newFinancialOpens:0,newFinancialCloses:0,businessFirstSeal:false,sourceProfile:'protocol_only'});
  });}catch(error){failure=error;throw error;}
  finally{const out=process.env.RESEARCH_PREREQUISITE_PROFILE_ARTIFACTS,p=path.join(out,'2409-'+label+'-cleanup.json');if(fs.existsSync(p)){const cleanup=JSON.parse(fs.readFileSync(p));assert.equal(fs.existsSync(cleanup.removed),false);fs.writeFileSync(path.join(out,'2409-'+label+'-cluster-absent.json'),JSON.stringify({clusterRemoved:true,stopped:cleanup.stopped,stage:cleanup.stage})+'\n');}}
 });if(failure)throw failure;}
});
