import {randomUUID} from 'node:crypto';
import {authorPacketFixture} from './research-author-packet-fixture.mjs';
import {authorResultFixture} from './research-author-result-fixture.mjs';
import {projectResearchAuthorPacket} from '../web/src/lib/research-author-packet.ts';
import {projectResearchReviewerPacket} from '../web/src/lib/research-reviewer-assignment.ts';
import {EDITORIAL_CHECKS,validateResearchEditorialReview} from '../web/src/lib/research-editorial-review.ts';
import {resolveConfiguredResearchControllerPrincipals} from '../web/src/lib/research-execution-binding.ts';
import {completeCanonical,completeHash} from '../web/src/lib/research-complete-canonical.ts';
import {FinancialDeadline} from '../web/src/lib/research-financial-file-reader.ts';
export const syntheticReviewCredentials={INTERNAL_API_KEY:'synthetic-review-result-A',RESEARCH_REVIEW_KEY:'synthetic-review-result-R'};
export function syntheticEditorialReview(packet){
 return {schemaVersion:'research-editorial-review-v2',articleHash:packet.articleHash,reviewPackHash:completeHash(packet),reviewedAt:new Date().toISOString(),decision:'accepted',
 checks:EDITORIAL_CHECKS.map(category=>({category,status:'pass',rationale:'這是隔離合約測試的審查說明，不代表實際完成語義引用查證或投資研究。',paragraphIds:['summary']})),findings:[],strongestCounterEvidence:'競爭替代方案與驗證延誤可能影響成長假說，此段僅為合成驗收報告而非實際研究。'};
}
export function syntheticReviewerEnvelope(request,context,packet,invocation='synthetic-review-'+randomUUID()){
 const a=context.reviewerAssignment,started=new Date().toISOString(),review=syntheticEditorialReview(packet),ended=new Date().toISOString();
 const observation={version:'research_execution_observation_v2',assignmentId:a.assignment_id,jobId:a.job_id,attempt:a.attempt,reservationId:a.reservation_id,
 inputRevisionId:request.inputRevisionId,inputHash:request.inputHash,articleHash:packet.articleHash,reviewPackHash:completeHash(packet),outputHash:completeHash(review),
 verificationLevel:'trusted_controller_observation',providerSurface:'codex_cross_chat',hostId:'synthetic-fixture',threadId:randomUUID(),turnId:randomUUID(),invocationId:invocation,
 dispatchObservationHash:'d'.repeat(64),completionObservationHash:'e'.repeat(64),controllerObservedStartAt:started,controllerObservedEndAt:ended,modelIdentity:null};
 const validatedReview=validateResearchEditorialReview(packet,review,new Date().toISOString());
 return {request:{...request,action:'receiveReviewerResult',review,observation},envelope:{schemaVersion:'research-reviewer-result-v2',assignmentId:a.assignment_id,
 authorResultId:request.resultId,authorResultHash:request.resultHash,inputRevisionId:request.inputRevisionId,inputHash:request.inputHash,packet,packetHash:completeHash(packet),rawReview:review,validatedReview,observation}};
}
export async function reviewerResultFixture(symbol='2409'){
 const f=await authorPacketFixture(symbol),authorPacket=projectResearchAuthorPacket(f.request,f.revision,f.assignment,f.response,new FinancialDeadline()).packet;
 const draft=authorResultFixture(f.request,f.revision,authorPacket),pair=resolveConfiguredResearchControllerPrincipals(syntheticReviewCredentials),received=new Date().toISOString();
 const result={result_id:randomUUID(),assignment_id:f.assignment.assignment_id,result_hash:completeHash(draft.envelope),logical_bytes:Buffer.byteLength(completeCanonical(draft.envelope)),received_at:received,payload:draft.envelope};
 const author={...f.assignment,controller_principal:pair.authorPrincipalId,canonical_request:f.request.input};
 const reviewer={assignment_id:randomUUID(),author_assignment_id:author.assignment_id,author_result_id:result.result_id,author_result_hash:result.result_hash,
 job_id:author.job_id,attempt:author.attempt,input_revision_id:author.input_revision_id,input_hash:author.input_hash,reviewer_principal:pair.reviewerPrincipalId,work_owner:author.work_owner,
 reservation_id:randomUUID(),reservation_started_at:received,reservation_expires_at:author.reservation_expires_at,original_job_deadline:author.original_job_deadline,assigned_at:received};
 const h={assignment:author,result,revision:f.revision,completion:{reservation_id:author.reservation_id,owner:author.work_owner,outcome:'completed',result_hash:draft.envelope.validatedArticle.articleHash,finished_at:received}};
 const context={authorContext:h,reviewerAssignment:reviewer,reviewResult:null,reviewCompletion:null},request={...f.request,action:'receiveReviewerResult',resultId:result.result_id,resultHash:result.result_hash};
 const packet=projectResearchReviewerPacket({...request,action:'readReviewerPacket'},{author,reviewer,result,revision:f.revision},f.response,new FinancialDeadline());
 return {...syntheticReviewerEnvelope(request,context,packet),context,packet,pair,sources:{sourceSealReceivedAt:f.response.sourceSealReceivedAt,sources:f.response.sources}};
}
// Fill only legal review prose to an exact SHARED canonical UTF8 byte boundary.
// Quotes/backslash/newline and Chinese stay in the text, never stripped for size.
export function canonicalSizedEditorialReview(base,target=65536){
 const review=structuredClone(base);review.findings=Array.from({length:30},()=>({severity:'minor',paragraphId:null,issue:'中文跳脫測試含 "quote" 與 \\ slash。\n這是隔離的測試段落。',sourceIds:[]}));
 let remaining=target-Buffer.byteLength(completeCanonical(review));if(remaining<0)throw Error('synthetic_boundary_base_too_large');
 for(const finding of review.findings){const n=Math.min(Math.floor(remaining/3),2000-finding.issue.length);finding.issue+='中'.repeat(n);remaining-=n*3;
  if(remaining<=2&&finding.issue.length+remaining<=2000){finding.issue+='a'.repeat(remaining);remaining=0;}if(!remaining)break;}
 if(remaining||Buffer.byteLength(completeCanonical(review))!==target)throw Error('synthetic_boundary_not_exact');return review;
}
