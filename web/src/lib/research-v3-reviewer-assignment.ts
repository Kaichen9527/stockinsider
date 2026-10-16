/** Private reviewer caller boundary. Existing context has a real v3 binding-
 * revocation gap after author completion. Read the actual seven-argument RPC,
 * validate identity/row/window, then fail closed BEFORE assignment or sources.
 * This is intentionally not a usable reviewer packet, dispatch or approval. */
import {resolveConfiguredResearchControllerPrincipals,resolveResearchControllerIdentity} from './research-execution-binding.ts';
import {FinancialIoDeadline} from './research-financial-io-owner.ts';
import {financialInstant} from './research-financial-clock.ts';
import type {VersionedInputRpc} from './research-versioned-complete-input.ts';
import {handoffEnsure as ensure,handoffExact as exact,handoffWindow,readV3HandoffBody,handoffRpc,selectV3HandoffBinding,checkV3StoredHandoff,type V3HandoffConfig} from './research-v3-author-handoff.ts';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
export function createV3ReviewerAssignmentComposition(config:V3HandoffConfig){
 const select=selectV3HandoffBinding({bindingTexts:[...config.bindingTexts],executorFingerprint:config.executorFingerprint});
 async function run(http:Request,db:VersionedInputRpc,action:'assignReviewer'|'readReviewerAssignment'|'readReviewerPacket',deadline:FinancialIoDeadline):Promise<never>{
  const identity=resolveResearchControllerIdentity(http,'reviewer'),principals=resolveConfiguredResearchControllerPrincipals();
  ensure(identity.ok&&principals.ok&&identity.principalId===principals.reviewerPrincipalId&&principals.authorPrincipalId!==identity.principalId);deadline.check();
  const request=await readV3HandoffBody(http,action,'x-research-review-assignment-action',deadline);select(request.input);
  const args={p_request:request.input,p_revision_id:request.inputRevisionId,p_input_hash:request.inputHash,p_author_principal:principals.authorPrincipalId,p_reviewer_principal:identity.principalId,p_result_id:request.resultId,p_result_hash:request.resultHash};
  const raw=await handoffRpc(db,'read_research_reviewer_context_v2',args,deadline);ensure(Buffer.byteLength(JSON.stringify(raw))<=1048576);
  const context=exact(raw,['authorContext','reviewerAssignment']),author=checkV3StoredHandoff(request,context.authorContext,principals.authorPrincipalId,deadline);ensure(author.completion!==null);
  if(context.reviewerAssignment!==null){
   const a=exact(context.reviewerAssignment,['assignment_id','author_assignment_id','author_result_id','author_result_hash','job_id','attempt','input_revision_id','input_hash','reviewer_principal','work_owner','reservation_id','reservation_started_at','reservation_expires_at','original_job_deadline','assigned_at']);
   ensure(typeof a.assignment_id==='string'&&UUID.test(a.assignment_id)&&typeof a.reservation_id==='string'&&UUID.test(a.reservation_id)&&a.reservation_id!==author.a.reservation_id&&a.author_assignment_id===author.a.assignment_id&&a.author_result_id===request.resultId&&a.author_result_hash===request.resultHash&&a.job_id===request.input.jobId&&a.attempt===request.input.attempt&&a.input_revision_id===request.inputRevisionId&&a.input_hash===request.inputHash&&a.reviewer_principal===identity.principalId&&a.work_owner===request.input.owner&&a.original_job_deadline===author.a.original_job_deadline&&financialInstant(a.reservation_started_at)>=financialInstant(author.completion.finished_at));handoffWindow(a,deadline);
  }
  // Existing SQL checks source/claim/completion/reservation but not the candidate
  // registry tombstone. No service-role EXECUTE on the private resolver, no new
  // RPC/grant allowed in this source slice. Never fake it or use active READ.
  deadline.check();throw Error('research_v3_completed_binding_fence_unavailable');
 }
 return Object.freeze({assignReviewer:(h:Request,d:VersionedInputRpc,b=new FinancialIoDeadline())=>run(h,d,'assignReviewer',b),readReviewerAssignment:(h:Request,d:VersionedInputRpc,b=new FinancialIoDeadline())=>run(h,d,'readReviewerAssignment',b),readReviewerPacket:(h:Request,d:VersionedInputRpc,b=new FinancialIoDeadline())=>run(h,d,'readReviewerPacket',b)});
}
