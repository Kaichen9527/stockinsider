import type {VnextIdentity} from './auth.ts';
import {explicitScope,vnextEnabled} from './policy.ts';
type Row=Record<string,unknown>;
export function cachedAdmissionBody(body:Row){
 const symbols=explicitScope(body.symbols);
 if(Object.keys(body).some((key)=>!['action','symbols','requestKey'].includes(key)))throw new Error('vnext_cached_admission_fields_required');
 if(typeof body.requestKey!=='string' || !/^[\w:.-]{1,180}$/u.test(body.requestKey))throw new Error('vnext_request_key_required');
 return {symbols,requestKey:body.requestKey};
}
export function currentReceiptBody(body:Row){
 if(Object.keys(body).some((key)=>!['action','receiptIds'].includes(key)) || !Array.isArray(body.receiptIds) || body.receiptIds.length>200 || body.receiptIds.some((id)=>typeof id!=='string' || !/^[a-f0-9]{64}$/u.test(id)))throw new Error('vnext_current_receipt_hash_scope_required');
 return [...new Set(body.receiptIds as string[])].sort();
}
export async function cachedAdmissionCommand(identity:VnextIdentity,action:string,body:Row){
 if(identity.role!=='operator' || !vnextEnabled())throw new Error('vnext_cached_operator_mode_required');
 const {getSupabaseServerClient}=await import('../supabase-server.ts');
 const result=await getSupabaseServerClient().rpc('vnext_cached_admission_v1',{p_principal:identity.principal,p_command:action,p_request:body});
 if(result.error)throw new Error(`vnext_cached_admission_rejected:${result.error.message}`);if(!result.data || typeof result.data!=='object')throw new Error('vnext_cached_admission_receipt_missing');return result.data as Row;
}
/** Called inside one authenticated generic writer lease; never acquires another. */
export async function enqueueCachedScope(identity:VnextIdentity,body:Row){
 if(identity.role!=='operator')throw new Error('vnext_operator_required');const scope=cachedAdmissionBody(body);
 if(!scope.symbols.length)return {jobs:[],reason:'empty_scope',expensiveCalls:0};
 await(await import('./calendar-sync.ts')).synchronizeCachedCalendar(identity);
 const {scanCachedCandidates}=await import('./discovery.ts');return scanCachedCandidates(identity,undefined,undefined,{...scope,admissionOnly:true});
}
