import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Mac Codex claims one bounded research job; this endpoint never runs a model. */
export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Row;
  const action = String(body.action || '');
  const owner = String(body.owner || '');
  if (owner.length < 3 || owner.length > 120 || !/^[a-zA-Z0-9:_-]+$/u.test(owner)) {
    return NextResponse.json({ ok: false, error: 'research_deep_owner_invalid' }, { status: 400 });
  }
  const db = getSupabaseServerClient();
  if (action === 'claim') {
    const result = await db.rpc('claim_research_deep_job_v1', { p_owner: owner });
    if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 409 });
    const job = Array.isArray(result.data) ? result.data[0] : result.data;
    return NextResponse.json({ ok: true, job: job || null,
      policy: { maxConcurrentModels: 1, maxMinutesPerJob: 30, maxModelMinutesPerTaipeiDay: 120,
        maxNewDeepStudiesPerTaipeiWeek: 5 } });
  }
  if (action === 'claimPublication') {
    const jobId = String(body.jobId || '');
    const attempt = Number(body.attempt);
    const revisionId = String(body.revisionId || '');
    const inputHash = String(body.inputHash || '');
    const outboxOwner = String(body.outboxOwner || '');
    if (!UUID.test(jobId) || !UUID.test(revisionId) || !Number.isInteger(attempt)
      || attempt < 1 || attempt > 3 || !/^[0-9a-f]{64}$/u.test(inputHash)
      || !/^[a-zA-Z0-9:_-]{3,120}$/u.test(outboxOwner)) {
      return NextResponse.json({ ok: false, error: 'research_deep_publication_claim_invalid' }, { status: 400 });
    }
    const result = await db.rpc('claim_candidate_deep_outbox_v1', {
      p_deep_job_id: jobId, p_deep_owner: owner, p_deep_attempt: attempt,
      p_revision_id: revisionId, p_input_hash: inputHash, p_outbox_owner: outboxOwner,
    });
    if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 409 });
    const publication = Array.isArray(result.data) ? result.data[0] : result.data;
    return NextResponse.json({ ok: true, publication: publication || null });
  }
  if (action === 'finish') {
    const jobId = String(body.jobId || '');
    const attempt = Number(body.attempt);
    const receiptId = body.receiptId == null ? null : String(body.receiptId);
    const success = body.success;
    const reason = String(body.reason || '');
    if (!UUID.test(jobId) || !Number.isInteger(attempt) || attempt < 1 || attempt > 3
      || typeof success !== 'boolean'
      || (success && (!receiptId || !UUID.test(receiptId)))
      || (!success && (receiptId !== null || reason.length < 4 || reason.length > 500))) {
      return NextResponse.json({ ok: false, error: 'research_deep_finish_invalid' }, { status: 400 });
    }
    const result = await db.rpc('finish_research_deep_job_v2', {
      p_job_id: jobId, p_owner: owner, p_attempt: attempt, p_success: success,
      p_receipt_id: receiptId, p_reason: success ? null : reason,
    });
    if (result.error || result.data !== true) {
      return NextResponse.json({ ok: false, error: result.error?.message || 'research_deep_finish_failed' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, jobId, status: success ? 'completed' : 'queued_or_failed' });
  }
  return NextResponse.json({ ok: false, error: 'research_deep_action_invalid' }, { status: 400 });
}
