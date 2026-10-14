// SOURCE ONLY / NOT_RUN. Requires separate native authorization and mandatory FS preload.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {withLegalVersionedFixture} from './research-versioned-legal-fixture-helper.mjs';
import {extractHistorical77Realm,produceHistorical77} from './research-legacy77-realm-fixture.mjs';
import {completeHash} from '../../web/src/lib/research-v3-material-canonical.ts';
const historical='77b1cc06b12d45063af75e976605fb9c4725da60f2c58bd39b28d54028590a41';
async function snapshot(x,label){
 const audit=await x.auditState(),ledger=await x.ledger(x.audit);
 const charge=(await x.audit.query(`SELECT count(*)::int count,coalesce(sum(logical_bytes),0)::int bytes FROM (
 SELECT logical_bytes FROM research_input_preparations_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3
 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2 WHERE job_id=$1 AND attempt=$2 AND reservation_id=$3) all_versions`,[x.req.jobId,x.req.attempt,x.req.reservationId])).rows[0];
 const value={audit,ledger,ledgerSha:createHash('sha256').update(JSON.stringify(ledger)).digest('hex'),charge,fd:{...x.witness}};
 assert.equal(Object.keys(audit).length,9);x.save(label+'.json',value);return value;
}
function unchanged(a,b){assert.deepEqual(b.audit,a.audit);assert.deepEqual(b.ledger,a.ledger);assert.equal(b.ledgerSha,a.ledgerSha);assert.deepEqual(b.charge,a.charge);assert.deepEqual(b.fd,a.fd);}
function persisted(response){const {status,replay,dispatchReady,...row}=response;assert.equal(status,'sealed');assert.equal(dispatchReady,false);assert.equal(typeof replay,'boolean');return row;}
async function legacyReplay(x){
 x.setStage('extract and verify original historical22 plus mapping/support');const material=extractHistorical77Realm(x.secure),m=material.mapping.companies[x.symbol];
 assert.equal(material.mapping.sourceClosureHash,historical);assert.equal(m.inventory.length,x.symbol==='2409'?8:6);
 const request={...x.req,expectedArtifactManifestHash:m.inventoryHash,expectedCalculatorExecutionHash:historical};
 assert.equal(x.prep.replay,false);assert.deepEqual(x.prep.request,x.preq);
 const initial=await snapshot(x,'01-original-preparation');assert.equal(initial.charge.count,1);assert.equal(initial.ledger.revisions.length,0);
 x.setStage('original exact15d4 producer and original real sealer in isolated child');
 const child=await produceHistorical77(x,material,request),saved=child.saved;
 assert.equal(saved.replay,false);assert.equal(saved.request_hash,completeHash(request));assert.equal(saved.input_hash,completeHash(saved.canonical_payload));assert.deepEqual(saved.canonical_request,request);
 assert.equal(saved.canonical_payload.hashes.sourceClosureHash,historical);assert.equal(saved.canonical_payload.schemaVersion,'research-article-input-v2');assert.equal(saved.canonical_payload.clocks.originalModelCutoff,m.modelCutoff);
 assert.ok(Object.values(saved.canonical_payload.capabilities).every(v=>v===false));
 const sealed=await snapshot(x,'02-original-first-seal');assert.equal(sealed.charge.count,2);assert.equal(sealed.ledger.revisions.length,1);assert.deepEqual(sealed.ledger.revisions[0],persisted(saved));
 assert.deepEqual(sealed.fd,initial.fd,'child owns original IO, current realm has no IO');
 // Missing both fixed artifact roots proves replay is not a compatible recomputation.
 for(const root of Object.values(x.roots))fs.rmSync(root,{recursive:true});
 x.setStage('current controller original77 read and seal replay with missing roots');
 for(const seal of [false,true]){
  const before=await snapshot(x,seal?'05-before-seal-replay':'03-before-read-replay'),start=x.rpcTrace.length;
  const replay=await x.controller.runCompleteInput(x.rpc,request,seal);assert.equal(replay.replay,true);assert.deepEqual(persisted(replay),persisted(saved));
  assert.deepEqual(replay.canonical_payload.clocks,saved.canonical_payload.clocks);
  assert.deepEqual(x.rpcTrace.slice(start).map(r=>r.name),['read_research_article_input_candidate_v3']);
  unchanged(before,await snapshot(x,seal?'06-after-seal-replay':'04-after-read-replay'));
 }
 x.setStage('same original preparation conflicts with valid current binding');const beforeConflict=await snapshot(x,'07-before-conflict');
 await assert.rejects(x.controller.runCompleteInput(x.rpc,x.req,true),error=>{x.save('conflict-error.json',{code:error.code,message:error.message});return error.code==='P0001'&&error.message==='complete_replay_conflict';});
 unchanged(beforeConflict,await snapshot(x,'08-after-conflict'));
 x.setStage('distinct original neutral preparation for fresh old77 refusal');
 const preq={...x.preq,sourceDocumentIds:[x.sourceIds[1]]};const prep=(await x.c.query('SELECT prepare_research_input_v2($1) v',[preq])).rows[0].v;
 assert.notEqual(prep.preparation_id,x.prep.preparation_id);assert.equal(prep.replay,false);
 const fresh={...request,preparationId:prep.preparation_id,preparationHash:prep.input_hash};
 const beforeFresh=await snapshot(x,'09-before-fresh77');assert.equal(beforeFresh.charge.count,3);
 await assert.rejects(x.controller.runCompleteInput(x.rpc,fresh,true),error=>{x.save('fresh-error.json',{message:error.message});return error.message==='original_fresh_v2_requires_retained_execution_realm';});
 unchanged(beforeFresh,await snapshot(x,'10-after-fresh77'));
 x.save('legacy77-result.json',{symbol:x.symbol,originalSource:material.index.source,originalSourceClosure:historical,originalChild:{pid:child.pid,node:child.node,nodeSha:child.nodeSha,fd:child.fd},parentFdUnchanged:true,firstSealOriginalRpc:true,replayMissingRoots:true,newExecutionIs77:false,compiledNextIdentityVerified:false,formalApproval:false,pending:['formal retained execution support/drain/cutover','full application S/C/B/Q/R/A and all four caller activation','old lease/source revocation and response-loss races outside these two cases']});
}
await test('original77 realm first seal then current versioned no-IO replay',async t=>{
 for(const symbol of ['2409','2383']){let failure;await t.test(symbol+' original old77 replay',async()=>{
  try{await withLegalVersionedFixture(symbol,{label:'legacy77-'+symbol,wireVersion:'research-article-input-v2',sourceCount:2,preparationMode:'original-v2'},legacyReplay);}catch(error){failure=error;throw error;}
 });if(failure)throw failure;}
});
