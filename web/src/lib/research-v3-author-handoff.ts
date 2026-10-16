/** Private unactivated v3 composition. Requires the candidate five-key current
 * handoff-context RPC; no legacy fallback, active READ after completion or retry. */
import {requireExactInternalBearer} from './internal-auth.ts';
import {resolveResearchControllerIdentity,validateSavedResearchExecutionObservation} from './research-execution-binding.ts';
import {parseBindingCore,bindingCanonical} from './research-versioned-input-binding.ts';
import {parseCompleteRequest,type CompleteRequest} from './research-versioned-input-request.ts';
import {completeHash,completeCanonical,parseCompleteJson} from './research-v3-material-canonical.ts';
import {FinancialIoDeadline} from './research-financial-io-owner.ts';
import {financialInstant} from './research-financial-clock.ts';
import {createV3BusinessArticleValidator,type ArticleSourceV2} from './research-v3-business-article.ts';
import type {VersionedInputRpc} from './research-versioned-complete-input.ts';
type Row=Record<string,unknown>;
export type V3HandoffConfig={bindingTexts:readonly string[];executorFingerprint:string};
export type V3HandoffRequest={action:string;input:CompleteRequest;inputRevisionId:string;inputHash:string;resultId:string;resultHash:string};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,HASH=/^[a-f0-9]{64}$/u;
export function handoffEnsure(ok:unknown):asserts ok{if(!ok)throw Error('research_v3_author_handoff_invalid');}
export function handoffRow(v:unknown):Row{handoffEnsure(v&&typeof v==='object'&&!Array.isArray(v));return v as Row;}
export function handoffExact(v:unknown,keys:readonly string[]):Row{const r=handoffRow(v);handoffEnsure(Object.keys(r).sort().join(',')===[...keys].sort().join(','));return r;}
const eq=(a:unknown,b:unknown)=>handoffEnsure(bindingCanonical(a)===bindingCanonical(b));
const assignmentKeys=['assignment_id','job_id','attempt','reservation_id','input_revision_id','input_hash','research_company_id','snapshot_hash','controller_principal','work_owner','canonical_request','assigned_at','reservation_started_at','reservation_expires_at','original_job_deadline'];
const revisionKeys=['revision_id','preparation_id','job_id','attempt','reservation_id','research_company_id','research_scope','snapshot_hash','request_hash','canonical_request','input_hash','canonical_payload','logical_bytes','admitted_at','research_cutoff','source_seal_id','status','dispatchReady'];
export function handoffWindow(a:Row,deadline:FinancialIoDeadline){deadline.check();const now=financialInstant(new Date().toISOString()),assigned=financialInstant(a.assigned_at),started=financialInstant(a.reservation_started_at),expires=financialInstant(a.reservation_expires_at),job=financialInstant(a.original_job_deadline);handoffEnsure(started<=assigned&&assigned<=now&&now<expires&&now<job&&expires<=started+1800_000_000_000n);}
/** Bounded private request parser, called only after role authentication. */
export async function readV3HandoffBody(http:Request,action:string,header:string,deadline:FinancialIoDeadline):Promise<V3HandoffRequest>{
 handoffEnsure(http.headers.get(header)===action&&http.headers.get('content-type')?.split(';')[0].trim()==='application/json'&&http.body);
 for(const h of ['x-research-author-result-action','x-research-author-handoff-action','x-research-review-assignment-action'])if(h!==header)handoffEnsure(!http.headers.has(h));
 const reader=http.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){deadline.check();const p=await deadline.wait(reader.read());if(p.done)break;bytes+=p.value.byteLength;handoffEnsure(bytes<=8192);chunks.push(p.value);}
  const b=handoffExact(parseCompleteJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),['action','input','inputRevisionId','inputHash','resultId','resultHash']);handoffEnsure(b.action===action);
  for(const k of ['inputRevisionId','resultId'])handoffEnsure(typeof b[k]==='string'&&UUID.test(b[k]));for(const k of ['inputHash','resultHash'])handoffEnsure(typeof b[k]==='string'&&HASH.test(b[k]));
  const input=parseCompleteRequest(b.input);deadline.check();return {...b,input} as V3HandoffRequest;
 }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}
/** Same actual promise and shared deadline; errors propagate unchanged. No retry. */
export async function handoffRpc(db:VersionedInputRpc,name:string,args:Row,deadline:FinancialIoDeadline){deadline.check();const work=Promise.resolve().then(()=>{deadline.check();return db.rpc(name,args);});work.catch(()=>{});const r=await deadline.wait(work);if(r.error)throw r.error;deadline.check();handoffEnsure(r.data!==undefined);return r.data;}
export function selectV3HandoffBinding(config:V3HandoffConfig){
 handoffEnsure(typeof config.executorFingerprint==='string'&&HASH.test(config.executorFingerprint));
 const bindings=[...config.bindingTexts].map(parseBindingCore);handoffEnsure(bindings.length>0&&bindings.length<=2&&new Set(bindings.map(b=>b.bindingCapsuleIdentity)).size===bindings.length&&bindings.every(b=>b.core.wireVersion==='research-article-input-v3'));
 return (request:CompleteRequest)=>{const found=bindings.filter(b=>b.bindingCapsuleIdentity===request.expectedCalculatorExecutionHash&&b.core.inventoryHash===request.expectedArtifactManifestHash);handoffEnsure(found.length===1&&found[0].core.compiledFingerprintIdentity===config.executorFingerprint);return found[0];};
}
function receipt(v:unknown,a:Row,result:Row){const c=handoffExact(v,['reservation_id','owner','outcome','result_hash','finished_at']);const saved=handoffRow(handoffRow(result.payload).validatedArticle),finished=financialInstant(c.finished_at);handoffEnsure(c.reservation_id===a.reservation_id&&c.owner===a.work_owner&&c.outcome==='completed'&&c.result_hash===saved.articleHash&&finished>=financialInstant(result.received_at)&&finished<=financialInstant(new Date().toISOString())&&finished<financialInstant(a.original_job_deadline)&&finished<financialInstant(a.reservation_expires_at));return c;}
/** Closed stored shape only. The composition additionally revalidates every
 * value and fresh binding from the current fenced RPC, then rereads that RPC. */
export function checkV3StoredHandoff(request:V3HandoffRequest,value:unknown,principal:string,deadline:FinancialIoDeadline){
 const encoded=JSON.stringify(value);handoffEnsure(Buffer.byteLength(encoded)<=1048576); // existing private envelope cap
 // Detach the current RPC snapshot before any later RPC can reuse its object.
 const h=handoffExact(JSON.parse(encoded),['assignment','result','revision','completion','binding']),a=handoffExact(h.assignment,assignmentKeys),r=handoffExact(h.result,['result_id','assignment_id','result_hash','logical_bytes','received_at','payload']),v=handoffExact(h.revision,revisionKeys);
 handoffEnsure(typeof a.assignment_id==='string'&&UUID.test(a.assignment_id)&&a.controller_principal===principal&&a.work_owner===request.input.owner&&a.job_id===request.input.jobId&&a.attempt===request.input.attempt&&a.reservation_id===request.input.reservationId&&a.input_revision_id===request.inputRevisionId&&a.input_hash===request.inputHash&&a.snapshot_hash===request.input.snapshotHash&&a.research_company_id===v.research_company_id);eq(a.canonical_request,request.input);
 handoffEnsure(v.status==='sealed'&&v.dispatchReady===false&&v.revision_id===request.inputRevisionId&&v.input_hash===request.inputHash&&v.request_hash===completeHash(request.input)&&v.input_hash===completeHash(v.canonical_payload)&&v.job_id===a.job_id&&v.attempt===a.attempt&&v.reservation_id===a.reservation_id&&v.preparation_id===request.input.preparationId&&v.snapshot_hash===a.snapshot_hash&&v.research_scope===request.input.scope);eq(v.canonical_request,request.input);
 const p=handoffRow(v.canonical_payload),job=handoffRow(p.originalJob),reservation=handoffRow(p.originalReservation),clocks=handoffRow(p.clocks);handoffEnsure(p.schemaVersion==='research-article-input-v3'&&a.original_job_deadline===job.leaseExpiresAt&&a.reservation_started_at===reservation.startedAt&&a.reservation_expires_at===reservation.leaseExpiresAt&&v.source_seal_id===handoffRow(p.sources).sealId&&v.admitted_at===v.research_cutoff&&v.research_cutoff===clocks.researchCutoff);
 handoffEnsure(v.logical_bytes===Buffer.byteLength(completeCanonical(request.input))+Buffer.byteLength(completeCanonical(p))&&Number(v.logical_bytes)>0&&Number(v.logical_bytes)<=524288);
 handoffEnsure(r.result_id===request.resultId&&r.assignment_id===a.assignment_id&&r.result_hash===request.resultHash&&r.result_hash===completeHash(r.payload)&&r.logical_bytes===Buffer.byteLength(completeCanonical(r.payload))&&Number(r.logical_bytes)>0&&Number(r.logical_bytes)<=1048576);
 const e=handoffExact(r.payload,['schemaVersion','assignmentId','inputRevisionId','inputHash','bindingCapsuleIdentity','wireVersion','financialProfile','validatorVersion','rawArticle','validatedArticle','observation']);
 handoffEnsure(e.schemaVersion==='research-author-result-v3-candidate'&&e.assignmentId===a.assignment_id&&e.inputRevisionId===request.inputRevisionId&&e.inputHash===request.inputHash&&e.wireVersion==='research-article-input-v3'&&e.financialProfile==='oct14_historical_cash_v1'&&e.validatorVersion==='business-article-cash-contract-v3.1'&&e.bindingCapsuleIdentity===request.input.expectedCalculatorExecutionHash);
 const received=financialInstant(r.received_at),o=handoffRow(e.observation);handoffEnsure(received>=financialInstant(a.assigned_at)&&received>=financialInstant(o.controllerObservedEndAt)&&received<=financialInstant(new Date().toISOString())&&received<financialInstant(a.original_job_deadline)&&received<financialInstant(a.reservation_expires_at));handoffWindow(a,deadline);
 const completion=h.completion===null?null:receipt(h.completion,a,r);return {h,a,r,v,e,completion};
}
/** Pure complete revalidator shared by the two server compositions. It does not
 * perform DB admission; callers supply ONLY their freshly fenced RPC context. */
export function createV3StoredHandoffRevalidator(config:V3HandoffConfig){
 const captured={bindingTexts:[...config.bindingTexts],executorFingerprint:config.executorFingerprint},select=selectV3HandoffBinding(captured),validator=createV3BusinessArticleValidator(captured);
 return (request:V3HandoffRequest,value:unknown,principal:string,deadline:FinancialIoDeadline)=>{
  const context=checkV3StoredHandoff(request,value,principal,deadline),binding=select(request.input);eq(context.h.binding,binding);
  const saved=handoffRow(context.e.validatedArticle),article=handoffRow(context.e.rawArticle);
  const checked=validator.revalidateStored(JSON.stringify(request.input),request.inputRevisionId,request.inputHash,{...context.v,binding},JSON.stringify(article),saved.sources as ArticleSourceV2[],deadline);
  eq(checked.validatedArticle,saved);
  const expected={assignmentId:String(context.a.assignment_id),jobId:request.input.jobId,attempt:request.input.attempt,reservationId:request.input.reservationId,inputRevisionId:request.inputRevisionId,inputHash:request.inputHash,articleHash:String(saved.articleHash),reviewPackHash:null,outputHash:completeHash(article),role:'author' as const,principalId:principal,workOwner:request.input.owner,originalLeaseOwner:request.input.owner,reservationRole:'company_research' as const,assignedAt:String(context.a.assigned_at),reservationStartedAt:String(context.a.reservation_started_at),reservationExpiresAt:String(context.a.reservation_expires_at),originalJobDeadline:String(context.a.original_job_deadline),receivedAt:String(context.r.received_at),articleAuthoredAt:null,author:null,usedInvocationIds:[]};
  const observation=validateSavedResearchExecutionObservation(expected,context.e.observation);handoffEnsure(observation.ok);const authored=financialInstant(article.authoredAt);handoffEnsure(financialInstant(observation.observation.controllerObservedStartAt)<=authored&&authored<=financialInstant(observation.observation.controllerObservedEndAt));
  deadline.check();return {...context,binding,checked};
 };
}
export function createV3AuthorHandoffComposition(config:V3HandoffConfig){
 const captured={bindingTexts:[...config.bindingTexts],executorFingerprint:config.executorFingerprint},select=selectV3HandoffBinding(captured),validate=createV3StoredHandoffRevalidator(captured);
 async function run(http:Request,db:VersionedInputRpc,action:'handoffAuthorResult'|'readAuthorHandoff',deadline:FinancialIoDeadline){
  handoffEnsure(requireExactInternalBearer(http));const identity=resolveResearchControllerIdentity(http,'author');handoffEnsure(identity.ok);deadline.check();const request=await readV3HandoffBody(http,action,'x-research-author-handoff-action',deadline);select(request.input);
  const args={p_request:request.input,p_revision_id:request.inputRevisionId,p_input_hash:request.inputHash,p_principal:identity.principalId,p_result_id:request.resultId,p_result_hash:request.resultHash};
  const read=()=>handoffRpc(db,'read_research_author_handoff_context_v2',args,deadline);
  const context=validate(request,await read(),identity.principalId,deadline);
  eq(await read(),context.h);handoffWindow(context.a,deadline);
  let completion=context.completion;
  if(action==='handoffAuthorResult'){
   // A transport error leaves outcome uncertain. Never retry; explicit READ uses
   // current stored context and pure revalidation, with no active input READ.
   completion=receipt(await handoffRpc(db,'commit_research_author_handoff_v2',args,deadline),context.a,context.r);
   const after=checkV3StoredHandoff(request,await read(),identity.principalId,deadline);eq({...after.h,completion:null},{...context.h,completion:null});eq(after.completion,completion);
  }
  const output={schemaVersion:'research-author-handoff-v3-candidate',receipt:completion,authorReservationCompleted:completion!==null,replayed:action==='handoffAuthorResult'&&context.completion!==null,controllerReportOnly:true,modelDispatched:false,reviewerDispatched:false,publishableResearch:false,researchQualified:false,strategyApproved:false,entryEligible:false,historicalPITEligible:false,financialVerified:false,wireDispatchEnabled:false,sourceClosureApproved:false,completedRecoveryAvailable:true};
  const snapshot=JSON.parse(JSON.stringify(output));handoffEnsure(Buffer.byteLength(JSON.stringify(snapshot))<=1048576);handoffWindow(context.a,deadline);return snapshot;
 }
 return Object.freeze({handoffAuthorResult:(http:Request,db:VersionedInputRpc,deadline=new FinancialIoDeadline())=>run(http,db,'handoffAuthorResult',deadline),readAuthorHandoff:(http:Request,db:VersionedInputRpc,deadline=new FinancialIoDeadline())=>run(http,db,'readAuthorHandoff',deadline)});
}
