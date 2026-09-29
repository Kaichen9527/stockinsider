import { NextResponse } from 'next/server';
import { requireIndependentResearchReviewer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { issueThesisQualification, researchCanonicalHash } from '@/lib/research-agent-qualification';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
type Row = Record<string, unknown>;
const textArray = (value: unknown) => Array.isArray(value) && value.length <= 20
  && value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 500)
  ? value as string[] : null;

/** Record an independent thesis decision for one accepted, immutable article. */
export async function POST(request: Request) {
  if (!requireIndependentResearchReviewer(request)) {
    return NextResponse.json({ ok: false, error: 'independent_research_reviewer_required' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Row;
  const receiptId = String(body.articleReceiptId || '');
  const authorId = String(body.authorId || '');
  const reviewerId = String(body.reviewerId || '');
  const readEvidenceHash = String(body.reviewerReadEvidenceHash || '');
  const decision = String(body.decision || '');
  const horizon = String(body.horizon || '');
  const reviewedAt = String(body.reviewedAt || '');
  const support = textArray(body.support);
  const counterEvidence = textArray(body.counterEvidence);
  const invalidationConditions = textArray(body.invalidationConditions);
  const materialEventIds = textArray(body.materialEventIds);
  if (!UUID.test(receiptId) || !authorId || !reviewerId || authorId.length > 120 || reviewerId.length > 120
    || !SHA256.test(readEvidenceHash) || !INSTANT.test(reviewedAt) || !Number.isFinite(Date.parse(reviewedAt))
    || Date.parse(reviewedAt) > Date.now() || !['qualified', 'rejected', 'needs_evidence'].includes(decision)
    || !['1-3m', '3-6m', '6-18m'].includes(horizon)
    || !support || !counterEvidence || !invalidationConditions || !materialEventIds) {
    return NextResponse.json({ ok: false, error: 'research_thesis_review_schema_invalid' }, { status: 400 });
  }
  const supabase = getSupabaseServerClient();
  const receiptRead = await supabase.from('candidate_dossier_submission_receipts')
    .select('submission_id,dossier_id,revision_id,input_hash,status')
    .eq('submission_id', receiptId).eq('status', 'accepted').maybeSingle();
  if (receiptRead.error) return NextResponse.json({ ok: false, error: receiptRead.error.message }, { status: 500 });
  if (!receiptRead.data || String(receiptRead.data.input_hash) !== readEvidenceHash) {
    return NextResponse.json({ ok: false, error: 'research_thesis_accepted_article_or_evidence_missing' }, { status: 409 });
  }
  const [dossierRead, detailRead] = await Promise.all([
    supabase.from('candidate_research_dossiers')
      .select('id,detail_snapshot_id,content,validation_status,published_at')
      .eq('id', receiptRead.data.dossier_id).maybeSingle(),
    supabase.from('candidate_detail_snapshots')
      .select('id,stock_id,valuation,stocks(id,symbol,name)')
      .eq('id', receiptRead.data.revision_id).maybeSingle(),
  ]);
  if (dossierRead.error || detailRead.error) {
    return NextResponse.json({ ok: false, error: dossierRead.error?.message || detailRead.error?.message }, { status: 500 });
  }
  const dossier = dossierRead.data;
  const detail = detailRead.data;
  if (!dossier || !detail || dossier.validation_status !== 'valid' || !dossier.published_at
    || dossier.detail_snapshot_id !== detail.id || Date.parse(reviewedAt) < Date.parse(String(dossier.published_at))) {
    return NextResponse.json({ ok: false, error: 'research_thesis_article_revision_mismatch' }, { status: 409 });
  }
  const relation = detail.stocks as Row | Row[] | null;
  const stock = Array.isArray(relation) ? relation[0] : relation;
  const valuation = detail.valuation as Row | null;
  const coverage = valuation?.researchCoverage as Row | null;
  const dossierContent = dossier.content as Row | null;
  const deepArticle = dossierContent?.deepResearch as Row | null;
  const deepHash = String(deepArticle?.articleHash || '');
  if (!SHA256.test(deepHash) || deepArticle?.symbol !== stock?.symbol) {
    return NextResponse.json({ ok: false, error: 'research_thesis_deep_article_required' }, { status: 409 });
  }
  const editorialRead = await supabase.from('candidate_deep_article_reviews_v1')
    .select('id').eq('revision_id', detail.id)
    .eq('input_hash', readEvidenceHash).eq('article_hash', deepHash).eq('decision', 'accepted')
    .eq('author_id', authorId).eq('reviewer_id', reviewerId).limit(1);
  if (editorialRead.error) return NextResponse.json({ ok: false, error: editorialRead.error.message }, { status: 500 });
  if (!editorialRead.data?.length) {
    return NextResponse.json({ ok: false, error: 'research_thesis_independent_editorial_review_missing' }, { status: 409 });
  }
  // A reviewer cannot mark a financial bridge verified simply by setting a request flag.
  const financialBridgeVerified = coverage?.status === 'complete'
    && valuation?.next12mBridgeComplete === true;
  let qualification;
  try {
    qualification = issueThesisQualification({
      symbol: String(stock?.symbol || ''), thesisRevisionId: String(detail.id),
      articleRevisionId: String(dossier.id), articleHash: researchCanonicalHash(dossier.content),
      evidenceSnapshotHash: readEvidenceHash, reviewerReadEvidenceHash: readEvidenceHash,
      acceptedArticle: true, authorId, reviewerId, financialBridgeVerified,
      decision: decision as 'qualified' | 'rejected' | 'needs_evidence',
      horizon: horizon as '1-3m' | '3-6m' | '6-18m',
      support, counterEvidence, invalidationConditions, materialEventIds,
      reviewedAt,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'research_thesis_review_invalid' }, { status: 409 });
  }
  const stored = await supabase.from('candidate_thesis_qualifications_v1').insert({
    stock_id: detail.stock_id, detail_revision_id: detail.id, dossier_id: dossier.id,
    article_hash: qualification.articleHash, evidence_snapshot_hash: qualification.evidenceSnapshotHash,
    review_receipt_hash: qualification.reviewReceiptHash, status: qualification.status,
    horizon: qualification.horizon, payload: qualification,
    qualified_at: qualification.qualifiedAt, next_review_at: qualification.nextReviewAt,
  }).select('id').single();
  if (stored.error && stored.error.code !== '23505') {
    return NextResponse.json({ ok: false, error: stored.error.message }, { status: 500 });
  }
  const existing = stored.error ? await supabase.from('candidate_thesis_qualifications_v1')
    .select('id,article_hash,evidence_snapshot_hash').eq('review_receipt_hash', qualification.reviewReceiptHash).maybeSingle() : null;
  if (existing?.error || (existing && (!existing.data || existing.data.article_hash !== qualification.articleHash
    || existing.data.evidence_snapshot_hash !== qualification.evidenceSnapshotHash))) {
    return NextResponse.json({ ok: false, error: 'research_thesis_review_replay_mismatch' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, qualificationId: stored.data?.id || existing?.data?.id,
    idempotentReplay: Boolean(existing), status: qualification.status,
    symbol: qualification.symbol, articleHash: qualification.articleHash,
    nextReviewAt: qualification.nextReviewAt });
}
