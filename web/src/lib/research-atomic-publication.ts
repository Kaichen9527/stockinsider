import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from './supabase-server.ts';
import { requireExactInternalBearer } from './internal-auth.ts';
import { resolveConfiguredResearchControllerPrincipals, resolveResearchControllerIdentity,
  validateSavedResearchExecutionObservation, type ResearchExecutionExpectation } from './research-execution-binding.ts';
import { completeCanonical, completeHash, parseCompleteJson } from './research-complete-canonical.ts';
import { parseCompleteRequest, type CompleteRequest } from './research-complete-input.ts';
import { FinancialDeadline } from './research-financial-file-reader.ts';
import { financialInstant } from './research-financial-clock.ts';
import { validateResearchReviewerContext, projectResearchReviewerPacket, type ReviewerAssignmentRequest } from './research-reviewer-assignment.ts';
import { validateResearchEditorialReview } from './research-editorial-review.ts';
type Row = Record<string, unknown>;
export type ResearchPublicationRequest = { action: 'publishResearchArticle' | 'readResearchPublication'; input: CompleteRequest;
  inputRevisionId: string; inputHash: string; authorResultId: string; authorResultHash: string; reviewerResultId: string; reviewerResultHash: string };
function ensure(value: unknown): asserts value { if (!value) throw new Error('research_publication_invalid'); }
function object(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
function exact(value: unknown, keys: string[]): Row { const row = object(value); ensure(Object.keys(row).sort().join(',') === keys.sort().join(',')); return row; }
const keys = ['action','input','inputRevisionId','inputHash','authorResultId','authorResultHash','reviewerResultId','reviewerResultHash'];
export async function readResearchPublicationBody(request: Request, deadline: FinancialDeadline): Promise<ResearchPublicationRequest> {
  const action = request.headers.get('x-research-publication-action');
  ensure(request.headers.get('x-research-input-version') === '2' && ['publishResearchArticle','readResearchPublication'].includes(String(action))
    && !['x-research-execution-version','x-research-author-result-action','x-research-author-handoff-action',
      'x-research-review-assignment-action','x-research-review-result-action'].some(key => request.headers.has(key))
    && request.headers.get('content-type')?.split(';')[0].trim() === 'application/json' && request.body);
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { deadline.check(); const part = await deadline.wait(reader.read()); if (part.done) break;
      size += part.value.byteLength; ensure(size <= 8192); chunks.push(part.value); }
    const row = exact(parseCompleteJson(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))),keys);
    ensure(row.action === action);
    for (const key of ['inputRevisionId','authorResultId','reviewerResultId']) ensure(typeof row[key] === 'string'
      && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(row[key]));
    for (const key of ['inputHash','authorResultHash','reviewerResultHash']) ensure(typeof row[key] === 'string' && /^[a-f0-9]{64}$/u.test(row[key]));
    return { ...row, input: parseCompleteRequest(row.input) } as ResearchPublicationRequest;
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function researchPublicationContent(authorPayload: unknown) {
  const p = object(authorPayload), v = object(p.validatedArticle);
  return { schemaVersion: 'research-publication-v2', deepResearch: { schemaVersion: 'research-published-v2', articleHash: v.articleHash,
    article: p.rawArticle, tables: v.tables, valuations: v.valuations, originalModelCutoff: v.originalModelCutoff,
    researchCutoff: v.researchCutoff, limitations: v.limitations, researchQualified: false, strategyApproved: false, entryEligible: false } };
}
/** Recompute immutable saved reports without impersonating either role's HTTP request. */
export function validateResearchPublicationContext(request: ResearchPublicationRequest, context: Row, rawSources: Row,
  authorPrincipal: string, reviewerPrincipal: string, deadline: FinancialDeadline) {
  exact(context,['authorContext','reviewerAssignment','reviewResult','reviewCompletion']);
  const active: ReviewerAssignmentRequest = { ...request, action:'readReviewerPacket', resultId: request.authorResultId, resultHash:request.authorResultHash };
  const bound = validateResearchReviewerContext(active,{authorContext:context.authorContext,reviewerAssignment:context.reviewerAssignment},authorPrincipal,reviewerPrincipal,deadline);
  ensure(bound.reviewer); const a = bound.author, ra = bound.reviewer, ar = bound.result, ap = object(ar.payload), av = object(ap.validatedArticle);
  const base = { jobId:request.input.jobId,attempt:request.input.attempt,inputRevisionId:request.inputRevisionId,inputHash:request.inputHash,
    articleHash:String(av.articleHash),workOwner:request.input.owner,originalLeaseOwner:request.input.owner,usedInvocationIds:[] };
  const authorExpected: ResearchExecutionExpectation = { ...base, assignmentId:String(a.assignment_id),reservationId:String(a.reservation_id),
    outputHash:completeHash(ap.rawArticle),reviewPackHash:null,role:'author',principalId:authorPrincipal,reservationRole:'company_research',
    assignedAt:String(a.assigned_at),reservationStartedAt:String(a.reservation_started_at),reservationExpiresAt:String(a.reservation_expires_at),
    originalJobDeadline:String(a.original_job_deadline),receivedAt:String(ar.received_at),articleAuthoredAt:null,author:null };
  const ao = validateSavedResearchExecutionObservation(authorExpected,ap.observation); ensure(ao.ok);
  const authored = financialInstant(object(ap.rawArticle).authoredAt);
  ensure(authored >= financialInstant(ao.observation.controllerObservedStartAt) && authored <= financialInstant(ao.observation.controllerObservedEndAt)
    && financialInstant(object(object(bound.revision.canonical_payload).clocks).researchCutoff) <= financialInstant(ao.observation.controllerObservedStartAt));
  const authorEnvelope = { schemaVersion:'research-author-result-v2',assignmentId:a.assignment_id,inputRevisionId:request.inputRevisionId,inputHash:request.inputHash,
    rawArticle:ap.rawArticle,validatedArticle:ap.validatedArticle,observation:ao.observation };
  ensure(completeHash(authorEnvelope) === ar.result_hash);
  const rr = exact(context.reviewResult,['result_id','assignment_id','result_hash','logical_bytes','received_at','payload']), rp = object(rr.payload);
  ensure(rr.result_id === request.reviewerResultId && rr.result_hash === request.reviewerResultHash && rr.assignment_id === ra.assignment_id
    && rr.result_hash === completeHash(rp) && rr.logical_bytes === Buffer.byteLength(completeCanonical(rp),'utf8') && Number(rr.logical_bytes) <= 1048576);
  const packet = projectResearchReviewerPacket(active,bound,exact(rawSources,['sourceSealReceivedAt','sources']),deadline);
  const reviewed = validateResearchEditorialReview(packet,rp.rawReview,String(rr.received_at)), review = reviewed.review;
  ensure(review.decision === 'accepted');
  const reviewerExpected: ResearchExecutionExpectation = { ...base, assignmentId:String(ra.assignment_id),reservationId:String(ra.reservation_id),
    outputHash:completeHash(review),reviewPackHash:completeHash(packet),role:'reviewer',principalId:reviewerPrincipal,reservationRole:'counter_review',
    assignedAt:String(ra.assigned_at),reservationStartedAt:String(ra.reservation_started_at),reservationExpiresAt:String(ra.reservation_expires_at),
    originalJobDeadline:String(ra.original_job_deadline),receivedAt:String(rr.received_at),articleAuthoredAt:String(object(ap.rawArticle).authoredAt),
    author:{principalId:authorPrincipal,threadId:ao.observation.threadId,invocationId:ao.observation.invocationId} };
  const ro = validateSavedResearchExecutionObservation(reviewerExpected,rp.observation); ensure(ro.ok);
  ensure(financialInstant(ro.observation.controllerObservedStartAt) >= financialInstant(ao.observation.controllerObservedEndAt)
    && financialInstant(review.reviewedAt) >= financialInstant(ro.observation.controllerObservedStartAt)
    && financialInstant(review.reviewedAt) <= financialInstant(ro.observation.controllerObservedEndAt));
  const envelope = { schemaVersion:'research-reviewer-result-v2',assignmentId:ra.assignment_id,authorResultId:request.authorResultId,authorResultHash:request.authorResultHash,
    inputRevisionId:request.inputRevisionId,inputHash:request.inputHash,packet,packetHash:completeHash(packet),rawReview:review,validatedReview:reviewed,observation:ro.observation };
  ensure(completeHash(envelope) === rr.result_hash);
  const c = exact(context.reviewCompletion,['reservation_id','owner','outcome','result_hash','finished_at']);
  ensure(c.reservation_id === ra.reservation_id && c.owner === ra.work_owner && c.outcome === 'completed' && c.result_hash === rr.result_hash
    && financialInstant(c.finished_at) >= financialInstant(rr.received_at) && financialInstant(c.finished_at) <= financialInstant(new Date().toISOString()));
  deadline.check(); return researchPublicationContent(ap);
}
function validateReceipt(value: unknown, request: ResearchPublicationRequest) {
  const r = exact(value,['schemaVersion','receipt','content','sourceReferences','researchState','researchQualified','strategyApproved','entryEligible','idempotentReplay']);
  const c = exact(r.receipt,['submissionId','dossierId','bundleId','inputRevisionId','inputHash','authorResultId','authorResultHash','reviewerResultId','reviewerResultHash','submissionHash','contentHash','receivedAt']);
  ensure(r.schemaVersion === 'research-publication-receipt-v2' && ['published','withdrawn'].includes(String(r.researchState))
    && r.researchQualified === false && r.strategyApproved === false && r.entryEligible === false && typeof r.idempotentReplay === 'boolean'
    && ['inputRevisionId','inputHash','authorResultId','authorResultHash','reviewerResultId','reviewerResultHash'].every(k => c[k] === request[k as keyof ResearchPublicationRequest])
    && c.contentHash === completeHash(r.content)); return r;
}
export async function runResearchPublication(db: Pick<SupabaseClient,'rpc'>, request: ResearchPublicationRequest,
  authorPrincipal: string, reviewerPrincipal: string, deadline: FinancialDeadline) {
  const args = { p_request:request.input,p_revision_id:request.inputRevisionId,p_input_hash:request.inputHash,p_author_principal:authorPrincipal,p_reviewer_principal:reviewerPrincipal,
    p_author_result_id:request.authorResultId,p_author_result_hash:request.authorResultHash,p_reviewer_result_id:request.reviewerResultId,p_reviewer_result_hash:request.reviewerResultHash };
  const rpc = async(name: string, a: Row) => { deadline.check(); const result = await deadline.wait(db.rpc(name,a).abortSignal(deadline.controller.signal)); ensure(!result.error); return result.data; };
  // Completed replay must not depend on an active claim or live source.
  const prior = await rpc('read_completed_research_publication_v2',args);
  if (prior !== null) return validateReceipt(prior,request);
  if (request.action === 'readResearchPublication') return null;
  const contextArgs = { p_request:request.input,p_revision_id:request.inputRevisionId,p_input_hash:request.inputHash,p_author_principal:authorPrincipal,p_reviewer_principal:reviewerPrincipal,
    p_result_id:request.authorResultId,p_result_hash:request.authorResultHash };
  const context = object(await rpc('read_research_reviewer_result_context_v2',contextArgs));
  const sources = object(await rpc('read_research_reviewer_result_sources_v2',contextArgs));
  const content = validateResearchPublicationContext(request,context,sources,authorPrincipal,reviewerPrincipal,deadline);
  const receipt = validateReceipt(await rpc('publish_research_article_v2',{...args,p_content_hash:completeHash(content)}),request);
  ensure(object(receipt.receipt).contentHash === completeHash(content)); return receipt;
}
export async function handleResearchPublication(request: Request) {
  const identity = resolveResearchControllerIdentity(request,'author'), pair = resolveConfiguredResearchControllerPrincipals();
  if (!requireExactInternalBearer(request) || !identity.ok || !pair.ok || identity.principalId !== pair.authorPrincipalId)
    return Response.json({ok:false,error:'research_publication_auth_required'},{status:401});
  const deadline = new FinancialDeadline(); let body: ResearchPublicationRequest;
  try { body = await readResearchPublicationBody(request,deadline); }
  catch { deadline.controller.abort(); return Response.json({ok:false,error:'research_publication_request_invalid'},{status:400}); }
  try { const publication = await runResearchPublication(getSupabaseServerClient(),body,identity.principalId,pair.reviewerPrincipalId,deadline);
    deadline.check(); return Response.json({ok:true,publication}); }
  catch { return Response.json({ok:false,error:'research_publication_unavailable',outcome:'uncertain',recoveryAction:'readResearchPublication',retryClaim:false},{status:409}); }
  finally { deadline.controller.abort(); }
}
