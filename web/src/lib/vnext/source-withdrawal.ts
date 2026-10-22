import { createHash } from 'node:crypto';
import type { VnextIdentity } from './auth.ts';
import { operatorPublicCitation } from './permitted-content.ts';
type Row=Record<string,unknown>;
type Operation='commit'|'read';
const reasons=['source_withdrawn','rights_revoked','source_retracted'];
const hashPattern=/^[a-f0-9]{64}$/u;
function keys(row:Row,expected:string[]){return Object.keys(row).sort().join('|')===[...expected].sort().join('|');}
function canonical(value:unknown):string{
 if(value && typeof value==='object' && !Array.isArray(value))return '{'+Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';
 return JSON.stringify(value);
}
export function withdrawalRequest(operation:Operation,body:Row){
 if(!body || Array.isArray(body) || !keys(body,operation==='read'?['contentHash']:['contentHash','reason','citation']) || !hashPattern.test(String(body.contentHash)))throw Error('vnext_withdrawal_closed_shape');
 if(operation==='commit' && (!reasons.includes(String(body.reason)) || typeof body.citation!=='string' || Buffer.byteLength(body.citation)>2048 || /[\s\p{Cc}@#]/u.test(body.citation) || operatorPublicCitation(body.citation)!==body.citation))throw Error('vnext_withdrawal_closed_shape');
 return structuredClone(body);
}
/** Exact server receipt; no skipped fields or caller approval flag. */
export function validateWithdrawalReceipt(value:unknown,request:Row,operation:Operation,principal:string){
 if(!value || typeof value!=='object' || Array.isArray(value))throw Error('vnext_withdrawal_receipt');
 const row=value as Row;if(operation==='read' && keys(row,['absent']) && row.absent===true)return Object.freeze({absent:true});
 if(!keys(row,['payload','hash','logicalBytes']) || !row.payload || typeof row.payload!=='object' || Array.isArray(row.payload))throw Error('vnext_withdrawal_receipt');
 const payload=row.payload as Row;
 if(!keys(payload,['schemaVersion','withdrawalId','contentHash','reason','citation','principal','createdAt','sourceReceiptHash']) || payload.schemaVersion!=='stockinsider-vnext-source-withdrawal-v1' || !/^[a-f0-9-]{36}$/u.test(String(payload.withdrawalId)) || payload.contentHash!==request.contentHash || !reasons.includes(String(payload.reason)) || !hashPattern.test(String(payload.principal)) || !hashPattern.test(String(payload.sourceReceiptHash)) || typeof payload.citation!=='string' || !Number.isFinite(Date.parse(String(payload.createdAt))))throw Error('vnext_withdrawal_receipt_binding');
 withdrawalRequest('commit',{contentHash:payload.contentHash,reason:payload.reason,citation:payload.citation});
 if(operation==='commit' && (payload.principal!==principal || payload.reason!==request.reason || payload.citation!==request.citation))throw Error('vnext_withdrawal_receipt_binding');
 const bytes=Buffer.from(canonical(payload));
 if(row.hash!==createHash('sha256').update(bytes).digest('hex') || row.logicalBytes!==bytes.length || bytes.length>8192)throw Error('vnext_withdrawal_receipt_hash');
 return structuredClone(row);
}
/** Trusted dependency seam for contract tests; production dependencies are fixed below.
 * A transport error is propagated unchanged. Only an explicit READ reconciles it;
 * no automatic resend, model call, clock refresh or source policy re-enable occurs. */
export async function sourceWithdrawalOperation(identity:VnextIdentity,operation:Operation,body:Row,dependencies:{rpc:(principal:string,operation:Operation,request:Row)=>Promise<unknown>;writer:<T>(work:()=>Promise<T>)=>Promise<T>}){
 if(identity.role!=='operator' || !hashPattern.test(identity.principal))throw Error('vnext_operator_required');
 const request=withdrawalRequest(operation,body);
 const work=async()=>validateWithdrawalReceipt(await dependencies.rpc(identity.principal,operation,request),request,operation,identity.principal);
 return operation==='commit'?dependencies.writer(work):work();
}
async function execute(identity:VnextIdentity,operation:Operation,body:Row){
 // Validate before importing a DB client or acquiring a production writer lease.
 if(identity.role!=='operator')throw Error('vnext_operator_required');withdrawalRequest(operation,body);
 const {analysisWriter}=await import('./analysis-runtime.ts');
 return sourceWithdrawalOperation(identity,operation,body,{writer:analysisWriter,rpc:async(principal,op,request)=>{
  const {vnextEnabled}=await import('./policy.ts');if(!vnextEnabled())throw Error('vnext_analysis_disabled');
  const {getSupabaseServerClient}=await import('../supabase-server.ts');
  const result=await getSupabaseServerClient().rpc('vnext_source_withdrawal_v1',{p_principal:principal,p_operation:op,p_request:request});
  if(result.error)throw result.error;return result.data;
 }});
}
export const commitSourceWithdrawal=(identity:VnextIdentity,body:Row)=>execute(identity,'commit',body);
export const readSourceWithdrawal=(identity:VnextIdentity,body:Row)=>execute(identity,'read',body);
