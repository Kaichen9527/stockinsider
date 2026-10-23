import {taipeiDate} from './policy.ts';
import type {Claim,Evidence} from './research.ts';
import {catalystAnnotation,catalystCalendarDate} from './semantic-criteria.ts';
export type CancellationLocator={evidenceId:string;contentHash:string;field:'statement';startCp:number;endCp:number;quote:string};
export type CancellationAnnotation={schemaVersion:'vnext-catalyst-cancellation-v1';symbol:string;catalystAt:string;catalystIdentity:string;baselineRevisionId:string|null;baselineClaimId:string|null;planned:CancellationLocator;cancelled:CancellationLocator};
export type CancellationAssessment={schemaVersion:'vnext-catalyst-cancellation-assessment-v1';annotation:CancellationAnnotation;assessment:'supported_explicit_report'|'unsupported'|'insufficient';reason:string};
export type CancellationContext={schemaVersion:'vnext-cancellation-context-v1';symbol:string;inputHash:string;baseline:null|{revisionId:string;inputHash:string;outputHash:string;publishedAt:string;cutoff:string;claims:Claim[];evidence:Evidence[]}};
export type CancellationScope={symbol:string;inputHash:string;cutoff:string;evidence:Evidence[]};
type Row=Record<string,unknown>;
const object=(v:unknown):v is Row=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Row,keys:string[])=>Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(v);
const time=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
/** Exact JSON equality includes every key, including acquisition-clock keys.
 * It is not a cryptographic identity or a substitute for the DB current fence. */
export function cancellationExact(a:unknown,b:unknown):boolean{
 if(a===b)return true;
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>cancellationExact(v,b[i]));
 if(object(a)&&object(b))return exact(a,Object.keys(b))&&Object.keys(a).every(k=>cancellationExact(a[k],b[k]));
 return false;
}
function plusThreeMonths(day:string){const year=Number(day.slice(0,4)),month=Number(day.slice(5,7))-1,date=Number(day.slice(8));const target=new Date(Date.UTC(year,month+3,1));const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(date,last));return target.toISOString().slice(0,10);}
function original(e:Evidence|undefined){
 const v=e?.value;
 return Boolean(e&&e.kind==='assumption'&&e.sourceTier==='public'&&e.key==='reported_event'&&hash(e.contentHash)&&time(e.eventAt)&&time(e.availableAt)&&object(v)&&exact(v,['scope','originSource','claimStatus','eventBasis','statement','publishedAt','originalContentHash'])&&v.scope==='official_original'&&v.originSource==='official'&&v.claimStatus==='reported'&&['source_publication','original_event'].includes(String(v.eventBasis))&&v.originalContentHash===e.contentHash&&typeof v.statement==='string'&&time(v.publishedAt)&&Date.parse(e.eventAt)<=Date.parse(v.publishedAt)&&Date.parse(v.publishedAt)<=Date.parse(e.availableAt));
}
/** Checks exact original bindings, not the semantic truth of a cancellation.
 * Issuer/current-rights authority is independently required in the private DB producer. */
export function cancellationAnnotation(claim:Claim,evidence:Evidence[],cutoff?:string,symbol?:string):CancellationAnnotation{
 const a=claim.cancellation;const fail=()=>{throw Error('vnext_cancellation_annotation_invalid');};
 if(!object(a)||!exact(a,['schemaVersion','symbol','catalystAt','catalystIdentity','baselineRevisionId','baselineClaimId','planned','cancelled'])||a.schemaVersion!=='vnext-catalyst-cancellation-v1'||typeof a.symbol!=='string'||!/^\d{4}$/u.test(a.symbol)||symbol!==undefined&&a.symbol!==symbol||!catalystCalendarDate(a.catalystAt)||typeof a.catalystIdentity!=='string'||Array.from(a.catalystIdentity).length<12||Array.from(a.catalystIdentity).length>160||a.catalystIdentity.trim()!==a.catalystIdentity||claim.kind!=='assumption'||claim.numeric!==undefined||claim.semantic!==undefined||!Array.isArray(claim.evidenceIds)||claim.evidenceIds.length!==2||new Set(claim.evidenceIds).size!==2||!(a.baselineRevisionId===null&&a.baselineClaimId===null||uuid(a.baselineRevisionId)&&typeof a.baselineClaimId==='string'&&a.baselineClaimId.length>0&&a.baselineClaimId.length<=200))return fail();
 const originals:Evidence[]=[];
 for(const l of [a.planned,a.cancelled]){
  if(!object(l)||!exact(l,['evidenceId','contentHash','field','startCp','endCp','quote'])||typeof l.evidenceId!=='string'||!claim.evidenceIds.includes(l.evidenceId)||!hash(l.contentHash)||l.field!=='statement'||typeof l.quote!=='string'||!Number.isSafeInteger(l.startCp)||!Number.isSafeInteger(l.endCp))return fail();
  const found=evidence.filter(e=>e.id===l.evidenceId);if(found.length!==1||!original(found[0])||found[0].contentHash!==l.contentHash)return fail();
  const e=found[0],v=e.value as Row,statement=v.statement as string,points=Array.from(statement),length=Array.from(l.quote).length;
  if(l.startCp<0||l.endCp<=l.startCp||l.endCp>points.length||length<12||length>1024||points.slice(l.startCp,l.endCp).join('')!==l.quote||!l.quote.includes(a.catalystIdentity)||statement.indexOf(a.catalystIdentity)!==statement.lastIndexOf(a.catalystIdentity)||!new RegExp(`(?:^|[^0-9])${a.catalystAt}(?:[^0-9]|$)`,'u').test(l.quote)||cutoff!==undefined&&(!time(cutoff)||Date.parse(e.availableAt)>Date.parse(cutoff)))return fail();
  originals.push(e);
 }
 const plannedDay=taipeiDate((originals[0].value as Row).publishedAt as string);if(a.catalystAt<plannedDay||a.catalystAt>plusThreeMonths(plannedDay))return fail();
 if(a.planned.evidenceId===a.cancelled.evidenceId||a.planned.contentHash===a.cancelled.contentHash||Date.parse((originals[0].value as Row).publishedAt as string)>=Date.parse((originals[1].value as Row).publishedAt as string)||Date.parse(originals[0].availableAt)>Date.parse(originals[1].availableAt))return fail();
 return a;
}
export function cancellationAssessment(value:unknown,annotation:CancellationAnnotation):CancellationAssessment{
 if(!object(value)||!exact(value,['schemaVersion','annotation','assessment','reason'])||value.schemaVersion!=='vnext-catalyst-cancellation-assessment-v1'||!cancellationExact(value.annotation,annotation)||!['supported_explicit_report','unsupported','insufficient'].includes(String(value.assessment))||typeof value.reason!=='string'||Array.from(value.reason.trim()).length<20||Array.from(value.reason).length>2000)throw Error('vnext_cancellation_assessment_invalid');
 return value as unknown as CancellationAssessment;
}
/** This is a validated server-packet shape, not proof that a caller owns a
 * publication. Only the DB may produce the current baseline/issuer receipt. */
export function cancellationContext(value:unknown,scope:CancellationScope):CancellationContext{
 const fail=()=>{throw Error('vnext_cancellation_context_invalid');};
 if(!object(value)||!exact(value,['schemaVersion','symbol','inputHash','baseline'])||value.schemaVersion!=='vnext-cancellation-context-v1'||typeof value.symbol!=='string'||!/^\d{4}$/u.test(value.symbol)||value.symbol!==scope.symbol||!hash(value.inputHash)||value.inputHash!==scope.inputHash||!time(scope.cutoff)||!Array.isArray(scope.evidence))return fail();
 if(value.baseline===null)return value as unknown as CancellationContext;
 const b=value.baseline;
 if(!object(b)||!exact(b,['revisionId','inputHash','outputHash','publishedAt','cutoff','claims','evidence'])||!uuid(b.revisionId)||!hash(b.inputHash)||!hash(b.outputHash)||!time(b.cutoff)||!time(b.publishedAt)||Date.parse(b.cutoff)>Date.parse(b.publishedAt)||Date.parse(b.publishedAt)>Date.parse(scope.cutoff)||!Array.isArray(b.claims)||b.claims.length>4||!Array.isArray(b.evidence)||b.evidence.length>4)return fail();
 const evidence=b.evidence as Evidence[];
 if(evidence.some(e=>!object(e)||Object.keys(e).some(k=>!['id','key','value','unit','period','contentHash','source','sourceTier','eventAt','availableAt','kind'].includes(k))||typeof e.id!=='string'||typeof e.source!=='string'||!original(e)||Date.parse(e.availableAt)>Date.parse(b.cutoff as string))||new Set(evidence.map(e=>e.id)).size!==evidence.length)return fail();
 const claims=b.claims as Claim[];
 if(new Set(claims.map(c=>c?.id)).size!==claims.length)return fail();
 for(const c of claims){
  if(!object(c)||!exact(c,['id','text','kind','evidenceIds','semantic'])||typeof c.id!=='string'||!c.id||typeof c.text!=='string'||!c.text||!Array.isArray(c.evidenceIds)||c.evidenceIds.length!==1||!c.evidenceIds.every(id=>typeof id==='string'))return fail();
  try{catalystAnnotation(c,evidence,b.cutoff as string,scope.symbol);}catch{return fail();}
 }
 if(evidence.some(e=>!claims.some(c=>c.evidenceIds.includes(e.id))))return fail();
 return value as unknown as CancellationContext;
}
export function assertCancellationScope(artifact:unknown,context:unknown,scope:CancellationScope):void{
 const c=cancellationContext(context,scope);
 if(!object(artifact)||!Array.isArray(artifact.claims)||artifact.claims.filter(c=>object(c)&&c.cancellation!==undefined).length>1)throw Error('vnext_cancellation_claims_missing');
 for(const claim of artifact.claims as Claim[]){
  if(claim.cancellation===undefined)continue;
  const a=cancellationAnnotation(claim,scope.evidence,scope.cutoff,scope.symbol);
  if(c.baseline===null){if(a.baselineRevisionId!==null||a.baselineClaimId!==null)throw Error('vnext_cancellation_baseline_mismatch');continue;}
  const b=c.baseline;if(Date.parse((scope.evidence.find(e=>e.id===a.cancelled.evidenceId)!.value as Row).publishedAt as string)<=Date.parse(b.publishedAt))throw Error('vnext_cancellation_baseline_order_invalid');
  const old=b.claims.find(v=>v.id===a.baselineClaimId);
  if(a.baselineRevisionId!==b.revisionId||!old||!old.semantic||old.semantic.outcome!=='met'||!['catalyst_dated','catalyst_verified'].includes(old.semantic.criterion)||old.semantic.catalystAt!==a.catalystAt||old.semantic.catalystIdentity!==a.catalystIdentity||old.semantic.evidenceId!==a.planned.evidenceId||old.semantic.contentHash!==a.planned.contentHash||!cancellationExact(b.evidence.find(e=>e.id===a.planned.evidenceId),scope.evidence.find(e=>e.id===a.planned.evidenceId)))throw Error('vnext_cancellation_baseline_mismatch');
 }
}
