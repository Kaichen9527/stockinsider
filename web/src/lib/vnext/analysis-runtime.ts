import type { VnextIdentity } from './auth.ts';
import type { WorkerRow } from './worker-core.ts';
export async function analysisCommand(identity:VnextIdentity,action:string,body:WorkerRow){
 if(identity.role!=='operator')throw new Error('vnext_operator_required');
 const {vnextEnabled}=await import('./policy.ts');if(!vnextEnabled())throw new Error('vnext_analysis_disabled');
 const {getSupabaseServerClient}=await import('../supabase-server.ts');const result=await getSupabaseServerClient().rpc('vnext_analysis_command_v1',{p_principal:identity.principal,p_command:action,p_request:body});
 if(result.error)throw new Error(`vnext_analysis_authority_rejected:${result.error.message}`);return result.data as WorkerRow;
}
export async function analysisWriter<T>(work:()=>Promise<T>){
 const {requireActiveVpsWriter}=await import('../taiwan-data-runtime.ts');const writer=await requireActiveVpsWriter();if(!writer.ok)throw new Error(writer.error);
 const {acquireProductionWriteLease,releaseProductionWriteLease}=await import('../production-write-lease.ts');const lease=await acquireProductionWriteLease(300);if(!lease)throw new Error('production_write_cycle_already_running');
 try{return await work();}finally{await releaseProductionWriteLease(lease);}
}
