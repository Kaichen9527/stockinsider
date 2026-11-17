import {sha256Canonical} from '../opportunity-v3/canonical.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {POLICY} from './policy.ts';

/** Fixture intent projection only. No runtime client, append authority or route. */
export const EPOCH_FIXTURE_SCHEMA='vnext-candidate-epoch-journal-fixture-v1';
const causes={
 'core.enqueue.admitted':['admitted','researching','admitted'],
 'core.enqueue.deferred':['deferred',null,null],
 'core.exit.target_hit':['exited','exited','target_hit'],
} as const;
type State='researching'|'waiting'|'eligible'|'exited'|null;
export type CandidateEpochEvent={eventId:string;symbol:string;sequence:string;previousEventId:string|null;
 epochId:string|null;epochStartedAt:string|null;kind:'admitted'|'deferred'|'exited';state:State;
 reasonCode:string;causePath:keyof typeof causes;occurredAt:string;recordedAt:string;publicationRevisionId:string|null};
export type CandidateEpochFixtureQuery={symbol:string|null;limit:number;cursor:string|null};
type Epoch={epochId:string;symbol:string;startedAt:string;admissionEventId:string;lastMembershipEventId:string;endedAt:string|null;exitEventId:string|null};
type Row=Record<string,unknown>;
const eventKeys='eventId symbol sequence previousEventId epochId epochStartedAt kind state reasonCode causePath occurredAt recordedAt publicationRevisionId';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const maxSequence=BigInt('9223372036854775807');
const fail=():never=>{throw Error('vnext_candidate_epoch_fixture_invalid');};
const object=(value:unknown):value is Row=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:unknown,keys:string):value is Row=>object(value)&&Object.keys(value).sort().join('|')===keys.split(' ').sort().join('|');
const optionalId=(value:unknown)=>value===null||typeof value==='string'&&uuid.test(value);
const clock=(value:unknown):value is string=>typeof value==='string'&&value.length<=64&&evidenceInstant(value)!==null;
const sequence=(value:unknown):value is string=>typeof value==='string'&&/^[1-9]\d{0,18}$/u.test(value)&&BigInt(value)<=maxSequence;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
const order=(a:CandidateEpochEvent,b:CandidateEpochEvent)=>{
 const left=evidenceInstant(a.recordedAt)!,right=evidenceInstant(b.recordedAt)!;
 return left<right?-1:left>right?1:compare(a.symbol,b.symbol)||(BigInt(a.sequence)<BigInt(b.sequence)?-1:BigInt(a.sequence)>BigInt(b.sequence)?1:0);
};
function parseEvent(value:unknown,cutoff:string):CandidateEpochEvent{
 if(!exact(value,eventKeys)||typeof value.eventId!=='string'||!uuid.test(value.eventId)||typeof value.symbol!=='string'||!/^\d{4}$/u.test(value.symbol)
  ||!sequence(value.sequence)||!optionalId(value.previousEventId)||!optionalId(value.epochId)||!optionalId(value.publicationRevisionId)
  ||!(value.epochStartedAt===null||clock(value.epochStartedAt))||!clock(value.occurredAt)||!clock(value.recordedAt)
  ||!['researching','waiting','eligible','exited',null].includes(value.state as State)||typeof value.causePath!=='string'||!Object.hasOwn(causes,value.causePath)
  ||typeof value.reasonCode!=='string'||value.reasonCode.length>80)return fail();
 const event=value as CandidateEpochEvent,rule=causes[event.causePath];
 if(event.kind!==rule[0]||rule[1]!==null&&event.state!==rule[1]||rule[2]!==null&&event.reasonCode!==rule[2]
  ||evidenceInstant(event.occurredAt)!>evidenceInstant(event.recordedAt)!||evidenceInstant(event.recordedAt)!>evidenceInstant(cutoff)!)return fail();
 if(event.causePath==='core.enqueue.deferred'&&!['eligibility_evidence_missing','unchanged_input','daily_budget','active_capacity','work_in_progress'].includes(event.reasonCode))return fail();
 if(event.causePath==='core.exit.target_hit'&&event.publicationRevisionId===null)return fail();
 if((event.epochId===null)!==(event.epochStartedAt===null))return fail();
 return {eventId:event.eventId,symbol:event.symbol,sequence:event.sequence,previousEventId:event.previousEventId,epochId:event.epochId,epochStartedAt:event.epochStartedAt,
  kind:event.kind,state:event.state,reasonCode:event.reasonCode,causePath:event.causePath,occurredAt:event.occurredAt,recordedAt:event.recordedAt,publicationRevisionId:event.publicationRevisionId};
}
/** Always disabled. No caller adapter, metadata, token or enable option exists. */
export function candidateEpochReadBoundary(...arguments_:unknown[]){
 if(arguments_.length)throw Error('vnext_candidate_epoch_runtime_overrides_forbidden');
 return Object.freeze({state:'Disabled' as const,activation:'disabled_not_connected' as const,readable:false as const,entryAuthority:false as const,sourceCauseVerified:false as const});
}
export function candidateEpochFixturePage(value:unknown,query:CandidateEpochFixtureQuery,readAt:string){
 if(!exact(query,'symbol limit cursor')||!(query.symbol===null||typeof query.symbol==='string'&&/^\d{4}$/u.test(query.symbol))||!Number.isInteger(query.limit)||query.limit<1||query.limit>20||!(query.cursor===null||typeof query.cursor==='string'&&query.cursor.length<=1000))return fail();
 if(!exact(value,'schemaVersion policyVersion cutoff events coverage activation')||value.schemaVersion!==EPOCH_FIXTURE_SCHEMA||value.policyVersion!==POLICY.version
  ||value.activation!=='disabled_not_connected'||!clock(value.cutoff)||!clock(readAt)||evidenceInstant(value.cutoff)!>evidenceInstant(readAt)!
  ||!exact(value.coverage,'complete preActivationHistory')||value.coverage.complete!==false||value.coverage.preActivationHistory!=='unavailable'
  ||!Array.isArray(value.events)||value.events.length>200)return fail();
 const events=value.events.map(event=>parseEvent(event,value.cutoff as string));
 if(Buffer.byteLength(JSON.stringify(events))>256*1024||new Set(events.map(event=>event.eventId)).size!==events.length)return fail();
 const tails=new Map<string,CandidateEpochEvent>(),epochs=new Map<string,Epoch>();
 for(const event of [...events].sort((a,b)=>compare(a.symbol,b.symbol)||(BigInt(a.sequence)<BigInt(b.sequence)?-1:BigInt(a.sequence)>BigInt(b.sequence)?1:0))){
  const prior=tails.get(event.symbol);
  if(BigInt(event.sequence)!==(prior?BigInt(prior.sequence)+BigInt(1):BigInt(1))||event.previousEventId!==(prior?.eventId??null)
   ||prior&&(evidenceInstant(event.occurredAt)!<evidenceInstant(prior.occurredAt)!||evidenceInstant(event.recordedAt)!<evidenceInstant(prior.recordedAt)!))return fail();
  if(event.kind==='admitted'){
   if(prior&&prior.state!==null&&prior.state!=='exited'||event.epochId!==event.eventId||event.epochStartedAt===null||evidenceInstant(event.epochStartedAt)!==evidenceInstant(event.occurredAt)||epochs.has(event.epochId))return fail();
   epochs.set(event.epochId,{epochId:event.epochId,symbol:event.symbol,startedAt:event.epochStartedAt,admissionEventId:event.eventId,lastMembershipEventId:event.eventId,endedAt:null,exitEventId:null});
  }else{
   if(event.epochId!==(prior?.epochId??null)||event.epochStartedAt!==(prior?.epochStartedAt??null))return fail();
   if(event.kind==='deferred'){if(event.state!==(prior?.state??null))return fail();}
   else{
    if(event.state===null||prior?.state==='exited')return fail();
    if(event.epochId!==null){const epoch=epochs.get(event.epochId);if(!epoch||epoch.symbol!==event.symbol||epoch.endedAt!==null)return fail();epoch.lastMembershipEventId=event.eventId;if(event.kind==='exited'){epoch.endedAt=event.occurredAt;epoch.exitEventId=event.eventId;}}
   }
  }
  tails.set(event.symbol,event);
 }
 const ordered=events.sort(order),packetHash=sha256Canonical({schemaVersion:EPOCH_FIXTURE_SCHEMA,policyVersion:POLICY.version,cutoff:value.cutoff,events:ordered,coverage:value.coverage,activation:value.activation});
 const filtersHash=sha256Canonical({symbol:query.symbol,limit:query.limit});
 const filtered=ordered.filter(event=>query.symbol===null||event.symbol===query.symbol);let after=-1;
 if(query.cursor!==null){
  if(!/^[A-Za-z0-9_-]+$/u.test(query.cursor))return fail();let cursor:unknown;
  try{cursor=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));}catch{return fail();}
  if(!exact(cursor,'version packetHash filtersHash after')||cursor.version!==1||cursor.packetHash!==packetHash||cursor.filtersHash!==filtersHash||!exact(cursor.after,'eventId symbol sequence recordedAt'))return fail();
  const tuple=cursor.after;after=filtered.findIndex(event=>event.eventId===tuple.eventId&&event.symbol===tuple.symbol&&event.sequence===tuple.sequence&&event.recordedAt===tuple.recordedAt);if(after<0)return fail();
 }
 const remaining=filtered.slice(after+1),rows=remaining.slice(0,query.limit),tail=rows.at(-1);
 const visibleEpochs=new Set(rows.flatMap(event=>event.epochId===null?[]:[event.epochId]));
 const nextCursor=tail&&remaining.length>rows.length?Buffer.from(JSON.stringify({version:1,packetHash,filtersHash,after:{eventId:tail.eventId,symbol:tail.symbol,sequence:tail.sequence,recordedAt:tail.recordedAt}})).toString('base64url'):null;
 return {schemaVersion:'vnext-candidate-epoch-fixture-page-v1' as const,policyVersion:POLICY.version,scope:'bounded_retained_fixture_intent_only' as const,activation:'disabled_not_connected' as const,
  packetHash,cutoff:value.cutoff,rows,nextCursor,epochs:[...epochs.values()].filter(epoch=>visibleEpochs.has(epoch.epochId)),epochSummaryScope:'retained_fixture_for_visible_epoch_ids' as const,
  coverage:{complete:false as const,preActivationHistory:'unavailable' as const},sourceCauseVerified:false as const,entryAuthority:false as const,
  gaps:['production_mutation_hooks_not_connected','native_journal_acceptance_not_run','pre_activation_history_unavailable','full_candidate_history_not_proven','other_mutation_cause_paths_not_supported',
   ...(events.some(event=>event.epochId===null&&event.kind!=='deferred')?['legacy_membership_epoch_unknown']:[])]};
}
