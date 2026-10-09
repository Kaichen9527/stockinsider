import type { SupabaseClient } from '@supabase/supabase-js';
import { requireExactInternalBearer } from './internal-auth.ts';
import { resolveResearchControllerIdentity } from './research-execution-binding.ts';
import { getSupabaseServerClient } from './supabase-server.ts';
import { readCompleteBody, parseCompleteRequest, runCompleteInput, type CompleteRequest } from './research-complete-input.ts';
import { completeHash } from './research-complete-canonical.ts';
import { FinancialDeadline } from './research-financial-file-reader.ts';

type Row = Record<string, unknown>;
type AssignmentRequest = { action: 'assignAuthor' | 'readAuthorAssignment'; input: CompleteRequest; inputRevisionId: string; inputHash: string };
type AuthorRequest = Omit<AssignmentRequest, 'action'> & { action: AssignmentRequest['action'] | 'readAuthorPacket' };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const assignmentKeys = ['assignment_id', 'job_id', 'attempt', 'reservation_id', 'input_revision_id', 'input_hash',
  'research_company_id', 'snapshot_hash', 'controller_principal', 'work_owner', 'canonical_request',
  'assigned_at', 'reservation_started_at', 'reservation_expires_at', 'original_job_deadline'];
function ensure(value: unknown): asserts value { if (!value) throw new Error('research_author_assignment_invalid'); }
function object(value: unknown): Row { ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Row; }
function parseRequest(value: Row): AuthorRequest {
  ensure(Object.keys(value).sort().join(',') === ['action', 'input', 'inputHash', 'inputRevisionId'].sort().join(',')
    && (value.action === 'assignAuthor' || value.action === 'readAuthorAssignment' || value.action === 'readAuthorPacket')
    && typeof value.inputRevisionId === 'string' && UUID.test(value.inputRevisionId)
    && typeof value.inputHash === 'string' && HASH.test(value.inputHash));
  return { action: value.action, input: parseCompleteRequest(value.input), inputRevisionId: value.inputRevisionId, inputHash: value.inputHash };
}

/** Private persistence only. A current compiled read is mandatory even on replay;
 * only the SQL transaction can admit an assignment against the live original fences. */
export async function runResearchAuthorAssignment(
  db: Pick<SupabaseClient, 'rpc'>, request: AssignmentRequest, principal: string, deadline: FinancialDeadline,
): Promise<Row | null> {
  ensure(HASH.test(principal));
  const revision = await runCompleteInput(db, request.input, false, deadline);
  ensure(revision.status === 'sealed' && revision.revision_id === request.inputRevisionId && revision.input_hash === request.inputHash);
  const payload = object(revision.canonical_payload), originalJob = object(payload.originalJob), originalReservation = object(payload.originalReservation);
  deadline.check();
  const result = await deadline.wait(db.rpc(request.action === 'assignAuthor' ? 'assign_research_author_v2' : 'read_research_author_assignment_v2', {
    p_request: request.input, p_revision_id: request.inputRevisionId, p_input_hash: request.inputHash, p_principal: principal,
  }).abortSignal(deadline.controller.signal));
  ensure(!result.error);
  if (result.data === null) { ensure(request.action === 'readAuthorAssignment'); return null; }
  const saved = object(result.data);
  ensure(Object.keys(saved).sort().join(',') === assignmentKeys.slice().sort().join(',')
    && typeof saved.assignment_id === 'string' && UUID.test(saved.assignment_id)
    && saved.job_id === request.input.jobId && saved.attempt === request.input.attempt
    && saved.reservation_id === request.input.reservationId && saved.input_revision_id === request.inputRevisionId
    && saved.input_hash === request.inputHash && saved.research_company_id === revision.research_company_id
    && saved.snapshot_hash === request.input.snapshotHash && saved.controller_principal === principal
    && saved.work_owner === request.input.owner && completeHash(saved.canonical_request) === completeHash(request.input)
    && saved.reservation_started_at === originalReservation.startedAt
    && saved.reservation_expires_at === originalReservation.leaseExpiresAt && saved.original_job_deadline === originalJob.leaseExpiresAt
    && typeof saved.assigned_at === 'string' && Number.isFinite(Date.parse(saved.assigned_at)));
  deadline.check();
  // Private principal and canonical request remain in the database, outside model packets and responses.
  const { controller_principal: _principal, canonical_request: _request, ...projection } = saved;
  void _principal; void _request;
  return projection;
}

/** Used only by the existing model-reservation route's explicit v2 branch. */
export async function handleResearchAuthorAssignment(request: Request): Promise<Response> {
  if (!requireExactInternalBearer(request)) return Response.json({ ok: false, error: 'research_author_auth_required' }, { status: 401 });
  const identity = resolveResearchControllerIdentity(request, 'author');
  if (!identity.ok) return Response.json({ ok: false, error: identity.error }, { status: 401 });
  if (request.headers.has('x-research-author-result-action')) {
    const { handleResearchAuthorResult } = await import('./research-author-result.ts');
    return handleResearchAuthorResult(request);
  }
  const deadline = new FinancialDeadline(); let input: AuthorRequest;
  try { input = parseRequest(await readCompleteBody(request, deadline)); }
  catch { deadline.controller.abort(); return Response.json({ ok: false, error: 'research_author_assignment_request_invalid' }, { status: 400 }); }
  try {
    if (input.action === 'readAuthorPacket') {
      const { runResearchAuthorPacket, assertResearchAuthorPacketWindow } = await import('./research-author-packet.ts');
      const result = await runResearchAuthorPacket(getSupabaseServerClient(), input, identity.principalId, deadline);
      deadline.check(); const response = Response.json({ ok: true, ...result });
      assertResearchAuthorPacketWindow(result.packet, deadline); return response;
    }
    const assignment = await runResearchAuthorAssignment(getSupabaseServerClient(), { ...input, action: input.action }, identity.principalId, deadline);
    deadline.check();
    return Response.json({ ok: true, assignment, dispatchReady: false, modelDispatched: false });
  } catch {
    if (input.action === 'readAuthorPacket') return Response.json({ ok: false, error: 'research_author_packet_unavailable',
      recoveryAction: 'readAuthorPacket', retryClaim: false }, { status: 409 });
    // RPC may have committed. Read the exact original assignment; never reserve again or renew clocks.
    return Response.json({ ok: false, error: 'research_author_assignment_unavailable', outcome: 'uncertain',
      recoveryAction: 'readAuthorAssignment', retryClaim: false }, { status: 409 });
  } finally { deadline.controller.abort(); }
}
