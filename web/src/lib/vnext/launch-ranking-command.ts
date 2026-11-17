import { createHash } from 'node:crypto';
import { types } from 'node:util';
import type { VnextIdentity } from './auth.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { isHistoryDate } from '../candidate-price-history.ts';
import { launchRankingEnabled, readLaunchRankingSnapshot, LAUNCH_RANKING_POLICY, LAUNCH_RANKING_RULES, LAUNCH_RANKING_ARITHMETIC, type LaunchRankingSnapshot } from './launch-ranking-read.ts';
type Row=Record<string,unknown>;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
function closed(value:unknown,keys:string):value is Row{
  if(!value||typeof value!=='object'||Array.isArray(value)||types.isProxy(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  const descriptors=Object.getOwnPropertyDescriptors(value),wanted=keys.split(' ');
  return Reflect.ownKeys(descriptors).length===wanted.length&&wanted.every(key=>descriptors[key]?.enumerable&&Object.hasOwn(descriptors[key],'value'));
}
export function launchRankingPublishRequest(value:unknown){
  if(!closed(value,'rankingRunId expectedPreviousRankingRunId')||!uuid(value.rankingRunId)
    ||value.expectedPreviousRankingRunId!==null&&!uuid(value.expectedPreviousRankingRunId))throw Error('launch_ranking_closed_request');
  return {rankingRunId:value.rankingRunId,expectedPreviousRankingRunId:value.expectedPreviousRankingRunId as string|null};
}
/** A replay reports the original immutable write, not a renewed current proof.
 * First writes use replay=false/historicalReceipt=false; replays use bothtrue.
 * A retained prior run is never reported as a newly published request run. */
export function parseLaunchRankingWriteReceipt(data:unknown,request:ReturnType<typeof launchRankingPublishRequest>){
  if(!closed(data,'schemaVersion policyVersion rulesVersion arithmeticVersion published retained reason rankingRunId requestRunId replay historicalReceipt')
    ||data.schemaVersion!=='vnext-launch-ranking-write-v2'||data.policyVersion!==LAUNCH_RANKING_POLICY||data.rulesVersion!==LAUNCH_RANKING_RULES||data.arithmeticVersion!==LAUNCH_RANKING_ARITHMETIC
    ||typeof data.published!=='boolean'||typeof data.retained!=='boolean'||typeof data.replay!=='boolean'||typeof data.historicalReceipt!=='boolean'
    ||data.requestRunId!==request.rankingRunId||data.rankingRunId!==null&&!uuid(data.rankingRunId)
    ||data.reason!==null&&(typeof data.reason!=='string'||!/^[a-z0-9_]{1,120}$/u.test(data.reason))
    ||(data.published?(data.retained||data.rankingRunId!==request.rankingRunId||data.reason!==null||data.replay!==data.historicalReceipt)
      :(!data.retained||data.reason===null||data.replay||data.historicalReceipt)))throw Error('launch_ranking_publication_uncertain');
  return data;
}
type Admission={ready:boolean;reason:string|null;session:string|null;cutoff:string|null;policyVersion:typeof LAUNCH_RANKING_POLICY};
export function parseLaunchCycleAdmission(data:unknown):Admission{
  if(!closed(data,'ready reason session cutoff policyVersion')||typeof data.ready!=='boolean'||data.policyVersion!==LAUNCH_RANKING_POLICY
    ||data.reason!==null&&(typeof data.reason!=='string'||!/^[a-z0-9_]{1,120}$/u.test(data.reason))
    ||data.session!==null&&!isHistoryDate(data.session)
    ||data.cutoff!==null&&evidenceInstant(data.cutoff)===null
    ||data.ready&&(data.session===null||data.cutoff===null||data.reason!==null
      ||evidenceInstant(data.cutoff)!==evidenceInstant(`${String(data.session)}T21:30:00+08:00`)))throw Error('launch_ranking_cycle_context_unavailable');
  return data as Admission;
}
/** Read-only SQL clock/calendar admission, before source/provider/model work.
 * A caller session, local clock or old20:30 context cannot establish readiness. */
export async function readLaunchCycleAdmission(identity:VnextIdentity):Promise<Admission>{
  if(!launchRankingEnabled())return {ready:false,reason:'launch_ranking_disabled',session:null,cutoff:null,policyVersion:LAUNCH_RANKING_POLICY};
  if(identity.role!=='operator'||!identity.principal)throw Error('launch_ranking_operator_required');
  const {getSupabaseServerClient}=await import('../supabase-server.ts');
  const result=await getSupabaseServerClient().rpc('vnext_launch_cycle_context_v1',{p_principal:identity.principal});
  if(result.error)throw Error('launch_ranking_cycle_context_unavailable');
  return parseLaunchCycleAdmission(result.data);
}
type ChartPublication = {
  processed: number;
  stored: number;
  replayed: number;
  missingEvidence: number;
  reason: 'lease_window' | 'chart_write_uncertain' | null;
};

async function freezeLaunchCharts(
  rankingRunId: string,
  leaseStarted: number,
  freezeRank: (rank: number) => PromiseLike<{data: unknown;error: unknown}>,
): Promise<ChartPublication> {
  const summary: ChartPublication={processed:0,stored:0,replayed:0,missingEvidence:0,reason:null};
  for(let rank=1;rank<=10;rank++){
    // Leave a full database statement window inside the already-held lease.
    if(Date.now()-leaseStarted>=270_000){summary.reason='lease_window';break;}
    let result;
    try{result=await freezeRank(rank);}catch{summary.reason='chart_write_uncertain';break;}
    if(!result){summary.reason='chart_write_uncertain';break;}
    const {data,error}=result;
    if(error||!closed(data,'schemaVersion rankingRunId rank status')
      ||data.schemaVersion!=='launch-chart-freeze-receipt-v1'||data.rankingRunId!==rankingRunId||data.rank!==rank
      ||typeof data.status!=='string'||!['stored','replay','missing_evidence','finished'].includes(data.status)){
      summary.reason='chart_write_uncertain';break;
    }
    if(data.status==='finished')break;
    summary.processed++;
    if(data.status==='stored')summary.stored++;
    else if(data.status==='replay')summary.replayed++;
    else summary.missingEvidence++;
  }
  return summary;
}

/** New policy writer, IDs/CAS only. SQL owns facts,16 rules, qualification and
 * publication. No old financial proof, caller points or JS brand is submitted. */
export async function publishLaunchRanking(identity:VnextIdentity,value:unknown){
  const request=launchRankingPublishRequest(value);
  if(!launchRankingEnabled()||identity.role!=='operator'||!identity.principal)throw Error('launch_ranking_operator_required');
  const {requireActiveVpsWriter}=await import('../taiwan-data-runtime.ts');
  const writer=await requireActiveVpsWriter();if(!writer.ok)throw Error('launch_ranking_writer_unavailable');
  const {acquireProductionWriteLease,releaseProductionWriteLease}=await import('../production-write-lease.ts');
  const leaseStarted=Date.now();
  const owner=await acquireProductionWriteLease(300);if(!owner)throw Error('launch_ranking_owned_lease_unavailable');
  try{
    const result=await writer.supabase.rpc('vnext_launch_ranking_command_v1',{p_principal:identity.principal,p_lease_owner:owner,p_request:request});
    if(result.error)throw Error('launch_ranking_publication_uncertain');
    const receipt=parseLaunchRankingWriteReceipt(result.data,request);
    if(!receipt.published)return receipt;
    const chartPublication=await freezeLaunchCharts(request.rankingRunId,leaseStarted,rank=>
      writer.supabase.rpc('vnext_launch_chart_freeze_v1',{p_principal:identity.principal,p_lease_owner:owner,p_ranking_run_id:request.rankingRunId,p_rank:rank}));
    return {...receipt,chartPublication};
  }finally{await releaseProductionWriteLease(owner);}
}
export function cycleLaunchRankingRequest(session:unknown,previous:LaunchRankingSnapshot|null,existing?:LaunchRankingSnapshot|null){
  if(!isHistoryDate(session))throw Error('launch_ranking_session_required');
  const digest=createHash('sha256').update(JSON.stringify(['launch-ranking-cycle-v1',LAUNCH_RANKING_POLICY,session])).digest('hex');
  const run=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}`;
  if(existing&&existing.rankingRunId!==run)throw Error('launch_ranking_existing_run_mismatch');
  if(existing)previous=existing;
  return launchRankingPublishRequest({rankingRunId:run,expectedPreviousRankingRunId:previous?.rankingRunId===run?previous.previousRankingRunId:previous?.rankingRunId??null});
}
export async function publishCycleLaunchRanking(identity:VnextIdentity,session:unknown){
  const context=await readLaunchCycleAdmission(identity);
  if(!context.ready||context.session!==session)return {published:false,retained:true,reason:context.reason??'launch_ranking_session_changed',policyVersion:LAUNCH_RANKING_POLICY};
  const requested=cycleLaunchRankingRequest(session,null).rankingRunId;
  const historical=await readLaunchRankingSnapshot({rankingRunId:requested});
  if(historical.snapshot)return publishLaunchRanking(identity,cycleLaunchRankingRequest(session,null,historical.snapshot));
  if(!['not_found','not_published'].includes(historical.availability))throw Error('launch_ranking_cycle_read_unavailable');
  const current=await readLaunchRankingSnapshot();
  if(!['ready','not_published'].includes(current.availability))throw Error('launch_ranking_cycle_read_unavailable');
  return publishLaunchRanking(identity,cycleLaunchRankingRequest(session,current.snapshot));
}
