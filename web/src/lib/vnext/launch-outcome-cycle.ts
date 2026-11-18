import {loadTwLaunchOutcomeInput,type TwEntryAuthorityClient,type TwEntryForwardCalendar,type TwOpeningQuote} from '../tw-entry-plan-authority.ts';
import type {VnextIdentity} from './auth.ts';
import {readLaunchHaltCapture} from './launch-halt-capture.ts';
import {readLaunchTwseOpeningLimits} from './launch-twse-limit-capture.ts';
import {bindTwseOpeningLimit,type TwseOpeningLimitReceipt} from './launch-twse-daily-limit.ts';
import {readLaunchTpexOpeningLimits} from './launch-tpex-limit-capture.ts';
import {bindTpexOpeningLimit,type TpexOpeningLimitReceipt} from './launch-tpex-opening-limit.ts';
import {inspectLaunchSuspendedOpening,type LaunchHaltCapture} from './launch-opening-halt.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {evaluateLaunchOutcome,launchOutcomeBenchmarkDays,LAUNCH_OUTCOME_POLICY,type LaunchOutcomeBenchmark,type LaunchOutcomeBenchmarkPoint,type LaunchOutcomeInput} from './launch-outcomes.ts';

type Row=Record<string,unknown>;
type Market='TWSE'|'TPEX';
type SignalRef={rankingRunId:string;symbol:string;market:Market;session:string};
type Anchor=Parameters<typeof loadTwLaunchOutcomeInput>[1];
type Writer=TwEntryAuthorityClient & {rpc:(name:string,args:Row)=>PromiseLike<{data:unknown;error:unknown}>};
const batchLimit=16;

const object=(value:unknown):value is Row=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(value);
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const equalClock=(left:unknown,right:unknown)=>evidenceInstant(left)!==null&&evidenceInstant(left)===evidenceInstant(right);

function signalRef(value:unknown):value is SignalRef {
  return object(value)&&id(value.rankingRunId)&&typeof value.symbol==='string'&&/^\d{4}$/u.test(value.symbol)
    &&(value.market==='TWSE'||value.market==='TPEX')&&typeof value.session==='string'
    &&/^\d{4}-\d{2}-\d{2}$/u.test(value.session)&&evidenceInstant(value.session+'T00:00:00Z')!==null;
}

function batchFrom(value:unknown,asOf:string) {
  if(!object(value)||value.schemaVersion!=='vnext-launch-outcome-batch-v1'||!equalClock(value.asOf,asOf)
    ||!object(value.calendars)||!Array.isArray(value.signals)||value.signals.length>batchLimit
    ||typeof value.available!=='number'||!Number.isSafeInteger(value.available)||value.available<value.signals.length
    ||(!value.signals.length&&value.available!==0)||!value.signals.every(signalRef))throw Error('launch_outcome_batch_unavailable');
  const references:SignalRef[]=value.signals;
  if(new Set(references.map(row=>row.rankingRunId+':'+row.symbol)).size!==references.length)throw Error('launch_outcome_batch_unavailable');
  const calendars=new Map<Market,TwEntryForwardCalendar|null>();
  for(const market of new Set(references.map(row=>row.market))){
    const calendar=value.calendars[market];
    if(calendar===null){calendars.set(market,null);continue;}
    if(!object(calendar)||calendar.schema!=='official-calendar-acquisition-v3.14'||typeof calendar.availableAt!=='string'
      ||!Array.isArray(calendar.calendarSessions)||!calendar.calendarSessions.length||calendar.calendarSessions.length>401
      ||!calendar.calendarSessions.every(object)||evidenceInstant(calendar.availableAt)===null
      ||evidenceInstant(calendar.availableAt)!>evidenceInstant(asOf)!)
      throw Error('launch_outcome_batch_unavailable');
    calendars.set(market,{schema:calendar.schema,availableAt:calendar.availableAt,calendarSessions:calendar.calendarSessions});
  }
  return {references,calendars,available:value.available};
}

function anchorFrom(value:unknown,ref:SignalRef):Anchor {
  if(!object(value)||value.rankingRunId!==ref.rankingRunId||value.symbol!==ref.symbol||value.session!==ref.session||value.market!==ref.market
    ||!id(value.firstRankingRunId)||!id(value.stockId)||!id(value.closeObservationId)||!id(value.calendarAuthorityId)
    ||!hash(value.inputHash)||!hash(value.priceRevision)||!hash(value.calendarRevision)||!hash(value.actionsRevision)
    ||typeof value.rawClose!=='string'||typeof value.cutoff!=='string'||typeof value.publishedAt!=='string')
    throw Error('launch_outcome_anchor_unavailable');
  return {...ref,firstRankingRunId:value.firstRankingRunId,stockId:value.stockId,closeObservationId:value.closeObservationId,
    calendarAuthorityId:value.calendarAuthorityId,inputHash:value.inputHash,priceRevision:value.priceRevision,calendarRevision:value.calendarRevision,
    actionsRevision:value.actionsRevision,rawClose:value.rawClose,cutoff:value.cutoff,publishedAt:value.publishedAt};
}

function replayFrom(value:unknown,ref:SignalRef,asOf:string,revision:string){
  if(!object(value)||value.schemaVersion!=='vnext-launch-outcome-write-v1'||value.rankingRunId!==ref.rankingRunId
    ||value.symbol!==ref.symbol||!equalClock(value.asOf,asOf)||value.policyVersion!==LAUNCH_OUTCOME_POLICY
    ||value.inputSnapshotHash!==revision||!hash(value.snapshotHash)||typeof value.replay!=='boolean')
    throw Error('launch_outcome_write_uncertain');
  return value.replay;
}

function benchmarkPoint(value:unknown):LaunchOutcomeBenchmarkPoint{
  if(!object(value)||typeof value.session!=='string'||typeof value.close!=='string'
    ||(value.open!==null&&typeof value.open!=='string')||typeof value.observedAt!=='string'
    ||typeof value.availableAt!=='string'||!hash(value.revision))throw Error('launch_outcome_market_scope');
  return {session:value.session,close:value.close,open:value.open,observedAt:value.observedAt,
    availableAt:value.availableAt,revision:value.revision};
}

function openingFromReceipts(packet:LaunchOutcomeInput,newest:LaunchHaltCapture|null,previous:unknown):LaunchOutcomeInput['opening']{
  const next=packet.sessions.find(day=>day.status!=='cancelled');
  if(!next||next.status!=='completed'||packet.opening!==null)return packet.opening;
  if(newest){
    try{
      const current=inspectLaunchSuspendedOpening(packet,newest);
      if(current.opening||current.sameDayEvent)return current.opening;
    }catch{return null;}
  }
  if(!object(previous)||!object(previous.opening))return null;
  const {opening}=previous;
  const priorAsOf=evidenceInstant(previous.asOf),knownAt=evidenceInstant(opening.knownAt),cutoff=evidenceInstant(packet.asOf);
  if(priorAsOf===null||knownAt===null||cutoff===null||knownAt>priorAsOf||priorAsOf>=cutoff
    ||opening.status!=='unfillable'||opening.reason!=='suspended'||opening.session!==next.session
    ||typeof opening.knownAt!=='string'||!hash(opening.revision)||opening.rawOpen!==null||opening.priceRevision!==null)return null;
  if(newest){
    const observed=evidenceInstant(newest.observedAt),recorded=evidenceInstant(newest.recordedAt);
    // A later official capture within the original session date can withdraw a
    // previously seen record. A newer day's rolling report can omit old rows.
    if(observed!==null&&recorded!==null&&observed<=recorded&&knownAt<recorded&&recorded<=cutoff
      &&observed>=evidenceInstant(next.openAt)!
      &&new Date(Number(observed/BigInt(1000))+8*60*60*1000).toISOString().slice(0,10)===next.session)return null;
  }
  return {status:'unfillable',reason:'suspended',session:next.session,knownAt:opening.knownAt,
    revision:opening.revision,rawOpen:null,priceRevision:null};
}

async function evaluateWithBenchmark(writer:Writer,signal:Row,packet:LaunchOutcomeInput){
  const dates=launchOutcomeBenchmarkDays(packet);
  if(dates.length){
    try{
      const {data,error}=await writer.rpc('vnext_launch_outcome_benchmark_v1',{...signal,p_as_of:packet.asOf,p_days:dates});
      if(!error&&object(data)&&data.market===packet.signal.market&&Array.isArray(data.points)&&data.points.length<=dates.length){
        const points=data.points.map(benchmarkPoint);
        if(points.every(row=>dates.includes(row.session))){
          const benchmark:LaunchOutcomeBenchmark={market:packet.signal.market,points,
            frozenClose:data.frozenClose===null?null:benchmarkPoint(data.frozenClose)};
          const enriched={...packet,benchmark};
          return {packet:enriched,evaluation:evaluateLaunchOutcome(enriched)};
        }
      }
    }catch{
      // Missing or invalid market data does not change the absolute outcome.
    }
  }
  return {packet,evaluation:evaluateLaunchOutcome(packet)};
}

/** Runs only with the caller's existing owned write lease and canonical post-close cutoff.
 * The RPC chooses frozen signals and applied calendar receipts. No request body
 * can supply a ranking outcome or an official price packet. */
export async function runLaunchOutcomesWithLease(writer:Writer,principal:string,owner:string,asOf:string) {
  const lease={p_principal:principal,p_lease_owner:owner};
  const selected=await writer.rpc('vnext_launch_outcome_batch_v1',{...lease,p_as_of:asOf,p_limit:batchLimit});
  if(selected.error)throw Error('launch_outcome_batch_unavailable');
  const batch=batchFrom(selected.data,asOf);
  let written=0,replayed=0;
  const haltCaptures=new Map<Market,Promise<LaunchHaltCapture|null>>();
  const limitCaptures=new Map<string,Promise<TwseOpeningLimitReceipt|null>>();
  const tpexLimitCaptures=new Map<string,Promise<TpexOpeningLimitReceipt|null>>();
  const deferred:Partial<Record<'official_calendar_unavailable'|'frozen_anchor_unavailable'|'official_data_unavailable'|'write_unconfirmed',number>>={};
  const defer=(reason:keyof typeof deferred)=>{deferred[reason]=(deferred[reason]??0)+1;};
  for(const ref of batch.references){
    const calendar=batch.calendars.get(ref.market);
    if(!calendar){defer('official_calendar_unavailable');continue;}
    const signal={...lease,p_run_id:ref.rankingRunId,p_symbol:ref.symbol};
    let anchor:Anchor,previousSuspension:unknown;
    try{
      const selected=await writer.rpc('vnext_launch_outcome_command_v1',signal);
      if(selected.error)throw Error('launch_outcome_anchor_unavailable');
      anchor=anchorFrom(selected.data,ref);
      previousSuspension=object(selected.data)?selected.data.previousSuspension:null;
    }catch{defer('frozen_anchor_unavailable');continue;}
    let packet:Awaited<ReturnType<typeof loadTwLaunchOutcomeInput>>;
    let evaluation:ReturnType<typeof evaluateLaunchOutcome>;
    try{
      const openingQuotes:TwOpeningQuote[]=[];
      const stock=await loadTwLaunchOutcomeInput(writer,anchor,asOf,calendar,quote=>openingQuotes.push(quote));
      if(stock.sessions.find(day=>day.status!=='cancelled')?.status==='completed'){
        if(!haltCaptures.has(ref.market))haltCaptures.set(ref.market,readLaunchHaltCapture(writer,principal,owner,ref.market,asOf));
        stock.opening=openingFromReceipts(stock,await haltCaptures.get(ref.market)!,previousSuspension);
        const quote=openingQuotes[0];
        if(stock.opening===null&&quote){
          if(ref.market==='TWSE'){
            if(!limitCaptures.has(quote.session))
              limitCaptures.set(quote.session,readLaunchTwseOpeningLimits(writer,principal,owner,quote.session,asOf));
            stock.opening=bindTwseOpeningLimit(stock,quote,await limitCaptures.get(quote.session)!);
          }else{
            if(!tpexLimitCaptures.has(quote.session))
              tpexLimitCaptures.set(quote.session,readLaunchTpexOpeningLimits(writer,principal,owner,quote.session,asOf));
            stock.opening=bindTpexOpeningLimit(stock,quote,await tpexLimitCaptures.get(quote.session)!);
          }
        }
      }
      ({packet,evaluation}=await evaluateWithBenchmark(writer,signal,stock));
    }catch{defer('official_data_unavailable');continue;}
    try{
      const result=await writer.rpc('vnext_launch_outcome_command_v1',{...signal,p_input:packet,p_result:evaluation});
      if(result.error)throw Error('launch_outcome_write_uncertain');
      if(replayFrom(result.data,ref,asOf,evaluation.inputSnapshotHash))replayed++;
      else written++;
    }catch{defer('write_unconfirmed');}
  }
  return {status:'evaluated',asOf,available:batch.available,attempted:batch.references.length,
    backlog:batch.available-batch.references.length,written,replayed,deferred} as const;
}

/** Refresh prior signals on a retained close using the same database-owned cutoff. */
export async function runScheduledLaunchOutcomeCycle(identity:VnextIdentity) {
  const {readLaunchCycleAdmission}=await import('./launch-ranking-command.ts');
  const context=await readLaunchCycleAdmission(identity);
  if(!context.ready||!context.session||!context.cutoff){
    return {status:'deferred',reason:context.reason??'launch_outcome_session_unavailable'} as const;
  }
  const outcome=await runLaunchOutcomeCycle(identity,context.cutoff);
  return {...outcome,session:context.session};
}

/** An epilogue of the existing guarded operator cycle. The ranking receipt
 * stays valid if official outcome inputs or the later lease are unavailable. */
export async function runLaunchOutcomeCycle(identity:VnextIdentity,asOf:string) {
  if(identity.role!=='operator'||!identity.principal)throw Error('launch_outcome_operator_required');
  try{
    const {requireActiveVpsWriter}=await import('../taiwan-data-runtime.ts');
    const writer=await requireActiveVpsWriter();
    if(!writer.ok)return {status:'deferred',reason:'launch_outcome_writer_unavailable'} as const;
    const {acquireProductionWriteLease,releaseProductionWriteLease}=await import('../production-write-lease.ts');
    const lease=await acquireProductionWriteLease(300);
    if(!lease)return {status:'deferred',reason:'launch_outcome_lease_unavailable'} as const;
    try{return await runLaunchOutcomesWithLease(writer.supabase,identity.principal,lease,asOf);}
    finally{await releaseProductionWriteLease(lease);}
  }catch{return {status:'deferred',reason:'launch_outcome_batch_unavailable'} as const;}
}
