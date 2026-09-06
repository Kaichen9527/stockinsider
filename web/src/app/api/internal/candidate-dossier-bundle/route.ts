import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { chunkCandidateFactIds } from '@/lib/candidate-detail-fact-batches';
import {
  candidateDossierBundleId, candidateDossierInputHash, decodeCandidateDossierCursor, encodeCandidateDossierCursor,
  isPaidInvestAnchorsReference, numberedCandidateSources, withoutPaidInvestAnchorsSourceLinks,
} from '@/lib/candidate-dossier-contract';

type Row = Record<string, unknown>;

function symbolsFrom(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(values.map(String).map((symbol) => symbol.trim().toUpperCase()).filter((symbol) => /^\d{4}$/u.test(symbol)))].slice(0, 40);
}

async function handle(request: Request, body: Row) {
  if (!requireExactInternalBearer(request)) {
    return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  }
  const url = new URL(request.url);
  const sinceValue = body.since ?? url.searchParams.get('since');
  const since = typeof sinceValue === 'string' && Number.isFinite(Date.parse(sinceValue)) ? sinceValue : new Date(Date.now() - 3 * 86_400_000).toISOString();
  const limit = Math.max(1, Math.min(40, Number(body.limit ?? url.searchParams.get('limit') ?? 20) || 20));
  const cursorValue = body.cursor ?? url.searchParams.get('cursor');
  const cursor = cursorValue ? decodeCandidateDossierCursor(cursorValue) : null;
  if (cursorValue && !cursor) return NextResponse.json({ ok: false, error: 'candidate_dossier_cursor_invalid' }, { status: 400 });
  const symbols = symbolsFrom(body.symbols ?? body.symbol ?? url.searchParams.get('symbols') ?? url.searchParams.getAll('symbol'));
  const supabase = getSupabaseServerClient();
  let query = supabase.from('candidate_detail_snapshots')
    .select('id,stock_id,session_date,lifecycle_stage,title,summary,sections,fact_ids,source_links,valuation,technical,as_of,available_at,stocks!inner(symbol,name)')
    .gte('available_at', since).order('available_at', { ascending: false }).order('id', { ascending: false }).limit(limit * 4 + 1);
  if (symbols.length > 0) query = query.in('stocks.symbol', symbols);
  if (cursor) query = query.or(`available_at.lt.${cursor.availableAt},and(available_at.eq.${cursor.availableAt},id.lt.${cursor.revisionId})`);
  const details = await query;
  if (details.error) return NextResponse.json({ ok: false, error: details.error.message }, { status: 500 });

  const revisionIds = (details.data || []).map((row) => String(row.id));
  const publications = revisionIds.length
    ? await supabase.from('candidate_daily_stage_snapshots').select('detail_revision_id,created_at').in('detail_revision_id', revisionIds)
    : { data: [], error: null };
  if (publications.error) return NextResponse.json({ ok: false, error: publications.error.message }, { status: 500 });
  const publishedAtByRevision = new Map<string, string>();
  for (const row of (publications.data || []) as Row[]) {
    const revisionId = String(row.detail_revision_id || '');
    if (revisionId && !publishedAtByRevision.has(revisionId)) publishedAtByRevision.set(revisionId, String(row.created_at || ''));
  }
  const publishedDetails = ((details.data || []) as Row[]).filter((detail) => publishedAtByRevision.has(String(detail.id)));
  const pageDetails = publishedDetails.slice(0, limit);
  const allowedFactIds = [...new Set(pageDetails.flatMap((row) => (Array.isArray(row.fact_ids) ? row.fact_ids : []).map(String)))];
  const factReads = await Promise.all(chunkCandidateFactIds(allowedFactIds).map((batch) => supabase.from('candidate_official_facts')
    .select('fact_id,stock_id,fact_key,fact_kind,period_end,value,unit,as_of,available_at,source_url,provenance,derivation')
    .in('fact_id', batch).lte('available_at', new Date().toISOString()).order('available_at', { ascending: false }).limit(batch.length)));
  const factsError = factReads.find((read) => read.error)?.error;
  if (factsError) return NextResponse.json({ ok: false, error: factsError.message }, { status: 500 });
  const allFacts = factReads.flatMap((read) => (read.data || []) as Row[]);
  const bundles = pageDetails.map((detail) => {
    const detailFactIds = new Set((Array.isArray(detail.fact_ids) ? detail.fact_ids : []).map(String));
    const facts = allFacts.filter((fact) => detailFactIds.has(String(fact.fact_id)) && !isPaidInvestAnchorsReference(fact.source_url));
    const safeDetail: Row = { ...withoutPaidInvestAnchorsSourceLinks(detail), fact_ids: facts.map((fact) => String(fact.fact_id)) };
    const inputHash = candidateDossierInputHash(safeDetail, facts);
    const bundleId = candidateDossierBundleId(inputHash);
    const revisionId = String(detail.id);
    return {
      bundleId, revisionId, publishedRevisionId: revisionId, inputHash,
      // v2 names remain during worker migration.
      bundleHash: inputHash, detail: safeDetail, facts, sources: numberedCandidateSources(safeDetail, facts),
      publishedAt: publishedAtByRevision.get(revisionId) || null,
    };
  });
  if (bundles.length > 0) {
    const queued = await supabase.from('candidate_dossier_bundles').upsert(bundles.map((bundle) => ({
      bundle_id: bundle.bundleId, revision_id: bundle.revisionId, published_revision_id: bundle.publishedRevisionId,
      input_hash: bundle.inputHash, symbol: String(((bundle.detail.stocks as Row | null)?.symbol) || ''),
      payload: { detail: bundle.detail, facts: bundle.facts, sources: bundle.sources }, queued_at: new Date().toISOString(),
    })), { onConflict: 'revision_id,input_hash', ignoreDuplicates: true });
    if (queued.error) return NextResponse.json({ ok: false, error: queued.error.message }, { status: 500 });
  }
  const last = pageDetails.at(-1);
  const hasMore = publishedDetails.length > limit || (details.data || []).length > limit * 4;
  const nextCursor = hasMore && last ? encodeCandidateDossierCursor({ availableAt: String(last.available_at), revisionId: String(last.id) }) : null;
  return NextResponse.json({
    ok: true, cursor: cursorValue || null, nextCursor,
    policy: {
      version: 'candidate-dossier-enrichment-v4', officialFactsOnly: true, investAnchorsContentForbidden: true,
      requireFactIdPerSummaryAndSection: true, immutableBundleHashRequired: true, publishedRevisionBindingRequired: true,
      claimKinds: ['fact', 'guidance', 'assumption', 'derived_calculation'], derivedFormulaDagRequired: true,
    },
    bundles,
  });
}

export async function POST(request: Request) { return handle(request, await request.json().catch(() => ({})) as Row); }
export async function GET(request: Request) { return handle(request, {}); }
