import {deepFactors,type DeepInputs} from './factors.ts';
import {validateArtifact,validateClaim,validateReview,type Artifact,type Evidence,type Review} from './research.ts';
import type {AuditQuote} from './thesis-audit.ts';
import {taipeiDate} from './policy.ts';
type Input={artifact:Artifact|null;review:Review|null;original:Evidence[];current?:Evidence[];quote:AuditQuote;cutoff:string};
const methods=['forward_pe','forward_pb','normalized_pe','ev_ebitda','dcf'];
const units=new Set(['TWD','TWD_per_share','TWD/share']);
/** A finite structural valuation gate, not a substitute for semantic review or
 * the separate official financial/corporate-action entry authority. Nothing in
 * this projection supplies a forecast, a multiple, or a missing scenario. */
export function reviewedValuation(input:Input){
 const {artifact,review,quote,cutoff}=input;const evidence=input.current||input.original;const gaps:string[]=[];
 const known=Number.isFinite(Date.parse(cutoff));
 if(!known || !artifact || !validateArtifact(artifact,input.original,artifact.inputHash).valid)gaps.push('valuation_artifact_invalid');
 if(!artifact || !review || review.approved!==true || validateReview(review,artifact,input.original).length)gaps.push('valuation_original_review_incomplete');
 const supported=(id:string)=>review?.claimChecks.filter((check)=>check.claimId===id && check.verdict==='supported').length===1;
 const usableClaim=(id:string)=>artifact?.claims.find((claim)=>claim.id===id && supported(id) && !validateClaim(claim,evidence).length && claim.evidenceIds.every((sourceId)=>{const source=evidence.find((row)=>row.id===sourceId);return source && Number.isFinite(Date.parse(source.availableAt)) && Date.parse(source.availableAt)<=Date.parse(cutoff);}));
 const scenarios=['valuation_bear','valuation_base','valuation_bull'].map((key)=>{
  const matching=artifact?.claims.filter((claim)=>claim.numeric?.key===key)||[];
  const claim=matching.length===1?usableClaim(matching[0].id):undefined;
  if(!claim?.numeric || !units.has(claim.numeric.unit))gaps.push(`valuation_scenario_missing_or_unreviewed:${key}`);
  return claim;
 });
 const methodClaims=artifact?.claims.filter((claim)=>methods.some((method)=>claim.id===`valuation:${method}`))||[];
 const method=methodClaims.length===1 && usableClaim(methodClaims[0].id)?methodClaims[0].id.slice('valuation:'.length):'unknown';
 if(method==='unknown')gaps.push('valuation_method_missing_or_unreviewed');
 if(scenarios.every((claim)=>claim?.numeric) && (new Set(scenarios.map((claim)=>claim!.numeric!.unit)).size!==1 || new Set(scenarios.map((claim)=>claim!.numeric!.period)).size!==1))gaps.push('valuation_scenario_unit_or_period_mismatch');
 const priceClaims=artifact?.claims.filter((claim)=>claim.numeric?.key==='current_price' && usableClaim(claim.id) && units.has(claim.numeric!.unit) && claim.numeric!.period===quote.session && claim.numeric!.value===quote.close)||[];
 if(!quote.adjusted || quote.close===null || !Number.isFinite(quote.close) || quote.close<=0 || !quote.session || !quote.source || priceClaims.length!==1)gaps.push('valuation_actual_reviewed_quote_missing');
 if(!known || !artifact || artifact.quoteDate!==quote.session || !Number.isFinite(Date.parse(artifact.valuationDate)) || artifact.valuationDate<String(quote.session||'') || artifact.valuationDate>taipeiDate(cutoff))gaps.push('valuation_dates_not_current_quote_asof');
 const bear=scenarios[0]?.numeric?.value??null,base=scenarios[1]?.numeric?.value??null,bull=scenarios[2]?.numeric?.value??null;
 const current=quote.adjusted?quote.close:null;
 if(current!==null && base!==null && base<=current)gaps.push('valuation_no_remaining_upside');
 const raw:DeepInputs['valuation']={current,bear,base,bull,method,quoteAt:quote.session||'',valuationAt:artifact?.valuationDate||'',provenance:quote.adjusted && quote.source?[quote.source,...(quote.provenance||[]),...scenarios.flatMap((claim)=>claim?.evidenceIds||[])]:[]};
 // Reuse the approved deep core's ordered, positive scenarios, dated quote,
 // positive downside and disclosed reward/risk calculation with original weights.
 const factor=deepFactors({cutoff,valuation:raw,profitabilityChecklist:{checks:[]},technicalChipsChecklist:{checks:[]},catalystChecklist:{checks:[]},marketLiquidityChecklist:{checks:[]}}).factors.valuation;
 if(factor.value===null)gaps.push('valuation_scenarios_or_downside_unusable');
 const usable=gaps.length===0;
 const remainingUpside=usable?base!/current!-1:null;const downside=usable?1-bear!/current!:null;
 return {usable,valuation:usable?raw:{...raw,bear:null,base:null,bull:null,method:'unknown'},remainingUpside,downside,rewardRisk:usable?remainingUpside!/downside!:null,
  claimIds:usable?[...new Set([...scenarios.map((claim)=>claim!.id),methodClaims[0].id,priceClaims[0].id])]:[],gaps};
}
