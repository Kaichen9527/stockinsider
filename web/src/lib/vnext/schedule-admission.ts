import {sha256Canonical} from '../opportunity-v3/canonical.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {POLICY} from './policy.ts';

/** Source candidate policy, not a timer or an execution/charging authority. */
export const SCHEDULE_FIXTURE_SCHEMA='vnext-schedule-admission-fixture-v1';
export const SCHEDULE_CANDIDATE_POLICY='taipei-fixed-cutoff-five-minute-v1';
export type ScheduleJob='rank_publish_2030'|'shared_market_0815';
export type ScheduleCalendarRow={session_authority_id:string;session_id:string;market:'TWSE'|'TPEX';open_at:string;close_at:string;
 status:'completed'|'cancelled';provider:'twse'|'tpex';source_timestamp:string;collected_at:string;source_ref:string;recorded_at:string};
export type SchedulePrior={snapshotId:string;session:string;cutoff:string;sourceAt:string}|null;
export type ScheduleFixture={schemaVersion:typeof SCHEDULE_FIXTURE_SCHEMA;policyVersion:string;jobId:ScheduleJob;session:string;now:string;
 calendarRows:ScheduleCalendarRow[];source:{state:'complete'|'incomplete'|'unknown';revisionId:string|null;session:string|null;sourceAt:string|null;availableAt:string|null;rightsQualifiedAt:string|null;qualificationAt:string|null};
 prior:SchedulePrior;inventory:{observedAt:string;entries:Array<{id:string;jobId:ScheduleJob|'legacy_cycle'|'vercel_cycle';active:boolean}>};
 receipts:Array<{intentId:string;requestHash:string;status:'completed'|'pending'|'uncertain';completedAt:string|null}>};
const fail=():never=>{throw Error('vnext_schedule_fixture_invalid');};
const exact=(value:unknown,keys:string):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(' ')===keys.split(' ').sort().join(' ');
const text=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_:./-]{1,180}$/u.test(value);
const clock=(value:unknown):value is string=>typeof value==='string'&&value.length<=40&&evidenceInstant(value)!==null;
const day=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&clock(value+'T00:00:00Z');
const instant=(value:string)=>evidenceInstant(value)!;
const taipeiDay=(value:string)=>new Date(Number(instant(value)/BigInt(1000))+8*60*60*1000).toISOString().slice(0,10);
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const jobs=['rank_publish_2030','shared_market_0815'] as const;
/** No adapter, actor, flag, credential or metadata can activate this facade. */
export function scheduleAdmissionBoundary(...arguments_:unknown[]){
 if(arguments_.length)throw Error('vnext_schedule_runtime_overrides_forbidden');
 return Object.freeze({state:'Disabled' as const,activation:'disabled_not_connected' as const,executionAllowed:false as const,chargeAuthorized:false as const});
}
/** Bounded, zero-I/O fixture intent only. It never invokes an existing cycle. */
export function scheduleAdmissionFixture(value:unknown){
 if(!exact(value,'schemaVersion policyVersion jobId session now calendarRows source prior inventory receipts')||value.schemaVersion!==SCHEDULE_FIXTURE_SCHEMA||value.policyVersion!==POLICY.version
  ||!jobs.includes(value.jobId as ScheduleJob)||!day(value.session)||!clock(value.now)||!Array.isArray(value.calendarRows)||value.calendarRows.length>64
  ||!exact(value.source,'state revisionId session sourceAt availableAt rightsQualifiedAt qualificationAt')||!['complete','incomplete','unknown'].includes(value.source.state as string)
  ||!(value.source.revisionId===null||text(value.source.revisionId))||!(value.source.session===null||day(value.source.session))
  ||!['sourceAt','availableAt','rightsQualifiedAt','qualificationAt'].every(key=>(value.source as Record<string,unknown>)[key]===null||clock((value.source as Record<string,unknown>)[key]))
  ||!exact(value.inventory,'observedAt entries')||!clock(value.inventory.observedAt)||!Array.isArray(value.inventory.entries)||value.inventory.entries.length>16
  ||!Array.isArray(value.receipts)||value.receipts.length>16)return fail();
 const packet=value as ScheduleFixture;
 const scheduledAt=packet.session+(packet.jobId==='rank_publish_2030'?'T20:30:00+08:00':'T08:15:00+08:00');
 const cutoff=new Date(Number(instant(scheduledAt)/BigInt(1000))).toISOString(),end=instant(cutoff)+BigInt(300_000_000);
 if(packet.prior!==null&&(!exact(packet.prior,'snapshotId session cutoff sourceAt')||!text(packet.prior.snapshotId)||!day(packet.prior.session)||!clock(packet.prior.cutoff)||!clock(packet.prior.sourceAt)
  ||packet.prior.session>packet.session||instant(packet.prior.sourceAt)>instant(packet.prior.cutoff)||instant(packet.prior.cutoff)>instant(cutoff)))return fail();
 const rowIds=new Set<string>();
 for(const row of packet.calendarRows){
  if(!exact(row,'session_authority_id session_id market open_at close_at status provider source_timestamp collected_at source_ref recorded_at')||!text(row.session_authority_id)||rowIds.has(row.session_authority_id)
   ||!day(row.session_id)||row.session_id>packet.session||!['TWSE','TPEX'].includes(row.market)||row.provider!==row.market.toLowerCase()||!['completed','cancelled'].includes(row.status)||!text(row.source_ref)
   ||![row.open_at,row.close_at,row.source_timestamp,row.collected_at,row.recorded_at].every(clock)
   ||instant(row.open_at)>=instant(row.close_at)||taipeiDay(row.open_at)!==row.session_id||taipeiDay(row.close_at)!==row.session_id
   ||instant(row.source_timestamp)>instant(row.collected_at)||instant(row.collected_at)>instant(row.recorded_at))return fail();
  rowIds.add(row.session_authority_id);
 }
 const inventoryIds=new Set<string>();
 for(const entry of packet.inventory.entries){
  if(!exact(entry,'id jobId active')||!text(entry.id)||inventoryIds.has(entry.id)||![...jobs,'legacy_cycle','vercel_cycle'].includes(entry.jobId)||typeof entry.active!=='boolean')return fail();
  inventoryIds.add(entry.id);
 }
 const receiptIds=new Set<string>();
 for(const receipt of packet.receipts){
  if(!exact(receipt,'intentId requestHash status completedAt')||!hash(receipt.intentId)||!hash(receipt.requestHash)||receiptIds.has(receipt.intentId)||!['completed','pending','uncertain'].includes(receipt.status)
   ||!(receipt.completedAt===null||clock(receipt.completedAt))||receipt.status==='completed'&&receipt.completedAt===null
   ||receipt.status!=='completed'&&receipt.completedAt!==null||receipt.completedAt!==null&&instant(receipt.completedAt)>instant(packet.now))return fail();
  receiptIds.add(receipt.intentId);
 }
 // Select immutable as-of heads, including exact-microsecond tied conflicts.
 const known=packet.calendarRows.filter(row=>[row.source_timestamp,row.collected_at,row.recorded_at].every(at=>instant(at)<=instant(cutoff)));
 const heads=new Map<string,ScheduleCalendarRow>(),conflicts=new Set<string>();
 for(const row of [...known].sort((a,b)=>instant(a.recorded_at)<instant(b.recorded_at)?-1:instant(a.recorded_at)>instant(b.recorded_at)?1:a.session_authority_id.localeCompare(b.session_authority_id))){
  const key=row.session_id+row.market,prior=heads.get(key);
  if(prior&&instant(prior.recorded_at)===instant(row.recorded_at)){
   const semantic=(r:ScheduleCalendarRow)=>({...r,session_authority_id:null,open_at:instant(r.open_at).toString(),close_at:instant(r.close_at).toString(),source_timestamp:instant(r.source_timestamp).toString(),collected_at:instant(r.collected_at).toString(),recorded_at:instant(r.recorded_at).toString()});
   if(sha256Canonical(semantic(prior))!==sha256Canonical(semantic(row)))conflicts.add(key);
  }else conflicts.delete(key);
  heads.set(key,row);
 }
 const pair=(session:string)=>[heads.get(session+'TWSE'),heads.get(session+'TPEX')];
 const today=pair(packet.session),completePair=(rows:Array<ScheduleCalendarRow|undefined>)=>rows.every(row=>row?.status==='completed'&&instant(row.close_at)<=instant(cutoff));
 // A known newer partial/disagreeing close cannot silently fall back to an older
 // complete pair. Fully cancelled official dates can be skipped as holidays.
 const closedDays=[...new Set(known.map(row=>row.session_id))].filter(session=>pair(session).some(row=>row&&instant(row.close_at)<=instant(cutoff))).sort().reverse();
 const latestClosedDay=closedDays.find(session=>!pair(session).every(row=>row?.status==='cancelled'))??null;
 const latestCompleted=latestClosedDay!==null&&completePair(pair(latestClosedDay))?latestClosedDay:null;
 const intentId=sha256Canonical({domain:SCHEDULE_FIXTURE_SCHEMA,policy:POLICY.version,schedulePolicy:SCHEDULE_CANDIDATE_POLICY,jobId:packet.jobId,cutoff});
 const requestHash=sha256Canonical({intentId,calendarRows:[...heads.values()].sort((a,b)=>(a.session_id+a.market).localeCompare(b.session_id+b.market)),source:packet.source,prior:packet.prior,
  inventory:{observedAt:packet.inventory.observedAt,entries:[...packet.inventory.entries].sort((a,b)=>a.id.localeCompare(b.id))}});
 const result=(status:string)=>({schemaVersion:SCHEDULE_FIXTURE_SCHEMA,schedulePolicy:SCHEDULE_CANDIDATE_POLICY,scope:'fixture_intent_only' as const,status,jobId:packet.jobId,session:packet.session,
  operation:packet.jobId==='rank_publish_2030'?'publish_qualified_active_pool_ranking' as const:'update_shared_market_only' as const,
  cutoff,windowEnd:new Date(Number(end/BigInt(1000))).toISOString(),intentId,requestHash,latestCompletedSession:latestCompleted,
  retainedPrior:packet.prior===null?null:{...packet.prior},executionAllowed:false as const,chargeAuthorized:false as const,sourceCauseVerified:false as const,activation:'disabled_not_connected' as const,
  gaps:['trusted_timer_and_inventory_not_connected','calendar_source_binding_not_connected','calendar_unrepresented_dates_not_proven','source_rights_qualification_not_verified','original_actual_proof_expiry_and_rights_not_bound','durable_whole_cycle_replay_not_proven','existing_writers_not_connected',
   ...(packet.jobId==='shared_market_0815'?['premarket_advance_official_pair_producer_not_observed']:[])]});
 if(instant(packet.now)<instant(cutoff))return result('not_due');
 if(instant(packet.now)>=end)return result('missed_window');
 const active=packet.inventory.entries.filter(entry=>entry.active);
 if(instant(packet.inventory.observedAt)>instant(cutoff)||instant(cutoff)-instant(packet.inventory.observedAt)>BigInt(300_000_000)
  ||active.some(entry=>entry.jobId==='legacy_cycle'||entry.jobId==='vercel_cycle')||jobs.some(job=>active.filter(entry=>entry.jobId===job).length>1)
  ||active.filter(entry=>entry.jobId===packet.jobId).length!==1)return result('schedule_conflict_or_unknown');
 if(conflicts.size||today.some(row=>!row)||today[0]?.status!==today[1]?.status)return result('calendar_unknown_or_conflict');
 if(today[0]?.status==='cancelled')return result('official_holiday');
 if(packet.jobId==='rank_publish_2030'&&!completePair(today)||latestCompleted===null)return result('official_close_unavailable');
 const source=packet.source;
 if(source.state!=='complete'||source.revisionId===null||source.session!==latestCompleted||['sourceAt','availableAt','rightsQualifiedAt','qualificationAt'].some(key=>{
  const at=source[key as 'sourceAt'];return at===null||instant(at)>instant(cutoff);
 })||source.sourceAt!==null&&source.availableAt!==null&&(instant(source.sourceAt)>instant(source.availableAt)
  ||source.rightsQualifiedAt!==null&&instant(source.availableAt)>instant(source.rightsQualifiedAt)
  ||source.qualificationAt!==null&&instant(source.availableAt)>instant(source.qualificationAt)))return result('source_incomplete_or_unavailable_at_cutoff');
 const receipt=packet.receipts.find(item=>item.intentId===intentId);
 if(receipt&&(receipt.requestHash!==requestHash||receipt.completedAt!==null&&instant(receipt.completedAt)<instant(cutoff)))return result('fixture_receipt_conflict');
 if(receipt)return result(receipt.status==='completed'?'fixture_completed_replay':'fixture_inflight_or_uncertain');
 // New ranking intent only: this observation age never renews or substitutes
 // the original financial/price proof expiresAt/current-rights checks in SQL.
 if(packet.jobId==='rank_publish_2030'&&instant(packet.now)>=instant(source.qualificationAt!)+BigInt(120_000_000))return result('qualification_stale_for_new_intent');
 return result('fixture_intent_ready');
}
