/** Anonymous synthetic identities only; zero real providers/ledger reads. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleReplayBindingFixture as bind,scheduleReplayBoundary,SCHEDULE_REPLAY_FIXTURE_SCHEMA,type ScheduleReplayFixture} from './schedule-replay-binding.ts';
import {SCHEDULE_FIXTURE_SCHEMA,type ScheduleCalendarRow} from './schedule-admission.ts';
import {POLICY} from './policy.ts';
const h=(n:number)=>n.toString(16).padStart(64,'0');
function fixture(morning=false):ScheduleReplayFixture{
 const cutoff=morning?'2026-11-06T00:15:00Z':'2026-11-06T12:30:00Z';
 const rows=(session:string):ScheduleCalendarRow[]=>['TWSE','TPEX'].map(market=>({session_authority_id:'official_'+session+'_'+market,session_id:session,market:market as 'TWSE'|'TPEX',provider:market.toLowerCase() as 'twse'|'tpex',
  open_at:session+'T01:00:00Z',close_at:session+'T05:30:00Z',status:'completed',source_timestamp:session+'T00:00:00Z',collected_at:session+'T00:01:00Z',recorded_at:session+'T00:02:00Z',source_ref:'official/'+session+'/'+market}));
 return {schemaVersion:SCHEDULE_REPLAY_FIXTURE_SCHEMA,schedule:{schemaVersion:SCHEDULE_FIXTURE_SCHEMA,policyVersion:POLICY.version,jobId:morning?'shared_market_0815':'rank_publish_2030',session:'2026-11-06',now:cutoff,
  calendarRows:[...rows('2026-11-05'),...rows('2026-11-06')],source:{state:'complete',revisionId:'original_material_revision',session:morning?'2026-11-05':'2026-11-06',sourceAt:morning?'2026-11-05T05:30:00Z':'2026-11-06T05:30:00Z',availableAt:cutoff,rightsQualifiedAt:cutoff,qualificationAt:cutoff},
  prior:null,inventory:{observedAt:cutoff,entries:[{id:'candidate',jobId:morning?'shared_market_0815':'rank_publish_2030',active:true}]},receipts:[]},
  material:{sourceHashes:[h(1),h(2)],events:[{contentHash:h(1),eventAt:'2026-11-05T00:00:00Z',publishedAt:'2026-11-05T00:01:00Z',availableAt:'2026-11-05T00:02:00Z'}],
   market:{baselineHash:h(3),originalInvocationRefHash:h(4),originalRequestHash:h(5)},ranking:morning?null:{originalRunRefHash:h(6),originalRequestHash:h(7)},
   queue:morning?[]:[{jobRefHash:h(8),session:'2026-11-05',admissionHash:h(9),preparedInputHash:h(10),attempt:0,retryOfRefHash:null}],
   providers:morning?[]:[{invocationRefHash:h(11),jobRefHash:h(8),task:'author',originalRequestHash:h(12)},{invocationRefHash:h(13),jobRefHash:h(8),task:'reviewer',originalRequestHash:h(14)}]},observationFixtureOnly:null};
}
function completed(p:ScheduleReplayFixture){const first=bind(p);p.observationFixtureOnly={stableSlotId:first.stableSlotId,materialRequestHash:first.materialRequestHash,state:'completed',originalResult:{resultHash:h(20),originalCutoff:p.schedule.source.session+'T00:10:00Z',sourceAt:p.schedule.source.session+'T00:00:00Z',expiresAt:p.schedule.now}};return first;}
test('separate stable slot and material request identity with no whole-entry authority',()=>{
 for(const morning of [false,true]){const p=fixture(morning),original=structuredClone(p),result=bind(p);assert.equal(result.status,'binding_only_whole_entry_authority_missing');assert.deepEqual(p,original);
  assert.equal(result.executionAllowed,false);assert.equal(result.chargeAuthorized,false);assert.equal(result.providerPostAllowed,false);assert.equal(result.wholeEntryAuthorityBound,false);
  const changed=structuredClone(p);changed.material.sourceHashes[1]=h(99);assert.equal(bind(changed).stableSlotId,result.stableSlotId);assert.notEqual(bind(changed).materialRequestHash,result.materialRequestHash);
 }
 assert.notEqual(bind(fixture()).stableSlotId,bind(fixture(true)).stableSlotId);
});
test('reordered references, equivalent explicit offsets and acquisition-only observations do not change material identity',()=>{
 const p=fixture(),first=bind(p);p.schedule.calendarRows.reverse();p.material.sourceHashes.reverse();p.material.providers.reverse();
 p.material.events[0].eventAt='2026-11-05T08:00:00+08:00';p.material.events[0].availableAt='2026-11-06T12:29:59Z';p.schedule.now='2026-11-06T12:30:01Z';
 assert.equal(bind(p).materialRequestHash,first.materialRequestHash);assert.equal(bind(p).calendarRevisionHash,first.calendarRevisionHash);
 p.schedule.source.availableAt='2026-11-06T12:29:59Z';assert.equal(bind(p).materialRequestHash,first.materialRequestHash);
});
test('calendar revision, event/publication semantics and original stage requests remain bound',()=>{
 for(const change of [
  (p:ScheduleReplayFixture)=>{p.schedule.calendarRows[0].source_ref='official/correction';},
  (p:ScheduleReplayFixture)=>{p.material.events[0].publishedAt='2026-11-05T00:01:01Z';},
  (p:ScheduleReplayFixture)=>{p.material.market.originalRequestHash=h(91);},
  (p:ScheduleReplayFixture)=>{p.material.ranking!.originalRequestHash=h(92);},
  (p:ScheduleReplayFixture)=>{p.material.queue[0].preparedInputHash=h(93);},
  (p:ScheduleReplayFixture)=>{p.material.queue[0].admissionHash=h(94);},
  (p:ScheduleReplayFixture)=>{p.material.providers[0].originalRequestHash=h(95);},
 ]){const p=fixture(),first=completed(p);change(p);const result=bind(p);assert.equal(result.stableSlotId,first.stableSlotId);assert.equal(result.status,'fixture_identity_conflict');assert.equal(result.chargeAuthorized,false);}
});
test('completed fixture replay retains original result and expired TTL after new-intent120s expires',()=>{
 const p=fixture(),first=completed(p),original=structuredClone(p.observationFixtureOnly!.originalResult);p.schedule.now='2026-11-06T12:34:00Z';
 const replay=bind(p);assert.equal(replay.status,'fixture_completed_replay');assert.equal(replay.materialRequestHash,first.materialRequestHash);assert.deepEqual(replay.originalResult,original);assert.equal(replay.retainedResultExpired,true);
 p.observationFixtureOnly=null;assert.equal(bind(p).status,'planner_refusal:qualification_stale_for_new_intent');
});
test('pending, uncertain and failed same attempt never permit re-POST, retry or resume',()=>{
 for(const state of ['pending','uncertain','failed'] as const){const p=fixture();const first=bind(p);p.observationFixtureOnly={stableSlotId:first.stableSlotId,materialRequestHash:first.materialRequestHash,state,originalResult:null};
  assert.equal(bind(p).status,state==='failed'?'fixture_failed_no_retry':`fixture_${state}_no_repost`);assert.equal(bind(p).providerPostAllowed,false);assert.equal(bind(p).chargeAuthorized,false);
  p.material.sourceHashes[1]=h(99);assert.equal(bind(p).status,'fixture_identity_conflict');
 }
});
test('source/inventory/calendar refusals precede completed observation and no missed-window catchup',()=>{
 for(const change of [
  (p:ScheduleReplayFixture)=>{p.schedule.source.state='incomplete';},
  (p:ScheduleReplayFixture)=>{p.schedule.inventory.entries.push({id:'duplicate',jobId:p.schedule.jobId,active:true});},
  (p:ScheduleReplayFixture)=>{p.schedule.calendarRows=[];},
  (p:ScheduleReplayFixture)=>{p.schedule.source.availableAt='2026-11-06T12:30:00.000001Z';},
  (p:ScheduleReplayFixture)=>{p.schedule.now='2026-11-06T12:35:00Z';},
 ]){const p=fixture();completed(p);change(p);assert.match(bind(p).status,/^planner_refusal:/);assert.equal(bind(p).originalResult,null);}
});
test('prior planner receipt domain cannot be supplied as a whole-entry binding token',()=>{
 const p=fixture();p.schedule.receipts=[{intentId:h(1),requestHash:h(2),status:'pending',completedAt:null}];assert.throws(()=>bind(p),/schedule_replay_fixture_invalid/);
});
test('closed bounded lineage rejects missing/duplicate/cross-job refs, invalid retry and future causal clocks',()=>{
 for(const change of [
  (p:ScheduleReplayFixture)=>{p.material.sourceHashes=[];},
  (p:ScheduleReplayFixture)=>{p.material.sourceHashes=[h(1),h(1)];},
  (p:ScheduleReplayFixture)=>{p.material.ranking=null;},
  (p:ScheduleReplayFixture)=>{p.material.providers[0].jobRefHash=h(99);},
  (p:ScheduleReplayFixture)=>{p.material.queue[0].attempt=1;},
  (p:ScheduleReplayFixture)=>{p.material.providers.push(p.material.providers[0]);},
  (p:ScheduleReplayFixture)=>{p.material.events[0].availableAt='2026-11-06T12:30:00.000001Z';},
  (p:ScheduleReplayFixture)=>{p.material.events[0].publishedAt='2026-11-05T00:03:00Z';},
  (p:ScheduleReplayFixture)=>{p.material.sourceHashes=Array.from({length:201},()=>h(1));},
 ]){const p=fixture();change(p);assert.throws(()=>bind(p),/schedule_replay_fixture_invalid/);}
 const morning=fixture(true);morning.material.market.originalInvocationRefHash=null;morning.material.market.originalRequestHash=null;assert.throws(()=>bind(morning),/schedule_replay_fixture_invalid/);
});
test('wrong slot or completion result conflicts; result chronology cannot manufacture source date or TTL',()=>{
 const p=fixture();completed(p);p.observationFixtureOnly!.stableSlotId=h(99);assert.equal(bind(p).status,'fixture_identity_conflict');
 for(const change of [
  (p:ScheduleReplayFixture)=>{p.observationFixtureOnly!.originalResult=null;},
  (p:ScheduleReplayFixture)=>{p.observationFixtureOnly!.originalResult!.originalCutoff='2026-11-06T12:30:00.000001Z';},
  (p:ScheduleReplayFixture)=>{p.observationFixtureOnly!.originalResult!.sourceAt='2026-11-06T00:11:00Z';},
 ]){const p=fixture();completed(p);change(p);assert.throws(()=>bind(p),/schedule_replay_fixture_invalid/);}
});
test('known retry original must match original material and ordering; an absent original stays an explicit gap',()=>{
 const p=fixture();p.material.queue.push({...p.material.queue[0],jobRefHash:h(30),attempt:1,retryOfRefHash:h(8)});assert.equal(bind(p).status,'binding_only_whole_entry_authority_missing');
 for(const change of [
  (p:ScheduleReplayFixture)=>{p.material.queue[1].admissionHash=h(31);},
  (p:ScheduleReplayFixture)=>{p.material.queue[1].session='2026-11-04';},
  (p:ScheduleReplayFixture)=>{p.material.queue[0].attempt=1;p.material.queue[0].retryOfRefHash=h(33);},
 ]){const changed=structuredClone(p);change(changed);assert.throws(()=>bind(changed),/schedule_replay_fixture_invalid/);}
 const updated=structuredClone(p);updated.material.queue[1].preparedInputHash=h(32);assert.equal(bind(updated).status,'binding_only_whole_entry_authority_missing');assert.notEqual(bind(updated).materialRequestHash,bind(p).materialRequestHash);
 p.material.queue=p.material.queue.slice(1);p.material.providers=[];assert.ok(bind(p).gaps.includes('retry_reference_not_resolved_in_fixture'));assert.equal(bind(p).wholeEntryAuthorityBound,false);
});
test('strict anonymous output and facade cannot carry caller-created enable, private fields or adapters',()=>{
 const p=fixture();completed(p);const allowed=['schemaVersion','scope','status','stableSlotId','materialRequestHash','calendarRevisionHash','originalResult','retainedResultExpired','executionAllowed','chargeAuthorized','providerPostAllowed','sourceCauseVerified','wholeEntryAuthorityBound','gaps'];
 assert.deepEqual(Object.keys(bind(p)).sort(),allowed.sort());
 for(const mutate of [
  (p:ScheduleReplayFixture)=>{Object.assign(p,{approved:true});},
  (p:ScheduleReplayFixture)=>{Object.assign(p.material.market,{principal:'anonymous_fixture_sentinel'});},
  (p:ScheduleReplayFixture)=>{Object.assign(p.observationFixtureOnly!,{rawLog:'anonymous_fixture_sentinel'});},
 ]){const p=fixture();completed(p);mutate(p);assert.throws(()=>bind(p),/schedule_replay_fixture_invalid/);}
 assert.deepEqual(scheduleReplayBoundary(),{state:'Disabled',executionAllowed:false,chargeAuthorized:false,providerPostAllowed:false});let calls=0;
 for(const value of [true,{approved:true},{adapter:()=>{calls++;}},{receipt:p.observationFixtureOnly}])assert.throws(()=>scheduleReplayBoundary(value),/runtime_overrides_forbidden/);assert.equal(calls,0);
});
