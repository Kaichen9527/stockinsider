/** Private candidate reviewer composition. Requires current five-key handoff
 * binding fence. No dispatch, reviewer result, publication, FS or legacy fallback. */
import {resolveConfiguredResearchControllerPrincipals,resolveResearchControllerIdentity} from './research-execution-binding.ts';
import {FinancialIoDeadline} from './research-financial-io-owner.ts';
import {financialInstant} from './research-financial-clock.ts';
import {bindingCanonical} from './research-versioned-input-binding.ts';
import {completeHash} from './research-v3-material-canonical.ts';
import {projectResearchAuthorPacket} from './research-v3-author-result.ts';
import type {VersionedInputRpc} from './research-versioned-complete-input.ts';
import {handoffEnsure as ensure,handoffExact as exact,handoffRow as row,handoffWindow,readV3HandoffBody,handoffRpc,selectV3HandoffBinding,createV3StoredHandoffRevalidator,type V3HandoffConfig} from './research-v3-author-handoff.ts';
type Row=Record<string,unknown>;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const equal=(a:unknown,b:unknown)=>ensure(bindingCanonical(a)===bindingCanonical(b));
function freeze<T>(v:T):T{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
export function createV3ReviewerAssignmentComposition(config:V3HandoffConfig){
 const captured={bindingTexts:[...config.bindingTexts],executorFingerprint:config.executorFingerprint},select=selectV3HandoffBinding(captured),validate=createV3StoredHandoffRevalidator(captured);
 async function run(http:Request,db:VersionedInputRpc,action:'assignReviewer'|'readReviewerAssignment'|'readReviewerPacket',deadline:FinancialIoDeadline){
  const identity=resolveResearchControllerIdentity(http,'reviewer'),principals=resolveConfiguredResearchControllerPrincipals();
  ensure(identity.ok&&principals.ok&&identity.principalId===principals.reviewerPrincipalId&&principals.authorPrincipalId!==identity.principalId);deadline.check();
  const authorPrincipal=principals.authorPrincipalId,reviewerPrincipal=identity.principalId;
  const request=await readV3HandoffBody(http,action,'x-research-review-assignment-action',deadline);select(request.input);
  const args={p_request:request.input,p_revision_id:request.inputRevisionId,p_input_hash:request.inputHash,p_author_principal:authorPrincipal,p_reviewer_principal:reviewerPrincipal,p_result_id:request.resultId,p_result_hash:request.resultHash};
  const read=()=>handoffRpc(db,'read_research_reviewer_context_v2',args,deadline);
  function check(raw:unknown){
   const encoded=JSON.stringify(raw);ensure(Buffer.byteLength(encoded)<=1048576);const context=exact(JSON.parse(encoded),['authorContext','reviewerAssignment']),author=validate(request,context.authorContext,authorPrincipal,deadline);ensure(author.completion!==null);
   let assignment:Row|null=null;
   if(context.reviewerAssignment!==null){
    const a=exact(context.reviewerAssignment,['assignment_id','author_assignment_id','author_result_id','author_result_hash','job_id','attempt','input_revision_id','input_hash','reviewer_principal','work_owner','reservation_id','reservation_started_at','reservation_expires_at','original_job_deadline','assigned_at']);
    ensure(typeof a.assignment_id==='string'&&UUID.test(a.assignment_id)&&typeof a.reservation_id==='string'&&UUID.test(a.reservation_id)&&a.reservation_id!==author.a.reservation_id&&a.author_assignment_id===author.a.assignment_id&&a.author_result_id===request.resultId&&a.author_result_hash===request.resultHash&&a.job_id===request.input.jobId&&a.attempt===request.input.attempt&&a.input_revision_id===request.inputRevisionId&&a.input_hash===request.inputHash&&a.reviewer_principal===reviewerPrincipal&&a.work_owner===request.input.owner&&a.original_job_deadline===author.a.original_job_deadline&&financialInstant(a.reservation_started_at)>=financialInstant(author.completion.finished_at));handoffWindow(a,deadline);assignment=a;
   }
   return {context,author,assignment};
  }
  let current=check(await read());
  if(action==='assignReviewer'){
   // No retry on transport loss. readReviewerAssignment is the explicit recovery.
   const assigned=await handoffRpc(db,'assign_research_reviewer_v2',args,deadline),after=check(await read());
   equal(after.context.authorContext,current.context.authorContext);equal(after.assignment,assigned);
   if(current.assignment!==null)equal(assigned,current.assignment);current=after;
  }
  let packet:Row|null=null;
  if(action==='readReviewerPacket'){
   ensure(current.assignment!==null);
   const source=exact(await handoffRpc(db,'read_research_reviewer_sources_v2',args,deadline),['sourceSealReceivedAt','sources']);
   const author=current.author,{controller_principal:_principal,canonical_request:_request,...assignment}=author.a;void _principal;void _request;
   // Reuse exact existing rights/manifest/clock/size and scenario projection.
   const projected=projectResearchAuthorPacket(request,author.v,assignment,{assignment,inputRevisionId:request.inputRevisionId,inputHash:request.inputHash,...source},deadline);
   const research=projected.packet,saved=row(author.e.validatedArticle);
   equal((research.sources as Row[]).map(s=>s.descriptor),saved.sources);
   // Flatten the research projection at the original depth. Full article/tables
   // are retained; no truncation and no unbounded full-node catalogue in packet.
   const {schemaVersion:_authorPacketSchema,assignmentId:authorAssignmentId,writingWindow:authorWritingWindow,...researchFields}=research;void _authorPacketSchema;
   packet={...researchFields,schemaVersion:'research-reviewer-packet-v3-candidate',authorAssignmentId,authorWritingWindow,
    writingWindow:{assignedAt:current.assignment.assigned_at,originalJobDeadline:current.assignment.original_job_deadline,originalReservationDeadline:current.assignment.reservation_expires_at},
    reviewerAssignmentId:current.assignment.assignment_id,reviewerAssignment:current.assignment,
    authorResultId:request.resultId,authorResultHash:request.resultHash,authorReceipt:author.completion,
    requestHash:author.v.request_hash,articleHash:saved.articleHash,bindingCapsuleIdentity:author.binding.bindingCapsuleIdentity,bindingCore:author.binding.core,
    validatorVersion:saved.validatorVersion,article:author.e.rawArticle,tables:saved.tables,valuations:saved.valuations,
    cashCitationContext:author.checked.citations.context,
    policy:{sourceEvidenceUntrusted:true,independentClaimReviewRequired:true,reviewTextLimit:65536,receiveEnvelopeLimit:1048576,financialFactsFromTypedReferencesOnly:true},
    controllerReportOnly:true,dispatchReady:false,modelDispatched:false,reviewerDispatched:false,publishableResearch:false,researchQualified:false,strategyApproved:false,entryEligible:false,historicalPITEligible:false,financialVerified:false,wireDispatchEnabled:false,sourceClosureApproved:false,valuationApproved:false,technicalAdmission:false,forecastCash:null,noFutureCash:true};
  }
  const snapshot=JSON.parse(JSON.stringify(packet)) as Row|null,packetHash=snapshot===null?null:completeHash(snapshot);
  const output=JSON.parse(JSON.stringify({schemaVersion:'research-reviewer-assignment-v3-candidate',assignment:current.assignment,packet:snapshot,packetHash,controllerReportOnly:true,dispatchReady:false,reviewerDispatched:false,modelDispatched:false,publishableResearch:false,researchQualified:false,strategyApproved:false,entryEligible:false,historicalPITEligible:false,financialVerified:false,wireDispatchEnabled:false,sourceClosureApproved:false}));
  ensure(Buffer.byteLength(JSON.stringify(output))<=1048576);deadline.check();
  // Last current DB fence follows all calculations/serialization, under the same
  // budget. A withdrawal or read tombstone here propagates; no packet escapes.
  equal(await read(),current.context);handoffWindow(current.author.a,deadline);if(current.assignment!==null)handoffWindow(current.assignment,deadline);
  return freeze(output);
 }
 return Object.freeze({assignReviewer:(h:Request,d:VersionedInputRpc,b=new FinancialIoDeadline())=>run(h,d,'assignReviewer',b),readReviewerAssignment:(h:Request,d:VersionedInputRpc,b=new FinancialIoDeadline())=>run(h,d,'readReviewerAssignment',b),readReviewerPacket:(h:Request,d:VersionedInputRpc,b=new FinancialIoDeadline())=>run(h,d,'readReviewerPacket',b)});
}
