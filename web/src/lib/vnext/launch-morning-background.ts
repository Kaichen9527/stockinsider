import type {VnextIdentity} from './auth.ts';
import {evidenceInstant} from './evidence-clock.ts';

type Row=Record<string,unknown>;
export type LaunchMorningBackground={session:string;cutoff:string;previousSession:string;revision:string;twseClose:number;tpexClose:number};
const object=(value:unknown):value is Row=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const day=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&evidenceInstant(value+'T00:00:00Z')!==null;
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const positive=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>0;

export function parseLaunchMorningBackground(value:unknown):LaunchMorningBackground|null{
  if(!object(value)||Object.keys(value).length!==7||value.schemaVersion!=='vnext-launch-morning-public-v1'||
    !day(value.session)||!day(value.previousSession)||value.previousSession>=value.session||
    typeof value.cutoff!=='string'||evidenceInstant(value.cutoff)!==evidenceInstant(value.session+'T08:15:00+08:00')||
    !hash(value.revision)||!positive(value.twseClose)||!positive(value.tpexClose))return null;
  return {session:value.session,cutoff:value.cutoff,previousSession:value.previousSession,revision:value.revision,
    twseClose:value.twseClose,tpexClose:value.tpexClose};
}

type Reader={rpc:(name:string)=>PromiseLike<{data:unknown;error:unknown}>};
export async function readLaunchMorningBackground(reader:Reader):Promise<LaunchMorningBackground|null>{
  try{
    const r=await reader.rpc('vnext_launch_morning_public_v1');
    return r.error?null:parseLaunchMorningBackground(r.data);
  }catch{return null;}
}

export async function publishLaunchMorningBackground(identity:VnextIdentity){
  if(identity.role!=='operator'||!identity.principal)throw Error('launch_morning_operator_required');
  const {requireActiveVpsWriter}=await import('../taiwan-data-runtime.ts');
  const writer=await requireActiveVpsWriter();
  if(!writer.ok)return {status:'deferred',reason:'morning_writer_unavailable'} as const;
  const {acquireProductionWriteLease,releaseProductionWriteLease}=await import('../production-write-lease.ts');
  const owner=await acquireProductionWriteLease(300);
  if(!owner)return {status:'deferred',reason:'morning_lease_unavailable'} as const;
  try{
    const r=await writer.supabase.rpc('vnext_launch_morning_command_v1',{p_principal:identity.principal,p_lease_owner:owner});
    const response:unknown=r.data;
    if(r.error||!object(response))throw Error('launch_morning_receipt_unavailable');
    if(response.status==='deferred'&&typeof response.reason==='string'&&/^morning_[a-z_]{1,75}$/u.test(response.reason)&&
      (response.retainedSession===null||day(response.retainedSession)))return {status:'deferred',reason:response.reason,retainedSession:response.retainedSession} as const;
    if(response.status!=='published'||!day(response.session)||!day(response.previousSession)||response.previousSession>=response.session||
      evidenceInstant(response.cutoff)!==evidenceInstant(response.session+'T08:15:00+08:00')||!hash(response.revision)||typeof response.replay!=='boolean')
      throw Error('launch_morning_receipt_unavailable');
    const {session,previousSession,revision,replay,cutoff}=response;
    return {status:'published',session,previousSession,revision,replay,cutoff:String(cutoff)} as const;
  }finally{await releaseProductionWriteLease(owner);}
}
