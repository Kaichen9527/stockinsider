// SOURCE-ONLY delivery: every case NOT_RUN until a separate native execution authorization.
// Required preload: --import ./scripts/opportunity-v3/research-versioned-prerequisite-fs-witness.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {withLegalVersionedFixture} from './research-versioned-legal-fixture-helper.mjs';
import {parseBindingCore} from '../../web/src/lib/research-versioned-input-binding.ts';
import {completeHash,validateCompleteSchema} from '../../web/src/lib/research-v3-material-canonical.ts';
import {createVersionedCompleteInputController} from '../../web/src/lib/research-versioned-complete-input.ts';
const wire2='research-article-input-v2',wire3='research-article-input-v3';
function validateSaved(saved,request,binding){
 assert.equal(saved.status,'sealed');assert.deepEqual(saved.canonical_request,request);
 assert.equal(saved.request_hash,completeHash(request));assert.equal(saved.input_hash,completeHash(saved.canonical_payload));
 const p=saved.canonical_payload;assert.equal(p.schemaVersion,binding.core.wireVersion);
 assert.equal(p.researchIdentity.symbol,binding.core.symbol);assert.equal(p.clocks.originalModelCutoff,binding.registration.modelCutoff);
 assert.equal(p.preparation.id,request.preparationId);assert.equal(p.originalReservation.reservationId,request.reservationId);
 assert.deepEqual(Object.keys(p.capabilities).sort(),['dispatchReady','entryEligible','financialVerified','historicalPITEligible','modelDispatched','publishableResearch','researchQualified','strategyApproved']);
 assert.ok(Object.values(p.capabilities).every(v=>v===false));assert.equal(saved.dispatchReady,false);
 const f=p.financial;assert.deepEqual(f.artifactInventory,binding.registration.inventory);
 const material=binding.core.wireVersion===wire3?{...f.candidate,financialMaterial:f.material}:{schemaVersion:'research-complete-financial-material-v2',symbol:binding.core.symbol,artifactReadKnownAt:p.clocks.artifactReadKnownAt,sourceClosureHash:binding.core.sourceExecutionHash,artifactInventoryHash:binding.core.inventoryHash,financialMaterial:f.material};
 validateCompleteSchema(material,binding.registration.schemaTemplate,p.clocks.artifactReadKnownAt);
 assert.equal(p.hashes.sourceClosureHash,binding.core.sourceExecutionHash);
 if(binding.core.wireVersion===wire3)assert.equal(f.protocol.bindingCapsuleIdentity,binding.bindingCapsuleIdentity);
}
async function firstReplayConflict(x){
 x.setStage('cross-wire actual sameowner first seal');const beforeOpen=x.witness.opens,beforeClose=x.witness.closes,traceStart=x.rpcTrace.length;
 const saved=await x.controller.runCompleteInput(x.rpc,x.req,true);validateSaved(saved,x.req,x.selected);
 const expected=x.selected.registration.inventory.length;assert.equal(x.witness.opens-beforeOpen,expected);assert.equal(x.witness.closes-beforeClose,expected);
 const trace=x.rpcTrace.slice(traceStart),assertions=trace.filter(r=>r.name==='assert_research_input_candidate_v3');assert.equal(assertions.length,2);
 assert.deepEqual(assertions[0].before,{opens:beforeOpen,closes:beforeClose});
 assert.deepEqual(assertions[1].before,{opens:beforeOpen+expected,closes:beforeClose});
 assert.deepEqual(trace.find(r=>r.name==='seal_research_article_input_candidate_v3').before,{opens:beforeOpen+expected,closes:beforeClose+expected});
 const ledger=await x.ledger(x.audit),audit=await x.auditState(),opens=x.witness.opens,closes=x.witness.closes;
 const replayController=createVersionedCompleteInputController({bindingTexts:x.texts,executorFingerprint:x.hc,roots:{'original75d-fixed8or6':path.join(x.secure,'missing-old'),'historical15d4-fixed9or7':path.join(x.secure,'missing-new')}});
 x.setStage('missing-root sealed replay');const replay=await replayController.runCompleteInput(x.rpc,x.req,true);
 assert.deepEqual(replay.canonical_payload,saved.canonical_payload);assert.equal(replay.input_hash,saved.input_hash);assert.equal(replay.request_hash,saved.request_hash);
 assert.deepEqual(await x.ledger(x.audit),ledger);assert.deepEqual(await x.auditState(),audit);assert.equal(x.witness.opens,opens);assert.equal(x.witness.closes,closes);
 x.setStage('same-preparation opposite binding conflict');const other=parseBindingCore(x.texts.find(t=>JSON.parse(t).wireVersion!==x.selected.core.wireVersion));
 await assert.rejects(x.controller.runCompleteInput(x.rpc,{...x.req,expectedArtifactManifestHash:other.core.inventoryHash,expectedCalculatorExecutionHash:other.bindingCapsuleIdentity},true),error=>{x.save('expected-binding-conflict.json',{code:error.code,message:error.message});assert.equal(error.code,'P0001');assert.match(error.message,/complete_replay_conflict/);return true;});
 assert.deepEqual(await x.ledger(x.audit),ledger);assert.deepEqual(await x.auditState(),audit);assert.equal(x.witness.opens,opens);assert.equal(x.witness.closes,closes);
 x.save('cross-wire-result.json',{saved,replay,expected,opens:opens-beforeOpen,closed:closes-beforeClose,audit,ledger,replayNoIo:true,conflictNoIo:true,formalApproval:false});
}
async function prepare(x,binding,ids){
 assert.ok(ids.length<=30);const request={...x.preq,sourceDocumentIds:ids};
 const row=(await x.c.query('SELECT prepare_research_input_candidate_v3($1,$2,$3) v',[request,binding.core.inventoryHash,binding.bindingCapsuleIdentity])).rows[0].v;
 assert.equal(row.request.jobId,x.req.jobId);assert.equal(row.request.attempt,x.req.attempt);assert.equal(row.request.reservationId,x.req.reservationId);
 return {row,request:{...x.req,preparationId:row.preparation_id,preparationHash:row.input_hash,expectedArtifactManifestHash:binding.core.inventoryHash,expectedCalculatorExecutionHash:binding.bindingCapsuleIdentity}};
}
async function charges(x){
 const result=(await x.audit.query(`SELECT count(*)::int count,coalesce(sum(logical_bytes),0)::int bytes FROM (
 SELECT logical_bytes FROM research_input_preparations_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3
 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3) all_versions`,[x.req.jobId,x.req.attempt,x.req.reservationId])).rows[0];
 assert.ok(result.bytes<=524288);return result;
}
async function mixedSlots(x){
 x.setStage('mixed versions first seal');const first=await x.controller.runCompleteInput(x.rpc,x.req,true);validateSaved(first,x.req,x.selected);assert.equal((await charges(x)).count,2);
 const other=parseBindingCore(x.texts.find(t=>JSON.parse(t).wireVersion!==x.selected.core.wireVersion));
 x.setStage('second distinct neutral preparation same original unit');const second=await prepare(x,other,[x.sourceIds[1]]);assert.notEqual(second.row.preparation_id,x.prep.preparation_id);assert.equal((await charges(x)).count,3);
 x.setStage('opposite wire second seal');const saved=await x.controller.runCompleteInput(x.rpc,second.request,true);validateSaved(saved,second.request,other);const used=await charges(x);assert.equal(used.count,4);
 const rows=await x.ledger(x.audit);assert.equal(rows.preparations.length,2);assert.equal(rows.revisions.length,2);assert.deepEqual(new Set(rows.revisions.map(r=>r.canonical_payload.schemaVersion)),new Set([wire2,wire3]));
 const before=await x.auditState(),opens=x.witness.opens,closes=x.witness.closes;
 x.setStage('fifth slot preparation rejects without mutation or IO');await assert.rejects(prepare(x,x.selected,[x.sourceIds[2]]),error=>{x.save('expected-count-bound.json',{code:error.code,message:error.message});assert.equal(error.code,'P0001');assert.match(error.message,/input_preparation_count_bound/);return true;});
 assert.deepEqual(await x.auditState(),before);assert.deepEqual(await charges(x),used);assert.equal(x.witness.opens,opens);assert.equal(x.witness.closes,closes);
 x.save('mixed-count-bound.json',{used,rows,before,after:await x.auditState(),sameJob:x.req.jobId,sameAttempt:x.req.attempt,sameReservation:x.req.reservationId,countRejection:true,byteBoundaryProven:false});
}
async function maxThirtyMeasure(x){
 x.setStage('max30 source real RPC charge measurement');assert.equal(x.sourceIds.length,30);assert.equal(x.prep.request.sourceDocumentIds.length,30);assert.equal(x.prep.payload.sourceManifest.length,30);
 const saved=await x.controller.runCompleteInput(x.rpc,x.req,true);validateSaved(saved,x.req,x.selected);
 const ledger=await x.ledger(x.audit),used=await charges(x);assert.equal(used.count,2);
 const revision=ledger.revisions.find(r=>r.preparation_id===x.prep.preparation_id);assert.ok(revision);
 const dbCharge=(await x.audit.query("SELECT octet_length(convert_to(research_complete_canonical_v2($1::jsonb),'UTF8'))+octet_length(convert_to(research_complete_canonical_v2($2::jsonb),'UTF8')) AS bytes",[x.req,saved.canonical_payload])).rows[0].bytes;
 assert.equal(revision.logical_bytes,dbCharge);assert.equal(used.bytes,x.prep.logical_bytes+revision.logical_bytes);
 // No invented 'would-charge': a different wire changes both the full material and admission clocks.
 // This measured legal input does not establish a reachable >524288 mixed-wire case under the four-slot cap.
 x.save('max30-byte-measurement.json',{sourceCount:30,syntheticDocumentsOnly:true,independentNewsRootsProven:false,used,preparationBytes:x.prep.logical_bytes,sealedCanonicalBytes:dbCharge,remainingBytes:524288-used.bytes,remainingSlots:4-used.count,ledger});
 const other=parseBindingCore(x.texts.find(t=>JSON.parse(t).wireVersion!==x.selected.core.wireVersion));
 x.setStage('mixed max30/29 distinct neutral preparation');const next=await prepare(x,other,x.sourceIds.slice(0,29));assert.notEqual(next.row.preparation_id,x.prep.preparation_id);
 const before=await x.auditState(),beforeCharge=await charges(x),opens=x.witness.opens,closes=x.witness.closes;assert.equal(beforeCharge.count,3);
 x.setStage('bounded mixed-wire charge measurement');let nextSaved;
 try{nextSaved=await x.controller.runCompleteInput(x.rpc,next.request,true);}catch(error){
  x.save('mixed-byte-error.json',{code:error.code,message:error.message});assert.equal(error.code,'P0001');assert.match(error.message,/complete_byte_bound/);
  assert.deepEqual(await x.auditState(),before);assert.deepEqual(await charges(x),beforeCharge);
  assert.equal(x.witness.opens-opens,other.registration.inventory.length);assert.equal(x.witness.closes-closes,other.registration.inventory.length);
  x.save('mixed-byte-measurement.json',{beforeCharge,afterCharge:await charges(x),originalSqlByteRejectionObserved:true,rollbackVerified:true,wouldCharge:null,pending:['rejected SQL does not return exact would-charge; no value invented'],formalApproval:false});return;
 }
 validateSaved(nextSaved,next.request,other);const afterCharge=await charges(x);assert.equal(afterCharge.count,4);
 const nextCharge=(await x.audit.query("SELECT octet_length(convert_to(research_complete_canonical_v2($1::jsonb),'UTF8'))+octet_length(convert_to(research_complete_canonical_v2($2::jsonb),'UTF8')) AS bytes",[next.request,nextSaved.canonical_payload])).rows[0].bytes;
 assert.equal(afterCharge.bytes,beforeCharge.bytes+nextCharge);assert.equal(x.witness.opens-opens,other.registration.inventory.length);assert.equal(x.witness.closes-closes,other.registration.inventory.length);
 x.save('mixed-byte-measurement.json',{beforeCharge,wouldCharge:nextCharge,afterCharge,actualSecondSeal:true,byteRejection:{status:'PENDING',reason:'this legal bounded input remains within original byte cap; no reachable over-cap input proven'},formalApproval:false});
}
await test('new cross-wire and shared-quota matrix; original cases not imported',async t=>{
 const cases=[
  ['2409',{label:'auo-compatible',wireVersion:wire2},firstReplayConflict],
  ['2383',{label:'emc-v3',wireVersion:wire3},firstReplayConflict],
  ['2409',{label:'mixed-v2-then-v3',wireVersion:wire2,sourceCount:3},mixedSlots],
  ['2383',{label:'mixed-v3-then-v2',wireVersion:wire3,sourceCount:3},mixedSlots],
  ['2409',{label:'max30-compatible-measure',wireVersion:wire2,sourceCount:30,prepareAllSources:true},maxThirtyMeasure],
  ['2383',{label:'max30-v3-measure',wireVersion:wire3,sourceCount:30,prepareAllSources:true},maxThirtyMeasure],
 ];
 for(const[symbol,options,body]of cases){let failed;await t.test(options.label,async()=>{try{await withLegalVersionedFixture(symbol,options,body);}catch(error){failed=error;throw error;}});if(failed)throw failed;}
});
