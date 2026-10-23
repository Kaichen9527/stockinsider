import {reviewedValuation} from './reviewed-valuation.ts';
import {inputHash} from './policy.ts';
import type {Artifact,Evidence,Review} from './research.ts';
import type {VnextIdentity} from './auth.ts';
type Row=Record<string,unknown>;
type BaselineInput={artifact:Artifact|null;review:Review|null;original:Evidence[];publishedAt:string};
/** Structural baseline projection, NOT current market/source authority. Keep the
 * original reviewed quote when validating a target; later quote movement must
 * not erase that immutable target. SQL independently checks all current rows. */
export function reviewedTargetBaseline(input:BaselineInput){
 const {artifact,review,original,publishedAt}=input;
 const matching=artifact?.claims.filter(c=>c.numeric?.key==='current_price')||[];
 const price=matching.length===1?matching[0].numeric:null;
 const source=matching.length===1?original.find(e=>matching[0].evidenceIds.includes(e.id) && e.key==='current_price' && e.value===price?.value && e.unit===price?.unit && e.period===price?.period):null;
 if(!price || !source || source.kind!=='fact' || source.sourceTier!=='official' || !Number.isFinite(Date.parse(publishedAt)))return {baseline:null,gaps:['target_original_reviewed_quote_missing']};
 const valuation=reviewedValuation({artifact,review,original,cutoff:publishedAt,quote:{close:price.value,session:price.period,source:source.source,adjusted:true,volume:null,ma20:null,ma60:null,volumeRatio:null,institutionalFlow:null}});
 const scenarioClaims=artifact!.claims.filter(c=>['valuation_bear','valuation_base','valuation_bull'].includes(c.numeric?.key||''));
 if(!valuation.usable || scenarioClaims.some(c=>c.numeric?.unit!==price.unit))return {baseline:null,gaps:[...valuation.gaps,'target_original_scenario_or_quote_unit_unusable']};
 return {baseline:{schemaVersion:'vnext-reviewed-target-baseline-v1' as const,inputHash:artifact!.inputHash,outputHash:artifact!.outputHash,base:valuation.valuation.base!,bear:valuation.valuation.bear!,bull:valuation.valuation.bull!,method:valuation.valuation.method,unit:price.unit,quoteAt:price.period,originalPrice:price.value,valuationAt:artifact!.valuationDate,claimIds:valuation.claimIds,publishedAt},gaps:[]};
}
export type TargetObservation={symbol:string;status:'exited'|'deferred';reason:string;revisionId:string|null;inputHash:string|null};
/** Actual server entry. No caller target, price, Boolean, URL or model is sent.
 * The caller already owns the existing analysis writer lease; this function
 * never acquires another lease or starts/claims research. */
export async function evaluateCachedTargets(identity:VnextIdentity,transport?:{rpc:(name:string,body:Row)=>PromiseLike<{data:unknown;error:unknown}>}){
 if(identity.role!=='operator')throw Error('vnext_operator_required');
 const client=transport|| (await import('../supabase-server.ts')).getSupabaseServerClient();
 const response=await client.rpc('vnext_target_command_v1',{p_principal:identity.principal,p_request:{}});
 if(response.error)throw Error('vnext_target_authority_unavailable');
 const data=response.data as Row|null;
 if(!data || Object.keys(data).sort().join('|')!=='observations|policyVersion' || data.policyVersion!=='vnext-target-exit-v1' || !Array.isArray(data.observations) || data.observations.length>20)throw Error('vnext_target_receipt_invalid');
 const seen=new Set<string>();
 for(const raw of data.observations){
  const row=raw as Row;
  if(!row || Object.keys(row).sort().join('|')!=='inputHash|reason|revisionId|status|symbol' || typeof row.symbol!=='string' || !/^\d{4}$/u.test(row.symbol) || seen.has(row.symbol) || typeof row.status!=='string' || !['exited','deferred'].includes(row.status) || typeof row.reason!=='string' || !/^[a-z_]{1,120}$/u.test(row.reason) || row.revisionId!==null && (typeof row.revisionId!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(row.revisionId)) || row.inputHash!==null && (typeof row.inputHash!=='string' || !/^[a-f0-9]{64}$/u.test(row.inputHash)))throw Error('vnext_target_receipt_invalid');
  seen.add(row.symbol);
 }
 return {observations:data.observations as TargetObservation[],receiptDigest:inputHash(data),scope:'server_current_publication_and_work_only' as const};
}
