import {createHash} from 'node:crypto';
import type {VnextIdentity} from './auth.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {readLaunchOfficialReportBody} from './launch-official-report-body.ts';
import {captureLaunchTwseOpeningLimits} from './launch-twse-limit-capture.ts';
import {launchHaltSource,validateLaunchHaltCapture,type LaunchHaltCapture} from './launch-opening-halt.ts';

type Market=LaunchHaltCapture['market'];
type Row=Record<string,unknown>;
type Writer={rpc:(name:string,args:Row)=>PromiseLike<{data:unknown;error:unknown}>};
const limit=512*1024;
const hash=(body:Uint8Array)=>createHash('sha256').update(body).digest('hex');
const market=(value:unknown):value is Market=>value==='TWSE'||value==='TPEX';
const object=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);

async function capture(market:Market,fetchPage:typeof fetch){
  const url=launchHaltSource(market);
  const response=await fetchPage(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12_000),
    headers:{accept:market==='TWSE'?'text/csv':'application/json'}});
  const type=response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if(!response.ok||response.url!==url||type!==(market==='TWSE'?'text/csv':'application/json')){
    await response.body?.cancel().catch(()=>{});
    throw Error('launch_halt_authority_unavailable');
  }
  const body=await readLaunchOfficialReportBody(response,limit),observedAt=new Date().toISOString(),sha256=hash(body);
  // Database assigns the authoritative recordedAt when it stores the receipt.
  validateLaunchHaltCapture({market,url,observedAt,recordedAt:observedAt,sha256,body});
  return {body,observedAt,sha256};
}

export async function captureLaunchHaltSlots(writer:Writer,principal:string,owner:string,fetchPage:typeof fetch=fetch){
  const lease={p_principal:principal,p_lease_owner:owner};
  const admission=await writer.rpc('vnext_launch_halt_command_v1',{...lease,p_action:'admit'});
  const data=admission.data;
  if(admission.error||!object(data)||!Array.isArray(data.markets)||data.markets.length>2
    ||!data.markets.every(market)||new Set(data.markets).size!==data.markets.length)
    throw Error('launch_halt_admission_unavailable');
  const due:Market[]=data.markets;
  return Promise.all(due.map(async market=>{
    try{
      const {body,observedAt,sha256}=await capture(market,fetchPage);
      const saved=await writer.rpc('vnext_launch_halt_command_v1',{...lease,p_action:'append',p_market:market,
        p_observed_at:observedAt,p_sha256:sha256,p_body:'\\x'+body.toString('hex')});
      if(saved.error||!object(saved.data)||saved.data.market!==market||saved.data.sha256!==sha256||
        evidenceInstant(saved.data.recordedAt)===null||typeof saved.data.replay!=='boolean')
        throw Error('launch_halt_capture_unconfirmed');
      return {market,status:saved.data.replay?'replay':'written'} as const;
    }catch{return {market,status:'deferred'} as const;}
  }));
}

export async function readLaunchHaltCapture(writer:Writer,principal:string,owner:string,market:Market,asOf:string):Promise<LaunchHaltCapture|null>{
  try{
    const receipt=await writer.rpc('vnext_launch_halt_command_v1',{p_principal:principal,p_lease_owner:owner,p_action:'read',p_market:market,p_as_of:asOf});
    const v=receipt.data;
    if(receipt.error||!object(v)||v.market!==market||typeof v.observedAt!=='string'||typeof v.recordedAt!=='string'||
      typeof v.sha256!=='string'||typeof v.bodyBase64!=='string'||v.bodyBase64.length>699052||!/^[A-Za-z0-9+/]+={0,2}$/u.test(v.bodyBase64))
      return null;
    const body=Buffer.from(v.bodyBase64,'base64');
    if(body.length>limit||body.toString('base64')!==v.bodyBase64||hash(body)!==v.sha256)return null;
    return {market,url:launchHaltSource(market),observedAt:v.observedAt,recordedAt:v.recordedAt,sha256:v.sha256,body};
  }catch{return null;}
}

export async function captureLaunchOpeningHalts(identity:VnextIdentity){
  if(identity.role!=='operator'||!identity.principal)throw Error('launch_halt_operator_required');
  const {requireActiveVpsWriter}=await import('../taiwan-data-runtime.ts');
  const writer=await requireActiveVpsWriter();
  if(!writer.ok)throw Error('launch_halt_writer_unavailable');
  const {acquireProductionWriteLease,releaseProductionWriteLease}=await import('../production-write-lease.ts');
  const lease=await acquireProductionWriteLease(300);
  if(!lease)throw Error('launch_halt_lease_unavailable');
  try{
    const [captures,openingLimits]=await Promise.allSettled([
      captureLaunchHaltSlots(writer.supabase,identity.principal,lease),
      captureLaunchTwseOpeningLimits(writer.supabase,identity.principal,lease),
    ]);
    if(captures.status==='rejected')throw captures.reason;
    return {captures:captures.value,openingLimits:openingLimits.status==='fulfilled'?openingLimits.value:'deferred'};
  }
  finally{await releaseProductionWriteLease(lease);}
}
