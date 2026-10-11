import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { invalidateThesis, type ThesisQualification } from '@/lib/research-agent-qualification';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** A documented new event invalidates new entries immediately; held paper positions remain monitored. */
export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const qualificationId = String(body.qualificationId || '');
  const eventDocumentId = String(body.eventDocumentId || '');
  const status = String(body.status || '');
  if (!UUID.test(qualificationId) || !UUID.test(eventDocumentId)
    || !['stale', 'invalidated'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'research_thesis_event_schema_invalid' }, { status: 400 });
  }
  const supabase = getSupabaseServerClient();
  const [previous, document] = await Promise.all([
    supabase.from('candidate_thesis_qualifications_v1').select('*').eq('id', qualificationId).maybeSingle(),
    supabase.from('source_raw_documents').select('id,symbols,collected_at').eq('id', eventDocumentId).maybeSingle(),
  ]);
  if (previous.error || document.error) {
    return NextResponse.json({ ok: false, error: previous.error?.message || document.error?.message }, { status: 500 });
  }
  if (!previous.data || !document.data) {
    return NextResponse.json({ ok: false, error: 'research_thesis_event_source_missing' }, { status: 404 });
  }
  const thesis = previous.data.payload as ThesisQualification;
  if (!thesis || !Array.isArray(document.data.symbols) || !document.data.symbols.includes(thesis.symbol)
    || !Number.isFinite(Date.parse(String(document.data.collected_at)))
    || Date.parse(String(document.data.collected_at)) < Date.parse(thesis.qualifiedAt)) {
    return NextResponse.json({ ok: false, error: 'research_thesis_event_binding_invalid' }, { status: 409 });
  }
  const latest = await supabase.from('candidate_thesis_qualifications_v1')
    .select('id,parent_id,payload,status').eq('stock_id', previous.data.stock_id)
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  if (latest.error) return NextResponse.json({ ok: false, error: latest.error.message }, { status: 500 });
  if (latest.data?.id !== qualificationId) {
    const latestPayload = latest.data?.payload as ThesisQualification | null;
    if (latest.data?.parent_id === qualificationId && latest.data?.status === status
      && Array.isArray(latestPayload?.materialEventIds)
      && latestPayload.materialEventIds.includes(eventDocumentId)) {
      return NextResponse.json({ ok: true, qualificationId: latest.data.id,
        status, eventDocumentId, idempotentReplay: true });
    }
    return NextResponse.json({ ok: false, error: 'research_thesis_revision_not_latest' }, { status: 409 });
  }
  let changed;
  try {
    changed = invalidateThesis({ thesis, eventId: eventDocumentId,
      observedAt: String(document.data.collected_at), status: status as 'stale' | 'invalidated' });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'research_thesis_event_invalid' }, { status: 409 });
  }
  const saved = await supabase.from('candidate_thesis_qualifications_v1').insert({
    parent_id: qualificationId,
    stock_id: previous.data.stock_id, detail_revision_id: previous.data.detail_revision_id,
    dossier_id: previous.data.dossier_id, article_hash: changed.articleHash,
    evidence_snapshot_hash: changed.evidenceSnapshotHash, review_receipt_hash: changed.reviewReceiptHash,
    status: changed.status, horizon: changed.horizon, payload: changed,
    qualified_at: changed.qualifiedAt, next_review_at: changed.nextReviewAt,
  }).select('id').single();
  if (saved.error && saved.error.code !== '23505') {
    return NextResponse.json({ ok: false, error: saved.error.message }, { status: saved.error.code === 'P0001' ? 409 : 500 });
  }
  const existing = saved.error ? await supabase.from('candidate_thesis_qualifications_v1')
    .select('id').eq('review_receipt_hash', changed.reviewReceiptHash).maybeSingle() : null;
  if (existing?.error || (existing && !existing.data)) {
    return NextResponse.json({ ok: false, error: 'research_thesis_event_replay_mismatch' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, qualificationId: saved.data?.id || existing?.data?.id,
    status: changed.status, eventDocumentId, idempotentReplay: Boolean(existing) });
}
