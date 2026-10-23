import {inputHash} from './policy.ts';
import {cancellationExact} from './catalyst-cancellation.ts';
import type {Artifact,Claim,Evidence,Review} from './research.ts';
export const BUSINESS_CRITERIA=['competitive_advantage','thesis_risk_analysis'] as const;
export type BusinessAnnotation={schemaVersion:'vnext-business-annotation-v1';criterion:typeof BUSINESS_CRITERIA[number];outcome:'met'|'not_met'|'unknown';symbol:string;evidenceId:string;contentHash:string;field:'statement';startCp:number;endCp:number;quote:string};
export type BusinessAssessment={schemaVersion:'vnext-business-assessment-v1';annotation:BusinessAnnotation;assessment:'supported_inference'|'unsupported'|'insufficient';reason:string};
export type BusinessReceipt={schemaVersion:'vnext-business-receipt-v1';revisionId:string;inputHash:string;symbol:string;authorInvocation:string;reviewerInvocation:string;authorExecution:string;reviewerExecution:string;criteria:Array<{criterion:typeof BUSINESS_CRITERIA[number];annotationHash:string|null;sourceId:string|null;sourceHash:string|null;observedAt:string|null;met:boolean|null;gap:string|null}>};
type Row=Record<string,unknown>;
const object=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Row,keys:string[])=>Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(v);
const clock=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
/** Exact original binding only. Official reporting does not make an investment
 * inference true; current issuer/rights/journal authority comes from the DB. */
export function businessAnnotation(claim:Claim,evidence:Evidence[],cutoff?:string,symbol?:string){
 const a=claim.business;const fail=()=>{throw Error('vnext_business_annotation_invalid');};
 if(!object(a)||!exact(a,['schemaVersion','criterion','outcome','symbol','evidenceId','contentHash','field','startCp','endCp','quote'])||['schemaVersion','criterion','outcome','symbol','evidenceId','contentHash','field','quote'].some(k=>typeof(a as unknown as Row)[k]!=='string')||a.schemaVersion!=='vnext-business-annotation-v1'||!BUSINESS_CRITERIA.includes(a.criterion)||!['met','not_met','unknown'].includes(a.outcome)||!/^\d{4}$/u.test(a.symbol)||symbol!==undefined&&a.symbol!==symbol||!hash(a.contentHash)||a.field!=='statement'||claim.kind!=='assumption'||claim.numeric!==undefined||claim.semantic!==undefined||claim.cancellation!==undefined||!Array.isArray(claim.evidenceIds)||claim.evidenceIds.length!==1||claim.evidenceIds[0]!==a.evidenceId)return fail();
 const found=evidence.filter(e=>e.id===a.evidenceId);if(found.length!==1)return fail();const e=found[0],v=e.value;
 if(e.kind!=='assumption'||e.key!=='reported_event'||e.sourceTier!=='public'||e.contentHash!==a.contentHash||!object(v)||!exact(v,['scope','originSource','claimStatus','eventBasis','statement','publishedAt','originalContentHash'])||v.scope!=='official_original'||v.originSource!=='official'||v.claimStatus!=='reported'||!['source_publication','original_event'].includes(String(v.eventBasis))||v.originalContentHash!==a.contentHash||typeof v.statement!=='string'||!clock(v.publishedAt)||!clock(e.eventAt)||!clock(e.availableAt)||Date.parse(e.eventAt)>Date.parse(v.publishedAt)||Date.parse(v.publishedAt)>Date.parse(e.availableAt)||!clock(cutoff??e.availableAt)||Date.parse(e.availableAt)>Date.parse(cutoff??e.availableAt))return fail();
 const points=Array.from(v.statement),quote=Array.from(a.quote);if(!Number.isSafeInteger(a.startCp)||!Number.isSafeInteger(a.endCp)||a.startCp<0||a.endCp<=a.startCp||a.endCp>points.length||quote.length<12||quote.length>1024||points.slice(a.startCp,a.endCp).join('')!==a.quote)return fail();
 return {annotation:a,annotationHash:inputHash(a),sourceId:e.id,sourceHash:e.contentHash,observedAt:v.publishedAt};
}
export function businessAssessment(value:unknown,annotation:BusinessAnnotation):BusinessAssessment{
 if(!object(value)||!exact(value,['schemaVersion','annotation','assessment','reason'])||value.schemaVersion!=='vnext-business-assessment-v1'||!cancellationExact(value.annotation,annotation)||!['supported_inference','unsupported','insufficient'].includes(String(value.assessment))||typeof value.reason!=='string'||Array.from(value.reason.trim()).length<20||Array.from(value.reason).length>2000||value.assessment==='insufficient'&&annotation.outcome!=='unknown')throw Error('vnext_business_assessment_invalid');
 return value as unknown as BusinessAssessment;
}
export function assertBusinessScope(value:unknown,scope:{symbol:string;cutoff:string;evidence:Evidence[]}){
 if(!object(value)||!Array.isArray(value.claims)||typeof scope.symbol!=='string'||!/^\d{4}$/u.test(scope.symbol)||!clock(scope.cutoff))throw Error('vnext_business_server_scope_missing');
 const seen=new Set<string>();for(const claim of value.claims as Claim[])if(claim.business!==undefined){const r=businessAnnotation(claim,scope.evidence,scope.cutoff,scope.symbol);if(seen.has(r.annotation.criterion))throw Error('vnext_business_duplicate_criterion');seen.add(r.annotation.criterion);}
}
/** Receipts are supplied only by current server publication context. This
 * validates transport consistency and never certifies an arbitrary receipt. */
export function businessChecklist(input:{artifact:Artifact|null;review:Review|null;original:Evidence[];current:Evidence[];cutoff:string;symbol:string;revisionId:string|null;inputHash:string;receipt?:BusinessReceipt|null}){
 const absent=(criterion:typeof BUSINESS_CRITERIA[number])=>({criterion,met:null as boolean|null,provenance:[] as string[],observedAt:null as string|null,gap:'current_business_component_authority_missing',interpretation:'labelled_inference_not_confirmed_fact'});
 try{
  const r=input.receipt;if(!object(r)||!exact(r,['schemaVersion','revisionId','inputHash','symbol','authorInvocation','reviewerInvocation','authorExecution','reviewerExecution','criteria'])||r.schemaVersion!=='vnext-business-receipt-v1'||r.revisionId!==input.revisionId||r.inputHash!==input.inputHash||r.symbol!==input.symbol||!hash(r.inputHash)||![r.revisionId,r.authorInvocation,r.reviewerInvocation,r.authorExecution,r.reviewerExecution].every(uuid)||r.authorInvocation===r.reviewerInvocation||r.authorExecution===r.reviewerExecution||!Array.isArray(r.criteria)||r.criteria.length!==2||!input.artifact||input.artifact.inputHash!==input.inputHash||input.artifact.outputHash!==inputHash({...input.artifact,outputHash:undefined})||!input.review?.approved||input.review.authorOutputHash!==input.artifact.outputHash)throw Error('receipt_missing');
  const checks=BUSINESS_CRITERIA.map(criterion=>{
   const entries=r.criteria.filter(e=>e.criterion===criterion);if(entries.length!==1)throw Error('receipt_criterion');const entry=entries[0];
   if(!object(entry)||!exact(entry,['criterion','annotationHash','sourceId','sourceHash','observedAt','met','gap'])||entry.met!==null&&typeof entry.met!=='boolean'||entry.gap!==null&&!['component_annotation_missing','component_outcome_unknown','component_assessment_insufficient'].includes(String(entry.gap)))throw Error('receipt_shape');
   const claims=input.artifact!.claims.filter(c=>c.business?.criterion===criterion);
   if(!claims.length){if(entry.annotationHash!==null||entry.sourceId!==null||entry.sourceHash!==null||entry.observedAt!==null||entry.met!==null||entry.gap!=='component_annotation_missing')throw Error('missing_binding');return {...absent(criterion),gap:entry.gap};}
   if(claims.length!==1)throw Error('claim_count');const claim=claims[0],result=businessAnnotation(claim,input.original,input.cutoff,input.symbol);
   if(!input.current.some(e=>e.id===result.sourceId&&cancellationExact(e,input.original.find(o=>o.id===e.id))))throw Error('current_source');
   const reviews=input.review!.claimChecks.filter(c=>c.claimId===claim.id&&c.verdict==='supported');if(reviews.length!==1||!reviews[0].sources.some(s=>s.id===result.sourceId&&s.contentHash===result.sourceHash))throw Error('review_missing');const a=businessAssessment(reviews[0].businessAssessment,claim.business!);if(a.assessment==='unsupported')throw Error('unsupported');
   const gap=a.assessment==='insufficient'?'component_assessment_insufficient':claim.business!.outcome==='unknown'?'component_outcome_unknown':null,met=gap?null:claim.business!.outcome==='met';
   if(entry.annotationHash!==result.annotationHash||entry.sourceId!==result.sourceId||entry.sourceHash!==result.sourceHash||entry.observedAt!==result.observedAt||entry.met!==met||entry.gap!==gap)throw Error('receipt_binding');
   return {criterion,met,provenance:[result.sourceHash,result.annotationHash],observedAt:result.observedAt,gap,interpretation:'labelled_inference_not_confirmed_fact'};
  });
  return {checks,groupAuthority:'remaining_components_not_db_verified',riskBound:null};
 }catch{return {checks:BUSINESS_CRITERIA.map(absent),groupAuthority:'remaining_components_not_db_verified',riskBound:null};}
}
