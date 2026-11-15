import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
const script=new URL('./launch-calendar-history.mjs',import.meta.url);
const packet={schemaVersion:'launch-calendar-history-diagnostic-v1',cutoff:'2026-11-15T01:00:00Z',batches:[],events:[]};
function run(input,args=[]){return spawnSync(process.execPath,['--experimental-strip-types',script.pathname,...args],{input,encoding:'utf8',maxBuffer:2*1024*1024});}
test('actual CLI calls both observation engines, emits explicit missing producer gaps with no authority',()=>{
 const result=run(JSON.stringify(packet));assert.equal(result.status,0);const receipt=JSON.parse(result.stdout);
 assert.equal(receipt.batchCount,0);assert.equal(receipt.eventCount,0);assert.equal(receipt.officialCompletedSessions,null);
 assert.equal(receipt.calendarAuthority,false);assert.equal(receipt.sourceAuthority,false);assert.equal(receipt.publicationAuthority,false);
 assert.ok(receipt.gaps.includes('calendar_explicit_cancellation_producer_unavailable'));assert.match(receipt.inputSha256,/^[a-f0-9]{64}$/u);
 const sha='a'.repeat(64),session='2026-07-10',at=packet.cutoff;
 const row={market:'TWSE',session,status:'completed',openAt:session+'T01:00:00Z',scheduledCloseAt:session+'T05:30:00Z',
  sourceTimestamp:at,collectedAt:at,sourceUrl:'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date=20260101',sourceSha256:sha,
  sourceRef:`twse-annual-calendar:2026:${session}:${sha}`};
 const event={eventId:'00000000-0000-4000-8000-000000000001',market:'TWSE',session,kind:'cancel',effectiveAt:session+'T01:00:00Z',
  observedAt:at,sourceKnownAt:at,recordedAt:at,commitKnownAt:at,sourceRevision:sha,rightsRevision:sha,rawSha256:sha,supersedesEventId:null};
 const observed=run(JSON.stringify({...packet,batches:[{sourceCutoff:at,availableAt:at,supersedes:null,rows:[row]}],events:[event]}));
 assert.equal(observed.status,0);const diagnostic=JSON.parse(observed.stdout);
 assert.equal(diagnostic.counts.TWSE.pastCompletedScheduleRows,1);assert.equal(diagnostic.cancellationObservations[0].state,'cancel_observed');
 assert.equal(diagnostic.officialCompletedSessions,null);assert.equal(observed.stdout.includes('sourceUrl'),false);
});
test('CLI refuses malformed UTF8, size/schema/URL/path arguments generically without echo',()=>{
 for(const [input,args] of [[Buffer.from([0xc3,0x28]),[]],[' '.repeat(1024*1024+1),[]],[JSON.stringify({...packet,priceDates:['PRIVATE_SENTINEL']}),[]],
  [JSON.stringify(packet),['--url=PRIVATE_SENTINEL']],[JSON.stringify(packet),['--file=PRIVATE_SENTINEL']]]){
  const result=run(input,args);assert.equal(result.status,1);const receipt=JSON.parse(result.stdout);
  assert.equal(receipt.error,'calendar_diagnostic_refused');assert.equal(result.stdout.includes('PRIVATE_SENTINEL'),false);
  assert.equal(receipt.calendarAuthority,false);
 }
});
