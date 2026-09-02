import { NextResponse } from 'next/server';
import { requireInternalAuth } from '@/lib/internal-auth';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { collectPagedAuthorityRows } from '@/lib/candidate-research-policy';
import { officialMarketIndexBatchHash, parseOfficialMarketIndexPage, type OfficialMarketIndexPage } from '@/lib/official-market-index-backfill';

const BODY_LIMIT = 1_000_000;

async function officialSessions(cutoff: string) {
  const supabase = getSupabaseServerClient();
  return collectPagedAuthorityRows<{ session_date?: unknown }>(async (from, to) => {
    const result = await supabase.rpc('candidate_research_official_sessions', { p_cutoff: cutoff, p_limit: 1320 }).range(from, to);
    if (result.error) throw result.error;
    return (result.data as Array<{ session_date?: unknown }>) || [];
  }, { maxRows: 1320 });
}

export async function GET(request: Request) {
  const auth = requireInternalAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const sessions = (await officialSessions(new Date().toISOString())).map((row) => String(row.session_date || '')).filter((date) => /^\d{4}-\d{2}-\d{2}$/u.test(date)).sort().slice(-520);
    return NextResponse.json({ ok: true, result: { sessions } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireInternalAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const releaseId = String(process.env.STOCKINSIDER_WRITER_RELEASE_ID || '');
  if (!/^[0-9a-f]{40}$/u.test(releaseId)) return NextResponse.json({ ok: false, error: 'writer_release_identity_missing' }, { status: 503 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > BODY_LIMIT) return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 422 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 422 });
  const object = body as Record<string, unknown>;
  if (Object.keys(object).sort().join(',') !== 'availableAt,batchHash,pages,source' || object.source !== 'official_exchange_index_backfill_v1' || !Array.isArray(object.pages) || object.pages.length < 1 || object.pages.length > 12) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 422 });
  }
  const pages = object.pages as OfficialMarketIndexPage[];
  const parsed = pages.map(parseOfficialMarketIndexPage);
  if (parsed.some((rows) => rows === null) || object.batchHash !== officialMarketIndexBatchHash(pages)) return NextResponse.json({ ok: false, error: 'invalid_official_index_evidence' }, { status: 422 });
  const unique = new Map(parsed.flatMap((rows) => rows || []).map((row) => [`${row.market}:${row.sessionDate}`, row]));
  const rows = [...unique.values()];
  const availableAt = String(object.availableAt || '');
  if (!Number.isFinite(Date.parse(availableAt)) || rows.length < 1 || rows.length > 300 || rows.some((row) => row.sessionDate > availableAt.slice(0, 10))) return NextResponse.json({ ok: false, error: 'invalid_official_index_evidence' }, { status: 422 });
  const supabase = getSupabaseServerClient();
  const dates = [...new Set(rows.map((row) => row.sessionDate))];
  const [writer, sessions, existing] = await Promise.all([
    supabase.from('production_writer_releases').select('release_id').eq('active', true).single(),
    officialSessions(availableAt),
    supabase.from('official_market_evidence_history').select('*').in('session_date', dates),
  ]);
  if (writer.error || writer.data?.release_id !== releaseId) return NextResponse.json({ ok: false, error: 'writer_release_not_active' }, { status: 409 });
  if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
  const allowed = new Set(sessions.map((row) => String(row.session_date || '')));
  if (rows.some((row) => !allowed.has(row.sessionDate))) return NextResponse.json({ ok: false, error: 'official_session_reference_missing' }, { status: 422 });
  const existingByKey = new Map((existing.data || []).map((row) => [`${row.market}:${row.session_date}`, row]));
  const write = await supabase.from('official_market_evidence_history').upsert(rows.map((row) => {
    const retained = existingByKey.get(`${row.market}:${row.sessionDate}`);
    return {
      market: row.market, session_date: row.sessionDate, index_close: row.close,
      breadth_above_ma20: retained?.breadth_above_ma20 ?? null, breadth_observed: retained?.breadth_observed ?? null,
      breadth_eligible: retained?.breadth_eligible ?? null, foreign_net_twd: retained?.foreign_net_twd ?? null,
      source_urls: [...new Set([...(Array.isArray(retained?.source_urls) ? retained.source_urls : []), row.sourceUrl])],
      as_of: `${row.sessionDate}T13:30:00+08:00`, available_at: availableAt,
      provenance: { ...(retained?.provenance || {}), source: object.source, response_sha256: row.responseSha256, writer_release_id: releaseId },
    };
  }), { onConflict: 'market,session_date' });
  if (write.error) return NextResponse.json({ ok: false, error: write.error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: { accepted: rows.length, releaseId } });
}
