import type { SupabaseClient } from '@supabase/supabase-js';
import { requireExactInternalBearer } from './internal-auth.ts';
import { resolveResearchControllerIdentity } from './research-execution-binding.ts';
import { getSupabaseServerClient } from './supabase-server.ts';
import { parseCompleteRequest, validateCompleteResponse, type CompleteRequest } from './research-complete-input.ts';
import { completeCanonical, completeHash, parseCompleteJson } from './research-complete-canonical.ts';
import { FinancialDeadline } from './research-financial-file-reader.ts';
import { validateBusinessResearchArticle, type ArticleSourceV2 } from './research-business-article.ts';
import { financialInstant } from './research-financial-clock.ts';

type Row = Record<string, unknown>;
export type AuthorHandoffRequest = { action: 'handoffAuthorResult' | 'readAuthorHandoff'; input: CompleteRequest;
  inputRevisionId: string; inputHash: string; resultId: string; resultHash: string };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
function ensure(value: unknown): asserts value { if (!value) throw new Error('research_author_handoff_invalid'); }
function object(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
function exact(value: unknown, keys: string[]): Row { const v = object(value); ensure(Object.keys(v).sort().join(',') === keys.sort().join(',')); return v; }
export async function readResearchAuthorHandoffBody(request: Request, deadline: FinancialDeadline): Promise<AuthorHandoffRequest> {
  const action = request.headers.get('x-research-author-handoff-action');
  ensure((action === 'handoffAuthorResult' || action === 'readAuthorHandoff') && !request.headers.has('x-research-author-result-action')
    && request.headers.get('content-type')?.split(';')[0].trim() === 'application/json' && request.body);
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { deadline.check(); const part = await deadline.wait(reader.read()); if (part.done) break; size += part.value.byteLength; ensure(size <= 8192); chunks.push(part.value); }
    const row = exact(parseCompleteJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))),
      ['action', 'input', 'inputRevisionId', 'inputHash', 'resultId', 'resultHash']);
    ensure(row.action === action);
    for (const key of ['inputRevisionId', 'resultId']) ensure(typeof row[key] === 'string' && UUID.test(row[key]));
    for (const key of ['inputHash', 'resultHash']) ensure(typeof row[key] === 'string' && HASH.test(row[key]));
    const input = parseCompleteRequest(row.input); deadline.check(); return { ...row, input } as AuthorHandoffRequest;
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function windowCheck(assignment: Row, deadline: FinancialDeadline) {
  deadline.check(); const now = financialInstant(new Date().toISOString());
  ensure(now < financialInstant(assignment.original_job_deadline) && now < financialInstant(assignment.reservation_expires_at));
}
function validateReceipt(value: unknown, assignment: Row, result: Row) {
  const receipt = exact(value, ['reservation_id', 'owner', 'outcome', 'result_hash', 'finished_at']);
  ensure(receipt.reservation_id === assignment.reservation_id && receipt.owner === assignment.work_owner
    && receipt.outcome === 'completed' && receipt.result_hash === object(object(result.payload).validatedArticle).articleHash);
  const completed = financialInstant(receipt.finished_at);
  ensure(completed >= financialInstant(result.received_at) && completed <= financialInstant(new Date().toISOString())
    && completed < financialInstant(assignment.original_job_deadline) && completed < financialInstant(assignment.reservation_expires_at));
  return receipt;
}
/** Budget completion against a private controller report; not platform execution proof. */
export async function runResearchAuthorHandoff(db: Pick<SupabaseClient, 'rpc'>, request: AuthorHandoffRequest,
  principal: string, deadline: FinancialDeadline) {
  ensure(HASH.test(principal)); deadline.check();
  const args = { p_request: request.input, p_revision_id: request.inputRevisionId, p_input_hash: request.inputHash,
    p_principal: principal, p_result_id: request.resultId, p_result_hash: request.resultHash };
  const rpc = async (name: string) => { deadline.check(); const response = await deadline.wait(db.rpc(name, args).abortSignal(deadline.controller.signal)); ensure(!response.error); return response.data; };
  const context = exact(await rpc('read_research_author_handoff_context_v2'), ['assignment', 'result', 'revision', 'completion']);
  const a = object(context.assignment), result = exact(context.result, ['result_id', 'assignment_id', 'result_hash', 'logical_bytes', 'received_at', 'payload']), revision = object(context.revision);
  ensure(a.controller_principal === principal && a.work_owner === request.input.owner && a.job_id === request.input.jobId
    && a.attempt === request.input.attempt && a.reservation_id === request.input.reservationId
    && a.input_revision_id === request.inputRevisionId && a.input_hash === request.inputHash
    && a.research_company_id === revision.research_company_id && a.snapshot_hash === request.input.snapshotHash
    && completeHash(a.canonical_request) === completeHash(request.input)
    && result.result_id === request.resultId && result.assignment_id === a.assignment_id
    && result.result_hash === request.resultHash && result.result_hash === completeHash(result.payload)
    && result.logical_bytes === Buffer.byteLength(completeCanonical(result.payload), 'utf8') && Number(result.logical_bytes) <= 1048576);
  validateCompleteResponse(request.input, revision);
  ensure(revision.status === 'sealed' && revision.revision_id === request.inputRevisionId && revision.input_hash === request.inputHash);
  const originalJob = object(object(revision.canonical_payload).originalJob), originalReservation = object(object(revision.canonical_payload).originalReservation);
  ensure(a.original_job_deadline === originalJob.leaseExpiresAt && a.reservation_started_at === originalReservation.startedAt
    && a.reservation_expires_at === originalReservation.leaseExpiresAt);
  const payload = exact(result.payload, ['schemaVersion', 'assignmentId', 'inputRevisionId', 'inputHash', 'rawArticle', 'validatedArticle', 'observation']);
  ensure(payload.schemaVersion === 'research-author-result-v2' && payload.assignmentId === a.assignment_id
    && payload.inputRevisionId === request.inputRevisionId && payload.inputHash === request.inputHash);
  const saved = object(payload.validatedArticle);
  const recomputed = validateBusinessResearchArticle({ request: request.input, revision,
    sources: saved.sources as ArticleSourceV2[], now: new Date().toISOString() }, payload.rawArticle);
  ensure(completeHash(recomputed) === completeHash(saved)); windowCheck(a, deadline);
  let receipt = context.completion === null ? null : validateReceipt(context.completion, a, result);
  if (request.action === 'handoffAuthorResult') {
    const committed = validateReceipt(await rpc('commit_research_author_handoff_v2'), a, result);
    if (receipt) ensure(completeHash(receipt) === completeHash(committed)); receipt = committed;
  }
  windowCheck(a, deadline);
  return { receipt, authorReservationCompleted: receipt !== null, controllerReportOnly: true,
    modelDispatched: false, reviewerDispatched: false, publishableResearch: false,
    researchQualified: false, strategyApproved: false, entryEligible: false,
    // Private original deadlines checked after response serialization by the handler.
    window: a };
}
export async function handleResearchAuthorHandoff(request: Request): Promise<Response> {
  if (!requireExactInternalBearer(request)) return Response.json({ ok: false, error: 'research_author_auth_required' }, { status: 401 });
  const identity = resolveResearchControllerIdentity(request, 'author');
  if (!identity.ok) return Response.json({ ok: false, error: identity.error }, { status: 401 });
  const deadline = new FinancialDeadline(); let input: AuthorHandoffRequest;
  try { input = await readResearchAuthorHandoffBody(request, deadline); }
  catch { deadline.controller.abort(); return Response.json({ ok: false, error: 'research_author_handoff_request_invalid' }, { status: 400 }); }
  try {
    const { window, ...result } = await runResearchAuthorHandoff(getSupabaseServerClient(), input, identity.principalId, deadline);
    windowCheck(window, deadline); const response = Response.json({ ok: true, ...result }); windowCheck(window, deadline); return response;
  } catch {
    return Response.json({ ok: false, error: 'research_author_handoff_unavailable', outcome: 'uncertain',
      recoveryAction: 'readAuthorHandoff', retryClaim: false }, { status: 409 });
  } finally { deadline.controller.abort(); }
}
