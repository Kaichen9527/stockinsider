/** Pure fixture intent checks: no timers, SQL, provider, network or writers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleAdmissionFixture as plan,scheduleAdmissionBoundary,SCHEDULE_FIXTURE_SCHEMA,type ScheduleFixture,type ScheduleCalendarRow} from './schedule-admission.ts';
import {POLICY,STAGING_SCHEDULE} from './policy.ts';
function fixture(morning=false):ScheduleFixture{
 const session='2026-11-06',cutoff=morning?'2026-11-06T00:15:00Z':'2026-11-06T12:30:00Z';
 const rows=(date:string):ScheduleCalendarRow[]=>['TWSE','TPEX'].map((market,n)=>({session_authority_id:`official_${date}_${n}`,session_id:date,market:market as 'TWSE'|'TPEX',provider:market.toLowerCase() as 'twse'|'tpex',
  open_at:date+'T01:00:00Z',close_at:date+'T05:30:00Z',status:'completed',source_timestamp:date+'T00:00:00Z',collected_at:date+'T00:01:00Z',recorded_at:date+'T00:02:00Z',source_ref:`official/${market}/${date}`}));
 return {schemaVersion:SCHEDULE_FIXTURE_SCHEMA,policyVersion:POLICY.version,jobId:morning?'shared_market_0815':'rank_publish_2030',session,now:cutoff,calendarRows:[...rows('2026-11-05'),...rows(session)],
  source:{state:'complete',revisionId:'frozen_revision',session:morning?'2026-11-05':session,sourceAt:morning?'2026-11-05T05:30:00Z':session+'T05:30:00Z',availableAt:cutoff,rightsQualifiedAt:cutoff,qualificationAt:cutoff},
  prior:{snapshotId:'original_snapshot',session:'2026-11-05',cutoff:'2026-11-05T12:30:00Z',sourceAt:'2026-11-05T05:30:00Z'},
  inventory:{observedAt:cutoff,entries:[{id:'only_candidate',jobId:morning?'shared_market_0815':'rank_publish_2030',active:true}]},receipts:[]};
}
test('fixed Taipei cutoffs and half-open five-minute source policy skip catchup',()=>{
 for(const morning of [false,true]){
  const p=fixture(morning),first=plan(p),start=Date.parse(first.cutoff);
  assert.equal(first.status,'fixture_intent_ready');assert.equal(first.cutoff,morning?'2026-11-06T00:15:00.000Z':'2026-11-06T12:30:00.000Z');
  p.now=new Date(start-1).toISOString();assert.equal(plan(p).status,'not_due');
  p.now=new Date(start+299999).toISOString();assert.equal(plan(p).status,morning?'fixture_intent_ready':'qualification_stale_for_new_intent');assert.equal(plan(p).intentId,first.intentId);assert.equal(plan(p).cutoff,first.cutoff);
  p.now=new Date(start+300000).toISOString();assert.equal(plan(p).status,'missed_window');
  p.now=new Date(start+86400000).toISOString();assert.equal(plan(p).status,'missed_window');
 }
});
test('disabled planned schedule agrees with V2 fixed slots without activating timers or changing core guard',()=>{
 assert.deepEqual(STAGING_SCHEDULE,{enabled:false,timeZone:'Asia/Taipei',postClose:'20:30',premarket:'08:15'});
});
test('new rank fixture intent uses half-open120s qualification age while morning has no financial freshness claim',()=>{
 const p=fixture();p.now='2026-11-06T12:31:59.999999Z';assert.equal(plan(p).status,'fixture_intent_ready');
 p.now='2026-11-06T12:32:00Z';assert.equal(plan(p).status,'qualification_stale_for_new_intent');assert.deepEqual(plan(p).retainedPrior,p.prior);
 const morning=fixture(true);morning.now='2026-11-06T00:19:59.999999Z';assert.equal(plan(morning).status,'fixture_intent_ready');
 assert.ok(plan(p).gaps.includes('original_actual_proof_expiry_and_rights_not_bound'));
});
test('08:15 uses previous completed official date and preserves prior original publication metadata',()=>{
 const p=fixture(true),original=structuredClone(p),result=plan(p);
 assert.equal(result.latestCompletedSession,'2026-11-05');assert.equal(result.jobId,'shared_market_0815');assert.deepEqual(result.retainedPrior,p.prior);assert.deepEqual(p,original);
 assert.equal(result.executionAllowed,false);assert.equal(result.chargeAuthorized,false);assert.equal(result.sourceCauseVerified,false);
});
test('official cancelled, missing and cross-market conflicting current day never use weekday inference',()=>{
 for(const change of [
  (p:ScheduleFixture)=>{p.calendarRows=p.calendarRows.filter(row=>row.session_id!==p.session);},
  (p:ScheduleFixture)=>{p.calendarRows=p.calendarRows.filter(row=>!(row.session_id===p.session&&row.market==='TPEX'));},
  (p:ScheduleFixture)=>{p.calendarRows.find(row=>row.session_id===p.session)!.status='cancelled';},
 ]){const p=fixture(true);change(p);assert.equal(plan(p).status,'calendar_unknown_or_conflict');assert.deepEqual(plan(p).retainedPrior,p.prior);}
 const holiday=fixture(true);holiday.calendarRows.filter(row=>row.session_id===holiday.session).forEach(row=>{row.status='cancelled';});assert.equal(plan(holiday).status,'official_holiday');
 const unknown=fixture();unknown.calendarRows=[];assert.equal(plan(unknown).status,'calendar_unknown_or_conflict');
});
test('official weekend trading row pair is accepted without weekday assumptions',()=>{
 const p=fixture();const shift=(s:string)=>s.replaceAll('2026-11-06','2026-11-07');
 const shifted=JSON.parse(shift(JSON.stringify(p))) as ScheduleFixture;assert.equal(plan(shifted).status,'fixture_intent_ready');
});
test('newer known partial or disagreeing completed close cannot fall back to older pair',()=>{
 for(const mode of ['missing','cancelled'] as const){
  const p=fixture(true);p.calendarRows=p.calendarRows.flatMap(row=>{
   if(row.session_id!=='2026-11-05')return [row];
   const older={...row,session_authority_id:'older_'+row.market,session_id:'2026-11-04',open_at:'2026-11-04T01:00:00Z',close_at:'2026-11-04T05:30:00Z',source_timestamp:'2026-11-04T00:00:00Z',collected_at:'2026-11-04T00:01:00Z',recorded_at:'2026-11-04T00:02:00Z'};
   return [older,...(row.market==='TPEX'&&mode==='missing'?[]:[{...row,status:row.market==='TPEX'?'cancelled' as const:row.status}])];
  });p.source.session='2026-11-04';p.source.sourceAt='2026-11-04T05:30:00Z';assert.equal(plan(p).status,'official_close_unavailable');
 }
});
test('as-of exact microsecond heads exclude later calendar receipts and detect only latest conflicts',()=>{
 const p=fixture(),row=p.calendarRows.find(row=>row.session_id===p.session)!;
 p.calendarRows.push({...row,session_authority_id:'future_cancel',status:'cancelled',recorded_at:'2026-11-06T12:30:00.000001Z'});
 assert.equal(plan(p).status,'fixture_intent_ready');p.calendarRows.at(-1)!.recorded_at=row.recorded_at;assert.equal(plan(p).status,'calendar_unknown_or_conflict');
 p.calendarRows.push({...row,session_authority_id:'resolved_head',recorded_at:'2026-11-06T12:29:00Z'});assert.equal(plan(p).status,'fixture_intent_ready');
 const reversed={...p,calendarRows:[...p.calendarRows].reverse()};assert.equal(plan(reversed).requestHash,plan(p).requestHash);
 const tied=fixture();tied.calendarRows.push({...tied.calendarRows[2],session_authority_id:'equivalent_id'});assert.equal(plan(tied).status,'fixture_intent_ready');
 assert.equal(plan({...tied,calendarRows:[...tied.calendarRows].reverse()}).requestHash,plan(tied).requestHash);
});
test('source, rights and qualification arriving after fixed cutoff cannot become eligible during window',()=>{
 for(const field of ['sourceAt','availableAt','rightsQualifiedAt','qualificationAt'] as const){
  const p=fixture();p.now='2026-11-06T12:34:00Z';p.source[field]='2026-11-06T12:30:00.000001Z';
  assert.equal(plan(p).status,'source_incomplete_or_unavailable_at_cutoff');assert.deepEqual(plan(p).retainedPrior,p.prior);
 }
 for(const state of ['incomplete','unknown'] as const){const p=fixture();p.source.state=state;assert.equal(plan(p).status,'source_incomplete_or_unavailable_at_cutoff');}
 const p=fixture(true);p.source.session=p.session;assert.equal(plan(p).status,'source_incomplete_or_unavailable_at_cutoff');
 for(const key of ['rightsQualifiedAt','qualificationAt'] as const){const p=fixture();p.source[key]='2026-11-06T12:29:59.999999Z';assert.equal(plan(p).status,'source_incomplete_or_unavailable_at_cutoff');}
});
test('single schedule inventory rejects duplicate, legacy, Vercel, missing, stale and future observations',()=>{
 for(const change of [
  (p:ScheduleFixture)=>{p.inventory.entries.push({...p.inventory.entries[0],id:'duplicate'});},
  (p:ScheduleFixture)=>{p.inventory.entries.push({id:'other1',jobId:'shared_market_0815',active:true},{id:'other2',jobId:'shared_market_0815',active:true});},
  (p:ScheduleFixture)=>{p.inventory.entries.push({id:'legacy',jobId:'legacy_cycle',active:true});},
  (p:ScheduleFixture)=>{p.inventory.entries.push({id:'vercel',jobId:'vercel_cycle',active:true});},
  (p:ScheduleFixture)=>{p.inventory.entries=[];},
  (p:ScheduleFixture)=>{p.inventory.observedAt='2026-11-06T12:24:59.999999Z';},
  (p:ScheduleFixture)=>{p.inventory.observedAt='2026-11-06T12:30:00.000001Z';},
 ]){const p=fixture();change(p);assert.equal(plan(p).status,'schedule_conflict_or_unknown');}
});
test('completed fixture receipt replays same fixed intent with no executable or charging permission',()=>{
 const p=fixture(),original=plan(p);p.receipts=[{intentId:original.intentId,requestHash:original.requestHash,status:'completed',completedAt:p.now}];p.now='2026-11-06T12:34:59.999999Z';
 const replay=plan(p);assert.equal(replay.status,'fixture_completed_replay');assert.equal(replay.intentId,original.intentId);assert.equal(replay.requestHash,original.requestHash);
 assert.equal(replay.executionAllowed,false);assert.equal(replay.chargeAuthorized,false);assert.ok(replay.gaps.includes('durable_whole_cycle_replay_not_proven'));
 for(const state of ['pending','uncertain'] as const){p.receipts[0].status=state;p.receipts[0].completedAt=null;assert.equal(plan(p).status,'fixture_inflight_or_uncertain');}
});
test('fixture replay revalidates inventory and source; changed admissible payload conflicts',()=>{
 const p=fixture(),first=plan(p);p.receipts=[{intentId:first.intentId,requestHash:first.requestHash,status:'completed',completedAt:p.now}];
 p.source.state='incomplete';assert.equal(plan(p).status,'source_incomplete_or_unavailable_at_cutoff');p.source.state='complete';
 p.source.revisionId='other_revision';assert.equal(plan(p).status,'fixture_receipt_conflict');p.source.revisionId='frozen_revision';
 p.inventory.entries.push({id:'other_schedule',jobId:'legacy_cycle',active:true});assert.equal(plan(p).status,'schedule_conflict_or_unknown');
});
test('strict closed fixture shape rejects private metadata, invalid clocks, forged authority and bounds',()=>{
 for(const change of [
  (p:ScheduleFixture)=>{Object.assign(p,{executionAllowed:true});},
  (p:ScheduleFixture)=>{Object.assign(p.source,{actor:'private'});},
  (p:ScheduleFixture)=>{p.now='2026-02-30T12:30:00Z';},
  (p:ScheduleFixture)=>{p.session='2026-02-30';},
  (p:ScheduleFixture)=>{p.calendarRows[0].provider='tpex';},
  (p:ScheduleFixture)=>{p.calendarRows[0].source_timestamp='2026-11-05T00:02:00Z';},
  (p:ScheduleFixture)=>{p.calendarRows=Array.from({length:65},()=>p.calendarRows[0]);},
  (p:ScheduleFixture)=>{p.policyVersion='caller_policy';},
 ]){const p=fixture();change(p);assert.throws(()=>plan(p),/schedule_fixture_invalid/);}
});
test('no caller activation, actor, adapter or schedule receipt can open runtime facade',()=>{
 assert.deepEqual(scheduleAdmissionBoundary(),{state:'Disabled',activation:'disabled_not_connected',executionAllowed:false,chargeAuthorized:false});
 let calls=0;for(const value of [true,{approved:true},{role:'operator'},{adapter:()=>{calls++;}},{receipt:'completed'},{activation:'enabled'}])assert.throws(()=>scheduleAdmissionBoundary(value),/runtime_overrides_forbidden/);
 assert.equal(calls,0);
});
