import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTwLaunchPatternReadEvidence, readTwLaunchInstitutionalSelection } from '../tw-entry-plan-authority.ts';
import { nativeVolumeFixture } from './launch-native-volume.test-fixture.ts';

test('actual selected20 provenance is independent of technical51/predecessor and refuses public/cloned/mutated selections', async () => {
  const f=nativeVolumeFixture({capitalChangeIndex:220}), selected=await loadTwLaunchPatternReadEvidence(f.client,f.request);
  const reads=f.reads.length, proof=readTwLaunchInstitutionalSelection(selected,f.request);
  assert.ok(proof);assert.equal(proof.sessions.length,20);assert.equal(proof.sessions[0].session,f.sessions.at(-20));
  assert.equal(proof.sessions.at(-1)!.session,f.request.signalSession);assert.equal(proof.targetEvents.length,0);
  assert.equal(proof.priceRevision,selected.history.sourceDatasetRevision);
  assert.equal(proof.actionsRevision,selected.corporateActions!.revisionId);
  assert.equal(f.reads.length,reads,'lookup adds no query or native preparation');
  assert.equal(readTwLaunchInstitutionalSelection(structuredClone(selected),f.request),null);
  assert.equal(readTwLaunchInstitutionalSelection(selected,{...f.request,symbol:'5274'}),null);
  assert.equal(readTwLaunchInstitutionalSelection(selected,{stockId:f.request.stockId,symbol:f.request.symbol,
    exchange:f.request.exchange,signalSession:f.request.signalSession,cutoff:f.request.cutoff}),null,'full runtime calendar request is bound');
  selected.history.bars.at(-1)!.close+=1;
  assert.equal(readTwLaunchInstitutionalSelection(selected,f.request),null);
});
test('selected summary retains exact target action facts only inside its20 consumed sessions', async () => {
  for(const index of [208,220]) {
    const f=nativeVolumeFixture({cashEvent:true,cashEventIndex:index}), selected=await loadTwLaunchPatternReadEvidence(f.client,f.request);
    const proof=readTwLaunchInstitutionalSelection(selected,f.request);assert.ok(proof);
    assert.equal(proof.targetEvents.length,index===220?1:0);
    if(index===220){assert.equal(proof.targetEvents[0].session,f.sessions[220]);assert.equal(proof.targetEvents[0].eventKind,'ex_right_dividend');}
  }
});
test('institutional lookup rejects accessor and Proxy mutations before invoking hooks or querying', async () => {
  for(const mode of ['history_accessor','nested_proxy'] as const) {
    const f=nativeVolumeFixture(), selected=await loadTwLaunchPatternReadEvidence(f.client,f.request);
    let hooks=0;const reads=f.reads.length,history=selected.history;
    if(mode==='history_accessor')Object.defineProperty(selected,'history',{enumerable:true,get(){hooks++;return history;}});
    else history.bars[0]=new Proxy(history.bars[0],{get(target,key,receiver){hooks++;return Reflect.get(target,key,receiver);}});
    assert.equal(readTwLaunchInstitutionalSelection(selected,f.request),null,mode);
    assert.equal(hooks,0);assert.equal(f.reads.length,reads);
  }
});
