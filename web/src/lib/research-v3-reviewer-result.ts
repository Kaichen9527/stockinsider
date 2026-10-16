/** Unactivated existing-signature finite-v3 reviewer receive/READ composition.
 * Requires the reviewed candidate SQL union. No fallback, automatic retry, FS,
 * dispatch, principal supplied by body, or substitute for independent execution. */
import {resolveConfiguredResearchControllerPrincipals,resolveResearchControllerIdentity,validateResearchExecutionObservation,validateSavedResearchExecutionObservation,type ResearchExecutionExpectation} from './research-execution-binding.ts';
import {FinancialIoDeadline} from './research-financial-io-owner.ts';
import {financialInstant} from './research-financial-clock.ts';
import {parseCompleteRequest} from './research-versioned-input-request.ts';
import {completeCanonical,completeHash,parseCompleteJson} from './research-v3-material-canonical.ts';
import {bindingCanonical} from './research-versioned-input-binding.ts';
import {handoffEnsure as ensure,handoffExact as exact,handoffRow as row,handoffWindow,handoffRpc,selectV3HandoffBinding,type V3HandoffRequest,type V3HandoffConfig} from './research-v3-author-handoff.ts';
import {createV3ReviewerResultProjector} from './research-v3-reviewer-result-projection.ts';
import {validateV3EditorialReview} from './research-v3-editorial-review.ts';
import type {VersionedInputRpc} from './research-versioned-complete-input.ts';
type Row=Record<string,unknown>;type RequestBody=V3HandoffRequest & {review?:unknown;observation?:unknown};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,HASH=/^[a-f0-9]{64}$/u;
const equal=(a:unknown,b:unknown)=>ensure(bindingCanonical(a)===bindingCanonical(b));
async function readBody(http:Request,action:string,deadline:FinancialIoDeadline):Promise<RequestBody>{
 ensure(http.headers.get('x-research-review-result-action')===action&&http.headers.get('content-type')?.split(';')[0].trim()==='application/json'&&http.body);
 for(const h of ['x-research-author-result-action','x-research-author-handoff-action','x-research-review-assignment-action'])ensure(!http.headers.has(h));
 const reader=http.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;try{while(true){deadline.check();const next=await deadline.wait(reader.read());if(next.done)break;bytes+=next.value.byteLength;ensure(bytes<=(action==='receiveReviewerResult'?1048576:8192));chunks.push(next.value);}
 const r=exact(parseCompleteJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),['action','input','inputRevisionId','inputHash','resultId','resultHash',...(action==='receiveReviewerResult'?['review','observation']:[])]);ensure(r.action===action);for(const k of ['inputRevisionId','resultId'])ensure(typeof r[k]==='string'&&UUID.test(r[k]));for(const k of ['inputHash','resultHash'])ensure(typeof r[k]==='string'&&HASH.test(r[k]));const input=parseCompleteRequest(r.input);ensure(Buffer.byteLength(JSON.stringify(input))<=8192);return{...r,input} as RequestBody;
 }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function createV3ReviewerResultComposition(config:V3HandoffConfig){
 const captured={bindingTexts:[...config.bindingTexts],executorFingerprint:config.executorFingerprint},select=selectV3HandoffBinding(captured),project=createV3ReviewerResultProjector(captured);
 async function run(http:Request,db:VersionedInputRpc,action:'receiveReviewerResult'|'readReviewerResult',deadline:FinancialIoDeadline){
 const identity=resolveResearchControllerIdentity(http,'reviewer'),pair=resolveConfiguredResearchControllerPrincipals();ensure(identity.ok&&pair.ok&&identity.principalId===pair.reviewerPrincipalId&&pair.authorPrincipalId!==pair.reviewerPrincipalId);deadline.check();const request=await readBody(http,action,deadline);select(request.input);
 const args={p_request:request.input,p_revision_id:request.inputRevisionId,p_input_hash:request.inputHash,p_author_principal:pair.authorPrincipalId,p_reviewer_principal:pair.reviewerPrincipalId,p_result_id:request.resultId,p_result_hash:request.resultHash};
 const rpc=(name:string,extra:Row={})=>handoffRpc(db,name,{...args,...extra},deadline);
 const read=async()=>{const v=await rpc('read_research_reviewer_result_context_v2');const encoded=JSON.stringify(v);ensure(Buffer.byteLength(encoded)<=1048576);return exact(JSON.parse(encoded),['authorContext','reviewerAssignment','reviewResult','reviewCompletion']);};
 const context=await read(),sources=await rpc('read_research_reviewer_result_sources_v2'),bound=project(request,context,sources,pair.authorPrincipalId,pair.reviewerPrincipalId,deadline);
 const envelope=(review:unknown,observation:unknown,receivedAt:string,saved:boolean)=>{
  deadline.check();const a=bound.assignment,author=bound.author,authorObservation=row(author.e.observation),validated=validateV3EditorialReview(bound.packet,review,receivedAt,bound.calculatorExecutionHash),raw=validated.review;
  const expected:ResearchExecutionExpectation={assignmentId:String(a.assignment_id),jobId:String(a.job_id),attempt:Number(a.attempt),reservationId:String(a.reservation_id),inputRevisionId:request.inputRevisionId,inputHash:request.inputHash,articleHash:String(bound.packet.articleHash),reviewPackHash:bound.packetHash,outputHash:completeHash(raw),role:'reviewer',principalId:pair.reviewerPrincipalId,workOwner:String(a.work_owner),originalLeaseOwner:request.input.owner,reservationRole:'counter_review',assignedAt:String(a.assigned_at),reservationStartedAt:String(a.reservation_started_at),reservationExpiresAt:String(a.reservation_expires_at),originalJobDeadline:String(a.original_job_deadline),receivedAt,articleAuthoredAt:String(row(author.e.rawArticle).authoredAt),author:{principalId:String(author.a.controller_principal),threadId:String(authorObservation.threadId),invocationId:String(authorObservation.invocationId)},usedInvocationIds:[]};
  // Saved and authenticated ingress are separate original validators; `saved` is
  // private control flow, never a request option, authority flag or live bypass.
  const checked=saved?validateSavedResearchExecutionObservation(expected,observation):validateResearchExecutionObservation(http,expected,observation);ensure(checked.ok);
  ensure(financialInstant(checked.observation.controllerObservedStartAt)>=financialInstant(authorObservation.controllerObservedEndAt)&&financialInstant(raw.reviewedAt)>=financialInstant(checked.observation.controllerObservedStartAt)&&financialInstant(raw.reviewedAt)<=financialInstant(checked.observation.controllerObservedEndAt));
  const value={schemaVersion:'research-reviewer-result-v3-candidate',assignmentId:a.assignment_id,authorResultId:request.resultId,authorResultHash:request.resultHash,inputRevisionId:request.inputRevisionId,inputHash:request.inputHash,bindingCapsuleIdentity:author.binding.bindingCapsuleIdentity,wireVersion:'research-article-input-v3',financialProfile:'oct14_historical_cash_v1',sourceExecutionHash:author.binding.core.sourceExecutionHash,packet:bound.packet,packetHash:bound.packetHash,rawReview:raw,validatedReview:validated,observation:checked.observation};ensure(Buffer.byteLength(completeCanonical(value))<=1048576);deadline.check();return value;
 };
 const checkSaved=(ctx:Row)=>{
  if(ctx.reviewResult===null){ensure(ctx.reviewCompletion===null);return null;}
  const s=exact(ctx.reviewResult,['result_id','assignment_id','result_hash','logical_bytes','received_at','payload']);ensure(typeof s.result_id==='string'&&UUID.test(s.result_id)&&s.assignment_id===bound.assignment.assignment_id&&s.result_hash===completeHash(s.payload)&&s.logical_bytes===Buffer.byteLength(completeCanonical(s.payload))&&Number(s.logical_bytes)>0&&Number(s.logical_bytes)<=1048576);
  const p=row(s.payload),expected=envelope(p.rawReview,p.observation,String(s.received_at),true);equal(p,expected);
  const received=financialInstant(s.received_at),now=financialInstant(new Date().toISOString()),a=bound.assignment;ensure(received>=financialInstant(a.assigned_at)&&received<=now);
  const c=exact(ctx.reviewCompletion,['reservation_id','owner','outcome','result_hash','finished_at']),finished=financialInstant(c.finished_at);ensure(c.reservation_id===a.reservation_id&&c.owner===a.work_owner&&c.outcome==='completed'&&c.result_hash===s.result_hash&&finished>=received&&finished<=now&&finished<financialInstant(a.reservation_expires_at)&&finished<financialInstant(a.original_job_deadline));return s;
 };
 let saved=checkSaved(context);equal(await read(),context); // current fence after arithmetic, before mutation
 if(action==='receiveReviewerResult'){
  const expected=envelope(request.review,request.observation,new Date().toISOString(),false);if(saved)equal(saved.payload,expected);
  // A rejection/transport error propagates unchanged. Outcome is uncertain; only
  // explicit readReviewerResult recovers. No internal second mutation.
  const received=exact(await rpc('receive_research_reviewer_result_v2',{p_result:expected}),['result_id','assignment_id','result_hash','logical_bytes','received_at','payload']);equal(received.payload,expected);
  const after=await read();equal(after.authorContext,context.authorContext);equal(after.reviewerAssignment,context.reviewerAssignment);saved=checkSaved(after);equal(saved,received);context.reviewResult=after.reviewResult;context.reviewCompletion=after.reviewCompletion;
 }
 const output=JSON.parse(JSON.stringify({schemaVersion:'research-reviewer-result-receipt-v3-candidate',result:saved,completion:context.reviewCompletion,controllerReportOnly:true,modelDispatched:false,reviewerDispatched:false,publishableResearch:false,researchQualified:false,strategyApproved:false,entryEligible:false,historicalPITEligible:false,financialVerified:false,sourceClosureApproved:false,wireDispatchEnabled:false}));ensure(Buffer.byteLength(JSON.stringify(output))<=1048576);deadline.check();equal(await rpc('read_research_reviewer_result_sources_v2'),sources);equal(await read(),context);handoffWindow(bound.assignment,deadline);return output;
 }
 return Object.freeze({receiveReviewerResult:(h:Request,d:VersionedInputRpc,b=new FinancialIoDeadline())=>run(h,d,'receiveReviewerResult',b),readReviewerResult:(h:Request,d:VersionedInputRpc,b=new FinancialIoDeadline())=>run(h,d,'readReviewerResult',b)});
}
