import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { validateCloudWork, verifyCloudResult, cloudReservationWorkKey, type CloudResult } from '@/lib/research-cloud-work';
import { loadDeepArticleEvidence } from '@/lib/research-deep-evidence';
import { validateDeepResearchArticle, type DeepResearchArticle } from '@/lib/research-deep-article';

/** Trusted tester controller submits the original packet and returned artifact.
 * The Cloud process has neither this key nor a production publication key. */
export async function POST(request: Request) {
  const auth = requireInternalAuth(request, { allowResearchTester: true });
  if (!auth.ok || auth.authSource !== 'research_test_key'
    || !request.headers.get('authorization')?.startsWith('Bearer ') || request.headers.has('x-internal-key'))
    return NextResponse.json({ ok: false, error: 'independent_cloud_test_controller_required' }, { status: 401 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('cloud_body_missing');
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4_000_000) {
          await reader.cancel();
          return NextResponse.json({ ok: false, error: 'cloud_body_too_large' }, { status: 413 });
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const work = validateCloudWork(body.work);
    const result = body.result as CloudResult;
    if (work.kind !== 'deep_article_validation' || work.role !== 'independent_test' || work.dataScope !== 'research_snapshot')
      throw new Error('cloud_live_validation_kind_required');
    const db = getSupabaseServerClient();
    const reservation = await db.from('research_model_reservations_v1')
      .select('reservation_id,role,owner,work_key,started_at,lease_expires_at')
      .eq('reservation_id', work.reservationId).maybeSingle();
    const row = reservation.data;
    if (reservation.error || !row || row.role !== work.role || row.owner !== work.owner
      || row.work_key !== cloudReservationWorkKey(work)
      || Date.parse(row.started_at) !== Date.parse(work.issuedAt)
      || Date.parse(row.lease_expires_at) !== Date.parse(work.deadlineAt)) throw new Error('cloud_live_reservation_mismatch');
    const completed = await db.from('research_model_completions_v1')
      .select('owner,outcome,result_hash,finished_at').eq('reservation_id', work.reservationId).maybeSingle();
    if (completed.error) throw new Error('cloud_completion_read_failed');
    const now = new Date().toISOString();
    if (completed.data) {
      if (!result || completed.data.owner !== work.owner || completed.data.result_hash !== result.resultHash
        || completed.data.outcome !== result.status || Date.parse(result.completedAt) > Date.parse(now))
        throw new Error('cloud_completion_replay_mismatch');
      // Replay an already durable identical result without reinterpreting new evidence.
      const handoff = verifyCloudResult(work, result, result.completedAt);
      return NextResponse.json({ ok: true, handoff, idempotentReplay: true,
        authoritativePublication: false, strategyApproved: false });
    }
    const handoff = verifyCloudResult(work, result, now);
    if (result.status === 'completed') {
      const article = work.input.article as DeepResearchArticle;
      const documents = await loadDeepArticleEvidence(db, work.evidence.map((item) => item.id));
      const expectedDocuments = work.input.documents as Array<{ id: string; sourceUrl: string; publishedAt: string; observedAt: string }>;
      for (const document of documents) {
        const expected = expectedDocuments.find((item) => item.id === document.id);
        if (!expected || expected.sourceUrl !== document.sourceUrl
          || Date.parse(expected.publishedAt) !== Date.parse(document.publishedAt)
          || Date.parse(expected.observedAt) !== Date.parse(document.observedAt)) throw new Error('cloud_server_evidence_changed');
      }
      const ids = work.input.allowedOfficialFactIds as string[];
      const facts = ids.length ? await db.from('candidate_official_facts').select('fact_id,available_at,as_of')
        .in('fact_id', ids).lte('available_at', work.cutoffAt).lte('as_of', work.cutoffAt) : { data: [], error: null };
      if (facts.error || !facts.data || new Set(facts.data.map((fact) => fact.fact_id)).size !== ids.length)
        throw new Error('cloud_server_facts_missing');
      validateDeepResearchArticle({ article, documents, allowedOfficialFactIds: new Set(ids), expectedSymbol: article.symbol, now });
    }
    // Existing SQL enforces lease expiry and immutable exact replay atomically.
    const saved = await db.rpc('finish_research_model_v1', { p_reservation: work.reservationId,
      p_owner: work.owner, p_outcome: result.status, p_result_hash: result.resultHash });
    if (saved.error || saved.data !== true) throw new Error('cloud_reservation_completion_failed');
    return NextResponse.json({ ok: true, handoff, idempotentReplay: false,
      authoritativePublication: false, strategyApproved: false });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'cloud_result_rejected' }, { status: 409 });
  }
}
