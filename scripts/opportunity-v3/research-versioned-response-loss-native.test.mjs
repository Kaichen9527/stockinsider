// SOURCE ONLY until separate heavy release: two new children + parent, no old entry imports.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash}from'node:crypto';
import {completeHash}from'../../web/src/lib/research-v3-material-canonical.ts';
import {withLegalVersionedFixture}from'./research-versioned-legal-fixture-helper.mjs';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'); // audit codec only
const signatures={read_research_article_input_candidate_v3:['p_request'],assert_research_input_candidate_v3:['p_request','p_context_hash'],seal_research_article_input_candidate_v3:['p_request','p_calculation','p_context_hash']};
async function snapshot(x,label){
 const audit=await x.auditState(),ledger=await x.ledger(x.audit),fences=(await x.audit.query("SELECT jsonb_build_object('events',(SELECT coalesce(jsonb_agg(to_jsonb(e)ORDER BY event_id),'[]')FROM research_source_fence_events_v2 e),'invalidations',(SELECT coalesce(jsonb_agg(to_jsonb(i)ORDER BY seal_id,event_id),'[]')FROM research_source_seal_invalidations_v2 i)) v")).rows[0].v;
 const charge=(await x.audit.query('SELECT count(*)::int count,coalesce(sum(logical_bytes),0)::int bytes FROM (SELECT logical_bytes FROM research_input_preparations_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3) mixed',[x.req.jobId,x.req.attempt,x.req.reservationId])).rows[0];
 const value={audit,ledger,ledgerSha256:sha(ledger),fences,fencesSha256:sha(fences),charge,fd:{...x.witness}};assert.equal(Object.keys(audit).length,9);x.save(label+'.json',value);return value;
}
function unchanged(a,b){assert.deepEqual(b.audit,a.audit);assert.deepEqual(b.ledger,a.ledger);assert.deepEqual(b.charge,a.charge);assert.deepEqual(b.fences,a.fences);assert.deepEqual(b.fd,a.fd);}
function storedResponse(response){const {status,replay,dispatchReady,...row}=response;assert.equal(status,'sealed');assert.equal(replay,true);assert.equal(dispatchReady,false);return row;}
async function lossCase(x){
 x.setStage('private Unix PG relay and dedicated service-role writer');const lab=await x.createResponseLossLab();
 const observer=(await x.audit.query('SELECT pg_backend_pid() pid')).rows[0].pid,fixtureWriter=(await x.c.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 assert.equal(new Set([lab.identity.pid,observer,fixtureWriter]).size,3);assert.equal((await x.audit.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
 x.save('loss-connections.json',{proxyWriter:lab.identity,observer,fixtureWriter,observerReadOnly:true});
 const initial=await snapshot(x,'01-prepared');assert.equal(initial.charge.count,1);assert.equal(initial.ledger.revisions.length,0);
 const n=x.symbol==='2409'?9:6,trace=[];let assertions=0,pre=false,post=false,armed=false,actualQueryError,controllerError,actualQuerySettled=false,committed,stored,sealPromise;
 const rpc={rpc:async(name,args)=>{
  assert.ok(Object.hasOwn(signatures,name));assert.equal(lab.pendingCount(),0);trace.push({name,stage:'call',fd:{...x.witness}});x.save('loss-rpc-order.json',trace);
  if(name==='seal_research_article_input_candidate_v3'){
   assert.ok(pre&&post);assert.equal(assertions,2);assert.deepEqual({...x.witness},{opens:initial.fd.opens+n,closes:initial.fd.closes+n});
   const before=await snapshot(x,'02-before-seal-send');assert.equal(before.charge.count,1);assert.equal(before.ledger.revisions.length,0);
   lab.arm(async()=>{
    // Called only after complete held successful backend response, never ReadyI alone.
    x.setStage('held response: independent observer confirms actual committed row');
    const rows=(await x.audit.query('SELECT to_jsonb(r) AS row FROM research_article_input_revisions_v2 r WHERE preparation_id=$1',[x.req.preparationId])).rows;assert.equal(rows.length,1);stored=rows[0].row;
    assert.deepEqual(stored.canonical_request,x.req);assert.equal(stored.request_hash,completeHash(x.req));assert.equal(stored.input_hash,completeHash(stored.canonical_payload));assert.equal(stored.canonical_payload.schemaVersion,x.selected.core.wireVersion);assert.ok(Object.values(stored.canonical_payload.capabilities).every(v=>v===false));
    committed=await snapshot(x,'03-committed-response-held');assert.equal(committed.charge.count,2);assert.equal(committed.ledger.revisions.length,1);assert.deepEqual(committed.ledger.revisions[0],stored);assert.deepEqual(committed.ledger.preparations,initial.ledger.preparations);assert.deepEqual(committed.fences,initial.fences);for(const table of Object.keys(initial.audit))if(table!=='research_article_input_revisions_v2')assert.deepEqual(committed.audit[table],initial.audit[table]);assert.equal(committed.charge.bytes,initial.charge.bytes+stored.logical_bytes);x.save('observer-commit-confirmed.json',{writerPid:lab.identity.pid,observerPid:observer,requestHash:stored.request_hash,inputHash:stored.input_hash,rowHash:sha(stored),charge:committed.charge});
   });armed=true;
  }
  const work=lab.query(`SELECT public.${name}(${signatures[name].map((_,i)=>'$'+(i+1)).join(',')}) v`,signatures[name].map(k=>args[k]));if(name==='seal_research_article_input_candidate_v3')sealPromise=work;
  let response;try{response=await work;}catch(error){if(name==='seal_research_article_input_candidate_v3'){actualQueryError=error;actualQuerySettled=true;x.save('actual-pg-query-rejection.json',{code:error.code,message:error.message});}throw error;}
  if(name==='seal_research_article_input_candidate_v3'){actualQuerySettled=true;assert.fail('held seal response must never reach the caller');}
  trace.push({name,stage:'settled-success',fd:{...x.witness}});x.save('loss-rpc-order.json',trace);
  if(name==='assert_research_input_candidate_v3'){assertions++;if(assertions===1){pre=true;assert.deepEqual({...x.witness},initial.fd);}else{post=true;assert.deepEqual({...x.witness},{opens:initial.fd.opens+n,closes:initial.fd.closes});}}
  return{data:response.rows[0].v,error:null};
 }};
 x.setStage('actual controller first-seal response transport loss');try{await x.controller.runCompleteInput(rpc,x.req,true);}catch(error){controllerError=error;x.save('caller-uncertain.json',{code:error.code,message:error.message,outcome:'uncertain until exact read reconciliation'});}
 assert.ok(armed&&sealPromise,'must reach real seal query');const loss=await lab.loss;await Promise.allSettled([sealPromise]);assert.ok(actualQueryError&&actualQuerySettled);assert.equal(controllerError,actualQueryError,'controller error must be the actual rejected PG promise, not a timeout facade');assert.equal(lab.pendingCount(),0);assert.equal(loss.forwardedAfterArm,0);assert.ok(loss.observerCommitConfirmed&&loss.actualTransportDrop&&loss.clientSocketClosed&&loss.upstreamSocketClosed);x.save('actual-transport-loss.json',loss);
 assert.ok(committed&&stored);unchanged(committed,await snapshot(x,'04-after-actual-client-rejection'));
 for(const root of Object.values(x.roots)){fs.rmSync(root,{recursive:true});assert.equal(fs.existsSync(root),false);} // only owned fixture files
 x.setStage('new service-role connection: missing-root exact read and seal replay');const replay=await x.createSourceMutator(),replayIdentity=(await replay.query('SELECT pg_backend_pid() pid,current_user role')).rows[0];assert.equal(replayIdentity.role,'service_role');assert.notEqual(replayIdentity.pid,lab.identity.pid);assert.notEqual(replayIdentity.pid,observer);x.save('reconcile-connection.json',replayIdentity);
 const replayTrace=[],replayRpc={rpc:async(name,args)=>{assert.equal(name,'read_research_article_input_candidate_v3','reconciliation must not re-prepare/reclaim/renew or call sealer');replayTrace.push({name,fd:{...x.witness}});return{data:(await replay.query('SELECT read_research_article_input_candidate_v3($1) v',[args.p_request])).rows[0].v,error:null};}};
 for(const seal of[false,true]){const label=seal?'06-seal-replay':'05-read-reconcile',before=await snapshot(x,label+'-before'),result=await x.controller.runCompleteInput(replayRpc,x.req,seal);assert.deepEqual(storedResponse(result),stored);assert.deepEqual(result.canonical_payload.clocks,stored.canonical_payload.clocks);const after=await snapshot(x,label+'-after');unchanged(before,after);unchanged(committed,after);}
 assert.equal(replayTrace.length,2);x.save('reconcile-rpc-order.json',replayTrace);x.save('response-loss-result.json',{symbol:x.symbol,callerInitiallyUncertain:true,realPgPromiseRejected:true,zeroForwardedSealBytes:true,independentCommittedRowConfirmed:true,reconciledExactRow:true,replayedWithoutIoOrCharge:true,slotCount:2,logicalBytes:committed.charge.bytes,fd:{opens:n,closes:n},formalPeer:false,productionWriterVerified:false,wholeExecutionClosureApproved:false});
}
await test('real local PG held-response loss: two new wire cases only',async t=>{
 for(const[symbol,wireVersion]of[['2409','research-article-input-v3'],['2383','research-article-input-v2']]){let failure;await t.test(symbol+' committed response loss and no-IO reconciliation',async()=>{try{await withLegalVersionedFixture(symbol,{label:'response-loss-'+symbol,wireVersion},async x=>{try{await lossCase(x);}catch(error){try{await snapshot(x,'failure-before-cleanup');}catch(snapshotError){x.save('failure-snapshot-error.json',{message:snapshotError.message});}throw error;}});}catch(error){failure=error;throw error;}});if(failure)throw failure;}
});
