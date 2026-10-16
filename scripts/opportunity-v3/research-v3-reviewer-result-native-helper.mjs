// One new native entry. Frozen product/SQL/fixtures; no old test entry imported.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import{withLegalVersionedFixture}from'./research-versioned-legal-fixture-helper.mjs';
import{readPrerequisiteState,canonical,digest}from'./research-versioned-prerequisite-profile.mjs';
import{installer,metadataQuery,hash,identity,authorPrefix}from'./research-v3-completed-reviewer-native-helper.mjs';
import{createV3AuthorHandoffComposition}from'../../web/src/lib/research-v3-author-handoff.ts';
import{createV3ReviewerAssignmentComposition}from'../../web/src/lib/research-v3-reviewer-assignment.ts';
import{completeHash,completeCanonical}from'../../web/src/lib/research-v3-material-canonical.ts';
const fenceProfile=JSON.parse(fs.readFileSync('docs/operations/2026-10-16/v3-handoff-binding-fence/source-derived-profile.json'));
const fenceSql=fs.readFileSync(fenceProfile.sourceSQL.path,'utf8');assert.equal(Buffer.byteLength(fenceSql),39960);assert.equal(hash(fenceSql),'fff12bbd98489c334d07a42083e86f5cac0a04d6ff33eb1b72286eafec0dc31d');
const TABLES=['research_input_preparations_v2','research_article_input_revisions_v2','research_source_seals_v2','research_deep_jobs_v1','research_deep_job_attempts_v1','research_deep_admission_charges_v1','research_model_reservations_v1','research_model_completions_v1','source_raw_documents','research_author_assignments_v2','research_author_results_v2','research_source_fence_events_v2','research_source_seal_invalidations_v2','research_reviewer_assignments_v2','research_reviewer_results_v2','research_execution_invocations_v2'];
async function tableRows(c){const rows={};for(const table of TABLES)rows[table]=(await c.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') rows FROM public.${table} t`)).rows[0].rows;return rows;}
async function installFence(ctx,lab){
 await installer(ctx);const {client:c,connect,close,save,setStage}=ctx,observer=await connect();await observer.query('SET default_transaction_read_only=on');
 try{
  setStage('handoff fence: c08-installed predecessor full actual catalog');
  const before=await readPrerequisiteState(observer),meta=(await observer.query(metadataQuery)).rows[0].value,empty=await tableRows(observer),codecs={};
  const ids={writer:(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid,observer:(await observer.query('SELECT pg_backend_pid() pid')).rows[0].pid};assert.notEqual(ids.writer,ids.observer);
  save('fence-before-private.json',{state:before,metadata:meta,tables:empty,ids});
  for(const key of ['namespace','catalog']){const js=canonical(before[key]),db=(await observer.query('SELECT research_observed_canonical_json_v1($1::jsonb) text',[JSON.stringify(before[key])])).rows[0].text;assert.equal(db,js);codecs[key]={bytes:Buffer.byteLength(js),sha256:hash(js),jsEqualsDb:true};}
  assert.equal(codecs.namespace.sha256,fenceProfile.predecessorNamespaceHash);assert.equal(codecs.catalog.sha256,fenceProfile.predecessorCatalogHash);assert.ok(Object.values(empty).every(v=>v.length===0));
  const old=before.namespace.routines.find(v=>v.signature===fenceProfile.function.signature);assert.equal(Buffer.byteLength(old.body),6975);assert.equal(hash(old.body),fenceProfile.function.predecessorBodySha256);
  setStage('handoff fence: full original SQL first COMMIT');
  try{await c.query(fenceSql);}catch(e){save('fence-first-error-private.json',{code:e.code,message:e.message,where:e.where,position:e.position});await c.query('ROLLBACK');const after=await readPrerequisiteState(observer),afterMeta=(await observer.query(metadataQuery)).rows[0].value;save('fence-rejected-after-private.json',{state:after,metadata:afterMeta,tables:await tableRows(observer)});assert.deepEqual(after,before);assert.deepEqual(afterMeta,meta);save('fence-rejected-witness.json',{code:e.code,message:e.message,rollbackExact:true,actualCommit:false,codecs});throw e;}
  const after=await readPrerequisiteState(observer),afterMeta=(await observer.query(metadataQuery)).rows[0].value;save('fence-committed-after-private.json',{state:after,metadata:afterMeta,tables:await tableRows(observer)});
  assert.equal(digest(after.namespace),fenceProfile.successorNamespaceHash);assert.deepEqual(after.details,before.details);assert.deepEqual(after.scope,before.scope);assert.deepEqual(afterMeta.defaults,meta.defaults);assert.equal(afterMeta.functions.length,meta.functions.length);
  const changed=[];for(let i=0;i<meta.functions.length;i++){const a=meta.functions[i],b=afterMeta.functions[i];assert.deepEqual(b.identity,a.identity);assert.equal(b.signature,a.signature);if(a.bodySha256!==b.bodySha256)changed.push(b);}
  assert.equal(changed.length,1);assert.equal(changed[0].signature,fenceProfile.function.signature);assert.equal(changed[0].bodySha256,fenceProfile.function.successorBodySha256);
  const target=after.namespace.routines.find(v=>v.signature===fenceProfile.function.signature);assert.equal(Buffer.byteLength(target.body),9492);assert.equal(hash(target.body),fenceProfile.function.successorBodySha256);
  const expected=structuredClone(before);expected.namespace.routines.find(v=>v.signature===fenceProfile.function.signature).body=target.body;
  expected.catalog.functions.find(v=>v.signature===fenceProfile.function.signature).definitionSha256=after.catalog.functions.find(v=>v.signature===fenceProfile.function.signature).definitionSha256;
  assert.deepEqual(after,expected);assert.deepEqual(await tableRows(observer),empty);
  for(const key of ['namespace','catalog']){const js=canonical(after[key]),db=(await observer.query('SELECT research_observed_canonical_json_v1($1::jsonb) text',[JSON.stringify(after[key])])).rows[0].text;assert.equal(db,js);codecs['after'+key]={bytes:Buffer.byteLength(js),sha256:hash(js),jsEqualsDb:true};}
  save('fence-commit-witness.json',{actualCommit:true,connections:ids,codecs,sqlSha256:hash(fenceSql),onlyOneBodyChanged:true,changed:changed.map(v=>({signature:v.signature,oid:v.identity.oid,bodySha256:v.bodySha256})),otherFullMetadataUnchanged:true,emptyTables:Object.fromEntries(Object.entries(empty).map(([k,v])=>[k,{count:v.length,sha256:hash(canonical(v))}]))});
  setStage('handoff fence: exact installed repeat rejection');let error;try{await c.query(fenceSql);}catch(e){error=e;}finally{await c.query('ROLLBACK');}assert.equal(error?.code,'P0001');assert.equal(error.message,'handoff_binding_predecessor_namespace');assert.deepEqual(await readPrerequisiteState(observer),after);assert.deepEqual((await observer.query(metadataQuery)).rows[0].value,afterMeta);save('fence-repeat-witness.json',{code:error.code,message:error.message,rollbackExact:true});
  // Existing disposable installer connection; no new role/ACL. Only authorized
  // append-only read tombstone later, not a service-role bypass for business RPCs.
  lab.operator=await connect();lab.operatorPid=(await lab.operator.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 }finally{await close(observer);}
}
async function snapshot(x,label){
 await x.audit.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{assert.equal((await x.audit.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');const tables=await tableRows(x.audit),ledger=await x.ledger(x.audit),charge=(await x.audit.query('SELECT count(*)::int count,coalesce(sum(logical_bytes),0)::int bytes FROM (SELECT logical_bytes FROM research_input_preparations_v2 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2) q')).rows[0];
 const revocations=(await x.audit.query("SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') rows FROM research_input_binding_revocations_candidate_v3 t")).rows[0].rows;
 const v={tables,ledger,ledgerHash:hash(canonical(ledger)),charge,revocations,fd:{...x.witness}};assert.equal(Object.keys(tables).length,16);x.save(label+'-private.json',v);return v;
 }finally{await x.audit.query('ROLLBACK');}
}
const safeSnapshot=v=>({sha256:hash(canonical(v)),tables:Object.fromEntries(Object.entries(v.tables).map(([k,r])=>[k,{count:r.length,sha256:hash(canonical(r))}])),ledgerHash:v.ledgerHash,charge:v.charge,revocationCount:v.revocations.length,revocationsHash:hash(canonical(v.revocations)),fd:v.fd});
function unchangedExcept(a,b,allowed){assert.deepEqual(b.ledger,a.ledger);assert.deepEqual(b.charge,a.charge);assert.deepEqual(b.fd,a.fd);assert.deepEqual(b.revocations,a.revocations);for(const table of TABLES)if(!allowed.includes(table))assert.deepEqual(b.tables[table],a.tables[table],table);}
async function settledQuery(c,text,params){
 let listener;const ready=new Promise(resolve=>{listener=m=>resolve(m.status);c.connection.once('readyForQuery',listener);});let result,error;
 try{result=await c.query(text,params);}catch(e){error=e;}const status=await ready;assert.equal(status,'I');return {result,error,status};
}

export {installFence,snapshot,safeSnapshot,unchangedExcept,settledQuery,tableRows,TABLES};
