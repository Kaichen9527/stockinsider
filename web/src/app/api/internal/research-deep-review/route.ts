import { NextResponse } from 'next/server';
import { requireIndependentResearchReviewer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import {
  DEEP_ARTICLE_SECTION_ORDER, deepArticleSourceIds, validateDeepResearchArticle,
  type DeepResearchArticle,
} from '@/lib/research-deep-article';
import { loadDeepArticleEvidence } from '@/lib/research-deep-evidence';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const HASH = /^[0-9a-f]{64}$/u;

/** Separate reviewer principal signs the exact article hash before publication. */
export async function POST(request: Request) {
  if (!requireIndependentResearchReviewer(request)) {
    return NextResponse.json({ ok: false, error: 'independent_research_reviewer_required' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Row;
  const revisionId = String(body.revisionId || '');
  const inputHash = String(body.inputHash || '');
  const authorId = String(body.authorId || '');
  const reviewerId = String(body.reviewerId || '');
  const reviewedAt = String(body.reviewedAt || '');
  const decision = String(body.decision || '');
  const findings = body.findings as Row | null;
  const article = body.article as DeepResearchArticle;
  if (!UUID.test(revisionId) || !HASH.test(inputHash) || !authorId || !reviewerId
    || authorId === reviewerId || authorId.length > 120 || reviewerId.length > 120
    || !Number.isFinite(Date.parse(reviewedAt)) || Date.parse(reviewedAt) > Date.now()
    || !['accepted', 'rejected'].includes(decision) || !findings || typeof findings !== 'object'
    || !article || typeof article !== 'object') {
    return NextResponse.json({ ok: false, error: 'deep_article_review_schema_invalid' }, { status: 400 });
  }
  if (decision === 'accepted') {
    const sectionChecks = findings.sectionChecks;
    if (!Array.isArray(sectionChecks) || sectionChecks.length !== DEEP_ARTICLE_SECTION_ORDER.length
      || sectionChecks.some((item, index) => item?.key !== DEEP_ARTICLE_SECTION_ORDER[index]
        || item?.verdict !== 'supported' || typeof item?.note !== 'string' || item.note.trim().length < 10)
      || findings.valuationRecomputed !== true || findings.counterEvidenceChecked !== true
      || findings.sourceRightsChecked !== true || findings.productionReady !== true) {
      return NextResponse.json({ ok: false, error: 'deep_article_independent_checks_incomplete' }, { status: 409 });
    }
  }
  const db = getSupabaseServerClient();
  try {
    const [detailRead, bundleRead] = await Promise.all([
      db.from('candidate_detail_snapshots')
        .select('id,stock_id,fact_ids,stocks(symbol)').eq('id', revisionId).maybeSingle(),
      db.from('candidate_dossier_bundles').select('revision_id,input_hash')
        .eq('revision_id', revisionId).eq('input_hash', inputHash).maybeSingle(),
    ]);
    if (detailRead.error || bundleRead.error) throw new Error(detailRead.error?.message || bundleRead.error?.message);
    if (!detailRead.data || !bundleRead.data) throw new Error('deep_article_bundle_not_found');
    const relation = detailRead.data.stocks as Row | Row[] | null;
    const stock = Array.isArray(relation) ? relation[0] : relation;
    const sourceIds = deepArticleSourceIds(article);
    const documents = await loadDeepArticleEvidence(db, sourceIds);
    const validated = validateDeepResearchArticle({
      article, documents,
      allowedOfficialFactIds: new Set((Array.isArray(detailRead.data.fact_ids) ? detailRead.data.fact_ids : []).map(String)),
      expectedSymbol: String(stock?.symbol || ''), now: reviewedAt,
    });
    if (Date.parse(reviewedAt) < Date.parse(article.authoredAt)) throw new Error('deep_article_review_before_authoring');
    const saved = await db.from('candidate_deep_article_reviews_v1').insert({
      revision_id: revisionId, input_hash: inputHash, article_hash: validated.articleHash,
      author_id: authorId, reviewer_id: reviewerId, decision, findings,
      source_document_ids: validated.sourceDocumentIds, reviewed_at: reviewedAt,
    }).select('id').single();
    if (saved.error && saved.error.code !== '23505') throw new Error(saved.error.message);
    const replay = saved.error ? await db.from('candidate_deep_article_reviews_v1')
      .select('id,findings').eq('revision_id', revisionId).eq('input_hash', inputHash)
      .eq('article_hash', validated.articleHash).eq('reviewer_id', reviewerId)
      .eq('decision', decision).maybeSingle() : null;
    if (replay?.error || (replay && (!replay.data || JSON.stringify(replay.data.findings) !== JSON.stringify(findings)))) {
      throw new Error('deep_article_review_replay_mismatch');
    }
    return NextResponse.json({ ok: true, reviewId: saved.data?.id || replay?.data?.id,
      articleHash: validated.articleHash, decision, idempotentReplay: Boolean(replay) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'deep_article_review_failed' }, { status: 409 });
  }
}
