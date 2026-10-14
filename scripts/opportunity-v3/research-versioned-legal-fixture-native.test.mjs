import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {parseBindingCore} from '../../web/src/lib/research-versioned-input-binding.ts';
import {createVersionedCompleteInputController} from '../../web/src/lib/research-versioned-complete-input.ts';
import {readPrerequisiteState,stateDescriptor,assertPrerequisiteDescriptor} from './research-versioned-prerequisite-profile.mjs';
import {withLegalVersionedFixture} from './research-versioned-legal-fixture-helper.mjs';
async function main(t,symbol){
 await withLegalVersionedFixture(symbol,{label:'original-wire',wireVersion:symbol==='2409'?'research-article-input-v3':'research-article-input-v2'},async context=>{
  const {controller,rpc,req,save,ledger,audit,auditState,witness,opensInitial,closesInitial,texts,hc,secure,selected,setStage}=context;
  setStage('actual sameowner first seal');
  try{const saved=await controller.runCompleteInput(rpc,req,true);save('first-seal.json',saved);assert.equal(saved.status,'sealed');setStage('read-only observer ledger audit and replay');const before=await ledger(audit),auditBefore=await auditState(),openBefore=witness.opens;assert.equal(openBefore-opensInitial,symbol==='2409'?9:6);assert.equal(witness.closes-closesInitial,openBefore-opensInitial);const replayController=createVersionedCompleteInputController({bindingTexts:texts,executorFingerprint:hc,roots:{'original75d-fixed8or6':path.join(secure,'absent-old'),'historical15d4-fixed9or7':path.join(secure,'absent-new')}});const replay=await replayController.runCompleteInput(rpc,req,true);assert.deepEqual(replay.canonical_payload,saved.canonical_payload);assert.deepEqual(await ledger(audit),before);assert.equal(witness.opens,openBefore);assert.deepEqual(await auditState(),auditBefore);save('replay.json',{opensInitial,opensBefore:openBefore,opensAfter:witness.opens,closed:witness.closes-closesInitial,ledgerUnchanged:true,auditBefore,auditAfter:await auditState(),missingRootReplaySucceeded:true});
   const other=parseBindingCore(texts.find(v=>JSON.parse(v).wireVersion!==selected.core.wireVersion));const conflicting={...req,expectedArtifactManifestHash:other.core.inventoryHash,expectedCalculatorExecutionHash:other.bindingCapsuleIdentity};await assert.rejects(controller.runCompleteInput(rpc,conflicting,true));assert.deepEqual(await ledger(audit),before);assert.equal(witness.opens,openBefore);assert.deepEqual(await auditState(),auditBefore);save('same-prep-conflict.json',{rejected:true,noAdditionalOpens:true,auditBefore,auditAfter:await auditState()});assert.equal(assertPrerequisiteDescriptor(stateDescriptor(await readPrerequisiteState(audit))),'successor');
  }finally{save('fd-witness.json',{opens:witness.opens-opensInitial,closes:witness.closes-closesInitial});}

 });
 await t.test(symbol+' legal RPC + firstseal/replay/conflict',()=>{});
}
await test('legal scoped RPC fixture then actual controller firstseal, sequential isolated issuers',async t=>{await main(t,'2409');await main(t,'2383');});
