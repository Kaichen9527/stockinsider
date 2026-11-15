/** Closed licensed-CSV source producer. Raw bytes are persisted while this
 * invocation owns the existing global lease; SQL independently derives facts.
 * No score, JavaScript brand or caller approval flag crosses that boundary. */
import { createHash } from 'node:crypto';
import type { VnextIdentity } from './auth.ts';
import { officialLicensedCsvUrl } from './launch-official-replay.ts';
import { tpexNativeShareCsvUrl } from './launch-native-volume.ts';
import { tpexInstitutionalVolumeCsvUrl } from './launch-institutional-volume.ts';
import { tpexMarketFlowCsvUrl, TPEX_MARKET_FLOW_MAX_BYTES } from './launch-market-foreign-flow.ts';
import { evidenceKnownAt } from './evidence-clock.ts';
import { vnextEnabled } from './policy.ts';
import { parseLaunchIndexBackfillPlan, type LaunchIndexBackfillPlan } from './launch-index-backfill.ts';

type Row=Record<string,unknown>;
type Client={rpc(name:string,body:Row):PromiseLike<{data:unknown;error:unknown}>};
type Job={jobId:string;attemptId:string;datasetId:11370|11371|11856|11391|11755|11743;requestKey:string;sourceUrl:string;deadlineAt:string};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(value);
const row=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value:unknown,keys:string):value is Row=>row(value)&&Object.keys(value).sort().join(' ')===keys.split(' ').sort().join(' ');
export const launchSourcesEnabled=()=>vnextEnabled()&&process.env.STOCKINSIDER_VNEXT_LAUNCH_SOURCES_ENABLED==='true';
function profile(datasetId:unknown,key:unknown){
  if(typeof key!=='string')throw Error('launch_source_profile_invalid');
  const sourceUrl=datasetId===11370?tpexInstitutionalVolumeCsvUrl(key):datasetId===11371?tpexNativeShareCsvUrl(key)
    :datasetId===11743?tpexMarketFlowCsvUrl(key):datasetId===11755||datasetId===11391||datasetId===11856?officialLicensedCsvUrl(datasetId,key):null;
  if(!sourceUrl)throw Error('launch_source_profile_invalid');
  return {sourceUrl,maximumBytes:datasetId===11370?3*1024*1024:datasetId===11743?TPEX_MARKET_FLOW_MAX_BYTES:500000};
}
function job(value:unknown,now:string):Job{
  if(!exact(value,'jobId attemptId datasetId requestKey sourceUrl deadlineAt')||!uuid(value.jobId)||!uuid(value.attemptId)
    ||typeof value.deadlineAt!=='string'||!evidenceKnownAt(now,value.deadlineAt)||evidenceKnownAt(value.deadlineAt,now)
    ||profile(value.datasetId,value.requestKey).sourceUrl!==value.sourceUrl)throw Error('launch_source_claim_invalid');
  return value as Job;
}
/** Read-only classification is mandatory before ANY old provider/token IO.
 * Missing RPC/lookup is a deployment dependency, never an unbound result. */
export async function classifyLaunchSourceJob(client:Client,jobId:string){
  if(!uuid(jobId))throw Error('launch_source_job_invalid');
  const result=await client.rpc('vnext_launch_csv_dispatch_v1',{p_job_id:jobId});
  if(result.error||!row(result.data))throw Error('launch_source_dispatch_unavailable');
  if(exact(result.data,'bound')&&result.data.bound===false)return {bound:false as const};
  if(exact(result.data,'bound configured')&&result.data.bound===true&&typeof result.data.configured==='boolean')
    return {bound:true as const,configured:result.data.configured};
  throw Error('launch_source_dispatch_unavailable');
}
export type LaunchSourceDependencies={
  acquireLease():Promise<string|null>;releaseLease(owner:string):Promise<void>;
  command(owner:string,operation:string,request:Row,bytes?:Uint8Array):Promise<unknown>;
  fetch(url:string,init:RequestInit):Promise<Response>;
  putArtifact(hash:string,bytes:Buffer):Promise<void>;
  registerArtifact(owner:string,hash:string,length:number):Promise<void>;
  now():string;
};
async function owned<T>(deps:LaunchSourceDependencies,work:(owner:string)=>Promise<T>){
  const owner=await deps.acquireLease();if(!uuid(owner))throw Error('launch_source_owned_lease_unavailable');
  try{return await work(owner);}finally{await deps.releaseLease(owner);}
}
async function checkLease(deps:LaunchSourceDependencies,owner:string){
  const checked=await deps.command(owner,'lease-check',{});
  if(!exact(checked,'owned owner backendId')||checked.owned!==true||checked.owner!==owner||!uuid(checked.backendId))
    throw Error('launch_source_owned_lease_unavailable');
}
async function bytesOf(response:Response,maximum:number){
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/u.test(declared)||Number(declared)>maximum))throw Error('launch_source_response_rejected');
  if(!response.body)throw Error('launch_source_response_rejected');
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;
    if(length>maximum){await reader.cancel();throw Error('launch_source_response_rejected');}chunks.push(new Uint8Array(next.value));}}
  finally{reader.releaseLock();}
  if(length<2)throw Error('launch_source_response_rejected');
  return Buffer.concat(chunks,length);
}
async function consume(deps:LaunchSourceDependencies,owner:string,claimed:Job){
  let phase:'transport'|'artifact'|'complete'='transport';let bytes:Buffer|undefined;
  try{
    const beganAt=deps.now();
    if(!evidenceKnownAt(beganAt,claimed.deadlineAt)||evidenceKnownAt(claimed.deadlineAt,beganAt))throw Error('launch_source_claim_expired');
    await checkLease(deps,owner);
    const expected=profile(claimed.datasetId,claimed.requestKey);
    const response=await deps.fetch(expected.sourceUrl,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
      headers:{accept:'text/csv, application/csv','user-agent':'StockInsider/licensed-launch-csv-v1'}});
    if(response.status!==200||response.redirected||response.url!==expected.sourceUrl
      ||!/^(?:text|application)\/csv(?:\s*;[^\r\n]*)?$/iu.test(response.headers.get('content-type')||''))throw Error('launch_source_response_rejected');
    bytes=await bytesOf(response,expected.maximumBytes);const observedAt=deps.now();
    if(!evidenceKnownAt(observedAt,claimed.deadlineAt))throw Error('launch_source_response_rejected');
    const hash=createHash('sha256').update(bytes).digest('hex');phase='artifact';
    await checkLease(deps,owner);
    // Snapshot is owned by this invocation; no HTTP path/root is accepted.
    await deps.putArtifact(hash,bytes);
    await checkLease(deps,owner);await deps.registerArtifact(owner,hash,bytes.length);
    await checkLease(deps,owner);phase='complete';
    const result=await deps.command(owner,'complete',{attemptId:claimed.attemptId,artifactHash:hash,observedAt,httpStatus:200,
      redirectCount:0,contentType:response.headers.get('content-type'),responseUrl:expected.sourceUrl},bytes);
    if(!row(result)||result.schema!=='licensed-launch-csv-completion-v1'||result.terminal!=='complete'
      ||result.actionEligible!==false||result.legacyCanonical!=='not_applicable'||!uuid(result.captureId)
      ||!Number.isSafeInteger(result.facts)||Number(result.facts)<0)throw Error('launch_source_completion_uncertain');
    const ready=await deps.command(owner,'ready',{attemptId:claimed.attemptId,captureId:result.captureId});
    if(!exact(ready,'schema captureId readyAckId availableAt')||ready.schema!=='licensed-launch-csv-ready-v1'
      ||ready.captureId!==result.captureId||!uuid(ready.readyAckId)||typeof ready.availableAt!=='string'
      ||!evidenceKnownAt(observedAt,ready.availableAt))throw Error('launch_source_readiness_uncertain');
    return {jobId:claimed.jobId,attemptId:claimed.attemptId,status:'recorded' as const,captureId:result.captureId};
  }catch{
    // After a completion request, only a read-only receipt recovery may resolve
    // uncertainty. Never re-send raw bytes or settle an uncertain mutation.
    if(phase==='complete')return {jobId:claimed.jobId,attemptId:claimed.attemptId,status:'uncertain' as const,captureId:null};
    try{await checkLease(deps,owner);await deps.command(owner,'fail',{attemptId:claimed.attemptId,reason:phase==='artifact'?'artifact_failed':'transport_failed'});}
    catch{return {jobId:claimed.jobId,attemptId:claimed.attemptId,status:'uncertain' as const,captureId:null};}
    return {jobId:claimed.jobId,attemptId:claimed.attemptId,status:'failed' as const,captureId:null};
  }finally{bytes?.fill(0);}
}
/** Trusted server dependency seam for deterministic source-workflow tests.
 * It emits no source/score approval and cannot mint SQL facts by itself. */
export async function drainLaunchSourceWithDependencies(deps:LaunchSourceDependencies,limit=1){
  if(!Number.isInteger(limit)||limit<1||limit>4)throw Error('launch_source_claim_bound');
  return owned(deps,async owner=>{
    const result=await deps.command(owner,'claim',{limit});
    if(!exact(result,'schemaVersion jobs')||result.schemaVersion!=='licensed-launch-csv-claims-v1'||!Array.isArray(result.jobs)||result.jobs.length>limit)
      throw Error('launch_source_claim_invalid');
    const jobs=result.jobs.map(value=>job(value,deps.now()));if(new Set(jobs.map(item=>item.jobId)).size!==jobs.length)throw Error('launch_source_claim_invalid');
    const outcomes=[];for(const item of jobs)outcomes.push(await consume(deps,owner,item));
    return {schemaVersion:'licensed-launch-source-drain-v1' as const,outcomes,sourceAuthority:false as const,scoreAuthority:false as const};
  });
}
export async function adoptLaunchSourceWithDependencies(deps:LaunchSourceDependencies,jobId:string,queueOwner:string){
  if(!uuid(jobId)||queueOwner.length<16||queueOwner.length>200)throw Error('launch_source_genuine_claim_required');
  return owned(deps,async owner=>consume(deps,owner,job(await deps.command(owner,'adopt',{jobId,queueOwner}),deps.now())));
}
/** Explicit recovery reads the already-persisted outcome first. It never
 * retries acquisition, raw append or an uncertain mutation. */
export async function recoverLaunchSourceWithDependencies(deps:LaunchSourceDependencies,attemptId:string){
  if(!uuid(attemptId))throw Error('launch_source_attempt_invalid');
  return owned(deps,async owner=>{
    const receipt=await deps.command(owner,'receipt',{attemptId});
    if(exact(receipt,'recorded')&&receipt.recorded===false)return {status:'missing' as const,captureId:null};
    if(!exact(receipt,'recorded outcome captureId reason historicalReceipt')||receipt.recorded!==true||receipt.historicalReceipt!==true
      ||!['complete','failed'].includes(String(receipt.outcome)))throw Error('launch_source_receipt_unavailable');
    if(receipt.outcome==='failed')return {status:'failed' as const,captureId:null};
    if(!uuid(receipt.captureId))throw Error('launch_source_receipt_unavailable');
    const ready=await deps.command(owner,'ready',{attemptId,captureId:receipt.captureId});
    if(!exact(ready,'schema captureId readyAckId availableAt')||ready.schema!=='licensed-launch-csv-ready-v1'||ready.captureId!==receipt.captureId
      ||!uuid(ready.readyAckId)||typeof ready.availableAt!=='string'||!evidenceKnownAt(ready.availableAt,deps.now()))throw Error('launch_source_readiness_uncertain');
    return {status:'recorded' as const,captureId:receipt.captureId};
  });
}
async function production(identity:VnextIdentity):Promise<LaunchSourceDependencies>{
  if(!launchSourcesEnabled()||identity.role!=='operator'||!identity.principal)throw Error('launch_source_operator_mode_required');
  const {requireActiveVpsWriter}=await import('../taiwan-data-runtime.ts');
  const writer=await requireActiveVpsWriter();if(!writer.ok)throw Error('launch_source_writer_unavailable');
  const {stockInsiderDataPlaneMode}=await import('../data-plane-runtime.ts');
  const root=process.env.STOCKINSIDER_PRIVATE_ARTIFACT_ROOT;
  if(stockInsiderDataPlaneMode()!=='contabo'||!root)throw Error('launch_source_private_artifact_store_unavailable');
  const {privateArtifactStore}=await import('../private-artifact-store.ts');const store=privateArtifactStore(root);
  const {acquireProductionWriteLease,releaseProductionWriteLease}=await import('../production-write-lease.ts');
  return {acquireLease:()=>acquireProductionWriteLease(300),releaseLease:releaseProductionWriteLease,now:()=>new Date().toISOString(),fetch:(url,init)=>fetch(url,init),
    putArtifact:async(hash,bytes)=>{await store.put(hash,bytes);},
    registerArtifact:async(_owner,hash,length)=>{const result=await writer.supabase.rpc('register_private_artifact_receipt_v1',{
      p_artifact_hash:hash,p_byte_length:length,p_media_type:'text/csv',p_purpose:'diagnostic_attachment',p_metadata:{storage:'private_hash_store_v1',profile:'licensed-launch-csv-v1'}});
      if(result.error)throw Error('launch_source_artifact_registration_failed');},
    command:async(owner,operation,request,bytes)=>{
      if(operation==='enqueue-history-current'){
        if(Object.keys(request).length||bytes)throw Error('launch_index_backfill_closed_request');
        const result=await writer.supabase.rpc('vnext_launch_csv_backfill_plan_v1',{p_principal:identity.principal,p_lease_owner:owner});
        if(result.error)throw Error('launch_index_backfill_unavailable');return result.data;
      }
      const result=await writer.supabase.rpc('vnext_launch_csv_command_v1',{
      p_principal:identity.principal,p_lease_owner:owner,p_operation:operation,p_request:request,p_body:bytes?'\\x'+Buffer.from(bytes).toString('hex'):null});
      if(result.error)throw Error('launch_source_authority_rejected');return result.data;}};
}
export async function drainLaunchSources(identity:VnextIdentity,limit=1){
  if(!launchSourcesEnabled())return {status:'disabled' as const,sourceAuthority:false as const};
  return drainLaunchSourceWithDependencies(await production(identity),limit);
}
export type LaunchSourcePlan={schemaVersion:'licensed-launch-csv-plan-v2';status:'planned'|'no_active_pool'|'deferred';
  reason:null|'awaiting_current_completed_session';jobs:number;session:string|null;sourceAuthority:false};
/** Transport validation only. Deferral never proves a holiday, coverage or
 * permission. SQL alone decides from its own clock and guarded current pool. */
export function parseLaunchSourcePlan(value:unknown):LaunchSourcePlan{
  if(!exact(value,'schemaVersion status reason jobs session sourceAuthority')||value.schemaVersion!=='licensed-launch-csv-plan-v2'
    ||!Number.isSafeInteger(value.jobs)||Number(value.jobs)<0||Number(value.jobs)>200||value.sourceAuthority!==false)throw Error('launch_source_plan_unavailable');
  if(value.status==='planned'){
    let valid=false;
    if(typeof value.session==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value.session)){
      const stamp=Date.parse(value.session+'T00:00:00Z');valid=Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value.session;
    }
    if(!valid||Number(value.jobs)===0||value.reason!==null)throw Error('launch_source_plan_unavailable');
  }else if(value.status==='no_active_pool'){
    if(value.jobs!==0||value.session!==null||value.reason!==null)throw Error('launch_source_plan_unavailable');
  }else if(value.status==='deferred'){
    if(value.jobs!==0||value.session!==null||value.reason!=='awaiting_current_completed_session')throw Error('launch_source_plan_unavailable');
  }else throw Error('launch_source_plan_unavailable');
  return value as LaunchSourcePlan;
}
/** Plans only from SQL's actual active pool/completed cached sessions. There is
 * no HTTP-supplied symbol list, date expansion, URL or profile binding. */
export async function prepareLaunchSources(identity:VnextIdentity):Promise<LaunchIndexBackfillPlan|{status:'disabled';sourceAuthority:false}>{
  if(!launchSourcesEnabled())return {status:'disabled' as const,sourceAuthority:false as const};
  const deps=await production(identity);
  // This new RPC reuses the old current planner/queue; missing installation is
  // a deployment gap, never a fallback to a shorter claimed history window.
  return owned(deps,async owner=>parseLaunchIndexBackfillPlan(await deps.command(owner,'enqueue-history-current',{})));
}
export async function adoptClaimedLaunchSource(identity:VnextIdentity,jobId:string,queueOwner:string){
  return adoptLaunchSourceWithDependencies(await production(identity),jobId,queueOwner);
}
export async function recoverLaunchSourceReceipt(identity:VnextIdentity,attemptId:string){
  return recoverLaunchSourceWithDependencies(await production(identity),attemptId);
}
