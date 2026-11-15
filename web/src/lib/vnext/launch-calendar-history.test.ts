import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseLaunchCalendarHistory, LAUNCH_CALENDAR_DIAGNOSTIC_SCHEMA } from './launch-calendar-history.ts';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const SHA='a'.repeat(64),clock='2026-11-15T01:00:00Z';
/** Deliberately synthetic civil-date observations, NOT official sessions. */
function row(session:string,market:'TWSE'|'TPEX'='TWSE',status='completed',observed='2026-11-14T01:00:00Z'){
 return {market,session,status,openAt:session+'T01:00:00Z',scheduledCloseAt:session+'T05:30:00Z',sourceTimestamp:observed,collectedAt:observed,
  sourceUrl:market==='TWSE'?`https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date=${session.slice(0,4)}0101`
   :`https://www.tpex.org.tw/storage/zh-tw/web/bulletin/trading_date/trading_date_${Number(session.slice(0,4))-1911}.htm`,sourceSha256:SHA,
  sourceRef:`${market.toLowerCase()}-annual-calendar:${session.slice(0,4)}:${session}:${SHA}`};
}
function batch(start=0,observed='2026-11-14T01:00:00Z'){
 const rows=Array.from({length:400},(_,index)=>new Date(Date.UTC(2024,0,1+start+index)).toISOString().slice(0,10))
  .flatMap(session=>[row(session,'TWSE','completed',observed),row(session,'TPEX','completed',observed)]);
 return {sourceCutoff:observed,availableAt:observed,supersedes:null as string|null,rows};
}
function event(n=1){return {eventId:id(n),market:'TWSE',session:'2026-07-10',kind:'cancel',effectiveAt:'2026-07-10T01:00:00Z',
 observedAt:'2026-11-14T01:00:00Z',sourceKnownAt:'2026-11-14T01:00:00Z',recordedAt:'2026-11-14T01:00:01Z',commitKnownAt:'2026-11-14T01:00:02Z',
 sourceRevision:SHA,rightsRevision:SHA,rawSha256:SHA,supersedesEventId:null as string|null};}
const input=(batches:unknown[]=[],events:unknown[]=[],cutoff=clock)=>({schemaVersion:LAUNCH_CALENDAR_DIAGNOSTIC_SCHEMA,cutoff,batches,events});

test('two immutable400-date windows retain600 distinct schedule dates per venue, with NO official520 authority',()=>{
 const first=batch(),second=batch(200,'2026-11-15T00:00:00Z'),result=diagnoseLaunchCalendarHistory(input([first,second]));
 assert.equal(result.counts.TWSE.pastCompletedScheduleRows,600);assert.equal(result.counts.TPEX.scheduleObservedRows,600);
 assert.equal(result.batchCount,2);assert.equal(result.officialCompletedSessions,null);assert.equal(result.officialCoverage,null);
 assert.equal(result.sourceAuthority,false);assert.equal(result.calendarAuthority,false);assert.equal(result.publicationAuthority,false);
 assert.ok(result.gaps.includes('calendar_explicit_cancellation_producer_unavailable'));
 assert.ok(result.gaps.includes('calendar_new_schema_ingestion_and_commit_witness_unavailable'));
 assert.equal(result.gaps.includes('calendar_schedule_observations_below_520'),false,'this is only the explicitly labelled schedule diagnostic');
 assert.ok(Object.isFrozen(result.counts.TWSE));assert.ok(Object.isFrozen(result.batchRevisions));
});
test('Nov15 metadata is unavailable Nov13; a future added batch/event does not change an earlier revision',()=>{
 const before='2026-11-13T13:30:00Z',empty=diagnoseLaunchCalendarHistory(input([],[],before));
 const future=diagnoseLaunchCalendarHistory(input([batch()], [event()],before));
 assert.equal(future.batchCount,0);assert.equal(future.eventCount,0);assert.equal(future.projectionRevision,empty.projectionRevision);
 assert.equal(future.counts.TWSE.scheduleObservedRows,0);
});
test('forward scheduled and annualholiday rows never fill past completed schedule counts or imply ad-hoc cancel',()=>{
 const b={sourceCutoff:clock,availableAt:clock,supersedes:null,rows:[row('2026-11-16','TWSE','scheduled'),row('2026-11-13','TWSE','holiday')]};
 const result=diagnoseLaunchCalendarHistory(input([b]));
 assert.equal(result.counts.TWSE.futureScheduledRows,1);assert.equal(result.counts.TWSE.holidayScheduleRows,1);
 assert.equal(result.counts.TWSE.pastCompletedScheduleRows,0);assert.deepEqual(result.cancellationObservations,[]);
});
test('explicit cancellation and withdrawal stay observed metadata; withdrawal never creates completed day',()=>{
 const original=event(),withdraw={...event(2),kind:'withdrawal',supersedesEventId:id(1),observedAt:clock,sourceKnownAt:clock,recordedAt:clock,commitKnownAt:clock};
 const first=diagnoseLaunchCalendarHistory(input([], [original]));
 assert.equal(first.cancellationObservations[0].state,'cancel_observed');
 const result=diagnoseLaunchCalendarHistory(input([], [original,withdraw]));
 assert.equal(result.cancellationObservations[0].state,'withdrawn');assert.equal(result.counts.TWSE.pastCompletedScheduleRows,0);
 assert.equal(result.officialCompletedSessions,null);assert.ok(result.gaps.includes('calendar_withdrawn_cancellation_requires_reconciliation'));
});
test('conflicting cancellation roots and conflicting unlinked schedule corrections fail closed without latest-wins inference',()=>{
 const result=diagnoseLaunchCalendarHistory(input([], [event(),{...event(2),rawSha256:'b'.repeat(64)}]));
 assert.equal(result.cancellationObservations[0].state,'conflict');assert.equal(result.cancellationObservations[0].eventRevision,null);
 const original={sourceCutoff:clock,availableAt:clock,supersedes:null as string|null,rows:[row('2026-11-13')]};
 const amended={...original,availableAt:'2026-11-15T01:00:01Z',rows:[row('2026-11-13','TWSE','holiday')]};
 const conflict=diagnoseLaunchCalendarHistory(input([original,amended],[],'2026-11-15T01:00:02Z'));
 assert.equal(conflict.counts.TWSE.scheduleObservedRows,0);assert.ok(conflict.gaps.includes('calendar_observation_conflict'));
 const previous=diagnoseLaunchCalendarHistory(input([original])).batchRevisions[0];amended.supersedes=previous;
 const linked=diagnoseLaunchCalendarHistory(input([original,amended],[],'2026-11-15T01:00:02Z'));
 assert.equal(linked.counts.TWSE.holidayScheduleRows,1);assert.equal(linked.counts.TWSE.pastCompletedScheduleRows,0);
});
test('source/rights/commit changes bind immutable revision; microsecond knowledge remains exact',()=>{
 const a=event(),b={...a,rightsRevision:'b'.repeat(64)};
 assert.notEqual(diagnoseLaunchCalendarHistory(input([], [a])).projectionRevision,diagnoseLaunchCalendarHistory(input([], [b])).projectionRevision);
 a.commitKnownAt='2026-11-15T01:00:00.000001Z';assert.equal(diagnoseLaunchCalendarHistory(input([], [a])).eventCount,0);
 assert.equal(diagnoseLaunchCalendarHistory(input([], [a],'2026-11-15T01:00:00.000001Z')).eventCount,1);
});
test('closed shapes, chain holes, unsafe clocks and oversize batches reject without executing caller hooks',()=>{
 let hooks=0;const badKind={toString(){hooks++;return 'cancel';}};
 const sparse=new Array(1),base=event(),exotic:unknown[]=[];
 Object.setPrototypeOf(exotic,{[Symbol.iterator](){hooks++;return [][Symbol.iterator]();}});
 for(const bad of [input([], [{...base,kind:badKind}]),input([], [{...base,supersedesEventId:id(9)}]),input([], [{...base,kind:'withdrawal'}]),
  input([], [{...base,commitKnownAt:'2026-11-13T00:00:00Z'}]),input([], [{...base,extra:true}]),input([], sparse),
  input(Array.from({length:9},()=>batch())),input(exotic),{...input(),priceDates:['2026-07-10']},new Proxy(input(),{})])assert.throws(()=>diagnoseLaunchCalendarHistory(bad),/diagnostic_invalid/u);
 assert.equal(hooks,0);
});
test('mutating caller rows after a diagnostic cannot alter its frozen summary',()=>{
 const b=batch(),result=diagnoseLaunchCalendarHistory(input([b]));b.rows.length=0;
 assert.equal(result.counts.TWSE.scheduleObservedRows,400);assert.equal(result.batchCount,1);
});
