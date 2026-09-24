import { requireExactInternalBearer } from './internal-auth.ts';
import { requireActiveVpsWriter } from './taiwan-data-runtime.ts';
import { parseCandidateHistoryBatchRequest, runCandidateHistoryBackfillBatch } from './candidate-history-backfill-batch.ts';
import { parseAuthorityBackfillRequest, runEntryPlanAuthorityBackfill } from './entry-plan-authority-backfill.ts';

type Dependencies = {
  authorized?: typeof requireExactInternalBearer;
  writer?: typeof requireActiveVpsWriter;
  runBatch?: typeof runCandidateHistoryBackfillBatch;
  runAuthority?: typeof runEntryPlanAuthorityBackfill;
};
export async function candidateHistoryBackfillResponse(request: Request, dependencies: Dependencies = {}) {
  if (!(dependencies.authorized || requireExactInternalBearer)(request)) return { status: 401, body: { ok: false, error: 'unauthorized_internal_writer' } };
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 10_000) return { status: 413, body: { ok: false, error: 'payload_too_large' } };
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return { status: 422, body: { ok: false, error: 'invalid_json' } }; }
  if (body && typeof body === 'object' && !Array.isArray(body) && (body as Record<string, unknown>).purpose === 'entry_plan_authority') {
    const authorityInput = parseAuthorityBackfillRequest(body);
    if (!authorityInput) return { status: 422, body: { ok: false, error: 'invalid_entry_plan_authority_request' } };
    const writer = await (dependencies.writer || requireActiveVpsWriter)();
    if (!writer.ok) return { status: 409, body: { ok: false, error: writer.error } };
    try {
      const result = await (dependencies.runAuthority || runEntryPlanAuthorityBackfill)(writer.supabase, authorityInput);
      const failed = Number(result.counts.failed) > 0;
      return { status: failed ? 503 : Number(result.counts.pending) + Number(result.counts.retry) + Number(result.counts.running) ? 202 : 200,
        body: { ok: !failed, result: { ...result, releaseId: writer.releaseId } } };
    } catch (error) {
      return { status: 503, body: { ok: false, error: error instanceof Error ? error.message : 'entry_plan_authority_backfill_failed' } };
    }
  }
  const input = parseCandidateHistoryBatchRequest(body);
  if (!input) return { status: 422, body: { ok: false, error: 'invalid_candidate_history_backfill_request' } };
  const writer = await (dependencies.writer || requireActiveVpsWriter)();
  if (!writer.ok) return { status: 409, body: { ok: false, error: writer.error } };
  try {
    const result = await (dependencies.runBatch || runCandidateHistoryBackfillBatch)(writer.supabase, input);
    return { status: result.batchComplete ? 200 : 503, body: { ok: result.batchComplete, result: { ...result, releaseId: writer.releaseId } } };
  } catch (error) {
    return { status: 503, body: { ok: false, error: error instanceof Error ? error.message : 'candidate_history_backfill_failed' } };
  }
}
