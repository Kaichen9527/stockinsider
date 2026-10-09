import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { loadResearchDeepClaimContext } from '@/lib/research-deep-claim-context';
import { loadResearchDeepAuthorInput, parseAuthorInputRequest } from '@/lib/research-deep-author-input';

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
  if (['claim', 'status', 'input'].includes(action) && typeof body.owner !== 'string') {
    return NextResponse.json({ ok: false, error: 'research_deep_owner_invalid' }, { status: 400 });
  }
  if (action === 'prepareResearchInput') {
    let input;
    try {
      const { action: _action, ...fields } = body; void _action;
      input = parseAuthorInputRequest(fields);
      if (input.scope !== 'research_observed_v1' || input.bundleId !== null) throw new Error('unsupported');
    } catch {
      return NextResponse.json({ ok: false, error: 'research_input_preparation_invalid' }, { status: 400 });
    }
    try {
      const result = await getSupabaseServerClient().rpc('prepare_research_input_v2', { p_request: input });
      if (result.error || !result.data) throw new Error('preparation_unconfirmed');
      return NextResponse.json({ ok: true, preparation: result.data, dispatchReady: false });
    } catch {
      return NextResponse.json({ ok: false, error: 'research_input_preparation_unavailable' }, { status: 409 });
    }
  }
  if (action === 'input') {
    let input;
    try {
      const { action: _action, ...fields } = body; void _action;
      input = parseAuthorInputRequest(fields);
    } catch {
      return NextResponse.json({ ok: false, error: 'research_deep_input_request_invalid' }, { status: 400 });
    }
    try {
      const packet = await loadResearchDeepAuthorInput(getSupabaseServerClient(), input);
      return NextResponse.json({ ok: true, packet });
    } catch {
      return NextResponse.json({ ok: false, error: 'research_deep_input_unavailable' }, { status: 409 });
    }
  }
  const observed = body.scope === 'research_observed_v1';
  if (Object.hasOwn(body,'scope') || Object.hasOwn(body,'snapshotHash')) {
    const keys=action==='status' ? ['action','owner','scope','snapshotHash',...(Object.hasOwn(body,'jobId') ? ['jobId','attempt']:[])] : ['action','owner','scope','snapshotHash'];
    if(!observed || !['claim','status'].includes(action) || typeof body.snapshotHash!=='string' || !/^[a-f0-9]{64}$/u.test(body.snapshotHash) || Object.keys(body).sort().join(',')!==keys.sort().join(',')) return NextResponse.json({ok:false,error:'research_deep_scope_invalid'},{status:400});
  }
  const scopeFields=observed ? {scope:'research_observed_v1' as const,snapshotHash:body.snapshotHash as string}:{};
  if (action === 'status') {
    const hasJob = Object.hasOwn(body, 'jobId'), hasAttempt = Object.hasOwn(body, 'attempt');
    if (hasJob !== hasAttempt || (hasJob && (typeof body.jobId !== 'string' || !UUID.test(body.jobId)
      || !Number.isInteger(body.attempt) || Number(body.attempt) < 1 || Number(body.attempt) > 3))) {
      return NextResponse.json({ ok: false, error: 'research_deep_status_identity_invalid' }, { status: 400 });
    }
    try {
      const context = await loadResearchDeepClaimContext(getSupabaseServerClient(), {
        owner, ...scopeFields, ...(hasJob ? { jobId: body.jobId as string, attempt: body.attempt as number } : {}),
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
      const result = observed ? await db.rpc('claim_research_observed_job_v2', {p_owner:owner,p_snapshot_hash:body.snapshotHash}) : await db.rpc('claim_research_deep_job_v1', { p_owner: owner });
      if(observed) {
        if(result.error) throw new Error('claim_unconfirmed');
        if(result.data===null) return NextResponse.json({ok:true,job:null,context:null,gap:'no_claimable_job',policy});
        const raw=result.data as {job?:{jobId?:string;attempt?:number}};
        if(!raw.job || !raw.job.jobId || !Number.isInteger(raw.job.attempt)) throw new Error('claim_identity_unconfirmed');
        const context=await loadResearchDeepClaimContext(db,{owner,...scopeFields,jobId:raw.job.jobId,attempt:raw.job.attempt});
        if(!context || context.schemaVersion!=='research-deep-claim-context-v2') throw new Error('claim_context_unconfirmed');
        return NextResponse.json({ok:true,context,gap:null,policy,job:{job_id:context.job.jobId,symbol:context.job.symbol,priority_run_id:context.job.priorityRunId,attempt:context.job.attempt,lease_expires_at:context.job.leaseExpiresAt}});
      }
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
