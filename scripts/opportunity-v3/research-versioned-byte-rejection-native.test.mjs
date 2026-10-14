// SOURCE ONLY: two children NOT_RUN; a separate native authorization is required.
// Mandatory preload before ESM: research-versioned-prerequisite-fs-witness.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {withLegalVersionedFixture} from './research-versioned-legal-fixture-helper.mjs';
import {parseBindingCore} from '../../web/src/lib/research-versioned-input-binding.ts';
import {completeHash,validateCompleteSchema} from '../../web/src/lib/research-v3-material-canonical.ts';
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

async function snapshot(x,label){
 const audit=await x.auditState(),ledger=await x.ledger(x.audit);
 const charge=(await x.audit.query(`SELECT count(*)::int count,coalesce(sum(logical_bytes),0)::int bytes FROM (
 SELECT logical_bytes FROM research_input_preparations_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3
 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3) all_versions`,[x.req.jobId,x.req.attempt,x.req.reservationId])).rows[0];
 assert.equal(Object.keys(audit).length,9);assert.ok(charge.bytes<=524288);
 const result={audit,ledger,ledgerHash:createHash('sha256').update(JSON.stringify(ledger)).digest('hex'),ledgerHashAlgorithm:'SHA256 UTF8 JSON.stringify of exact observer ledger projection (audit only)',charge,fd:{opens:x.witness.opens,closes:x.witness.closes}};
 x.save(label+'.json',result);return result;
}
function checkLifecycle(x,start,initial,binding){
 const trace=x.rpcTrace.slice(start),preposts=trace.filter(r=>r.name==='assert_research_input_candidate_v3'),seals=trace.filter(r=>r.name==='seal_research_article_input_candidate_v3');
 const n=binding.registration.inventory.length;assert.equal(preposts.length,2);assert.equal(seals.length,1);
 assert.deepEqual(preposts[0].before,initial);
 assert.deepEqual(preposts[1].before,{opens:initial.opens+n,closes:initial.closes});
 assert.deepEqual(seals[0].before,{opens:initial.opens+n,closes:initial.closes+n});
 assert.equal(x.witness.opens,initial.opens+n);assert.equal(x.witness.closes,initial.closes+n);
 return {files:n,trace,preNoNewOpens:true,postAllSourceFdsRetained:true,sealAllSourceFdsClosed:true};
}
async function byteRejection(x,sourceDerivedPrediction){
 assert.equal(x.sourceIds.length,30);assert.equal(x.prep.request.sourceDocumentIds.length,30);assert.equal(x.prep.payload.sourceManifest.length,30);
 x.save('source-derived-prediction.json',{...sourceDerivedPrediction,kind:'source-derived difference only',actualRejectedWouldCharge:null,actualRejectedTotal:null,proven:false,publicationCompatible:false});
 x.setStage('byte case initial prepared snapshot');const initial=await snapshot(x,'01-initial-preparation');assert.equal(initial.charge.count,1);
 assert.equal(initial.charge.bytes,x.prep.logical_bytes);assert.equal(initial.ledger.preparations.length,1);assert.equal(initial.ledger.revisions.length,0);
 x.setStage('byte case genuine first seal');const firstTrace=x.rpcTrace.length,first=await x.controller.runCompleteInput(x.rpc,x.req,true);
 validateSaved(first,x.req,x.selected);const firstFd=checkLifecycle(x,firstTrace,initial.fd,x.selected);x.save('first-seal.json',{saved:first,fd:firstFd});
 const afterFirst=await snapshot(x,'02-after-first-seal');assert.equal(afterFirst.charge.count,2);assert.equal(afterFirst.ledger.revisions.length,1);
 const firstRevision=afterFirst.ledger.revisions[0];
 const firstDbCharge=(await x.audit.query("SELECT octet_length(convert_to(research_complete_canonical_v2($1::jsonb),'UTF8'))+octet_length(convert_to(research_complete_canonical_v2($2::jsonb),'UTF8')) bytes",[x.req,first.canonical_payload])).rows[0].bytes;
 assert.equal(firstRevision.logical_bytes,firstDbCharge);assert.equal(afterFirst.charge.bytes,x.prep.logical_bytes+firstDbCharge);
 const other=parseBindingCore(x.texts.find(t=>JSON.parse(t).wireVersion!==x.selected.core.wireVersion));
 x.setStage('byte case second neutral preparation with29 sources');const beforePrepare=await snapshot(x,'03-before-second-preparation');
 const prepRequest={...x.preq,sourceDocumentIds:x.sourceIds.slice(0,29)};
 const second=(await x.c.query('SELECT prepare_research_input_candidate_v3($1,$2,$3) v',[prepRequest,other.core.inventoryHash,other.bindingCapsuleIdentity])).rows[0].v;
 assert.notEqual(second.preparation_id,x.prep.preparation_id);assert.equal(second.payload.sourceManifest.length,29);
 for(const key of ['jobId','attempt','reservationId'])assert.equal(second.request[key],x.req[key]);
 assert.equal(x.witness.opens,beforePrepare.fd.opens);assert.equal(x.witness.closes,beforePrepare.fd.closes);
 const request={...x.req,preparationId:second.preparation_id,preparationHash:second.input_hash,expectedArtifactManifestHash:other.core.inventoryHash,expectedCalculatorExecutionHash:other.bindingCapsuleIdentity};
 const before=await snapshot(x,'04-after-second-preparation-before-rejection');assert.equal(before.charge.count,3);assert.equal(before.ledger.preparations.length,2);assert.equal(before.ledger.revisions.length,1);
 assert.equal(before.charge.bytes,afterFirst.charge.bytes+second.logical_bytes);
 x.save('measured-preparation-and-first-seal-charges.json',{initialPreparation:x.prep.logical_bytes,firstSeal:firstDbCharge,secondPreparation:second.logical_bytes,usedBeforeSecondSeal:before.charge,actualRejectedWouldCharge:null});
 x.setStage('byte case actual second seal must reject original byte bound');const traceStart=x.rpcTrace.length;let observed;
 let after;try{await assert.rejects(x.controller.runCompleteInput(x.rpc,request,true),error=>{
  observed={code:error.code,message:error.message};x.save('second-seal-error.json',observed);return true;
 });}finally{after=await snapshot(x,'05-after-second-seal-attempt');}
 assert.equal(observed.code,'P0001');assert.equal(observed.message,'complete_byte_bound');
 assert.deepEqual(after.audit,before.audit);assert.deepEqual(after.ledger,before.ledger);assert.equal(after.ledgerHash,before.ledgerHash);assert.deepEqual(after.charge,before.charge);
 const fd=checkLifecycle(x,traceStart,before.fd,other);assert.equal(after.fd.opens,after.fd.closes);
 assert.equal(after.ledger.revisions[0].input_hash,first.input_hash);assert.equal(after.ledger.revisions[0].request_hash,first.request_hash);
 assert.deepEqual(after.ledger.revisions[0].canonical_payload.clocks,first.canonical_payload.clocks);
 x.save('byte-rejection-result.json',{observed,actualRejectedWouldCharge:null,actualRejectedTotal:null,pending:['original rejected seal SQL returns no exact would-charge; source-derived prediction is not a measured rejection charge','publication/author-packet compatibility of long synthetic locators not established'],before,after,fd,sourceDerivedPrediction,allNineTablesUnchanged:true,originalCountBeforeRejection:3,noBudgetOrCapsModified:true,formalApproval:false});
}
await test('dedicated byte rejection matrix; original green entries not imported',async t=>{
 const cases=[
  ['2409',{label:'auo-byte-plus400',wireVersion:wire2,sourceCount:30,prepareAllSources:true,locatorExtensionBytes:400},{historicalMeasuredTotal:462917,addedAsciiBytesPerRoot:400,rootOccurrences:177,predictedDelta:70800,predictedTotal:533717}],
  ['2383',{label:'emc-byte-plus1300',wireVersion:wire3,sourceCount:30,prepareAllSources:true,locatorExtensionBytes:1300},{historicalMeasuredTotal:304278,addedAsciiBytesPerRoot:1300,rootOccurrences:177,predictedDelta:230100,predictedTotal:534378}],
 ];
 for(const[symbol,options,prediction]of cases){let failed;await t.test(options.label,async()=>{try{await withLegalVersionedFixture(symbol,options,x=>byteRejection(x,prediction));}catch(error){failed=error;throw error;}});if(failed)throw failed;}
});
