import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { loadResearchDeepClaimContext } from '@/lib/research-deep-claim-context';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** The trusted controller claims or observes a bounded job; this route never runs a model. */
export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  }
  const parsed = await request.json().catch(() => null);
  const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Row : {};
  const action = String(body.action || '');
  const owner = String(body.owner || '');
  if (owner.length < 3 || owner.length > 120 || !/^[a-zA-Z0-9:_-]+$/u.test(owner)) {
    return NextResponse.json({ ok: false, error: 'research_deep_owner_invalid' }, { status: 400 });
  }
  if (['claim', 'status'].includes(action) && typeof body.owner !== 'string') {
    return NextResponse.json({ ok: false, error: 'research_deep_owner_invalid' }, { status: 400 });
  }
  if (action === 'status') {
    const hasJob = Object.hasOwn(body, 'jobId'), hasAttempt = Object.hasOwn(body, 'attempt');
    if (hasJob !== hasAttempt || (hasJob && (typeof body.jobId !== 'string' || !UUID.test(body.jobId)
      || !Number.isInteger(body.attempt) || Number(body.attempt) < 1 || Number(body.attempt) > 3))) {
      return NextResponse.json({ ok: false, error: 'research_deep_status_identity_invalid' }, { status: 400 });
    }
    try {
      const context = await loadResearchDeepClaimContext(getSupabaseServerClient(), {
        owner, ...(hasJob ? { jobId: body.jobId as string, attempt: body.attempt as number } : {}),
      });
      return NextResponse.json({ ok: true, context, gap: context ? null : 'no_active_owned_job' });
    } catch {
      return NextResponse.json({ ok: false, context: null, error: 'research_deep_status_context_unavailable' }, { status: 409 });
    }
  }
  const db = getSupabaseServerClient();
  if (action === 'claim') {
    const policy = { maxConcurrentModels: 1, maxMinutesPerJob: 30, maxModelMinutesPerTaipeiDay: 120,
      maxNewDeepStudiesPerTaipeiWeek: 5 };
    try {
      const result = await db.rpc('claim_research_deep_job_v1', { p_owner: owner });
      if (result.error || !Array.isArray(result.data) || result.data.length > 1) throw new Error('claim_unconfirmed');
      if (!result.data.length) return NextResponse.json({ ok: true, job: null, context: null, gap: 'no_claimable_job', policy });
      const claimed = result.data[0] as Row;
      if (!claimed || typeof claimed.job_id !== 'string' || !UUID.test(claimed.job_id)
        || !Number.isInteger(claimed.attempt) || Number(claimed.attempt) < 1 || Number(claimed.attempt) > 3) {
        throw new Error('claim_identity_unconfirmed');
      }
      const context = await loadResearchDeepClaimContext(db, { owner, jobId: claimed.job_id, attempt: claimed.attempt as number });
      if (!context || claimed.symbol !== context.job.symbol || claimed.priority_run_id !== context.job.priorityRunId
        || claimed.lease_expires_at !== context.job.leaseExpiresAt) throw new Error('claim_context_unconfirmed');
      return NextResponse.json({ ok: true, context, gap: null, policy,
        job: { job_id: context.job.jobId, symbol: context.job.symbol, priority_run_id: context.job.priorityRunId,
          attempt: context.job.attempt, lease_expires_at: context.job.leaseExpiresAt } });
    } catch {
      // The RPC may already have committed. Only status can recover its fence;
      // another claim is never an automatic recovery action.
      return NextResponse.json({ ok: false, context: null, error: 'research_deep_claim_context_unavailable',
        outcome: 'uncertain', retryClaim: false }, { status: 409 });
    }
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
  if (action === 'handoffModel') {
    if (!UUID.test(String(body.jobId)) || !Number.isInteger(body.attempt) || Number(body.attempt) < 1
      || Number(body.attempt) > 3 || !/^[a-f0-9]{64}$/u.test(String(body.articleHash)))
      return NextResponse.json({ ok: false, error: 'research_deep_handoff_invalid' }, { status: 400 });
    const result = await db.rpc('handoff_research_deep_model_v1', { p_job_id: body.jobId,
      p_owner: owner, p_attempt: body.attempt, p_article_hash: body.articleHash });
    return NextResponse.json({ ok: !result.error && result.data === true, error: result.error?.message || null },
      { status: result.error ? 409 : 200 });
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
