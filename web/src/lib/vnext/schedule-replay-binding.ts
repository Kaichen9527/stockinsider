import {sha256Canonical} from '../opportunity-v3/canonical.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {POLICY} from './policy.ts';
import {scheduleAdmissionFixture,type ScheduleFixture} from './schedule-admission.ts';

export const SCHEDULE_REPLAY_FIXTURE_SCHEMA='vnext-schedule-replay-binding-fixture-v1';
type Result={resultHash:string;originalCutoff:string;sourceAt:string;expiresAt:string|null};
type QueueRef={jobRefHash:string;session:string;admissionHash:string;preparedInputHash:string;attempt:0|1;retryOfRefHash:string|null};
export type ScheduleReplayFixture={schemaVersion:typeof SCHEDULE_REPLAY_FIXTURE_SCHEMA;schedule:ScheduleFixture;material:{
 sourceHashes:string[];events:Array<{contentHash:string;eventAt:string;publishedAt:string;availableAt:string}>;
 market:{baselineHash:string;originalInvocationRefHash:string|null;originalRequestHash:string|null};
 ranking:{originalRunRefHash:string;originalRequestHash:string}|null;queue:QueueRef[];
 providers:Array<{invocationRefHash:string;jobRefHash:string;task:'author'|'reviewer';originalRequestHash:string}>};
 observationFixtureOnly:{stableSlotId:string;materialRequestHash:string;state:'completed'|'pending'|'uncertain'|'failed';originalResult:Result|null}|null};
const fail=():never=>{throw Error('vnext_schedule_replay_fixture_invalid');};
const exact=(value:unknown,keys:string):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(' ')===keys.split(' ').sort().join(' ');
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const clock=(value:unknown):value is string=>typeof value==='string'&&value.length<=40&&evidenceInstant(value)!==null;
const at=(value:string)=>evidenceInstant(value)!;
const day=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&clock(value+'T00:00:00Z');
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
const canonicalClock=(value:string)=>at(value).toString();
/** No runtime connection or caller-created enable/adapter path exists. */
export function scheduleReplayBoundary(...arguments_:unknown[]){
 if(arguments_.length)throw Error('vnext_schedule_replay_runtime_overrides_forbidden');
 return Object.freeze({state:'Disabled' as const,executionAllowed:false as const,chargeAuthorized:false as const,providerPostAllowed:false as const});
}
/** Identity intent only. Existing DB ledgers have no such composite receipt. */
export function scheduleReplayBindingFixture(value:unknown){
 if(!exact(value,'schemaVersion schedule material observationFixtureOnly')||value.schemaVersion!==SCHEDULE_REPLAY_FIXTURE_SCHEMA
  ||!exact(value.material,'sourceHashes events market ranking queue providers'))return fail();
 const packet=value as ScheduleReplayFixture,material=packet.material;
 const plan=scheduleAdmissionFixture(packet.schedule);
 // The earlier planner's synthetic receipt is a different identity domain.
 if(packet.schedule.receipts.length!==0)return fail();
 if(!Array.isArray(material.sourceHashes)||material.sourceHashes.length<1||material.sourceHashes.length>200||!material.sourceHashes.every(hash)||new Set(material.sourceHashes).size!==material.sourceHashes.length
  ||!Array.isArray(material.events)||material.events.length>12||!exact(material.market,'baselineHash originalInvocationRefHash originalRequestHash')||!hash(material.market.baselineHash)
  ||!(material.market.originalInvocationRefHash===null||hash(material.market.originalInvocationRefHash))||!(material.market.originalRequestHash===null||hash(material.market.originalRequestHash))
  ||(material.market.originalInvocationRefHash===null)!==(material.market.originalRequestHash===null)
  ||!Array.isArray(material.queue)||material.queue.length>20||!Array.isArray(material.providers)||material.providers.length>40)return fail();
 if(packet.schedule.jobId==='rank_publish_2030'){
  if(!exact(material.ranking,'originalRunRefHash originalRequestHash')||!hash(material.ranking.originalRunRefHash)||!hash(material.ranking.originalRequestHash))return fail();
 }else if(material.ranking!==null||material.queue.length||material.providers.length||material.market.originalRequestHash===null)return fail();
 const eventIds=new Set<string>();
 for(const event of material.events){
  if(!exact(event,'contentHash eventAt publishedAt availableAt')||!hash(event.contentHash)||eventIds.has(event.contentHash)||!material.sourceHashes.includes(event.contentHash)
   ||![event.eventAt,event.publishedAt,event.availableAt].every(clock)||at(event.eventAt)>at(event.publishedAt)||at(event.publishedAt)>at(event.availableAt)||at(event.availableAt)>at(plan.cutoff))return fail();
  eventIds.add(event.contentHash);
 }
 const jobs=new Set<string>();
 for(const ref of material.queue){
  if(!exact(ref,'jobRefHash session admissionHash preparedInputHash attempt retryOfRefHash')||!hash(ref.jobRefHash)||jobs.has(ref.jobRefHash)||!day(ref.session)||ref.session>packet.schedule.session
   ||!hash(ref.admissionHash)||!hash(ref.preparedInputHash)||![0,1].includes(ref.attempt)||!(ref.retryOfRefHash===null||hash(ref.retryOfRefHash))
   ||(ref.attempt===0)!==(ref.retryOfRefHash===null)||ref.retryOfRefHash===ref.jobRefHash)return fail();
  jobs.add(ref.jobRefHash);
 }
 for(const ref of material.queue){
  if(ref.retryOfRefHash===null)continue;
  const original=material.queue.find(item=>item.jobRefHash===ref.retryOfRefHash);
  if(original&&(original.attempt!==0||original.admissionHash!==ref.admissionHash||original.session>ref.session))return fail();
 }
 const invocations=new Set<string>(),tasks=new Set<string>();
 for(const ref of material.providers){
  if(!exact(ref,'invocationRefHash jobRefHash task originalRequestHash')||!hash(ref.invocationRefHash)||invocations.has(ref.invocationRefHash)||!jobs.has(ref.jobRefHash)
   ||!['author','reviewer'].includes(ref.task)||!hash(ref.originalRequestHash)||tasks.has(ref.jobRefHash+ref.task))return fail();
  invocations.add(ref.invocationRefHash);tasks.add(ref.jobRefHash+ref.task);
 }
 const observation=packet.observationFixtureOnly;
 if(observation!==null){
  if(!exact(observation,'stableSlotId materialRequestHash state originalResult')||!hash(observation.stableSlotId)||!hash(observation.materialRequestHash)||!['completed','pending','uncertain','failed'].includes(observation.state))return fail();
  const result=observation.originalResult;
  if(observation.state==='completed'){
   if(!exact(result,'resultHash originalCutoff sourceAt expiresAt')||!hash(result.resultHash)||!clock(result.originalCutoff)||!clock(result.sourceAt)||!(result.expiresAt===null||clock(result.expiresAt))
    ||at(result.sourceAt)>at(result.originalCutoff)||at(result.originalCutoff)>at(plan.cutoff)||result.expiresAt!==null&&at(result.expiresAt)<at(result.sourceAt))return fail();
  }else if(result!==null)return fail();
 }
 // These are already fixture-validated rows; select the same exact as-of heads.
 // Calendar revision clocks remain causal version identity, not new-charge data.
 const heads=new Map<string,ScheduleFixture['calendarRows'][number]>();
 const known=packet.schedule.calendarRows.filter(row=>[row.source_timestamp,row.collected_at,row.recorded_at].every(clock=>at(clock)<=at(plan.cutoff)));
 for(const row of known.sort((a,b)=>at(a.recorded_at)<at(b.recorded_at)?-1:at(a.recorded_at)>at(b.recorded_at)?1:a.session_authority_id.localeCompare(b.session_authority_id)))heads.set(row.session_id+row.market,row);
 const calendarRevisionHash=sha256Canonical([...heads.values()].sort((a,b)=>order(a.session_id+a.market,b.session_id+b.market)).map(row=>({...row,
  open_at:canonicalClock(row.open_at),close_at:canonicalClock(row.close_at),source_timestamp:canonicalClock(row.source_timestamp),collected_at:canonicalClock(row.collected_at),recorded_at:canonicalClock(row.recorded_at)})));
 const materialRequestHash=sha256Canonical({domain:SCHEDULE_REPLAY_FIXTURE_SCHEMA,policyVersion:POLICY.version,stableSlotId:plan.intentId,officialSession:packet.schedule.session,cutoff:plan.cutoff,calendarRevisionHash,
  sourceSession:packet.schedule.source.session,sourceRevision:packet.schedule.source.revisionId,sourceAt:packet.schedule.source.sourceAt===null?null:canonicalClock(packet.schedule.source.sourceAt),
  sourceHashes:[...material.sourceHashes].sort(),events:material.events.map(({contentHash,eventAt,publishedAt})=>({contentHash,eventAt:canonicalClock(eventAt),publishedAt:canonicalClock(publishedAt)})).sort((a,b)=>order(a.contentHash,b.contentHash)),
  market:material.market,ranking:material.ranking,queue:[...material.queue].sort((a,b)=>order(a.jobRefHash,b.jobRefHash)),providers:[...material.providers].sort((a,b)=>order(a.invocationRefHash,b.invocationRefHash))});
 const result=(status:string,originalResult:Result|null=null)=>({schemaVersion:SCHEDULE_REPLAY_FIXTURE_SCHEMA,scope:'anonymous_fixture_identity_only' as const,status,stableSlotId:plan.intentId,materialRequestHash,calendarRevisionHash,
  originalResult:originalResult===null?null:{...originalResult},retainedResultExpired:originalResult?.expiresAt===null||originalResult===null?null:at(originalResult.expiresAt)<=at(packet.schedule.now),
  executionAllowed:false as const,chargeAuthorized:false as const,providerPostAllowed:false as const,sourceCauseVerified:false as const,wholeEntryAuthorityBound:false as const,
  gaps:['whole_entry_durable_authority_not_bound','original_stage_receipts_not_read_or_verified','current_rights_and_actual_proof_expiry_not_bound','synthetic_observation_not_existing_db_receipt',
   ...(material.queue.some(ref=>ref.retryOfRefHash!==null&&!jobs.has(ref.retryOfRefHash))?['retry_reference_not_resolved_in_fixture']:[])]});
 // Current calendar/source/inventory refusals precede fixture replay, but a
 // completed result can be redisplayed after the NEW-intent120s age expires.
 if(!['fixture_intent_ready','qualification_stale_for_new_intent'].includes(plan.status))return result('planner_refusal:'+plan.status);
 if(observation){
  if(observation.stableSlotId!==plan.intentId||observation.materialRequestHash!==materialRequestHash)return result('fixture_identity_conflict');
  if(observation.state==='completed')return result('fixture_completed_replay',observation.originalResult);
  return result(observation.state==='failed'?'fixture_failed_no_retry':'fixture_'+observation.state+'_no_repost');
 }
 if(plan.status==='qualification_stale_for_new_intent')return result('planner_refusal:'+plan.status);
 return result('binding_only_whole_entry_authority_missing');
}
