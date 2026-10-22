import { openAiResponsesProvider,providerCredentialIdentity } from './provider.ts';
import { MARKET_AI_INSTRUCTIONS,freezeMarketBaseline,interpretFrozenMarket } from './market-interpretation.ts';
import { analysisWriter } from './analysis-runtime.ts';
import type { VnextIdentity } from './auth.ts';
type Row=Record<string,unknown>;
export async function runMarketInterpretation(identity:VnextIdentity,recoverId?:string){
 if(identity.role!=='operator')throw new Error('vnext_operator_required');
 const {cachedMarketSnapshot}=await import('./market-producer.ts');const {command}=await import('./store.ts');const {getSupabaseServerClient}=await import('../supabase-server.ts');
 const baseline=freezeMarketBaseline(await cachedMarketSnapshot());
 const key=process.env.OPENAI_API_KEY;const model=process.env.STOCKINSIDER_VNEXT_MARKET_MODEL;const modelVersion=process.env.STOCKINSIDER_VNEXT_MARKET_MODEL_VERSION;
 // Lack of a binding preserves the actual quantitative baseline and its gaps.
 if(!key || !model || !modelVersion)return analysisWriter(async()=>{await command(identity,'market',{market:baseline});return {status:'gap',reason:'market_ai_server_binding_missing',baseline};});
 const rpc=async(action:string,body:Row)=>{const result=await getSupabaseServerClient().rpc('vnext_market_analysis_v1',{p_principal:identity.principal,p_command:action,p_request:body});if(result.error)throw new Error(`vnext_market_ai_authority_rejected:${result.error.message}`);return result.data as Row;};
 return analysisWriter(async()=>{await command(identity,'market',{market:baseline});return interpretFrozenMarket(baseline,{rpc,provider:openAiResponsesProvider(key),model,modelVersion,credentialIdentity:providerCredentialIdentity(key),currentBaseline:async()=>freezeMarketBaseline(await cachedMarketSnapshot()),publish:(market)=>command(identity,'market',{market})},recoverId);});
}
export {MARKET_AI_INSTRUCTIONS};
