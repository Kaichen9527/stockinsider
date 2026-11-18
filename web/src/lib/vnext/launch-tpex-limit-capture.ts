import {isHistoryDate} from '../candidate-price-history.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {decodeLaunchOfficialReceiptBody,fetchLaunchOfficialReport} from './launch-official-report-body.ts';
import {readTpexOpeningLimitRows,TPEX_OPENING_LIMIT_MAX_BYTES,TPEX_OPENING_LIMIT_URL,
  type TpexOpeningLimitReceipt} from './launch-tpex-opening-limit.ts';

type Row=Record<string,unknown>;
type Writer={rpc:(name:string,args:Row)=>PromiseLike<{data:unknown;error:unknown}>};
const command='vnext_launch_tpex_opening_limit_command_v1';
const object=(value:unknown):value is Row=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const authorityId=(value:unknown):value is string=>typeof value==='string'
  &&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(value);
const scope=(principal:string,owner:string)=>({p_principal:principal,p_lease_owner:owner});

export async function captureLaunchTpexOpeningLimits(writer:Writer,principal:string,owner:string,fetchPage:typeof fetch=fetch){
  const lease=scope(principal,owner);
  try{
    const {data,error}=await writer.rpc(command,{...lease,p_action:'admit'});
    if(error)return 'deferred' as const;
    if(data===null)return 'session_unready' as const;
    if(!object(data)||typeof data.session!=='string'||!isHistoryDate(data.session)||!authorityId(data.sessionAuthorityId)
      ||typeof data.alreadyCaptured!=='boolean')return 'deferred' as const;
    if(data.alreadyCaptured)return 'replay' as const;
    const {body,sha256}=await fetchLaunchOfficialReport(TPEX_OPENING_LIMIT_URL,'application/csv',TPEX_OPENING_LIMIT_MAX_BYTES,fetchPage);
    const observedAt=new Date().toISOString();
    readTpexOpeningLimitRows(data.session,body);
    const saved=await writer.rpc(command,{...lease,p_action:'append',p_session:data.session,p_observed_at:observedAt,
      p_session_authority_id:data.sessionAuthorityId,p_sha256:sha256,p_body:'\\x'+body.toString('hex')});
    if(saved.error||!object(saved.data)||saved.data.session!==data.session||saved.data.sessionAuthorityId!==data.sessionAuthorityId
      ||saved.data.sha256!==sha256||evidenceInstant(saved.data.recordedAt)===null||typeof saved.data.replay!=='boolean')return 'deferred' as const;
    return saved.data.replay?'replay' as const:'written' as const;
  }catch{return 'deferred' as const;}
}

export async function readLaunchTpexOpeningLimits(writer:Writer,principal:string,owner:string,session:string,
  asOf:string):Promise<TpexOpeningLimitReceipt|null>{
  try{
    const {data,error}=await writer.rpc(command,{...scope(principal,owner),p_action:'read',p_session:session,p_as_of:asOf});
    if(error||!object(data)||data.session!==session||!authorityId(data.sessionAuthorityId)
      ||typeof data.observedAt!=='string'||typeof data.recordedAt!=='string'||typeof data.sha256!=='string')return null;
    const observed=evidenceInstant(data.observedAt),recorded=evidenceInstant(data.recordedAt),cutoff=evidenceInstant(asOf);
    if(observed===null||recorded===null||cutoff===null||observed>recorded||recorded>cutoff)return null;
    const body=decodeLaunchOfficialReceiptBody(data.bodyBase64,data.sha256,TPEX_OPENING_LIMIT_MAX_BYTES);
    return body&&{session,sessionAuthorityId:data.sessionAuthorityId,observedAt:data.observedAt,recordedAt:data.recordedAt,
      sha256:data.sha256,body};
  }catch{return null;}
}
