/** Unverified diagnostic observations. No caller JSON grants calendar rights,
 * producer provenance, completed-session authority or selector admission. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { evidenceInstant, compareEvidenceClocks } from './evidence-clock.ts';

type Row = Record<string, unknown>;
const SHA = /^[a-f0-9]{64}$/u, UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const market = (value: unknown): value is 'TWSE'|'TPEX' => value === 'TWSE' || value === 'TPEX';
function fail(): never { throw Error('launch_calendar_diagnostic_invalid'); }
function object(value: unknown, keys: string): asserts value is Row {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.split(' ').length || !keys.split(' ').every(key =>
    Object.hasOwn(descriptors, key) && Object.hasOwn(descriptors[key], 'value') && descriptors[key].enumerable)) fail();
}
function array(value: unknown, maximum: number): asserts value is unknown[] {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length > maximum
    || Reflect.ownKeys(value).length !== value.length + 1) fail();
  for (let i=0;i<value.length;i++) {
    const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
    if (!descriptor || !Object.hasOwn(descriptor,'value') || !descriptor.enumerable) fail();
  }
}
function clock(value: unknown): asserts value is string { if (evidenceInstant(value) === null) fail(); }
function day(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
    || !Number.isFinite(Date.parse(value+'T00:00:00Z')) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) fail();
}
function canonical(value: unknown): string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Row)[key])).join(',')+'}';
  const encoded=JSON.stringify(value);if(encoded===undefined)fail();return encoded;
}
function hash(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function max(...values: string[]) { return values.reduce((a,b)=>compareEvidenceClocks(a,b)>=0?a:b); }
const known=(value:string,cutoff:string)=>compareEvidenceClocks(value,cutoff)<=0;
const civil=(value:string)=>new Date(Number(evidenceInstant(value)!/BigInt(1000))+28800000).toISOString().slice(0,10);
type Schedule = { market:'TWSE'|'TPEX';session:string;status:'completed'|'holiday'|'scheduled';openAt:string;scheduledCloseAt:string;
  sourceTimestamp:string;collectedAt:string;sourceUrl:string;sourceSha256:string;sourceRef:string };
type Batch = { revision:string;sourceCutoff:string;availableAt:string;supersedes:string|null;rows:Schedule[] };
type Event = { eventId:string;market:'TWSE'|'TPEX';session:string;kind:'cancel'|'withdrawal';effectiveAt:string;
  observedAt:string;sourceKnownAt:string;recordedAt:string;commitKnownAt:string;sourceRevision:string;rightsRevision:string;
  rawSha256:string;supersedesEventId:string|null;revision:string;availableAt:string };
export const LAUNCH_CALENDAR_DIAGNOSTIC_SCHEMA='launch-calendar-history-diagnostic-v1';

/** Accumulate immutable batches instead of clipping the old400-date window.
 * Every input is UNVERIFIED protocol metadata. Future batches/rows never enter
 * an earlier as-of projection; scheduled/holiday rows cannot fill a520 floor. */
export function diagnoseLaunchCalendarHistory(input: unknown) {
  object(input,'schemaVersion cutoff batches events');
  if(input.schemaVersion!==LAUNCH_CALENDAR_DIAGNOSTIC_SCHEMA)fail();
  clock(input.cutoff);array(input.batches,8);array(input.events,256);
  const cutoff=input.cutoff,batches:Batch[]=[],events:Event[]=[],batchIds=new Set<string>(),eventIds=new Set<string>();
  for(const value of input.batches){
    object(value,'sourceCutoff availableAt supersedes rows');clock(value.sourceCutoff);clock(value.availableAt);
    if(compareEvidenceClocks(value.sourceCutoff,value.availableAt)>0 || !(value.supersedes===null || typeof value.supersedes==='string'&&SHA.test(value.supersedes)))fail();
    array(value.rows,1200);const rows:Schedule[]=[],identities=new Set<string>();
    for(const item of value.rows){
      object(item,'market session status openAt scheduledCloseAt sourceTimestamp collectedAt sourceUrl sourceSha256 sourceRef');
      if(!market(item.market)||typeof item.status!=='string'||!['completed','holiday','scheduled'].includes(item.status))fail();
      day(item.session);clock(item.openAt);clock(item.scheduledCloseAt);clock(item.sourceTimestamp);clock(item.collectedAt);
      if(civil(item.openAt)!==item.session || civil(item.scheduledCloseAt)!==item.session
        || compareEvidenceClocks(item.openAt,item.scheduledCloseAt)>=0 || compareEvidenceClocks(item.sourceTimestamp,item.collectedAt)>0
        || compareEvidenceClocks(item.collectedAt,value.availableAt)>0 || typeof item.sourceSha256!=='string'||!SHA.test(item.sourceSha256))fail();
      const sourceUrl=item.market==='TWSE'?`https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date=${item.session.slice(0,4)}0101`
        :`https://www.tpex.org.tw/storage/zh-tw/web/bulletin/trading_date/trading_date_${Number(item.session.slice(0,4))-1911}.htm`;
      if(item.sourceUrl!==sourceUrl || item.sourceRef!==`${item.market.toLowerCase()}-annual-calendar:${item.session.slice(0,4)}:${item.session}:${item.sourceSha256}`
        || item.status==='completed'&&compareEvidenceClocks(item.scheduledCloseAt,value.sourceCutoff)>0
        || item.status==='scheduled'&&compareEvidenceClocks(item.scheduledCloseAt,value.sourceCutoff)<=0)fail();
      const key=item.market+':'+item.session;if(identities.has(key))fail();identities.add(key);
      rows.push({...item} as Schedule);
    }
    rows.sort((a,b)=>(a.market+':'+a.session).localeCompare(b.market+':'+b.session));
    const revision=hash(['unverified-annual-calendar-batch-v1',value.sourceCutoff,value.availableAt,value.supersedes,rows]);
    if(batchIds.has(revision))fail();batchIds.add(revision);
    batches.push({revision,sourceCutoff:value.sourceCutoff,availableAt:value.availableAt,supersedes:value.supersedes,rows});
  }
  const byBatch=new Map(batches.map(batch=>[batch.revision,batch]));
  for(const batch of batches)if(batch.supersedes!==null){
    const previous=byBatch.get(batch.supersedes);
    if(!previous || compareEvidenceClocks(previous.availableAt,batch.availableAt)>=0)fail();
  }
  for(const value of input.events){
    object(value,'eventId market session kind effectiveAt observedAt sourceKnownAt recordedAt commitKnownAt sourceRevision rightsRevision rawSha256 supersedesEventId');
    if(typeof value.eventId!=='string'||!UUID.test(value.eventId)||eventIds.has(value.eventId)||!market(value.market)
      || typeof value.kind!=='string'||!['cancel','withdrawal'].includes(value.kind))fail();
    day(value.session);clock(value.effectiveAt);clock(value.observedAt);clock(value.sourceKnownAt);clock(value.recordedAt);clock(value.commitKnownAt);
    if(civil(value.effectiveAt)!==value.session || compareEvidenceClocks(value.observedAt,value.recordedAt)>0
      || compareEvidenceClocks(value.sourceKnownAt,value.recordedAt)>0 || compareEvidenceClocks(value.recordedAt,value.commitKnownAt)>0
      || !['sourceRevision','rightsRevision','rawSha256'].every(key=>typeof value[key]==='string'&&SHA.test(value[key]))
      || !(value.supersedesEventId===null || typeof value.supersedesEventId==='string'&&UUID.test(value.supersedesEventId))
      || value.kind==='withdrawal'&&value.supersedesEventId===null)fail();
    eventIds.add(value.eventId);
    const revision=hash(['unverified-cancellation-event-v1',Object.keys(value).sort().map(key=>[key,value[key]])]);
    events.push({...value,revision,availableAt:max(value.observedAt,value.sourceKnownAt,value.recordedAt,value.commitKnownAt)} as Event);
  }
  const byEvent=new Map(events.map(event=>[event.eventId,event]));
  for(const event of events)if(event.supersedesEventId!==null){
    const previous=byEvent.get(event.supersedesEventId);
    if(!previous || previous.market!==event.market || previous.session!==event.session
      || compareEvidenceClocks(previous.availableAt,event.availableAt)>=0)fail();
  }
  const eligibleBatches=batches.filter(batch=>known(batch.availableAt,cutoff));
  // Revisions replace only their own row identities. Rows outside a later
  // trimmed batch remain retained rather than disappearing from history.
  const schedules=new Map<string,Array<{batch:Batch;row:Schedule}>>();
  for(const batch of eligibleBatches)for(const row of batch.rows){
    if(!known(row.collectedAt,cutoff)||!known(row.sourceTimestamp,cutoff))continue;
    const key=row.market+':'+row.session;schedules.set(key,[...(schedules.get(key)||[]),{batch,row}]);
  }
  const counts={TWSE:{scheduleObservedRows:0,pastCompletedScheduleRows:0,holidayScheduleRows:0,futureScheduledRows:0},
    TPEX:{scheduleObservedRows:0,pastCompletedScheduleRows:0,holidayScheduleRows:0,futureScheduledRows:0}};
  let conflicts=0;
  for(const values of schedules.values()){
    values.sort((a,b)=>compareEvidenceClocks(b.batch.availableAt,a.batch.availableAt)||a.batch.revision.localeCompare(b.batch.revision));
    const top=values[0],tied=values.filter(value=>compareEvidenceClocks(value.batch.availableAt,top.batch.availableAt)===0);
    const descends=(later:Batch,earlier:Batch)=>{
      let parent=later.supersedes;
      while(parent!==null){if(parent===earlier.revision)return true;parent=byBatch.get(parent)!.supersedes;}
      return false;
    };
    const meaning=(row:Schedule)=>[row.status,row.openAt,row.scheduledCloseAt];
    if(tied.some(value=>hash(value.row)!==hash(top.row))||values.some(value=>
      hash(meaning(value.row))!==hash(meaning(top.row))&&!descends(top.batch,value.batch))){conflicts++;continue;}
    const count=counts[top.row.market];count.scheduleObservedRows++;
    if(top.row.status==='scheduled'){count.futureScheduledRows++;continue;}
    if(top.row.session>civil(cutoff)||!known(top.row.scheduledCloseAt,cutoff))continue;
    if(top.row.status==='holiday')count.holidayScheduleRows++;else count.pastCompletedScheduleRows++;
  }
  const eligibleEvents=events.filter(event=>known(event.availableAt,cutoff));
  const groups=new Map<string,Event[]>();
  for(const event of eligibleEvents){const key=event.market+':'+event.session;groups.set(key,[...(groups.get(key)||[]),event]);}
  const cancellationObservations=[...groups.values()].map(values=>{
    const superseded=new Set(values.map(event=>event.supersedesEventId)),heads=values.filter(event=>!superseded.has(event.eventId));
    const head=heads.length===1?heads[0]:null;
    return Object.freeze({market:values[0].market,session:values[0].session,state:head===null?'conflict' as const:head.kind==='withdrawal'?'withdrawn' as const:'cancel_observed' as const,
      eventRevision:head?.revision??null,availableAt:max(...values.map(event=>event.availableAt))});
  }).sort((a,b)=>(a.market+':'+a.session).localeCompare(b.market+':'+b.session));
  const projectionRevision=hash(['unverified-calendar-history-projection-v1',cutoff,
    eligibleBatches.map(batch=>batch.revision).sort(),eligibleEvents.map(event=>event.revision).sort()]);
  const gaps=['calendar_raw_acquisition_receipt_bridge_unavailable','calendar_explicit_cancellation_producer_unavailable',
    'calendar_cancellation_rights_not_verified','calendar_new_schema_ingestion_and_commit_witness_unavailable'];
  if(Object.values(counts).some(count=>count.pastCompletedScheduleRows<520))gaps.push('calendar_schedule_observations_below_520');
  if(conflicts||cancellationObservations.some(value=>value.state==='conflict'))gaps.push('calendar_observation_conflict');
  if(cancellationObservations.some(value=>value.state==='withdrawn'))gaps.push('calendar_withdrawn_cancellation_requires_reconciliation');
  return Object.freeze({schemaVersion:LAUNCH_CALENDAR_DIAGNOSTIC_SCHEMA,cutoff,projectionRevision,
    batchCount:eligibleBatches.length,eventCount:eligibleEvents.length,requiredSessions:520,counts:Object.freeze({TWSE:Object.freeze(counts.TWSE),TPEX:Object.freeze(counts.TPEX)}),
    batchRevisions:Object.freeze(eligibleBatches.map(batch=>batch.revision).sort()),cancellationObservations:Object.freeze(cancellationObservations),
    officialCompletedSessions:null,officialCoverage:null,sourceAuthority:false,calendarAuthority:false,publicationAuthority:false,gaps:Object.freeze(gaps)});
}
