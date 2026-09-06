import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { candidateDossierBundleHash } from '@/lib/candidate-dossier-bundle';

type Row = Record<string, unknown>;

export async function POST(request: Request) {
  const auth = requireInternalAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({}));
  const since = typeof body.since === 'string' && Number.isFinite(Date.parse(body.since)) ? body.since : new Date(Date.now() - 3 * 86_400_000).toISOString();
  const limit = Math.max(1, Math.min(40, Number(body.limit || 20)));
  const supabase = getSupabaseServerClient();
  const details = await supabase.from('candidate_detail_snapshots')
    .select('id,stock_id,session_date,lifecycle_stage,title,summary,sections,fact_ids,source_links,valuation,technical,as_of,available_at,stocks(symbol,name)')
    .gte('available_at', since).order('available_at', { ascending: false }).limit(limit);
  if (details.error) return NextResponse.json({ ok: false, error: details.error.message }, { status: 500 });
  const allowedFactIds = [...new Set((details.data || []).flatMap((row) => (Array.isArray(row.fact_ids) ? row.fact_ids : []).map(String)))];
  const facts = allowedFactIds.length ? await supabase.from('candidate_official_facts')
    .select('fact_id,stock_id,fact_key,fact_kind,period_end,value,unit,as_of,available_at,source_url,provenance,derivation')
    .in('fact_id', allowedFactIds).lte('available_at', new Date().toISOString()).order('available_at', { ascending: false }).limit(5000) : { data: [], error: null };
  if (facts.error) return NextResponse.json({ ok: false, error: facts.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, policy: { version: 'candidate-dossier-enrichment-v2', officialFactsOnly: true, investAnchorsContentForbidden: true, requireFactIdPerSummaryAndSection: true, immutableBundleHashRequired: true }, bundles: (details.data || []).map((detail) => {
    const exactFacts = ((facts.data || []) as Row[]).filter((fact) => (Array.isArray(detail.fact_ids) ? detail.fact_ids : []).map(String).includes(String(fact.fact_id)));
    return { detail, facts: exactFacts, bundleHash: candidateDossierBundleHash(detail as Row, exactFacts) };
  }) });
}

export async function GET(request: Request) { return POST(request); }
