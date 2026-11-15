import {evidenceInstant} from './evidence-clock.ts';
import {LAUNCH_OUTCOME_HORIZONS,LAUNCH_OUTCOME_POLICY,LAUNCH_SIMULATION_COSTS} from './launch-outcomes.ts';

const barriers=['up_first','down_first','order_unknown','price_data_gap','calendar_gap','pending','not_hit'] as const;
const states=['ready','pending','price_data_gap','calendar_gap'] as const;
const executionStatuses=['pending','opening_evidence_gap','unfillable','modeled_fill'] as const;
const unfillableReasons=['suspended','one_price_upper_limit','no_executable_open'] as const;
const windows=LAUNCH_OUTCOME_HORIZONS;
const version='vnext-launch-outcome-public-v1';
type Row=Record<string,unknown>;
type Reference={rankingRunId:string;symbol:string;signalSession:string};
type Barrier={state:typeof barriers[number];session:string|null};
type Horizon={horizon:typeof windows[number];state:typeof states[number];terminalSession:string|null;grossReturnPct:number|null;netReturnPct:number|null;
  benchmarkReturnPct:number|null;marketExcessPct:number|null;netMarketExcessPct:number|null};
type Execution={status:typeof executionStatuses[number];nextSession:string|null;reason:typeof unfillableReasons[number]|null;
  grossBarrier20:Barrier|null;netBarrier20:Barrier|null;horizons:Horizon[]};
type Published=Reference&{schemaVersion:typeof version;policyVersion:typeof LAUNCH_OUTCOME_POLICY};
export type PublicLaunchOutcome={state:'unavailable'}|
  Published&{state:'not_started'|'awaiting_observation';firstRankingRunId:string|null;asOf:null;outcomeRevision:null;research:null;execution:null}|
  Published&{state:'ready';firstRankingRunId:string;asOf:string;outcomeRevision:string;research:{barrier20:Barrier;horizons:Horizon[]};
    execution:Execution;costs:typeof LAUNCH_SIMULATION_COSTS};

function exact(value:unknown,keys:string):value is Row {
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(' ')===keys.split(' ').sort().join(' ');
}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(value);
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/u.test(value);
const isDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(v)&&evidenceInstant(v+'T00:00:00Z')!==null;
const futureDay=(v:unknown,after:string):v is string|null=>v===null||(isDay(v)&&v>after);
const enumValue=<T extends string>(v:unknown,values:readonly T[]):v is T=>typeof v==='string'&&(values as readonly string[]).includes(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const rejected=()=>{throw Error('launch_outcome_public_projection_unavailable');};

function barrier(value:unknown,signalSession:string):Barrier {
  if(!exact(value,'state session')||!enumValue(value.state,barriers)||!futureDay(value.session,signalSession))return rejected();
  const needsDate=!['pending','not_hit'].includes(value.state);
  if(needsDate!==(value.session!==null))return rejected();
  return {state:value.state,session:value.session};
}

function horizons(value:unknown,signalSession:string,includeNet:boolean):Horizon[]{
  if(!Array.isArray(value)||value.length!==windows.length)return rejected();
  return value.map((row,index)=>{
    const horizon=windows[index];
    if(!exact(row,'horizon state terminalSession grossReturnPct netReturnPct benchmarkReturnPct marketExcessPct netMarketExcessPct')||row.horizon!==horizon||
      !enumValue(row.state,states)||!futureDay(row.terminalSession,signalSession))return rejected();
    if(row.state==='ready'){
      if(row.terminalSession===null||!finite(row.grossReturnPct)||(includeNet?!finite(row.netReturnPct):row.netReturnPct!==null))return rejected();
    }else if(row.grossReturnPct!==null||row.netReturnPct!==null)return rejected();
    const {benchmarkReturnPct,marketExcessPct,netMarketExcessPct}=row;
    if(row.state==='ready'&&benchmarkReturnPct!==null){
      if(!finite(benchmarkReturnPct)||!finite(marketExcessPct)||(includeNet?!finite(netMarketExcessPct):netMarketExcessPct!==null))return rejected();
    }else if(benchmarkReturnPct!==null||marketExcessPct!==null||netMarketExcessPct!==null)return rejected();
    return {horizon,state:row.state,terminalSession:row.terminalSession,
      grossReturnPct:row.grossReturnPct as number|null,netReturnPct:row.netReturnPct as number|null,
      benchmarkReturnPct:benchmarkReturnPct as number|null,marketExcessPct:marketExcessPct as number|null,netMarketExcessPct:netMarketExcessPct as number|null};
  });
}

function execution(value:unknown,signalSession:string):Execution{
  if(!exact(value,'status nextSession reason grossBarrier20 netBarrier20 horizons')||
    !enumValue(value.status,executionStatuses)||!futureDay(value.nextSession,signalSession))return rejected();
  const {status,nextSession}=value;
  if(status==='modeled_fill'){
    if(nextSession===null||value.reason!==null)return rejected();
    return {status,nextSession,reason:null,grossBarrier20:barrier(value.grossBarrier20,signalSession),
      netBarrier20:barrier(value.netBarrier20,signalSession),horizons:horizons(value.horizons,signalSession,true)};
  }
  const reason=status==='unfillable'&&enumValue(value.reason,unfillableReasons)?value.reason:null;
  if(value.reason!==reason||(status==='unfillable'&&(!reason||nextSession===null))||
    value.grossBarrier20!==null||value.netBarrier20!==null||!Array.isArray(value.horizons)||value.horizons.length!==0)return rejected();
  return {status,nextSession,reason,grossBarrier20:null,netBarrier20:null,horizons:[]};
}

export function parsePublicLaunchOutcome(value:unknown,ref:Reference):PublicLaunchOutcome {
  if(!exact(value,'schemaVersion policyVersion rankingRunId symbol signalSession state firstRankingRunId asOf outcomeRevision research execution')||
    value.schemaVersion!==version||value.policyVersion!==LAUNCH_OUTCOME_POLICY||
    value.rankingRunId!==ref.rankingRunId||value.symbol!==ref.symbol||value.signalSession!==ref.signalSession)return rejected();
  const published:Published={...ref,schemaVersion:version,policyVersion:LAUNCH_OUTCOME_POLICY};
  if(value.state==='not_started'||value.state==='awaiting_observation'){
    if((value.state==='not_started'?value.firstRankingRunId!==null:!uuid(value.firstRankingRunId))||
      value.asOf!==null||value.outcomeRevision!==null||value.research!==null||value.execution!==null)return rejected();
    return {...published,state:value.state,firstRankingRunId:value.firstRankingRunId as string|null,
      asOf:null,outcomeRevision:null,research:null,execution:null};
  }
  if(value.state!=='ready'||!uuid(value.firstRankingRunId)||typeof value.asOf!=='string'||
    evidenceInstant(value.asOf)===null||!sha(value.outcomeRevision)||!exact(value.research,'barrier20 horizons'))return rejected();
  return {...published,state:'ready',firstRankingRunId:value.firstRankingRunId,asOf:value.asOf,outcomeRevision:value.outcomeRevision,
    costs:LAUNCH_SIMULATION_COSTS,
    research:{barrier20:barrier(value.research.barrier20,ref.signalSession),horizons:horizons(value.research.horizons,ref.signalSession,false)},
    execution:execution(value.execution,ref.signalSession)};
}

type Reader={rpc:(name:string,args:{p_ranking_run_id:string;p_symbol:string})=>PromiseLike<{data:unknown;error:unknown}>};
export async function readLaunchOutcomeProjection(reader:Reader,ref:Reference):Promise<PublicLaunchOutcome>{
  if(!uuid(ref.rankingRunId)||!/^\d{4}$/u.test(ref.symbol)||!isDay(ref.signalSession))return {state:'unavailable'};
  try{
    const result=await reader.rpc('vnext_launch_outcome_public_v1',{p_ranking_run_id:ref.rankingRunId,p_symbol:ref.symbol});
    return result.error||!result.data?{state:'unavailable'}:parsePublicLaunchOutcome(result.data,ref);
  }catch{return {state:'unavailable'};}
}

export async function readPublicLaunchOutcome(ref:Reference):Promise<PublicLaunchOutcome>{
  try{
    const {getSupabaseServerClient}=await import('../supabase-server.ts');
    return await readLaunchOutcomeProjection(getSupabaseServerClient(),ref);
  }catch{return {state:'unavailable'};}
}
