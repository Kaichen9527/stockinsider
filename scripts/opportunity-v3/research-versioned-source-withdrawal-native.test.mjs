// SOURCE ONLY: three new children + parent NOT_RUN, pending separate native authorization.
// Mandatory early research-versioned-prerequisite-fs-witness.mjs preload.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {withLegalVersionedFixture} from './research-versioned-legal-fixture-helper.mjs';
import {extractHistorical77Realm,produceHistorical77} from './research-legacy77-realm-fixture.mjs';
import {completeHash} from '../../web/src/lib/research-v3-material-canonical.ts';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'); // audit only, not product tagged canonical
const withdrawn='withdrawn';
async function sourceSnapshot(x,label){
 const audit=await x.auditState(),ledger=await x.ledger(x.audit);
 const charge=(await x.audit.query(`SELECT count(*)::int count,coalesce(sum(logical_bytes),0)::int bytes FROM (
 SELECT logical_bytes FROM research_input_preparations_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3
 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3) all_versions`,[x.req.jobId,x.req.attempt,x.req.reservationId])).rows[0];
 const sourceRows=(await x.audit.query("SELECT id,to_jsonb(s) AS row,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') hash,public.research_source_root_v2(to_jsonb(s)) root FROM public.source_raw_documents s ORDER BY id")).rows;
 const events=(await x.audit.query('SELECT to_jsonb(e) AS row FROM public.research_source_fence_events_v2 e ORDER BY event_id')).rows.map(r=>r.row);
 const invalidations=(await x.audit.query('SELECT to_jsonb(i) AS row FROM public.research_source_seal_invalidations_v2 i ORDER BY seal_id,event_id')).rows.map(r=>r.row);
 const seals=(await x.audit.query('SELECT to_jsonb(s) AS row FROM public.research_source_seals_v2 s ORDER BY seal_id')).rows.map(r=>r.row);
 const leases=(await x.audit.query("SELECT to_jsonb(l) AS row FROM public.production_write_leases l WHERE lease_key='production-data-plane' ORDER BY lease_key")).rows.map(r=>r.row);
 const result={audit,ledger,ledgerHash:sha(ledger),charge,sourceRows,events,eventsHash:sha(events),invalidations,invalidationsHash:sha(invalidations),seals,leases,fd:{...x.witness}};
 assert.equal(Object.keys(audit).length,9);assert.ok(sourceRows.some(r=>r.id===x.sourceIds[0]));x.save(label+'.json',result);return result;
}
function stableExceptIntentionalSource(before,after){
 for(const table of Object.keys(before.audit))if(table!=='source_raw_documents')assert.deepEqual(after.audit[table],before.audit[table],table);
 assert.deepEqual(after.ledger,before.ledger);assert.equal(after.ledgerHash,before.ledgerHash);assert.deepEqual(after.charge,before.charge);assert.deepEqual(after.seals,before.seals);assert.deepEqual(after.leases,before.leases);
}
function noMutation(before,after){
 stableExceptIntentionalSource(before,after);assert.deepEqual(after.audit,before.audit);assert.deepEqual(after.sourceRows,before.sourceRows);assert.deepEqual(after.events,before.events);assert.deepEqual(after.invalidations,before.invalidations);
}
function exactSourceDelta(x,before,after,newRights){
 stableExceptIntentionalSource(before,after);const id=x.sourceIds[0],a=before.sourceRows.find(r=>r.id===id),b=after.sourceRows.find(r=>r.id===id);
 assert.deepEqual(b.row,{...a.row,metadata:{...a.row.metadata,rights_boundary:newRights}},'only selected metadata rights may change');assert.notEqual(b.hash,a.hash);assert.equal(b.root,a.root);
 assert.deepEqual(after.sourceRows.filter(r=>r.id!==id),before.sourceRows.filter(r=>r.id!==id));assert.equal(after.audit.source_raw_documents.count,before.audit.source_raw_documents.count);
 const oldIds=new Set(before.events.map(e=>String(e.event_id))),added=after.events.filter(e=>!oldIds.has(String(e.event_id)));
 assert.deepEqual(after.events.filter(e=>oldIds.has(String(e.event_id))),before.events);assert.equal(added.length,1);const event=added[0];assert.equal(event.document_id,id);assert.equal(event.operation,'UPDATE');assert.equal(event.before_hash,a.hash);assert.equal(event.after_hash,b.hash);
 const dependent=before.seals.filter(s=>s.documents.some(d=>d.root===a.root)).map(s=>s.seal_id).sort();assert.ok(dependent.length>0);assert.ok(dependent.includes(x.prep.source_seal_id));
 const pair=v=>v.seal_id+':'+v.event_id,prior=new Set(before.invalidations.map(pair));
 assert.deepEqual(after.invalidations.filter(i=>prior.has(pair(i))),before.invalidations);
 const newInvalidations=after.invalidations.filter(i=>!prior.has(pair(i)));
 assert.deepEqual(newInvalidations.map(i=>i.seal_id).sort(),dependent);assert.ok(newInvalidations.every(i=>String(i.event_id)===String(event.event_id)));
 return {documentId:id,event,invalidatedSealIds:dependent,beforeRowHash:a.hash,afterRowHash:b.hash};
}
async function mutatorContext(x,journal){
 const client=await x.createSourceMutator();const identity=(await client.query('SELECT pg_backend_pid() pid,current_user role')).rows[0],writer=(await x.c.query('SELECT pg_backend_pid() pid')).rows[0].pid,observer=(await x.audit.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 assert.equal(identity.role,'service_role');assert.notEqual(identity.pid,writer);assert.notEqual(identity.pid,observer);assert.notEqual(writer,observer);
 assert.equal((await x.audit.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');x.save('race-connections.json',{mutator:identity,writer,observer,observerReadOnly:true});
 return {client,record:(stage,extra={})=>{const event={ordinal:journal.length,stage,fd:{...x.witness},...extra};journal.push(event);x.save('race-journal.json',journal);return event;}};
}
async function changeRights(x,m,before,rights,label){
 // All writes stay on the dedicated SET ROLE service_role connection under an owned write lease.
 const owner=randomUUID();let acquired=false,began=false,committed=false,primary,proof;
 try{
  assert.equal((await m.client.query("SELECT acquire_production_write_lease('production-data-plane',$1,3600) ok",[owner])).rows[0].ok,true);acquired=true;
  await m.client.query('BEGIN ISOLATION LEVEL READ COMMITTED');began=true;
  const transaction=(await m.client.query('SELECT pg_backend_pid() pid,txid_current()::text xid,current_user role')).rows[0];assert.equal(transaction.role,'service_role');
  const result=await m.client.query("UPDATE public.source_raw_documents s SET metadata=jsonb_set(s.metadata,'{rights_boundary}',to_jsonb($2::text),false) WHERE s.id=$1 RETURNING to_jsonb(s) AS row,encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') hash",[x.sourceIds[0],rights]);
  assert.equal(result.rowCount,1);assert.equal(result.rows[0].row.metadata.rights_boundary,rights);
  await m.client.query('COMMIT');began=false;committed=true;proof=m.record(label+'-commit',{transaction,returningRowHash:result.rows[0].hash});
 }catch(error){primary=error;if(began)try{await m.client.query('ROLLBACK');}catch(rollbackError){x.save(label+'-rollback-error.json',{message:rollbackError.message});}}
 finally{if(acquired)try{assert.equal((await m.client.query("SELECT release_production_write_lease('production-data-plane',$1) ok",[owner])).rows[0].ok,true);}catch(error){x.save(label+'-lease-release-error.json',{code:error.code,message:error.message});primary??=error;}}
 if(primary){x.save(label+'-mutation-error.json',{code:primary.code,message:primary.message,committed});throw primary;}
 const after=await sourceSnapshot(x,label+'-observer-after-commit');assert.equal(after.sourceRows.find(r=>r.id===x.sourceIds[0]).hash,proof.returningRowHash,'independent observer sees committed row');
 const delta=exactSourceDelta(x,before,after,rights);x.save(label+'-intended-delta.json',delta);return{after,proof,delta};
}
async function exactRejected(x,work,label){
 let observed;await assert.rejects(work,error=>{observed={code:error.code,message:error.message};x.save(label+'-error.json',observed);return error.code==='P0001'&&error.message==='source_seal_invalidated_or_missing';});return observed;
}
async function freshWithdrawal(x,boundary){
 const journal=[],m=await mutatorContext(x,journal),initial=await sourceSnapshot(x,'01-initial'),n=boundary==='before-post'?9:6,fdStart={...x.witness};
 assert.equal(initial.charge.count,1);assert.equal(initial.ledger.revisions.length,0);assert.equal(x.prep.dispatchReady,false);assert.equal(x.prep.payload.modelDispatched,false);
 let assertions=0,preSuccess=false,postSuccess=false,barrier,mutation,attempt;
 const instrumented={rpc:async(name,args)=>{
  if(name==='assert_research_input_candidate_v3')assertions++;
  const atPost=boundary==='before-post'&&name==='assert_research_input_candidate_v3'&&assertions===2;
  const atSeal=boundary==='before-seal'&&name==='seal_research_article_input_candidate_v3';
  if(atPost||atSeal){
   assert.ok(preSuccess);if(atSeal)assert.ok(postSuccess);assert.equal(mutation,undefined);
   assert.deepEqual({...x.witness},{opens:fdStart.opens+n,closes:fdStart.closes+(atSeal?n:0)});
   barrier=await sourceSnapshot(x,'02-barrier-before-withdrawal');m.record('barrier-before-withdrawal',{name,preSuccess,postSuccess});
   mutation=await changeRights(x,m,barrier,withdrawn,'03-withdrawal');
  }
  const call=m.record('actual-rpc-call',{name});if(atPost||atSeal){attempt=call;assert.ok(mutation.proof.ordinal<call.ordinal);}
  const response=await x.rpc.rpc(name,args);m.record('actual-rpc-success',{name});
  if(name==='assert_research_input_candidate_v3'){
   assert.equal(response.error,null);
   if(assertions===1){preSuccess=true;assert.deepEqual({...x.witness},fdStart);x.save('preassert-success.json',{trace:x.rpcTrace,fd:{...x.witness},contextHash:response.data.contextHash});await sourceSnapshot(x,'preassert-success-state');}
   else{postSuccess=true;assert.deepEqual({...x.witness},{opens:fdStart.opens+n,closes:fdStart.closes});x.save('postassert-success.json',{trace:x.rpcTrace,fd:{...x.witness},contextHash:response.data.contextHash});await sourceSnapshot(x,'postassert-success-state');}
  }
  return response;
 }};
 x.setStage(boundary+' source withdrawal during genuine firstseal attempt');
 let after;try{await exactRejected(x,x.controller.runCompleteInput(instrumented,x.req,true),'04-blocked-rpc');}finally{after=await sourceSnapshot(x,'05-after-blocked-rpc');}
 assert.ok(mutation&&attempt&&preSuccess);assert.equal(assertions,2);assert.equal(postSuccess,boundary==='before-seal');noMutation(mutation.after,after);
 assert.equal(after.ledger.revisions.length,0);assert.equal(after.charge.count,1);assert.deepEqual({...x.witness},{opens:fdStart.opens+n,closes:fdStart.closes+n});
 const blocked=boundary==='before-post'?'assert_research_input_candidate_v3':'seal_research_article_input_candidate_v3';assert.equal(x.rpcTrace.at(-1).name,blocked);if(boundary==='before-post')assert.ok(!x.rpcTrace.some(r=>r.name==='seal_research_article_input_candidate_v3'));
 x.save('race-result.json',{boundary,expectedError:'source_seal_invalidated_or_missing',preSuccess,postSuccess,commitOrdinal:mutation.proof.ordinal,blockedCallOrdinal:attempt.ordinal,fd:{...x.witness},newSealedRows:0,allOtherEightTablesAndLedgerStable:true,failedRpcZeroMutation:true,formalApproval:false,liveSourceQualification:false});
}
async function old77Aba(x){
 const journal=[],m=await mutatorContext(x,journal),realm=extractHistorical77Realm(x.secure),mapping=realm.mapping.companies[x.symbol];
 const request={...x.req,expectedArtifactManifestHash:mapping.inventoryHash,expectedCalculatorExecutionHash:realm.mapping.sourceClosureHash};
 await sourceSnapshot(x,'01-before-original-firstseal');x.setStage('ABA prefix genuine original77 child and original sealer');const child=await produceHistorical77(x,realm,request);
 assert.equal(child.saved.replay,false);assert.deepEqual(child.saved.canonical_request,request);assert.equal(child.saved.request_hash,completeHash(request));assert.equal(child.saved.input_hash,completeHash(child.saved.canonical_payload));assert.equal(child.saved.canonical_payload.hashes.sourceClosureHash,realm.mapping.sourceClosureHash);assert.equal(child.saved.canonical_payload.clocks.originalModelCutoff,mapping.modelCutoff);assert.ok(Object.values(child.saved.canonical_payload.capabilities).every(v=>v===false));assert.deepEqual(child.fd,{opens:8,closes:8});
 const original=await sourceSnapshot(x,'02-original-sealed-A');assert.equal(original.charge.count,2);assert.equal(original.ledger.revisions.length,1);const selected=original.sourceRows.find(r=>r.id===x.sourceIds[0]);assert.equal(selected.row.metadata.rights_boundary,'public_citation');
 x.setStage('ABA withdrawal B independent commit');const b=await changeRights(x,m,original,withdrawn,'03-withdraw-B');
 x.setStage('ABA restoration A independent commit');const restored=await changeRights(x,m,b.after,selected.row.metadata.rights_boundary,'04-restore-A');assert.notEqual(b.proof.transaction.xid,restored.proof.transaction.xid);assert.ok(b.proof.ordinal<restored.proof.ordinal);
 const finalRow=restored.after.sourceRows.find(r=>r.id===x.sourceIds[0]);
 if(finalRow.hash!==selected.hash||JSON.stringify(finalRow.row)!==JSON.stringify(selected.row)){x.save('aba-row-restoration-pending.json',{reason:'other source row drift prevents claiming ABA',originalHash:selected.hash,restoredHash:finalRow.hash});assert.fail('ABA requires exact full source row restoration; do not relax or repair other fields');}
 assert.deepEqual(restored.after.audit.source_raw_documents,original.audit.source_raw_documents);assert.equal(restored.after.events.length,original.events.length+2);assert.equal(restored.after.invalidations.length,original.invalidations.length+2);
 const fd={...x.witness};
 for(const seal of[false,true]){
  const label=seal?'06-seal-replay':'05-read-replay',before=await sourceSnapshot(x,label+'-before');m.record(label+'-actual-call');
  await exactRejected(x,x.controller.runCompleteInput(x.rpc,request,seal),label);const after=await sourceSnapshot(x,label+'-after');noMutation(before,after);assert.deepEqual({...x.witness},fd);assert.deepEqual(after.ledger.revisions,original.ledger.revisions);
 }
 x.save('aba-result.json',{originalSource:realm.index.source,originalSourceClosure:realm.mapping.sourceClosureHash,originalChildPid:child.pid,childExitAndCloseConfirmed:true,fullSourceRowRestored:true,sourceRowHashA:selected.hash,sourceRowHashRestored:finalRow.hash,durableInvalidationsAdded:2,twoIndependentCommits:[b.proof,restored.proof],currentReplayZeroIo:true,exactError:'source_seal_invalidated_or_missing',existingSealedRowChargeClockHashUnchanged:true,formalApproval:false,compiledNextIdentityVerified:false});
}
await test('source withdrawal and exact-row ABA matrix; three new cases only',async t=>{
 const cases=[['2409',{label:'v3-pre-post-withdraw',wireVersion:'research-article-input-v3'},x=>freshWithdrawal(x,'before-post')],['2383',{label:'compat-post-seal-withdraw',wireVersion:'research-article-input-v2'},x=>freshWithdrawal(x,'before-seal')],['2409',{label:'old77-exact-row-aba',wireVersion:'research-article-input-v2',preparationMode:'original-v2'},old77Aba]];
 for(const[symbol,options,run]of cases){let failed;await t.test(options.label,async()=>{try{await withLegalVersionedFixture(symbol,options,async x=>{try{await run(x);}catch(error){try{await sourceSnapshot(x,'failure-before-cleanup-state');}catch(snapshotError){x.save('failure-snapshot-error.json',{message:snapshotError.message,primaryCode:error.code,primaryMessage:error.message});}throw error;}});}catch(error){failed=error;throw error;}});if(failed)throw failed;}
});
