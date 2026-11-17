import {evidenceInstant} from './evidence-clock.ts';

const version='vnext-launch-outcome-cohorts-v1';
const openingKeys=['filled','unfillable','pending','evidenceGap','waitingObservation'] as const;
const barrierKeys=['upFirst','downFirst','orderUnknown','notHit','pending','waitingObservation','dataGap'] as const;
const horizonKeys=['ready','pending','waitingObservation','dataGap'] as const;
const windows=[20,60,120] as const;
type Row=Record<string,unknown>;
type Opening=Record<typeof openingKeys[number],number>;
type Barrier=Record<typeof barrierKeys[number],number>;
type Horizon=Record<typeof horizonKeys[number],number>&{days:typeof windows[number];withBenchmark:number;meanReturnPct:number|null;meanExcessPct:number|null};
type Track={barrier20:Barrier;horizons:Horizon[]};
type Cohort={cohort:'first'|'repeat';signals:number;observed:number;opening:Opening;research:Track;execution:Track};
export type LaunchOutcomeCohorts={status:'unavailable'}|{status:'ready';fromSession:string;throughSession:string;observedThrough:string|null;cohorts:[Cohort,Cohort]};

const limit=3660;
const bad=()=>{throw Error('launch_outcome_cohorts_unavailable');};
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=limit;
const real=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(v)&&evidenceInstant(v+'T00:00:00Z')!==null;

function exact(v:unknown,keys:readonly string[]):v is Row{
  return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
}
function counts<T extends string>(v:Row,keys:readonly T[],expected:number):Record<T,number>{
  const pairs=keys.map(key=>{
    const value=v[key];if(!count(value))return bad();return [key,value] as const;
  });
  if(pairs.reduce((total,[,value])=>total+value,0)!==expected)return bad();
  return Object.fromEntries(pairs) as Record<T,number>;
}
function track(input:unknown,total:number,waiting:number):Track{
  if(!exact(input,['barrier20','horizons'])||!exact(input.barrier20,barrierKeys)||
    !Array.isArray(input.horizons)||input.horizons.length!==windows.length)return bad();
  const barrier20=counts(input.barrier20,barrierKeys,total);
  if(barrier20.waitingObservation!==waiting)return bad();
  const horizons=input.horizons.map((v,index)=>{
    const days=windows[index];
    if(!exact(v,['days',...horizonKeys,'withBenchmark','meanReturnPct','meanExcessPct'])||v.days!==days||!count(v.withBenchmark))return bad();
    const summary=counts(v,horizonKeys,total);
    if(summary.waitingObservation!==waiting||v.withBenchmark>summary.ready||
      (summary.ready===0?v.meanReturnPct!==null:!real(v.meanReturnPct))||
      (v.withBenchmark===0?v.meanExcessPct!==null:!real(v.meanExcessPct)))return bad();
    return {days,...summary,withBenchmark:v.withBenchmark,meanReturnPct:v.meanReturnPct as number|null,meanExcessPct:v.meanExcessPct as number|null};
  });
  return {barrier20,horizons};
}
function cohort(v:unknown,name:Cohort['cohort']):Cohort{
  if(!exact(v,['cohort','signals','observed','research','execution','opening'])||v.cohort!==name||!count(v.signals)||
    !count(v.observed)||v.observed>v.signals||!exact(v.opening,openingKeys))return bad();
  const opening=counts(v.opening,openingKeys,v.signals),waiting=v.signals-v.observed;
  if(opening.waitingObservation!==waiting)return bad();
  return {cohort:name,signals:v.signals,observed:v.observed,opening,research:track(v.research,v.signals,waiting),
    execution:track(v.execution,opening.filled,0)};
}
export function parseLaunchOutcomeCohorts(v:unknown):LaunchOutcomeCohorts{
  if(!exact(v,['schemaVersion','fromSession','throughSession','observedThrough','cohorts'])||v.schemaVersion!==version||
    !date(v.fromSession)||!date(v.throughSession)||
    Date.parse(v.throughSession)-Date.parse(v.fromSession)!==364*86_400_000||
    !Array.isArray(v.cohorts)||v.cohorts.length!==2)return bad();
  const cohorts:[Cohort,Cohort]=[cohort(v.cohorts[0],'first'),cohort(v.cohorts[1],'repeat')];
  const observedThrough=v.observedThrough;
  if(cohorts[0].signals+cohorts[1].signals>limit)return bad();
  if(!cohorts.some(c=>c.observed>0)?observedThrough!==null:typeof observedThrough!=='string'||evidenceInstant(observedThrough)===null)return bad();
  return {status:'ready',fromSession:v.fromSession,throughSession:v.throughSession,observedThrough:observedThrough as string|null,cohorts};
}

type Reader={rpc:(name:string)=>PromiseLike<{data:unknown;error:unknown}>};
export async function readLaunchOutcomeCohorts(reader:Reader):Promise<LaunchOutcomeCohorts>{
  try{
    const response=await reader.rpc('vnext_launch_outcome_cohorts_v1');
    return response.error||!response.data?{status:'unavailable'}:parseLaunchOutcomeCohorts(response.data);
  }catch{return {status:'unavailable'};}
}
