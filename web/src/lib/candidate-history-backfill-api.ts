import { requireExactInternalBearer } from './internal-auth.ts';
import { requireActiveVpsWriter } from './taiwan-data-runtime.ts';
import { parseCandidateHistoryBatchRequest, runCandidateHistoryBackfillBatch } from './candidate-history-backfill-batch.ts';

type Dependencies = {
  authorized?: typeof requireExactInternalBearer;
  writer?: typeof requireActiveVpsWriter;
  runBatch?: typeof runCandidateHistoryBackfillBatch;
};
export async function candidateHistoryBackfillResponse(request: Request, dependencies: Dependencies = {}) {
  if (!(dependencies.authorized || requireExactInternalBearer)(request)) return { status: 401, body: { ok: false, error: 'unauthorized_internal_writer' } };
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 10_000) return { status: 413, body: { ok: false, error: 'payload_too_large' } };
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return { status: 422, body: { ok: false, error: 'invalid_json' } }; }
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
