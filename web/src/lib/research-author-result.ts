import type { SupabaseClient } from '@supabase/supabase-js';
import { requireExactInternalBearer } from './internal-auth.ts';
import { resolveResearchControllerIdentity, validateResearchExecutionObservation } from './research-execution-binding.ts';
import { getSupabaseServerClient } from './supabase-server.ts';
import { parseCompleteRequest, runCompleteInput } from './research-complete-input.ts';
import { completeCanonical, completeHash, parseCompleteJson } from './research-complete-canonical.ts';
import { FinancialDeadline } from './research-financial-file-reader.ts';
import { runResearchAuthorPacket, assertResearchAuthorPacketWindow, type AuthorPacketRequest } from './research-author-packet.ts';
import { validateBusinessResearchArticle, type ArticleSourceV2 } from './research-business-article.ts';
import { financialInstant } from './research-financial-clock.ts';

type Row = Record<string, unknown>;
export const AUTHOR_RESULT_LIMITS = Object.freeze({ receiveWire: 1048576, readWire: 8192, article: 262144, envelope: 1048576 });
function ensure(value: unknown): asserts value { if (!value) throw new Error('research_author_result_invalid'); }
function object(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
type ResultRequest = AuthorPacketRequest & { action: 'receiveAuthorResult' | 'readAuthorResult'; article?: unknown; observation?: unknown };

export async function readResearchAuthorResultBody(request: Request, deadline: FinancialDeadline, action: string): Promise<ResultRequest> {
  ensure(action === 'receiveAuthorResult' || action === 'readAuthorResult');
  ensure(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json' && request.body);
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  const limit = action === 'receiveAuthorResult' ? AUTHOR_RESULT_LIMITS.receiveWire : AUTHOR_RESULT_LIMITS.readWire;
  try {
    while (true) { deadline.check(); const part = await deadline.wait(reader.read()); if (part.done) break; size += part.value.byteLength; ensure(size <= limit); chunks.push(part.value); }
    const body = object(parseCompleteJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
    const keys = ['action', 'input', 'inputRevisionId', 'inputHash', ...(action === 'receiveAuthorResult' ? ['article', 'observation'] : [])];
    ensure(Object.keys(body).sort().join(',') === keys.sort().join(',') && body.action === action
      && typeof body.inputRevisionId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(body.inputRevisionId)
      && typeof body.inputHash === 'string' && /^[a-f0-9]{64}$/u.test(body.inputHash));
    const input = parseCompleteRequest(body.input); deadline.check();
    return { ...body, input } as ResultRequest;
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Authenticated controller report, not provider execution attestation. */
export async function runResearchAuthorResult(db: Pick<SupabaseClient, 'rpc'>, request: ResultRequest,
  principal: string, httpRequest: Request, deadline: FinancialDeadline) {
  deadline.check();
  const revision = await runCompleteInput(db, request.input, false, deadline);
  const response = await runResearchAuthorPacket(db, request, principal, deadline);
  const packet = response.packet, window = object(packet.writingWindow);
  let envelope: Row | undefined;
  if (request.action === 'receiveAuthorResult') {
    deadline.check();
    ensure(Buffer.byteLength(JSON.stringify(request.article), 'utf8') <= AUTHOR_RESULT_LIMITS.article);
    const validated = validateBusinessResearchArticle({ request: request.input, revision,
      sources: (packet.sources as Row[]).map(s => s.descriptor as ArticleSourceV2), now: new Date().toISOString() }, request.article);
    deadline.check();
    const expected = {
      assignmentId: String(packet.assignmentId), jobId: request.input.jobId, attempt: request.input.attempt,
      reservationId: request.input.reservationId, inputRevisionId: request.inputRevisionId, inputHash: request.inputHash,
      articleHash: validated.articleHash, reviewPackHash: null, outputHash: completeHash(request.article),
      role: 'author' as const, principalId: principal, workOwner: request.input.owner, originalLeaseOwner: request.input.owner,
      reservationRole: 'company_research' as const, assignedAt: String(window.assignedAt),
      reservationStartedAt: String(object(object(revision.canonical_payload).originalReservation).startedAt),
      reservationExpiresAt: String(window.originalReservationDeadline), originalJobDeadline: String(window.originalJobDeadline),
      receivedAt: new Date().toISOString(), articleAuthoredAt: null, author: null, usedInvocationIds: [],
    };
    const observed = validateResearchExecutionObservation(httpRequest, expected, request.observation);
    ensure(observed.ok);
    const authored = financialInstant(object(request.article).authoredAt);
    ensure(financialInstant(observed.observation.controllerObservedStartAt) <= authored
      && authored <= financialInstant(observed.observation.controllerObservedEndAt)
      && financialInstant(packet.evidenceCutoffAt) <= financialInstant(observed.observation.controllerObservedStartAt));
    envelope = { schemaVersion: 'research-author-result-v2', assignmentId: packet.assignmentId,
      inputRevisionId: request.inputRevisionId, inputHash: request.inputHash,
      rawArticle: request.article, validatedArticle: validated, observation: observed.observation };
    ensure(Buffer.byteLength(completeCanonical(envelope), 'utf8') <= AUTHOR_RESULT_LIMITS.envelope); deadline.check();
  }
  const args = { p_request: request.input, p_revision_id: request.inputRevisionId, p_input_hash: request.inputHash, p_principal: principal,
    ...(envelope ? { p_result: envelope } : {}) };
  deadline.check();
  const saved = await deadline.wait(db.rpc(envelope ? 'receive_research_author_result_v2' : 'read_research_author_result_v2', args).abortSignal(deadline.controller.signal));
  ensure(!saved.error);
  if (saved.data !== null) {
    const row = object(saved.data); ensure(Object.keys(row).sort().join(',') === ['result_id','assignment_id','result_hash','logical_bytes','received_at','payload'].sort().join(','));
    ensure(row.assignment_id === packet.assignmentId && row.result_hash === completeHash(row.payload)
      && row.logical_bytes === Buffer.byteLength(completeCanonical(row.payload), 'utf8') && Number(row.logical_bytes) <= AUTHOR_RESULT_LIMITS.envelope);
    const payload = object(row.payload); ensure(payload.assignmentId === packet.assignmentId && payload.inputRevisionId === request.inputRevisionId && payload.inputHash === request.inputHash);
    if (envelope) ensure(completeHash(payload) === completeHash(envelope));
  } else ensure(request.action === 'readAuthorResult');
  assertResearchAuthorPacketWindow(packet, deadline);
  return { result: saved.data, dispatchReady: false, modelDispatched: false, publishableResearch: false,
    controllerReportOnly: true, packet };
}

export async function handleResearchAuthorResult(request: Request): Promise<Response> {
  if (!requireExactInternalBearer(request)) return Response.json({ ok: false, error: 'research_author_auth_required' }, { status: 401 });
  const identity = resolveResearchControllerIdentity(request, 'author');
  if (!identity.ok) return Response.json({ ok: false, error: identity.error }, { status: 401 });
  const deadline = new FinancialDeadline(); let input: ResultRequest;
  try { input = await readResearchAuthorResultBody(request, deadline, request.headers.get('x-research-author-result-action') || ''); }
  catch { deadline.controller.abort(); return Response.json({ ok: false, error: 'research_author_result_request_invalid' }, { status: 400 }); }
  try {
    const { packet, ...result } = await runResearchAuthorResult(getSupabaseServerClient(), input, identity.principalId, request, deadline);
    deadline.check(); const response = Response.json({ ok: true, ...result }); assertResearchAuthorPacketWindow(packet, deadline); return response;
  } catch {
    return Response.json({ ok: false, error: 'research_author_result_unavailable', outcome: 'uncertain',
      recoveryAction: 'readAuthorResult', retryClaim: false }, { status: 409 });
  } finally { deadline.controller.abort(); }
}
