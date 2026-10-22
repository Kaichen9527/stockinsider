import { NextResponse } from 'next/server';
import { vnextEnabled } from './policy.ts';
import { cacheContent, command, enqueue, executeResearch, publishMarket, publishResearch, submitAuthor, submitReview, swap } from './store.ts';
import { vnextIdentity } from './auth.ts';
import { boundedRequestBody } from './request.ts';
type Row = Record<string, unknown>;
/** Called before legacy parsing, reads, queue mutations, financial IO or models. */
export async function vnextRoute(request: Request, entrypoint: string) {
  if (!vnextEnabled()) return null;
  const identity = vnextIdentity(request);
  if (!identity) return NextResponse.json({ ok: false, error: 'vnext_configured_role_bearer_required' }, { status: 401 });
  try {
    const body = await boundedRequestBody(request) as Row;
    if (Array.isArray(body.symbols) && body.symbols.length === 0) {
      return NextResponse.json({ ok: true, policyVersion: 'stockinsider-vnext-20-v1', result: { jobs: [], reason: 'empty_scope', expensiveCalls: 0 } });
    }
    const action = entrypoint === 'vnext-research' ? String(body.action || 'enqueue')
      : entrypoint === 'candidate-dossier-outbox' && body.jobId ? 'claim'
      : entrypoint === 'candidate-dossier-submission' && body.artifact ? 'author'
      : entrypoint === 'candidate-dossier-bundle' && body.jobId ? 'bundle' : 'enqueue';
    if (action === 'automatic' || action === 'recover') {
      if (identity.role !== 'author') throw new Error('vnext_author_required');
      if (Object.keys(body).some((key) => !['action', 'jobId'].includes(key)) || typeof body.jobId !== 'string') throw new Error('vnext_worker_job_id_only');
      const worker = await import('./automatic-worker.ts');
      const result = action === 'automatic' ? await worker.runAutomaticResearch(body.jobId) : await worker.recoverAutomaticResearch(body.jobId);
      return NextResponse.json({ ok: true, policyVersion: 'stockinsider-vnext-20-v1', result });
    }
    const automaticScreen = action === 'screen';
    if (automaticScreen && identity.role !== 'operator') throw new Error('vnext_operator_required');
    const result = automaticScreen ? await (await import('./discovery.ts')).scanCachedCandidates(identity)
      : action === 'enqueue' ? await enqueue(identity, body, entrypoint)
      : action === 'author' ? await submitAuthor(identity, body)
      : action === 'review' ? await submitReview(identity, body)
      : action === 'publish' ? await publishResearch(identity, body)
      : action === 'bundle' ? await command(identity, 'author-context', { jobId: body.jobId, executionId: body.executionId })
      : action === 'execute' ? await executeResearch(identity, body)
      : action === 'swap' ? await swap(identity, body)
      : action === 'market' ? await publishMarket(identity, body)
      : action === 'content' ? await cacheContent(identity, body)
      : ['claim', 'fail', 'retry', 'review-claim', 'review-sources', 'review', 'publish', 'expire'].includes(action) ? await command(identity, action, body)
      : (() => { throw new Error('vnext_action_unsupported'); })();
    return NextResponse.json({ ok: true, policyVersion: 'stockinsider-vnext-20-v1', result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'vnext_authority_unavailable' }, { status: 409 });
  }
}
