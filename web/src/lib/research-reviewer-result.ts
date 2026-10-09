import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveConfiguredResearchControllerPrincipals, resolveResearchControllerIdentity, validateResearchExecutionObservation } from './research-execution-binding.ts';
import { getSupabaseServerClient } from './supabase-server.ts';
import { parseCompleteRequest } from './research-complete-input.ts';
import { completeCanonical, completeHash, parseCompleteJson } from './research-complete-canonical.ts';
import { FinancialDeadline } from './research-financial-file-reader.ts';
import { financialInstant } from './research-financial-clock.ts';
import { projectResearchReviewerPacket, validateResearchReviewerContext, type ReviewerAssignmentRequest } from './research-reviewer-assignment.ts';
import { validateResearchEditorialReview } from './research-editorial-review.ts';
type Row = Record<string, unknown>;
type ReviewResultRequest = Omit<ReviewerAssignmentRequest, 'action'> & { action: 'receiveReviewerResult' | 'readReviewerResult'; review?: unknown; observation?: unknown };
function ensure(value: unknown): asserts value { if (!value) throw new Error('research_reviewer_result_invalid'); }
function object(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
function exact(value: unknown, keys: string[]) { const r = object(value); ensure(Object.keys(r).sort().join(',') === keys.sort().join(',')); return r; }
function windowCheck(a: Row, deadline: FinancialDeadline) {
  deadline.check(); const now = financialInstant(new Date().toISOString());
  ensure(now < financialInstant(a.original_job_deadline) && now < financialInstant(a.reservation_expires_at));
}
export async function readResearchReviewerResultBody(request: Request, deadline: FinancialDeadline): Promise<ReviewResultRequest> {
  const action = request.headers.get('x-research-review-result-action');
  ensure(['receiveReviewerResult', 'readReviewerResult'].includes(String(action))
    && !['x-research-author-result-action', 'x-research-author-handoff-action', 'x-research-review-assignment-action'].some(h => request.headers.has(h))
    && request.headers.get('content-type')?.split(';')[0].trim() === 'application/json' && request.body);
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { deadline.check(); const p = await deadline.wait(reader.read()); if (p.done) break; size += p.value.byteLength;
      ensure(size <= (action === 'receiveReviewerResult' ? 1048576 : 8192)); chunks.push(p.value); }
    const row = exact(parseCompleteJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))),
      ['action', 'input', 'inputRevisionId', 'inputHash', 'resultId', 'resultHash', ...(action === 'receiveReviewerResult' ? ['review', 'observation'] : [])]);
    ensure(row.action === action);
    for (const key of ['inputRevisionId', 'resultId']) ensure(typeof row[key] === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(row[key]));
    for (const key of ['inputHash', 'resultHash']) ensure(typeof row[key] === 'string' && /^[a-f0-9]{64}$/u.test(row[key]));
    const input = parseCompleteRequest(row.input); deadline.check(); return { ...row, input } as ReviewResultRequest;
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function envelopeFor(request: ReviewResultRequest, context: Row, packet: Row, principal: string, http: Request, review: unknown, observation: unknown, receivedAt: string) {
  const ra = object(context.reviewerAssignment), h = object(context.authorContext), author = object(h.assignment), authorResult = object(object(h.result).payload);
  const authorObservation = object(authorResult.observation), validated = validateResearchEditorialReview(packet, review, receivedAt), raw = validated.review;
  const check = validateResearchExecutionObservation(http, {
    assignmentId: String(ra.assignment_id), jobId: String(ra.job_id), attempt: Number(ra.attempt), reservationId: String(ra.reservation_id),
    inputRevisionId: request.inputRevisionId, inputHash: request.inputHash, articleHash: String(packet.articleHash), reviewPackHash: completeHash(packet), outputHash: completeHash(raw),
    role: 'reviewer', principalId: principal, workOwner: String(ra.work_owner), originalLeaseOwner: request.input.owner, reservationRole: 'counter_review',
    assignedAt: String(ra.assigned_at), reservationStartedAt: String(ra.reservation_started_at), reservationExpiresAt: String(ra.reservation_expires_at),
    originalJobDeadline: String(ra.original_job_deadline), receivedAt, articleAuthoredAt: String(object(authorResult.rawArticle).authoredAt),
    author: { principalId: String(author.controller_principal), threadId: String(authorObservation.threadId), invocationId: String(authorObservation.invocationId) }, usedInvocationIds: [],
  }, observation);
  ensure(check.ok);
  ensure(financialInstant(check.observation.controllerObservedStartAt) >= financialInstant(authorObservation.controllerObservedEndAt)
    && financialInstant(raw.reviewedAt) >= financialInstant(check.observation.controllerObservedStartAt)
    && financialInstant(raw.reviewedAt) <= financialInstant(check.observation.controllerObservedEndAt));
  const envelope = { schemaVersion: 'research-reviewer-result-v2', assignmentId: ra.assignment_id,
    authorResultId: request.resultId, authorResultHash: request.resultHash, inputRevisionId: request.inputRevisionId, inputHash: request.inputHash,
    packet, packetHash: completeHash(packet), rawReview: raw, validatedReview: validated, observation: check.observation };
  ensure(Buffer.byteLength(completeCanonical(envelope), 'utf8') <= 1048576); return envelope;
}
export async function runResearchReviewerResult(db: Pick<SupabaseClient, 'rpc'>, request: ReviewResultRequest,
  authorPrincipal: string, reviewerPrincipal: string, http: Request, deadline: FinancialDeadline) {
  const args = { p_request: request.input, p_revision_id: request.inputRevisionId, p_input_hash: request.inputHash,
    p_author_principal: authorPrincipal, p_reviewer_principal: reviewerPrincipal, p_result_id: request.resultId, p_result_hash: request.resultHash };
  const rpc = async (name: string, extra: Row = {}) => { deadline.check(); const r = await deadline.wait(db.rpc(name, { ...args, ...extra }).abortSignal(deadline.controller.signal)); ensure(!r.error); return r.data; };
  const context = exact(await rpc('read_research_reviewer_result_context_v2'), ['authorContext', 'reviewerAssignment', 'reviewResult', 'reviewCompletion']);
  const activeRequest: ReviewerAssignmentRequest = { ...request, action: 'readReviewerPacket' };
  const bound = validateResearchReviewerContext(activeRequest, { authorContext: context.authorContext, reviewerAssignment: context.reviewerAssignment }, authorPrincipal, reviewerPrincipal, deadline);
  ensure(bound.reviewer); windowCheck(bound.reviewer, deadline);
  const sources = exact(await rpc('read_research_reviewer_result_sources_v2'), ['sourceSealReceivedAt', 'sources']);
  const packet = projectResearchReviewerPacket(activeRequest, bound, sources, deadline);
  let saved: Row | null = context.reviewResult === null ? null : exact(context.reviewResult, ['result_id', 'assignment_id', 'result_hash', 'logical_bytes', 'received_at', 'payload']);
  if (saved) {
    ensure(saved.assignment_id === bound.reviewer.assignment_id && saved.result_hash === completeHash(saved.payload)
      && saved.logical_bytes === Buffer.byteLength(completeCanonical(saved.payload), 'utf8') && Number(saved.logical_bytes) <= 1048576);
    const payload = object(saved.payload);
    ensure(completeHash(payload) === completeHash(envelopeFor(request, context, packet, reviewerPrincipal, http, payload.rawReview, payload.observation, String(saved.received_at))));
    const c = exact(context.reviewCompletion, ['reservation_id', 'owner', 'outcome', 'result_hash', 'finished_at']);
    ensure(c.reservation_id === bound.reviewer.reservation_id && c.owner === bound.reviewer.work_owner && c.outcome === 'completed'
      && c.result_hash === saved.result_hash && financialInstant(c.finished_at) >= financialInstant(saved.received_at)
      && financialInstant(c.finished_at) <= financialInstant(new Date().toISOString()));
  } else ensure(context.reviewCompletion === null);
  if (request.action === 'receiveReviewerResult') {
    const envelope = envelopeFor(request, context, packet, reviewerPrincipal, http, request.review, request.observation, new Date().toISOString());
    if (saved) ensure(completeHash(saved.payload) === completeHash(envelope));
    const received = exact(await rpc('receive_research_reviewer_result_v2', { p_result: envelope }), ['result_id', 'assignment_id', 'result_hash', 'logical_bytes', 'received_at', 'payload']);
    ensure(received.assignment_id === bound.reviewer.assignment_id && received.result_hash === completeHash(envelope)
      && completeHash(received.payload) === completeHash(envelope) && received.logical_bytes === Buffer.byteLength(completeCanonical(envelope), 'utf8'));
    const final = object(await rpc('read_research_reviewer_result_context_v2'));
    const finalRow = exact(final.reviewResult, ['result_id', 'assignment_id', 'result_hash', 'logical_bytes', 'received_at', 'payload']);
    // The envelope already occupies the allowed canonical depth. Do not add a
    // receipt wrapper to hash it; compare scalars and the existing payload hash.
    ensure(['result_id', 'assignment_id', 'result_hash', 'logical_bytes', 'received_at'].every(k => finalRow[k] === received[k])
      && completeHash(finalRow.payload) === completeHash(envelope) && object(final.reviewCompletion).result_hash === received.result_hash);
    saved = received;
  }
  windowCheck(bound.reviewer, deadline);
  return { result: saved, controllerReportOnly: true, modelDispatched: false, reviewerDispatched: false,
    publishableResearch: false, researchQualified: false, strategyApproved: false, entryEligible: false, window: bound.reviewer };
}
export async function handleResearchReviewerResult(request: Request) {
  const identity = resolveResearchControllerIdentity(request, 'reviewer'), pair = resolveConfiguredResearchControllerPrincipals();
  if (!identity.ok || !pair.ok || identity.principalId !== pair.reviewerPrincipalId) return Response.json({ ok: false, error: 'research_reviewer_auth_required' }, { status: 401 });
  const deadline = new FinancialDeadline(); let body: ReviewResultRequest;
  try { body = await readResearchReviewerResultBody(request, deadline); }
  catch { deadline.controller.abort(); return Response.json({ ok: false, error: 'research_reviewer_result_request_invalid' }, { status: 400 }); }
  try {
    const { window, ...result } = await runResearchReviewerResult(getSupabaseServerClient(), body, pair.authorPrincipalId, identity.principalId, request, deadline);
    windowCheck(window, deadline); const response = Response.json({ ok: true, ...result }); windowCheck(window, deadline); return response;
  } catch { return Response.json({ ok: false, error: 'research_reviewer_result_unavailable', outcome: 'uncertain', recoveryAction: 'readReviewerResult', retryClaim: false }, { status: 409 }); }
  finally { deadline.controller.abort(); }
}
