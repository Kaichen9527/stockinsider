import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';

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
  const stockIds = [...new Set((details.data || []).map((row) => String(row.stock_id)))];
  const facts = stockIds.length ? await supabase.from('candidate_official_facts')
    .select('fact_id,stock_id,fact_key,period_end,value,unit,as_of,available_at,source_url,provenance')
    .in('stock_id', stockIds).lte('available_at', new Date().toISOString()).order('available_at', { ascending: false }).limit(2000) : { data: [], error: null };
  if (facts.error) return NextResponse.json({ ok: false, error: facts.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, policy: { version: 'candidate-dossier-enrichment-v1', officialFactsOnly: true, investAnchorsContentForbidden: true, requireFactIdPerSummaryAndSection: true }, bundles: (details.data || []).map((detail) => ({ detail, facts: (facts.data || []).filter((fact) => fact.stock_id === detail.stock_id) })) });
}

export async function GET(request: Request) { return POST(request); }
