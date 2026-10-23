import type { VnextIdentity } from './auth.ts';
type Row=Record<string,unknown>;
export async function thesisCommand(identity:VnextIdentity,action:string,body:Row){
 if(identity.role!=='operator')throw new Error('vnext_operator_required');
 const {vnextEnabled}=await import('./policy.ts');if(!vnextEnabled())throw new Error('vnext_thesis_disabled');
 const {getSupabaseServerClient}=await import('../supabase-server.ts');
 const receipt=await getSupabaseServerClient().rpc('vnext_thesis_command_v1',{p_principal:identity.principal,p_command:action,p_request:body});
 if(receipt.error)throw new Error(`vnext_thesis_authority_rejected:${receipt.error.message}`);if(!receipt.data || typeof receipt.data!=='object')throw new Error('vnext_thesis_receipt_missing');return receipt.data as Row;
}
