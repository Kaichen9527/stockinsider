/** Synthetic existing cache transport; no acquisition or publication proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadTwEntryHistoricalPriceAuthority,loadTwEntryPlanAuthority} from './tw-entry-plan-authority.ts';
import {historicalAuthorityFixture} from './vnext/cached-authority-fixture.mjs';
const {fixture,mockClient}=historicalAuthorityFixture();
const prices='opportunity_price_observations_v3';
test('actual historical reader selects a distinct microsecond correction and retains immutable raw predecessors',async()=>{
 const {data,request}=fixture();const old=data[prices].at(-1)!;
 old.recorded_at='2026-09-24T08:10:00.123001Z';
 const corrected={...old,observation_id:'00000000-0000-4000-8000-000000009991',recorded_at:'2026-09-24T08:10:00.123002Z',raw_close:101};
 data[prices].push(corrected);const frozen=structuredClone(data);
 const result=await loadTwEntryHistoricalPriceAuthority(mockClient(data).client,request);
 assert.deepEqual(result.missingData,[]);assert.equal(result.bars.at(-1)?.rawClose,101);
 assert.equal(result.bars.at(-1)?.observationId,corrected.observation_id);assert.deepEqual(data,frozen);
});
test('actual historical reader rejects a submillisecond inverted source acquisition chain',async()=>{
 const {data,request}=fixture();const row=data[prices].at(-1)!;
 row.source_timestamp='2026-09-24T08:10:00.123002Z';row.collected_at='2026-09-24T08:10:00.123001Z';row.recorded_at='2026-09-24T08:10:00.123003Z';
 const result=await loadTwEntryHistoricalPriceAuthority(mockClient(data).client,request);
 assert.deepEqual(result.missingData,['raw_price_authority_invalid']);assert.deepEqual(result.bars,[]);
});
test('actual historical reader preserves the exact latest action availability clock',async()=>{
 const {data,request}=fixture();data.opportunity_corporate_action_feed_evidence_v3[0].recorded_at='2026-09-24T10:00:00.123456Z';
 const result=await loadTwEntryHistoricalPriceAuthority(mockClient(data).client,request);
 assert.deepEqual(result.missingData,[]);assert.equal(result.availableAt,'2026-09-24T10:00:00.123456Z');
 assert.ok(result.bars.every(bar=>bar.availableAt===result.availableAt));
});
test('actual historical reader selects the latest microsecond action correction with the original hash protocol',async()=>{
 const {data,request}=fixture(true);const old=data.opportunity_corporate_action_snapshots_v3.find(row=>row.declared_event_count===1)!;
 old.recorded_at='2026-09-24T08:00:00.123001Z';
 const snapshot={...old,snapshot_id:'00000000-0000-4000-8000-000000009992',recorded_at:'2026-09-24T08:00:00.123002Z'};
 const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const feeds=data.opportunity_corporate_action_feed_evidence_v3.filter(row=>row.snapshot_id===old.snapshot_id).map(row=>({...row,snapshot_id:snapshot.snapshot_id}));
 const event={...data.opportunity_corporate_action_events_v3[0],snapshot_id:snapshot.snapshot_id,post_action_reference_price:80,daily_adjustment_factor:.4};
 event.source_row_ref=hash(['corporate-action-source-row-v3.1','TWSE',snapshot.session_id,event.symbol,event.event_kind,event.pre_action_reference_price,event.post_action_reference_price,event.feed_identity]);
 snapshot.dataset_hash=hash(['corporate-action-snapshot-v3.1','TWSE',snapshot.session_id,snapshot.session_authority_id,snapshot.corporate_action_version,snapshot.provider,snapshot.collected_at,
  feeds.map(row=>[row.feed_identity,row.response_byte_count,row.response_sha256,row.parsed_row_count]),[[event.symbol,event.event_kind,event.pre_action_reference_price,event.post_action_reference_price,event.feed_identity,event.source_row_ref]]]);
 data.opportunity_corporate_action_snapshots_v3.push(snapshot);data.opportunity_corporate_action_feed_evidence_v3.push(...feeds);data.opportunity_corporate_action_events_v3.push(event);
 const frozen=structuredClone(data),result=await loadTwEntryHistoricalPriceAuthority(mockClient(data).client,request);
 assert.deepEqual(result.missingData,[]);assert.equal(result.bars[0].close,80);assert.deepEqual(data,frozen);
});
test('the same instant expressed with another offset remains a true conflicting raw correction',async()=>{
 const {data,request}=fixture();const old=data[prices].at(-1)!;old.recorded_at='2026-09-24T08:10:00.123001Z';
 data[prices].push({...old,observation_id:'00000000-0000-4000-8000-000000009993',recorded_at:'2026-09-24T16:10:00.123001+08:00',raw_close:101});
 const result=await loadTwEntryHistoricalPriceAuthority(mockClient(data).client,request);
 assert.deepEqual(result.missingData,['entry_authority_conflict']);assert.deepEqual(result.bars,[]);
});
test('cached transport rows cannot hide cutoff plus one microsecond in calendar, raw, snapshot, feed or event clocks',async()=>{
 for(const [table,expected] of [
  ['tw_trading_sessions_v3','official_calendar_authority_invalid'],[prices,'raw_price_authority_invalid'],
  ['opportunity_corporate_action_snapshots_v3','corporate_action_authority_invalid'],
  ['opportunity_corporate_action_feed_evidence_v3','corporate_action_evidence_incomplete'],
  ['opportunity_corporate_action_events_v3','corporate_action_event_invalid'],
 ] as const){
  const {data,request}=fixture(true);data[table][0].recorded_at='2026-09-24T12:00:00.000001Z';
  // The synthetic transport deliberately truncates its filter to milliseconds;
  // the actual reader must validate returned immutable rows independently.
  const result=await loadTwEntryHistoricalPriceAuthority(mockClient(data).client,request);
  assert.deepEqual(result.missingData,[expected],table);assert.deepEqual(result.bars,[]);
 }
});
test('raw source cannot precede official close by one microsecond; exact close remains valid',async()=>{
 for(const accepted of [false,true]){
  const {data,request}=fixture();const calendar=data.tw_trading_sessions_v3.at(-1)!;
  calendar.close_at='2026-09-24T05:30:00.123002Z';data[prices].at(-1)!.source_timestamp=accepted?'2026-09-24T05:30:00.123002Z':'2026-09-24T05:30:00.123001Z';
  const result=await loadTwEntryHistoricalPriceAuthority(mockClient(data).client,request);
  assert.deepEqual(result.missingData,accepted?[]:['raw_price_authority_invalid']);
 }
});
test('existing forward calendar helper rejects submillisecond future acquisition and inverted publication',async()=>{
 for(const acquisition of [true,false]){
  const {data,request}=fixture();const forward=request.forwardCalendar!;
  if(acquisition)forward.availableAt='2026-09-24T12:00:00.000001Z';
  else{forward.calendarSessions[0].collectedAt='2026-09-24T07:00:00.123001Z';forward.calendarSessions[0].sourceTimestamp='2026-09-24T07:00:00.123002Z';}
  const result=await loadTwEntryPlanAuthority(mockClient(data).client,request);
  assert.deepEqual(result.missingData,[acquisition?'official_next_session_missing':'official_next_calendar_invalid']);
 }
});
test('invalid latest price correction cannot revive a valid predecessor or mutate retained raw data',async()=>{
 const {data,request}=fixture();const old=data[prices].at(-1)!;old.recorded_at='2026-09-24T08:10:00.123001Z';
 data[prices].push({...old,observation_id:'00000000-0000-4000-8000-000000009994',recorded_at:'2026-09-24T08:10:00.123002Z',raw_close:-1});
 const frozen=structuredClone(data),result=await loadTwEntryHistoricalPriceAuthority(mockClient(data).client,request);
 assert.deepEqual(result.missingData,['adjusted_price_evidence_invalid']);assert.deepEqual(result.bars,[]);assert.equal(result.priceBasis,null);assert.deepEqual(data,frozen);
});
test('invalid calendar dates in source clocks are refused instead of normalized into later valid dates',async()=>{
 const {data,request}=fixture();request.cutoff='2026-10-02T12:00:00Z';
 const row=data[prices].at(-1)!;row.collected_at='2026-09-31T08:10:00Z';row.recorded_at='2026-09-31T08:10:00Z';
 const result=await loadTwEntryHistoricalPriceAuthority(mockClient(data).client,request);
 assert.deepEqual(result.missingData,['raw_price_authority_invalid']);assert.deepEqual(result.bars,[]);
});
